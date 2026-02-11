/**
 * Namespace: Util.OSM
 */
OpenLayers.Util.OSM = {};

/**
 * Class: OpenLayers.Layer.OSM.Mapnik
 *
 * Inherits from:
 *  - <OpenLayers.Layer.OSM>
 */
OpenLayers.Layer.OSM.Mapnik = OpenLayers.Class(OpenLayers.Layer.OSM, {
    /**
     * Constructor: OpenLayers.Layer.OSM.Mapnik
     *
     * Parameters:
     * name - {String}
     * options - {Object} Hashtable of extra options to tag onto the layer
     */
    initialize: function(name, options) {
        const url = "https://tile.openstreetmap.org/${z}/${x}/${y}.png";
        options = OpenLayers.Util.extend({ numZoomLevels: 19 }, options);
        const newArguments = [name, url, options];
        OpenLayers.Layer.OSM.prototype.initialize.apply(this, newArguments);
    },

    CLASS_NAME: "OpenLayers.Layer.OSM.Mapnik"
});

/**
 * Class: OpenLayers.Layer.OSM.CyclOSM
 *
 * Inherits from:
 *  - <OpenLayers.Layer.OSM>
 */
OpenLayers.Layer.OSM.CyclOSM = OpenLayers.Class(OpenLayers.Layer.OSM, {
    /**
     * Constructor: OpenLayers.Layer.OSM.CyclOSM
     *
     * Parameters:
     * name - {String}
     * options - {Object} Hashtable of extra options to tag onto the layer
     */
    initialize: function(name, options) {
        const url = "https://tile-cyclosm.openstreetmap.fr/cyclosm/${z}/${x}/${y}.png";
        options = OpenLayers.Util.extend({
            numZoomLevels: 20,
            attribution: "Map style: CyclOSM (CC-BY-SA) | Map data: © OpenStreetMap contributors"
        }, options);
        const newArguments = [name, url, options];
        OpenLayers.Layer.OSM.prototype.initialize.apply(this, newArguments);
    },

    CLASS_NAME: "OpenLayers.Layer.OSM.CyclOSM"
});
