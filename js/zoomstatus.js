//--------------------------------------------------------------------------------
//    $Id: zoomstatus.js,v 1.8 2013/02/25 07:51:19 wolf Exp $
//--------------------------------------------------------------------------------
//    Erklaerung:    http://www.netzwolf.info/kartografie/openlayers/zoomstatus
//--------------------------------------------------------------------------------
//    Fragen, Wuensche, Bedenken, Anregungen?
//    <openlayers(%40)netzwolf.info>
//--------------------------------------------------------------------------------

OpenLayers.Control.ZoomStatus = OpenLayers.Class(OpenLayers.Control, {

    defaultHtml: '<b>Zoom=${actual}, bei Zoom=${next} werden weitere Daten eingeblendet</b>',
    displayClass: 'olControlZoomStatus',

    //---------------------------------------------------------
    //    init
    //---------------------------------------------------------

    initialize: function (options) {
        OpenLayers.Control.prototype.initialize.apply(this, [options]);
        this.options = options || {};
        this.lastZoom = -1;
    },

    //---------------------------------------------------------
    //    destroy
    //---------------------------------------------------------

    destroy: function () {
        if (this.map) {
            this.map.events.unregister('move', this, this.redraw);
        }
        OpenLayers.Control.prototype.destroy.apply(this, arguments);
    },

    //---------------------------------------------------------
    //    attached to map
    //---------------------------------------------------------

    setMap: function () {
        OpenLayers.Control.prototype.setMap.apply(this, arguments);
        this.map.events.register('move', this, this.checkZoomChanged);
        this.map.events.register('addlayer', this, this.redraw);
        this.map.events.register('changelayer', this, this.redraw);
    },

    //---------------------------------------------------------
    //    make control visible
    //---------------------------------------------------------

    draw: function () {
        OpenLayers.Control.prototype.draw.apply(this, arguments);
        this.div.className = this.displayClass;
        this.div.style.display = 'none';
        return this.div;
    },

    //---------------------------------------------------------
    //    update info
    //---------------------------------------------------------

    checkZoomChanged: function () {
        if (this.map.zoom !== this.lastZoom) {
            this.redraw();
        }
    },

    redraw: function () {
        this.lastZoom = this.map.zoom;
        const next = this.getNextZoomStep();
        const text = this.options.html || this.defaultHtml;

        if (next !== null && next > this.lastZoom) {
            this.div.innerHTML = OpenLayers.String.format(text, {
                actual: this.lastZoom,
                delta: next - this.lastZoom,
                next: next
            });
            this.div.style.display = 'block';
        } else {
            this.div.style.display = 'none';
        }
    },

    //---------------------------------------------------------
    //    get next info
    //---------------------------------------------------------

    getNextZoomStep: function () {
        if (!this.map) { return null; }

        // Collect zoomSteps bitmask from all visible layers
        let steps = 0;
        for (const layer of this.map.layers) {
            if (layer.zoomSteps && layer.visibility) {
                steps |= layer.zoomSteps;
            }
        }

        // Find next zoom level where data will be shown
        const maxZoom = this.map.getNumZoomLevels() || 30;
        for (let i = this.map.zoom + 1; i < maxZoom; i++) {
            if ((steps >> i) & 1) {
                return i;
            }
        }

        return null; // No further zoom steps
    },

    CLASS_NAME: 'OpenLayers.Control.ZoomStatus'
});

//--------------------------------------------------------------------------------
//    $Id: zoomstatus.js,v 1.8 2013/02/25 07:51:19 wolf Exp $
//--------------------------------------------------------------------------------
