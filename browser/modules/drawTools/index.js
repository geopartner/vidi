/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2021 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

/**
 * Common tools for drawing
 */

/**
 * Get readable distance of layer
 * @param e
 * @returns {string}
 * @private
 */
const getDistance = e => {
    let tempLatLng = null;
    let totalDistance = 0.00000;
    $.each(e._latlngs, function (i, latlng) {
        if (tempLatLng == null) {
            tempLatLng = latlng;
            return;
        }
        totalDistance += tempLatLng.distanceTo(latlng);
        tempLatLng = latlng;
    });
    return L.GeometryUtil.readableDistance(totalDistance, true);
};

/**
 * Get readable distance of feature
 * @param e
 * @returns {string}
 * @private
 */
const getFeatureDistance = feature => {
    let tempLatLng = null;
    let totalDistance = 0.00000;
    let coords = feature.geometry.coordinates;
    $.each(coords, function (i, latlng) {
        let current = L.latLng(latlng[1], latlng[0]);
        if (tempLatLng == null) {
            tempLatLng = current;
            return;
        }
        totalDistance += tempLatLng.distanceTo(current);
        tempLatLng = current;
    });
    return L.GeometryUtil.readableDistance(totalDistance, true);
};

/**
 * Get readable area of feature
 * @param e
 * @returns {string}
 * @private
 */
const getFeatureArea = feature => {
    let latLngs = [];
    for (const latLng of feature.geometry.coordinates[0])
        latLngs.push(L.latLng(latLng[1], latLng[0]));

    return L.GeometryUtil.geodesicArea(latLngs);
};

/**
 * Get readable area of layer
 * @param e
 * @returns {string}
 * @private
 */
const getArea = e => {
    return L.GeometryUtil.readableArea(L.GeometryUtil.geodesicArea(e.getLatLngs()[0]), true);
};

const getAreaValue = e => {
    return L.GeometryUtil.geodesicArea(e.getLatLngs()[0]);
};

const getAreaOfCircle = e => {
    return L.GeometryUtil.readableArea(Math.pow(e.getRadius(), 2) * Math.PI, true);
};
const getAreaOfCircleValue = e => {
    return Math.pow(e.getRadius(), 2) * Math.PI;
};

module.exports = { getDistance, getFeatureDistance, getArea, getAreaValue, getFeatureArea, getAreaOfCircle, getAreaOfCircleValue };
