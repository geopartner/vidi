/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2021 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

'use strict';

const MODULE_NAME = `draw`;
import {GEOJSON_PRECISION} from './constants';
import shp from "shpjs";

const drawTools = require(`./drawTools`);
const fileSaver = require(`file-saver`);
const marked = require('marked');
let cloud, utils, state, serializeLayers;
let drawOn = false;
let drawnItems = new L.FeatureGroup();
let drawControl;
let table;
const store = new geocloud.sqlStore({
    clickable: true
});
let destructFunctions = [];
let backboneEvents;
let editing = false;
let _self = false;
let conflictSearch;
let blueIdea;
let selectedDrawing;
let overRideOnCheck = false;
const createId = () => (+new Date * (Math.random() + 1)).toString(36).substr(2, 5);
const EMPTY_TOOLTIP = "-";

module.exports = {
    set: function (o) {
        cloud = o.cloud;
        state = o.state;
        utils = o.utils;
        serializeLayers = o.serializeLayers;
        backboneEvents = o.backboneEvents;
        _self = this;
        return this;
    },

    init: () => {

        $("#_draw_download_geojson").click(function () {
            _self.download();
        });
        // Upload shape file
        $("#_draw_upload_shape_file").on('change', async function (e) {
            try {
                $("#_draw_upload_shape_error").text('');
                if (e.target.files && e.target.files.length > 0) {
                let file = e.target.files[0];
                if (!file.name.toLowerCase().endsWith(".zip")) {
                    $("#_draw_upload_shape_error").text('Must be a .zip file');
                    return;
                }
                $("#_draw_upload_shape_error").text(file.name);
                _self.handleZipFile(file);
                }
            } catch (e) {
                $("#_draw_upload_shape_error").text('Error on upload. Not a zip file');
            }
        });
    
        $("#_draw_upload_shape_btn").on('click', function (e) {
        document.getElementById('_draw_upload_shape_file').click();
        });

        backboneEvents.get().on(`reset:all`, () => {
            _self.resetState();
        });

        backboneEvents.get().on(`off:all`, () => {
            _self.control(false);
            _self.off();
        });

        backboneEvents.get().on(`on:${MODULE_NAME}`, () => {
            _self.control(true);
        });
        backboneEvents.get().on(`off:${MODULE_NAME}`, () => {
            _self.control(false);
        });

        state.listenTo(MODULE_NAME, _self);
        state.listen(MODULE_NAME, `update`);

        state.getModuleState(MODULE_NAME).then(initialState => {
            _self.applyState(initialState)
        });

        $("#draw-line-extremity").on("change", function () {
            var b = $("#draw-line-extremity").val() === "none";
            $("#draw-line-extremity-size").prop("disabled", b);
            $("#draw-line-extremity-where").prop("disabled", b);
        });

        $("#draw-measure").on("change", function () {
            var b = $("#draw-measure").is(":checked");
            $("#draw-line-total-dist").prop("disabled", !b);
        });
        //

        cloud.get().map.addLayer(drawnItems);
        store.layer = drawnItems;
        $("#draw-table").append("<table class='table table-sm'></table>");
        (function poll() {
            if (gc2table.isLoaded()) {
                table = gc2table.init({
                    el: "#draw-table table",
                    geocloud2: cloud.get(),
                    locale: window._vidiLocale.replace("_", "-"),
                    store: store,
                    cm: [
                        {
                            header: __("Type"),
                            dataIndex: "type",
                            sortable: true
                        },
                        {
                            header: __("Area"),
                            dataIndex: "area",
                            sortable: true
                        },
                        {
                            header: __("Distance/Radius"),
                            dataIndex: "distance",
                            sortable: true
                        }
                    ],
                    autoUpdate: false,
                    loadData: false,
                    height: 400,
                    setSelectedStyle: false,
                    responsive: false,
                    openPopUp: false
                });

                $("#_draw_make_conflict_with_selected").on("click", () => {
                    _self.makeConflictSearchWithSelected();
                })
                $("#_draw_make_conflict_with_all").on("click", () => {
                    _self.makeConflictSearchWithAll();
                })
                $("#_draw_make_blueidea_with_selected").on("click", () => {
                    _self.makeBlueIdeaWithSelected();
                })
                $("#_draw_make_blueidea_with_all").on("click", () => {
                    _self.makeBlueIdeaWithAll();
                })
                table.object.on("selected_" + table.uid, (e) => {
                    selectedDrawing = drawnItems._layers[e]._vidi_id;
                    console.log(selectedDrawing);
                })
            } else {
                setTimeout(poll, 30);
            }
        }());
    },

    showConflictSearch: () => {
        const e = document.querySelector('#main-tabs a[href="#conflict-content"]');
        if (e) {
            bootstrap.Tab.getInstance(e).show();
            e.click();
        } else {
            console.warn(`Unable to locate #conflict-content`)
        }

    },
    showBlueIdea: () => {
        const e = document.querySelector('#main-tabs a[href="#blueidea-content"]');
        if (e) {
            bootstrap.Tab.getInstance(e).show();
            e.click();
        } else {
            console.warn(`Unable to locate #blueidea-content`)
        }
    },
    makeConflictSearchWithSelected: () => {
        if (!selectedDrawing) {
            alert("Vælg en tegning")
            return;
        }
        state.resetState(['conflict']).then(() => {
            _self.showConflictSearch();
            setTimeout(() =>
                conflictSearch.makeSearch("Fra tegning", null, selectedDrawing, true), 200
            )
        });
    },

    makeConflictSearchWithAll: () => {
        if (store.layer.getLayers().length === 0) {
            alert(__("No drawings in the map"));
            return;
        }
        state.resetState(['conflict']).then(() => {
            _self.showConflictSearch();
            setTimeout(() =>
                conflictSearch.makeSearch("Fra tegning", null, null, true), 200);
        });
    },

    // Upload shape functions
    handleZipFile: (file) => {
        try {
            const reader = new FileReader();
            reader.onload = function () {
                if (reader.readyState != 2 || reader.error) {
                    return;
                } else {
                    _self.convertToLayer(reader.result);
                }
            }
            reader.readAsArrayBuffer(file);
        } catch (err) {
            console.log('Shape upload error: ', err);
            utils.showInfoToast(__('Error on upload'))
        }
    },
    handleFileInput: (files) => {
        try {
            const reader = new FileReader();
            for (const element of files) {
                const file = element
                reader.onload = function (e) {
                    const buffer = e.target.result;
                    // Behandle bufferen her, f.eks. gemme eller vise den
                    console.log(buffer);
                };

                reader.readAsArrayBuffer(file);
            }
        } catch (err) {
            console.log(err);
            utils.showInfoToast(__('Error in input files'))
        }
    },
    countObjects: (geojson) => {
        try {
            return geojson.features.length;
        } catch (err) {
            console.log(err);
            return 0;
        }
    },
    setGeometryProperties: (geoJson) => {

        for (const feature of geoJson.features) {

            if (feature.geometry.type === 'LineString') {
                feature.properties.type = 'polyline';
                feature.properties.distance = drawTools.getFeatureDistance(feature);
            }

            else if (feature.geometry.type === 'Polygon') {
                feature.properties.type = 'polygon';
                const area = drawTools.getFeatureArea(feature);
                const formatArea = utils.formatArea(area);
                feature.properties.area = formatArea;
            }
            else
                feature.properties.type = 'marker';
        }
    },

    convertToLayer: (buffer) => {
        shp(buffer)
        .then(function (geojson) {
            // If the file is not an array, make it an array
            if (!Array.isArray(geojson)) {
                geojson = [geojson];
            }

            // Handle as array
            for (const element of geojson) {
                // Count elements
                var count = _self.countObjects(element);
                
                // If no features, continue 
                if (count == 0) {
                    throw new Error(__("No features found in file"));
                }

                // If too many features, continue
                const maxCount = 200;
                if (count > maxCount) {
                    const errTxt = __("File contains") + " " + count + " " +__("objects") + ". Max: " + maxCount;
                    throw new Error(errTxt)
                }

                // If we got so far, we can add the layer
                _self.setGeometryProperties(element);

                _self.recreateDrawnings([{ 'geojson': element, 'type': 'Vector' }], true);
            }

            // Done
            backboneEvents.get().trigger(`${MODULE_NAME}:update`);
            utils.showInfoToast(__("File parsed successfully"))
        })
        .catch(function (err) {
            console.log(err);
            utils.showInfoToast(__('Error while parsing file'))
        });
    },

    // BlueIdea integration
    makeBlueIdeaWithSelected: () => {
        if (!selectedDrawing) {
        alert("Vælg en tegning");
        return;
        }

        // get geojson from selected drawing
        var geojson = {
        type: "FeatureCollection",
        features: [],
        };
        // for each layer in drawnItems, get geojson
        drawnItems.eachLayer(function (layer) {
            if (layer._vidi_id === selectedDrawing) {
                geojson.features.push(layer.toGeoJSON(GEOJSON_PRECISION));
            }
        });

        state.resetState(["blueidea"]).then(() => {
        _self.showBlueIdea();
        blueIdea.queryAddresses(geojson);
        });
    },
    makeBlueIdeaWithAll: () => {
        // get geojson from all drawings
        var geojson = {
        type: "FeatureCollection",
        features: [],
        };
        // for each layer in drawnItems, get geojson
        drawnItems.eachLayer(function (layer) {
            geojson.features.push(layer.toGeoJSON(GEOJSON_PRECISION));
        });

        state.resetState(["blueidea"]).then(() => {
        _self.showBlueIdea();
        blueIdea.queryAddresses(geojson);
        });
    },

    off: () => {
        // Unbind events
        cloud.get().map.off('draw:created');
        cloud.get().map.off('draw:drawstart');
        cloud.get().map.off('draw:drawstop');
        cloud.get().map.off('draw:editstart');
        cloud.get().map.off('draw:editstop');
        cloud.get().map.off('draw:deletestart');
        cloud.get().map.off('draw:deletestop');
        cloud.get().map.off('draw:deleted');
        cloud.get().map.off('draw:edited');

        // Call destruct functions
        $.each(destructFunctions, function (i, v) {
            v();
        });

        if (drawControl) {
            cloud.get().map.removeControl(drawControl);
        }

        drawOn = false;
        drawControl = false;
    },

    /**
     * Adds drawings control to the map
     */
    control: (enable = false, triggerEvents = true) => {
        if (enable && !drawControl) {
            if (triggerEvents) backboneEvents.get().trigger(`drawing:turnedOn`);

            L.drawLocal = require('./drawLocales/draw.js');

            drawControl = new L.Control.Draw({
                position: 'topright',
                draw: {
                    polygon: {
                        allowIntersection: true,
                        shapeOptions: {},
                        showArea: true
                    },
                    polyline: {
                        metric: true,
                        shapeOptions: {}
                    },
                    rectangle: {
                        shapeOptions: {}
                    },
                    circle: {
                        shapeOptions: {}
                    },
                    marker: true,
                    circlemarker: true
                },

                edit: {
                    featureGroup: drawnItems
                }

            });

            drawControl.setDrawingOptions({
                polygon: {
                    repeatMode: true,
                    icon: cloud.iconSmall
                },
                polyline: {
                    repeatMode: true,
                    icon: cloud.iconSmall,
                },
                rectangle: {
                    repeatMode: true,
                    icon: cloud.iconSmall
                },
                circle: {
                    repeatMode: true,
                    icon: cloud.iconSmall
                },
                marker: {
                    repeatMode: true
                }
            });

            cloud.get().map.addControl(drawControl);
            $(".leaflet-draw-draw-circlemarker").append('<i class="fa fa-comment" aria-hidden="true"></i>').css("background-image", "none");

            drawOn = true;

            // Unbind events
            cloud.get().map.off('draw:created');
            cloud.get().map.off('draw:drawstart');
            cloud.get().map.off('draw:drawstop');
            cloud.get().map.off('draw:editstart');
            cloud.get().map.off('draw:editstop');
            cloud.get().map.off('draw:deletestart');
            cloud.get().map.off('draw:deletestop');
            cloud.get().map.off('draw:deleted');
            cloud.get().map.off('draw:edited');

            // Bind events
            cloud.get().map.on('draw:editstart', function () {
                drawnItems.eachLayer((l) => {
                    if (l?._tooltip) {
                        const id = createId();
                        const html = `<textarea rows="2" class="form-control pe-auto" style="width: 150px" id="${id}">${l._vidi_marker_text}</textarea>`;
                        l._tooltip.setContent(html)
                        $(`#${id}`).on("keyup", (e) => {
                            l._vidi_marker_text = e.target.value.trim().length ? e.target.value : EMPTY_TOOLTIP;
                        })
                    }
                })
                editing = true;
            });

            cloud.get().map.on('draw:editstop', function () {
                drawnItems.eachLayer((l) => {
                    if (l?._tooltip) {
                        l._tooltip.setContent(marked(l._vidi_marker_text));
                    }
                })
                editing = false;
                backboneEvents.get().trigger(`${MODULE_NAME}:update`);
            });

            cloud.get().map.on('draw:deletestart', function () {
                editing = true;
            });

            cloud.get().map.on('draw:deletestop', function () {
                editing = false;
                backboneEvents.get().trigger(`${MODULE_NAME}:update`);
            });

            cloud.get().map.on('draw:created', function (e) {

                var type = e.layerType, area = null, distance = null, drawLayer = e.layer;

                if (type === 'marker') {
                    drawLayer._vidi_marker = true;
                }

                if (type === 'circlemarker') {
                    drawLayer._vidi_marker = true;
                    let text = prompt(__("Enter a text for the marker or cancel to add without text"), "");
                    text = text.trim().length ? text : EMPTY_TOOLTIP
                    drawLayer.bindTooltip(marked(text), {permanent: true, className: 'vidi-draw-tooltip'}).on("click", () => {
                    }).openTooltip();
                    drawLayer._vidi_marker_text = text;
                }

                drawnItems.addLayer(drawLayer);
                drawLayer.openTooltip();

                _self.setStyle(drawLayer, type);

                if (type !== 'circlemarker') {
                    drawLayer.on('click', function (event) {
                        _self.bindPopup(event);
                    });
                }

                if (type === "polygon" || type === "rectangle") {
                    area = utils.formatArea( drawTools.getAreaValue(drawLayer));
                }
                if (type === 'polyline') {
                    distance = drawTools.getDistance(drawLayer);

                }
                if (type === 'circle') {
                    distance = L.GeometryUtil.readableDistance(drawLayer.getRadius(), true);
                    area = utils.formatArea( drawTools.getAreaOfCircleValue(drawLayer));
                }

                drawLayer._vidi_type = "draw";
                drawLayer._vidi_id = createId();

                drawLayer.feature = {
                    properties: {
                        type: type,
                        area: area,
                        distance: distance
                    }
                };

                backboneEvents.get().trigger(`${MODULE_NAME}:update`);
                table.loadDataInTable(false, true);
            });
            cloud.get().map.on('draw:deleted', function () {
                backboneEvents.get().trigger(`${MODULE_NAME}:update`);
                table.loadDataInTable(false, true);
            });
            cloud.get().map.on('draw:edited', function (e) {

                $.each(e.layers._layers, function (i, v) {
                    let update = false;
                    if (typeof v._mRadius !== "undefined") {
                        v.feature.properties.distance = L.GeometryUtil.readableDistance(v._mRadius, true);
                        v.feature.properties.area = utils.formatArea(drawTools.getAreaOfCircle(v));
                        update = true;
                    } 
                    if (v.feature.properties.distance !== null && !update) {
                        v.feature.properties.distance = drawTools.getDistance(v);
                        update = true;
                    } 
                    if (v.feature.properties.area !== null && !update) {
                        v.feature.properties.area =  utils.formatArea(drawTools.getArea(v));
                        update = true;
                    }
                    if (update) {
                        v.updateMeasurements();
                    }
                });

                backboneEvents.get().trigger(`${MODULE_NAME}:update`);
                table.loadDataInTable(false, true);
            });

            var po1 = $('.leaflet-draw-section:eq(0)').popover({
                content: __("Use these tools for creating markers, lines, areas, squares and circles."),
                placement: "left",
                customClass: "d-none d-lg-inline"
            });
            po1.popover("show");
            setTimeout(function () {
                po1.popover("hide");
            }, 2500);

            var po2 = $('.leaflet-draw-section:eq(1)').popover({
                content: __("Use these tools for editing existing drawings."),
                placement: "left",
                customClass: "d-none d-lg-inline"
            });
            po2.popover("show");
            setTimeout(function () {
                po2.popover("hide");
            }, 2500);

        } else {
            if (triggerEvents) backboneEvents.get().trigger(`drawing:turnedOff`);
            _self.off();
        }
    },

    /**
     * Removes drawn features from the map
     */
    removeFeatures: () => {
        let l = _self.getLayer();
        l.getLayers().map(layer => {
            l.removeLayer(layer);
        });
    },

    /**
     * Resets state to default value
     */
    resetState: () => {
        return new Promise((resolve) => {
            _self.control(false);
            _self.removeFeatures();
            resolve();
        });
    },

    /**
     * Returns current module state
     */
    getState: () => {
        let drawnItems = serializeLayers.serializeDrawnItems(true);
        return {drawnItems};
    },

    /**
     * Applies externally provided state
     */
    applyState: (newState) => {
        return new Promise((resolve) => {
            store.reset();
            _self.control(false);
            if (newState.drawnItems && newState.drawnItems.length > 0) {
                setTimeout(() => {
                    _self.recreateDrawnings(newState.drawnItems, false);
                    resolve();
                }, 100);
            } else {
                resolve();
            }
        });
    },

    /**
     * Recreates drawnings on the map
     *
     * @param {Object} parr Features to draw
     * @param enableControl
     * @return {void}
     */
    recreateDrawnings: (parr, enableControl = true) => {
        let GeoJsonAdded = false;
        let v = parr;
        let l = _self.getLayer();
        let t = _self.getTable();

        if (parr.length === 1) {
            $.each(v[0].geojson.features, function (n, m) {
                let g;
                // if vidi specific properties are not set, set them
                if (!m._vidi_type) {m._vidi_type = "draw";}
                if (!m._vidi_id) {m._vidi_id = createId();}

                // If polyline or polygon
                // ======================
                if (m.type === "Feature" && GeoJsonAdded === false) {
                    var json = L.geoJson(m, {
                        style: function (f) {
                            return f.style;
                        }
                    });

                    g = json._layers[Object.keys(json._layers)[0]];

                    // Adding vidi-specific properties
                    g._vidi_type = m._vidi_type;
                    g._vidi_id = m._vidi_id;

                    l.addLayer(g);
                }

                // If circle
                // =========
                if (m.type === "Circle") {
                    g = L.circle(m._latlng, m._mRadius, m.style);
                    g.feature = m.feature;

                    // Adding vidi-specific properties
                    g._vidi_type = m._vidi_type;
                    g._vidi_id = m._vidi_id;

                    l.addLayer(g);
                }

                // If rectangle
                // ============
                if (m.type === "Rectangle") {
                    g = L.rectangle([m._latlngs[0], m._latlngs[2]], m.style);
                    g.feature = m.feature;

                    // Adding vidi-specific properties
                    g._vidi_type = m._vidi_type;
                    g._vidi_id = m._vidi_id;

                    l.addLayer(g);
                }

                // If circle marker
                // ================
                if (m.type === "CircleMarker") {
                    g = L.circleMarker(m._latlng, m.options);
                    g.feature = m.feature;

                    // Add label
                    if (m._vidi_marker_text) {
                        g.bindTooltip(marked(m._vidi_marker_text), {permanent: true, className: 'vidi-draw-tooltip'}).on("click", () => {
                        }).openTooltip();
                    }

                    // Adding vidi-specific properties
                    g._vidi_marker = true;
                    g._vidi_type = m._vidi_type;
                    g._vidi_id = m._vidi_id;
                    g._vidi_marker_text = m._vidi_marker_text;

                    l.addLayer(g);
                }

                // If marker
                // =========
                if (m.type === "Marker") {
                    g = L.marker(m._latlng, m.style);
                    g.feature = m.feature;

                    // Add label
                    if (m._vidi_marker_text) {
                        g.bindTooltip(m._vidi_marker_text, {permanent: true}).on("click", function () {
                        }).openTooltip();
                    }

                    // Adding vidi-specific properties
                    g._vidi_marker = true;
                    g._vidi_type = m._vidi_type;
                    g._vidi_id = m._vidi_id;
                    g._vidi_marker_text = null;

                    l.addLayer(g);

                } else {

                    // Add measure
                    if (m._vidi_measurementLayer) {
                        m._vidi_measurementOptions.formatArea = utils.formatArea;
                        g.showMeasurements(m._vidi_measurementOptions);
                    }

                    // Add extremities
                    if (m._vidi_extremities) {
                        g.showExtremities(m._vidi_extremities.pattern, m._vidi_extremities.size, m._vidi_extremities.where);
                    }

                    // Bind popup
                    g.on('click', function (event) {

                        _self.bindPopup(event);

                    });
                }
            });
        }

        t.loadDataInTable(false, true);
        if (enableControl) {
            _self.control(true);
        }
    },

    bindPopup: function (event) {

        if (editing) {
            return;
        }

        var popup = L.popup({
            className: "custom-popup"
        });

        popup.setLatLng(event.latlng)
            .setContent('<p style="width: 200px">' + __("Apply default style settings for this drawing?") + '</p><button type="button" id="btn-draw-apply-style-ok" class="btn btn btn-outline-secondary btn-sm w-100">' + __("Ok") + '</button>')
            .openOn(cloud.get().map);

        $("#btn-draw-apply-style-ok").on("click", function () {
            _self.setStyle(event.target, event.target.feature.properties.type);
            cloud.get().map.closePopup(popup);
            backboneEvents.get().trigger(`${MODULE_NAME}:update`);
        });

        $("#btn-draw-apply-style-cancel").on("click", function () {
            cloud.get().map.closePopup(popup);
        });
    },

    /**
     * Set style on layer
     * @param l
     * @param type
     */
    setStyle: function (l, type) {
        if ($("#draw-measure").is(":checked") && type !== 'marker' && type !== 'circlemarker') {
            l.hideMeasurements();
            l.showMeasurements({
                showTotalPolylineLength: $("#draw-line-total-dist").is(":checked"),
                formatArea: utils.formatArea
            });
        } else if (type !== 'marker' && type !== 'circlemarker') {
                l.hideMeasurements();
            }

        if (type !== 'marker' && type !== 'circlemarker') {
            l.setStyle({dashArray: $("#draw-line-type").val()});

            l.setStyle({lineCap: $("#draw-line-cap").val()});

            l.setStyle({color: $("#draw-colorpicker-input").val()});

            l.setStyle({fillColor: $("#draw-colorpicker-input").val()});

            l.setStyle({weight: $("#draw-line-weight").val()});

            l.setStyle({opacity: "1.0"});
        }

        if (type === 'polyline') {

            l.showExtremities($("#draw-line-extremity").val(), $("#draw-line-extremity-size").val(), $("#draw-line-extremity-where").val());

            l._extremities = {
                pattern: $("#draw-line-extremity").val(),
                size: $("#draw-line-extremity-size").val(),
                where: $("#draw-line-extremity-where").val()
            };
        }

        if (type === 'circlemarker') {
            l.setStyle({opacity: "0.0"});
            l.setStyle({fillOpacity: "0.0"});
        }
    },

    /**
     *
     * @returns {boolean}
     */
    getDrawOn: function () {
        return drawOn;
    },

    /**
     *
     * @returns {L.FeatureGroup|*}
     */
    getLayer: function () {
        return store.layer;
    },

    getDrawItems: function () {
        return drawnItems;
    },

    /**
     *
     * @returns {gc2table}
     */
    getTable: function () {
        return table;
    },

    getStore: function () {
        return store;
    },

    /**
     *
     * @param f {string}
     */
    setDestruct: function (f) {
        destructFunctions.push(f);
    },

    download: function () {
        if (store.layer.getLayers().length === 0) {
            alert(__("No drawings in the map"));
            return;
        }
        let geojson = {
            "type": "FeatureCollection",
            "features": []
        };
        store.layer.eachLayer(function (layer) {
            let feature = layer.toGeoJSON(GEOJSON_PRECISION);
            feature.type = "Feature"; // Is for some reason not set in Leaflet. QGIS needs this.
            geojson.features.push(feature);
        });
        let blob = new Blob([JSON.stringify(geojson)], {type: "text/plain;charset=utf-8"});
        fileSaver.saveAs(blob, "drawings.geojson");
    },

    setConflictSearch: function (o) {
        conflictSearch = o;
    },
    setBlueIdea: function (o) {
        blueIdea = o;
    },
};


