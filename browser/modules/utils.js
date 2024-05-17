/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2019 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

'use strict';

module.exports = {
    set: function () {
        return this;
    },
    init: function () {
    },
    formatArea: (a) => {
        
        const kmBigArea= 1000000;
        const haBigArea =  10000;
        const smallArea = 1;

        if (a > kmBigArea) {
          a = a / kmBigArea;
          return a.toFixed(2) + ' ' + 'km²';
        }
        if (a < kmBigArea && a > haBigArea) {
            a = a / haBigArea;
            return a.toFixed(2) + ' ' + 'ha';
        }
        const unit= 'm²'; 
        if (a < 100 && a > smallArea) {
          return a.toFixed(2) + ' ' + unit;
        }
        const digits =  Math.floor(Math.abs(Math.log10(a))) +2;
        return a.toFixed(digits) + ' ' + unit;

    },
    /**
     * @todo Remove deprecated "height" parameter
     */
    createMainTab: function (id, name, info, height, icon, rawIconWasProvided = false, moduleId = false) {
        let el = `#${id}-content`;

        let iconRaw;
        if (rawIconWasProvided) {
            iconRaw = icon;
        } else {
            icon = icon || "help";
            iconRaw = `<i data-container="body" data-toggle="tooltip" data-bs-placement="left" title="${name}" class="bi ${icon}"></i>`;
        }

        if (moduleId === false) {
            moduleId = ``;
        }

        $(`<li role="presentation">
            <a class="nav-link" data-bs-toggle="tab" data-module-id="${moduleId}" href="#${id}-content" aria-controls role="tab" data-toggle="tab" data-module-title="${name}">${iconRaw}</a>
        </li>`).appendTo("#main-tabs");
        $(`<div role="tabpanel" class="tab-pane fade" id="${id}-content"></div>`).appendTo(".tab-content.main-content");
        $(`<div class="help-btn"><i class="bi bi-question-circle help-btn"></i></div>`).appendTo(el).on("click", function () {
            createAlert($(this), info);
        });
        $(`<div></div>`).appendTo(el);
        $(`<div id="${id}"></div>`).appendTo(el);

    },

    createNavItem: function (id, dropdown) {
        $('<li id="' + id + '" class="' + (dropdown ? 'dropdown' : '') + '"></li>').appendTo('#main-navbar');
    },

    injectCSS: function (css) {
        $("head").append("<style>" + css + "</style>");
    },

    viewport: function () {
        return {
            width: $(document).width(),
            height: $(document).height()
        }
    },

    screen: function () {
        return {
            width: screen.width,
            height: screen.height
        }
    },

    transform: function (from, to, coordinates) {
        const proj4 = require("proj4");
        return proj4(from, to, coordinates);
    },

    popupCenter: function (url, width, height, name) {
        let leftPosition, topPosition;
        //Allow for borders.
        leftPosition = (window.screen.width / 2) - ((width / 2) + 10);
        //Allow for title and status bars.
        topPosition = (window.screen.height / 2) - ((height / 2) + 50);
        //Open the window.
        window.open(url, name,
            "status=no,height=" + height + ",width=" + width + ",resizable=yes,left="
            + leftPosition + ",top=" + topPosition + ",screenX=" + leftPosition + ",screenY="
            + topPosition + ",toolbar=no,menubar=no,scrollbars=no,location=no,directories=no");
    },

    cursorStyle: function () {
        return {
            crosshair: function () {
                document.getElementById('map').style.cursor = 'crosshair'
            },
            pointer: function () {
                document.getElementById('map').style.cursor = 'pointer'
            },
            reset: function () {
                document.getElementById('map').style.cursor = ''
            }
        }
    },

    __: function (txt, dict) {

        if ((dict[txt]) && (dict[txt][window._vidiLocale])) {
            return dict[txt][window._vidiLocale];
        } else {
            return txt;
        }

    },

    toggleFullScreen: function () {
        let fullScreenMode = false;
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                fullScreenMode = true;
            });
        } else if (document.exitFullscreen) {
                document.exitFullscreen().then(() => {
                    fullScreenMode = false;
                });
            }
        return fullScreenMode;
    },

    /**
     *
     * @param string
     * @returns {null|{x: *, y: *, z: *}}
     */
    parseZoomCenter: function (string) {
        if (!string) return null;
        const arr = string.split('/');
        if (
            !isNaN(parseInt(arr[1])) &&
            !isNaN(parseInt(arr[2])) &&
            !isNaN(parseInt(arr[3]))
        ) {
            return {
                z: arr[1],
                x: arr[2],
                y: arr[3],
            }
        } else {
            return null;
        }
    },

    showInfoToast: (text, options = {delay: 1500, autohide: true}, elementId = "info-toast") => {
        try {
            document.querySelector(`#${elementId} .toast-body`).innerHTML = text;
            const e = new bootstrap.Toast(document.getElementById(elementId), options);
            e.show();
        } catch (e) {
            console.log("Info toast could not be shown");
        }
    },

    hideInfoToast: (elementId = "info-toast") => {
        try {
            const e = new bootstrap.Toast(document.getElementById(elementId));
            e.hide();
        } catch (e) {
            console.log("Info toast could not be hidden");
        }
    },

    removeDuplicates: (inputArray) => {
        let temp = {};
        for (const element of inputArray) {
            temp[element] = true;
        }
        let result = [];
        for (let key in temp) {
            result.push(key);
        }
        return result;
    },

    isEmbedEnabled: () => {
        return $(`.embed.modal`).length > 0
    },

    splitBase64(str) {
        const parts = str.split(';');
        const contentType = parts[0].split(':')[1];
        const raw = parts[1].split(',')[1];
        return {
            contentType,
            raw
        };
    },
    isPWA() {
        return window.navigator.standalone === true || // iOS PWA Standalone
            document.referrer.includes('android-app://') || // Android Trusted Web App
            ["fullscreen", "standalone", "minimal-ui"].some(
                (displayMode) => window.matchMedia('(display-mode: ' + displayMode + ')').matches
            ) // Chrome PWA (supporting fullscreen, standalone, minimal-ui)
    }
};