/**
 * PolylineExtremities.js
 */
(function () {

    var __onAdd = L.Polyline.prototype.onAdd,
        __onRemove = L.Polyline.prototype.onRemove,
        __bringToFront = L.Polyline.prototype.bringToFront;


    var PolylineExtremities = {

        SYMBOLS: {
            stopM: {
                'viewBox': '0 0 2 8',
                'refX': '1',
                'refY': '4',
                'markerUnits': 'strokeWidth',
                'orient': 'auto',
                'path': 'M 0 0 L 0 8 L 2 8 L 2 0 z'
            },
            squareM: {
                'viewBox': '0 0 8 8',
                'refX': '4',
                'refY': '4',
                'markerUnits': 'strokeWidth',
                'orient': 'auto',
                'path': 'M 0 0 L 0 8 L 8 8 L 8 0 z'
            },
            dotM: {
                'viewBox': '0 0 20 20',
                'refX': '10',
                'refY': '10',
                'markerUnits': 'strokeWidth',
                'orient': 'auto',
                'path': 'M 10, 10 m -7.5, 0 a 7.5,7.5 0 1,0 15,0 a 7.5,7.5 0 1,0 -15,0'
            },
            dotL: {
                'viewBox': '0 0 45 45',
                'refX': '22.5',
                'refY': '22.5',
                'markerUnits': 'strokeWidth',
                'orient': 'auto',
                // http://stackoverflow.com/a/10477334
                'path': 'M 22.5, 22.5 m -20, 0 a 20,20 0 1,0 40,0 a 20,20 0 1,0 -40,0'
            },
            arrowM: {
                'viewBox': '0 0 10 10',
                'refX': '1',
                'refY': '5',
                'markerUnits': 'strokeWidth',
                'orient': 'auto',
                'path': 'M 0 0 L 10 5 L 0 10 z'
            },
        },

        onAdd: function (map) {
            __onAdd.call(this, map);
            this._drawExtremities();
        },

        onRemove: function (map) {
            map = map || this._map;
            __onRemove.call(this, map);
        },

        bringToFront: function () {
            __bringToFront.call(this);
            this._drawExtremities();
        },

        _drawExtremities: function () {
            var pattern = this._pattern;
            this.showExtremities(pattern);
        },

        showExtremities: function (pattern, size, where) {
            this._pattern = pattern;

            var id = 'pathdef-' + L.Util.stamp(this);

            this._path.setAttribute('marker-end', 'none');
            this._path.setAttribute('marker-start', 'none');

            if (pattern === "none") {
                return this;
            }

            /* If not in SVG mode or Polyline not added to map yet return */
            /* showExtremities will be called by onAdd, using value stored in this._pattern */
            if (!L.Browser.svg || typeof this._map === 'undefined') {
                return this;
            }

            /* If empty pattern, hide */
            if (!pattern) {
                if (this._patternNode && this._patternNode.parentNode)
                    this._map._pathRoot.removeChild(this._patternNode);
                return this;
            }

            var svg = this._map._renderer._container;

            // Check if the defs node is already created
            var defsNode;
            if (L.DomUtil.hasClass(svg, 'defs')) {
                defsNode = svg.getElementById('defs');

            } else {
                L.DomUtil.addClass(svg, 'defs');
                defsNode = L.SVG.create('defs');
                defsNode.setAttribute('id', 'defs');
                var svgFirstChild = svg.childNodes[0];
                svg.insertBefore(defsNode, svgFirstChild);
            }

            // Add the marker to the line

            this._path.setAttribute('id', id);

            var markersNode, markerPath, symbol = PolylineExtremities.SYMBOLS[pattern];

            // Check if marker is already created
            if (document.getElementById("defs").querySelector("#" + id)) {
                markersNode = document.getElementById("defs").querySelector("#" + id);
                markerPath = document.getElementById("defs").querySelector("#" + id).querySelector("path")
            } else {
                markersNode = L.SVG.create('marker');
                markerPath = L.SVG.create('path');
            }


            // Create the markers definition
            markersNode.setAttribute('id', id);
            for (var attr in symbol) {
                if (attr !== 'path') {
                    markersNode.setAttribute(attr, symbol[attr]);
                } else {
                    markerPath.setAttribute('d', symbol[attr]);
                }
            }

            // Copy the path apparence to the marker
            var styleProperties = ['class', 'stroke', 'stroke-opacity'];
            for (const element of styleProperties) {
                var styleProperty = element;
                var pathProperty = this._path.getAttribute(styleProperty);
                markersNode.setAttribute(styleProperty, pathProperty);
            }
            markersNode.setAttribute('fill', markersNode.getAttribute('stroke'));
            markersNode.setAttribute('fill-opacity', markersNode.getAttribute('stroke-opacity'));
            markersNode.setAttribute('stroke-opacity', '0');
            markersNode.setAttribute('markerWidth', size);
            markersNode.setAttribute('markerHeight', size);

            markersNode.appendChild(markerPath);

            defsNode.appendChild(markersNode);

            switch (where) {
                case "1":
                    this._path.setAttribute('marker-end', 'url(#' + id + ')');
                    break;

                case "2":
                    this._path.setAttribute('marker-start', 'url(#' + id + ')');
                    break;

                case "3":
                    this._path.setAttribute('marker-end', 'url(#' + id + ')');
                    this._path.setAttribute('marker-start', 'url(#' + id + ')');
                    break;
            }

            return this;
        }

    };

    L.Polyline.include(PolylineExtremities);

    L.LayerGroup.include({
        showExtremities: function (pattern) {
            for (var layer in this._layers) {
                if (typeof this._layers[layer].showExtremities === 'function') {
                    this._layers[layer].showExtremities(pattern);
                }
            }
            return this;
        }
    });

})();
