//------------------------------------------------------------------------------
//    $Id: popupmarker.js,v 1.125 2014/06/28 10:14:02 wolf Exp wolf $
//------------------------------------------------------------------------------
//    Erklaerung:    http://www.netzwolf.info/kartografie/openlayers/#csv
//------------------------------------------------------------------------------
//    Fragen, Wuensche, Bedenken, Anregungen?
//    <openlayers(%40)netzwolf.info>
//------------------------------------------------------------------------------
//
//    $Log: popupmarker.js,v $
//    Revision 1.125  2014/06/28 10:14:02  wolf
//    + fixBrokenJsonp
//
//    Revision 1.124  2014/02/19 10:53:34  wolf
//    * cleanup
//
//    Revision 1.123  2014/02/14 15:05:06  wolf
//    + formatValue: ~user, ~in
//
//    Revision 1.122  2014/02/12 20:26:30  wolf
//    * map -> this.map
//
//    Revision 1.121  2014/02/10 13:24:50  wolf
//    + clickout
//
//    Revision 1.120  2013/12/06 08:01:22  wolf
//    + clusterMinZoom
//
//    Revision 1.119  2013/11/25 23:03:44  wolf
//    + undefinedMarkerIconUrl
//    + undefinedMarkerIconSize
//    + highlight members
//
//    [...]
//
//    Revision 1.1  2010/01/21 10:29:17  wolf
//    Initial Revision
//
//------------------------------------------------------------------------------

if (!OpenLayers.Lang.en) {
    OpenLayers.Lang.en = {};
}

if (!OpenLayers.Lang.en.errorLoadingCSV) {
    OpenLayers.Lang.en.errorLoadingCSV =
        'Error loading CSV file "${url}": ${phase}';
}

OpenLayers.Layer.PopupMarker = OpenLayers.Class(OpenLayers.Layer.Markers,{

    popupOnHover: true,
    popupOnClick: true,
    restrictMapExtent: false,
    location: null,
    fieldSeparator: '\t',
    defaultIcon: null,
    popupClass:OpenLayers.Popup.AnchoredBubble,
    createUrlForBounds: null,
    editUrl: null,
    requestUser: null,
    requestPassword: null,
    requestAsync: true,
    clickHandler: null,
    opacity: null,
    minZoom: 10,
    lastZoom: -1,
    blockSize: 0.1,
    clusterSize: 0,
    clusterMinZoom: 0,
    clusterSort: null,
    clusterLimit: 10,
    zindex: null,
    cloudImage: null,
    zoomSteps: null,
    hideMarkerBelowMinZoom: false,
    region: null,            // XXX experimental
    maxTooltipWidth: null,
    closeOnClick: false,        // close by click into popup
    closeKeyCode: false,        // close popup by key with this keyCode
    clickDistance: 0,        // open by click near to marker
    clickout: false,        // close by click into map
    fieldTitles: {},
    fieldTypes: {},
    fieldValues: {},
    enableUpdate: false,
    enableCreate: false,
    enableDelete: false,
    enableLocate: false,
    locateId: null,
    reloadTimer: null,
    reloadInterval: null,
    labelEdit: 'Bearbeiten',
    labelDelete: 'L' + String.fromCharCode(246) + 'schen',
    labelConfirmDelete: 'Marker permanent l' + String.fromCharCode(246) + 'schen?',
    labelLocate: 'Verschieben',
    textAllItems: 'Alle ${count} Eintr' + String.fromCharCode(228) + 'ge',
    textFirstItems: 'Die ersten ${count} von ${all} Eintr' + String.fromCharCode(228) + 'gen',
    locateMarker: null,
    selectId: null,
    classByType: null,
    undefinedMarkerIconUrl: null,
    undefinedMarkerIconScale: 0.5,
    fixBrokenJsonp: false,

    //----------------------------------------------------------------------
    //    Init
    //----------------------------------------------------------------------

    initialize: function(name, options) {

        OpenLayers.Layer.Markers.prototype.initialize.apply(this,arguments);

        this.erase();

        this.loadBounds        = null;
        this.loadedBounds    = null;
        this.loadingUrl        = null;
        this.nextId        = 0;

        if (this.opacity ) { this.setOpacity(opacity); }
        if (this.minZoom ) { this.zoomSteps = 1<<this.minZoom; }

        if (!window.callbackCounter) { window.callbackCounter = 0; }
        if (!window.callbacks      ) { window.callbacks = []; }

        this.currentMarker = null;

        if (this.reloadInterval && this.location) {

            const closure = this;
            this.blockSize = 0;
            this.reloadTimer=window.setInterval (function() {
                closure.request(closure.location);
            }, this.reloadInterval);
        }
    },

    destroy: function () {

        if (this.clickHandler) { this.clickHandler.destroy(); }
        this.erase();
    },

    afterAdd: function() {

        if (this.location) { this.request(this.location); }

        if (this.enableCreate!==false || this.clickDistance>0 ||
                this.enableLocate || this.clickout) {
            this.clickHandler = new OpenLayers.Handler.Click (this,
                {'click': this.click}, {'single': true});
            this.clickHandler.activate();
        }
    },

    //----------------------------------------------------------------------
    //    click to create marker
    //----------------------------------------------------------------------

    click: function(ev) {

        if (this.locateMarker) {

            var marker = this.locateMarker;

            this.cancelLocate();

            if (ev.shiftKey || ev.ctrlKey) { return null; }

            const lonLat=this.map.getLonLatFromViewPortPx(ev.xy);

            this.drawTemporaryIcon (this.createIconFromData(marker.data, true),
                this.map.getLayerPxFromLonLat (lonLat));

            lonLat.transform(this.map.getProjectionObject(),this.map.displayProjection);
            marker.data.lat = lonLat.lat;
            marker.data.lon = lonLat.lon;

            const postData = OpenLayers.Util.getParameterString (marker.data);
            this.updateMarkerOnServer (marker, postData);

            return null;
        }

        if (!this.visibility) { return null; }

        if (this.clickout && this.currentPopup) {

            this.destroyPopup();
        }

        if (this.clickDistance>0 && !ev.ctrlKey && !ev.shiftKey && ev.xy && this.markers) {

            if (this.currentPopup) {

                this.destroyPopup();

            } else if (this.popupOnClick && (this.map.getZoom() >= this.minZoom || !this.hideMarkerBelowMinZoom)) {

                marker = this.findNearestMarker (ev.xy, this.clickDistance);
                if (marker) { this.markerClick.apply (marker, [ev]); }
            }
        }

        if (this.enableCreate && ev.ctrlKey && this.enableCreate && this.lastZoom >= this.minZoom) {

            if (this.currentPopup) {
                this.destroyPopup();
                return false;
            }

            this.createTemporaryMarker (this.map.getLonLatFromViewPortPx(ev.xy).
                                transform(this.map.getProjectionObject(), this.map.displayProjection));
        }

        return false;
    },

    createTemporaryMarker: function (lonlat, data) {

        if (this.currentPopup) { this.destroyPopup(); }
        if (!data) { data={}; }

        ++this.nextId;

        data.lon = lonlat.lon;
        data.lat = lonlat.lat;
        data.id  = -this.nextId;

        lonlat.transform(this.map.displayProjection, this.map.getProjectionObject());

        if (!this.map.getExtent().containsLonLat(lonlat)) {

            this.map.moveTo (lonlat, Math.max (this.map.getZoom(), this.minZoom));
        }

        const marker = this.createMarker (data);

        marker.temporary = true;

        this.createEditPopup (marker, true);
    },

    findNearestMarker: function (center, maxDistance) {

        if (!center || !this.markers) { return null; }

        if (!maxDistance) { maxDistance = 1e10; }

        let result = null;
        let dist   = maxDistance * maxDistance + 1;

        for (const i in this.markers) {
            const marker = this.markers[i];
            const icon   = marker.icon;
            if (!icon) { continue; }
            const px    = icon.px;
            if (!px) { continue; }
            const dx    = px.x - center.x;
            const dy    = px.y - center.y;
            const d2    = dx*dx + dy*dy;
            if (d2 >= dist) { continue; }
            result    = marker;
            dist    = d2;
        }
        return result;
    },

    //----------------------------------------------------------------------
    //    Reload Marker on move or zoom
    //----------------------------------------------------------------------

    moveTo: function (bounds, zoomChanged, dragging) {

        OpenLayers.Layer.Markers.prototype.moveTo.apply(this,arguments);

        //--------------------------------------------------------------
        //    but not while dragging or invisible or moving marker
        //--------------------------------------------------------------

        if (dragging || !this.visibility || this.locateMarker) { return; }

        //--------------------------------------------------------------
        //    XXX QUICKFIX WILL BE REMOVED XXX
        //--------------------------------------------------------------

        if (this.zindex && this.div.style.zIndex!=this.zindex) {

            this.div.style.zIndex=this.zindex;
        }

        //--------------------------------------------------------------
        //    Change visibility of marker
        //--------------------------------------------------------------

        if ((this.lastZoom>=this.minZoom) != (this.map.zoom>=this.minZoom)) {
            this.lastZoom = this.map.zoom;
            if (!this.blockSize && this.lastZoom < this.minZoom && this.hideMarkerBelowMinZoom) {
                this.erase();
            }
            if (this.location && this.createUrlForBounds) {
                if (this.map.zoom >= this.minZoom) {
                    for (var i=0; i<this.markers.length; i++) {
                        this.markers[i].display(this.markers[i].data._csize<=0);
                    }
                } else {
                    for (i=0; i<this.markers.length; i++) {
                        this.markers[i].display(this.markers[i].data._csize>0);
                    }
                }
            }
            if (!this.location && this.createUrlForBounds && this.hideMarkerBelowMinZoom) {
                for (i=0; i<this.markers.length; i++) {
                    this.markers[i].display(this.map.zoom >= this.minZoom);
                }
            }
        }

        //--------------------------------------------------------------
        //    Transform center and border to geogr. Coordinates
        //--------------------------------------------------------------

        if (this.map.zoom >= this.minZoom && this.createUrlForBounds) {

            this.loadBounds = bounds.clone().
                transform(this.map.getProjectionObject(), this.map.displayProjection);

            this.loadNext();
        }

        //--------------------------------------------------------------
        //    delayed Popup
        //--------------------------------------------------------------

        const marker = this.delayedPopupMarker;
        if (marker) {
            this.delayedPopupMarker=null;
            this.createPopup(marker);
            this.currentMarker=marker;
        }
    },

    //----------------------------------------------------------------------
    //    Load next
    //----------------------------------------------------------------------

    getUnknownArea: function (bounds) {

        if (!this.blockSize) { return bounds; }

        const l0 = Math.floor (bounds.left  / this.blockSize);
        const r0 = Math.ceil  (bounds.right / this.blockSize);
        const b0 = Math.floor (bounds.bottom/ this.blockSize);
        const t0 = Math.ceil  (bounds.top   / this.blockSize);
        let l=r0;
        let r=l0;
        let t=b0;
        let b=t0;
        for (let y=b0; y<t0; y++) {
            for (let x=l0; x<r0; x++) {
                const id = y+':'+x;
                if (this.loadedAreas[id]) { continue; }
                this.loadedAreas[id]=true;
                if (x< l) { l=x;   }
                if (x>=r) { r=x+1; }
                if (y< b) { b=y;   }
                if (y>=t) { t=y+1; }
            }
        }

        if (l>=r || b>=t) { return null;}

        return new OpenLayers.Bounds (
            l*this.blockSize,b*this.blockSize,r*this.blockSize,t*this.blockSize);
    },

    loadNext: function () {

        if (this.loadBounds==this.loadedBounds) { return; }
        if (this.loadingUrl) { return; }
        this.loadedBounds = this.loadBounds;
        const area = this.getUnknownArea (this.loadedBounds);
        if (area) { this.request (this.createUrlForBounds(area)); }
    },

    //----------------------------------------------------------------------
    //    Download CSV
    //----------------------------------------------------------------------

    request: function (url) {

        if(this.loadingUrl) { return false; }
        this.loadingUrl=url;

        OpenLayers.Request.GET({
            url:this.loadingUrl,
            success:this.requestSuccess,
            failure:this.requestFailure,
            scope:this
        });
        this.events.triggerEvent('loadstart');
        return true;
    },

    //----------------------------------------------------------------------
    //    Success downloading CSV
    //----------------------------------------------------------------------

    requestSuccess: function(request) {

        if (!request.response && !request.status) {

            OpenLayers.Console.userError(OpenLayers.i18n('errorLoadingCSV',{
                'url':    this.loadingUrl,
                'phase': 'request failed (timeout or no connection)'
            }));

        } else if (!request.responseText) {

            OpenLayers.Console.userError(OpenLayers.i18n('errorLoadingCSV',{
                'url':    this.loadingUrl,
                'phase': 'request failed (no data)'
            }));

        } else {

            const objects = this.parseCSV (request.responseText);
            if (!this.blockSize) { this.erase (true);}
            //if (objects.length>0) { objects[objects.length-1].isLatest=true;}
            for (let i=0; objects.length>i; i++) {
                this.createMarker (objects[i]);
            }
        }

        if (this.loadingUrl==this.location && !this.map.getCenter()) {
            const extent = this.getBounds();
            if (extent) {
                this.map.zoomToExtent(extent);
                if (this.restrictMapExtent) {
                    extent.extend(this.map.restrictedExtent);
                    this.map.restrictedExtent=extent;
                }
            }
        }

        if (!this.map.getCenter()) { this.map.zoomToMaxExtent(); }
        this.events.triggerEvent('loadend');
        this.loadingUrl = null;
        if (this.visibility) { this.loadNext(); }

        if (this.selectId) {
            const marker = this.getMarkerByDataId(this.selectId);
            this.selectId = null;
            this.createPopup (marker, true);
        }
    },

    //----------------------------------------------------------------------
    //    Error downloading of CSV
    //----------------------------------------------------------------------

    requestFailure: function(request) {

        OpenLayers.Console.userError(OpenLayers.i18n('errorLoadingCSV',{
            'url':    this.loadingUrl,
            'phase': 'request failed (' +
                request.status + ': ' + request.statusText + ')'
        }));
        if (!this.map.getCenter()) { this.map.zoomToMaxExtent(); }
        this.events.triggerEvent('loadend');
        this.loadingUrl = null;
        this.loadNext();
    },

    //----------------------------------------------------------------------
    //    createObject
    //----------------------------------------------------------------------

    getMarkerByDataId: function (id) {

        for (let i=0; i<this.markers.length; i++) {
            if (this.markers[i].data.id==id) { return this.markers[i]; }
        }
        return null;
    },

    createMarker: function (data, isnew) {

        if (!data) { return null; }
        if (this.filter && !this.filter(data)) { return null; }
        if (!data.id) {
            ++this.nextId;
            data.id = '' + this.nextId;
        }
        if (this.getMarkerByDataId(data.id)) { return null; }

        if (!data.lat && data.point) { data.lat=data.point.split(',')[0]; }
        if (!data.lon && data.point) { data.lon=data.point.split(',')[1]; }
        const lon = parseFloat (data.lon, 10);
        const lat = parseFloat (data.lat, 10);

        if (isNaN(lon) || isNaN(lat)) {

            if (data.location) {

                if (!this.locations[data.location]) {
                    this.locations[data.location] = [];
                }
                this.locations[data.location].push(data);
            }
            return null;
        }

        const lonLat=new OpenLayers.LonLat(lon, lat).
            transform(this.map.displayProjection, this.map.getProjectionObject());

        const marker = new OpenLayers.Marker (lonLat, this.createIconFromData(data));

        marker.icon.imageDiv.firstChild.className='olPopupMarker';
        marker.icon.imageDiv.className='olPopupMarker';

        if (data['~group']) {

            marker.icon.imageDiv;
            OpenLayers.Element.addClass (marker.icon.imageDiv, data['~group']);
        }

        //---------------------------------------------------------
        //    link
        //---------------------------------------------------------

        marker.layer=this;
        marker.data =data;

        //---------------------------------------------------------
        //    handle site relations
        //---------------------------------------------------------

        if (this.classByType && data.type && this.classByType[data.type] && data['~members']) {

            const groupMemberIds = data['~members'].split(',');
            const groupClass     = this.classByType[data.type];
            const groupLayer     = this;

            marker.icon.imageDiv.onmouseover = function() {

                const replacementIcon = null;

                for (const i in groupMemberIds) {

                    const memberId = groupMemberIds[i];
                    const memberMarker = groupLayer.getMarkerByDataId(memberId);

                    if (!memberMarker) continue;
                    OpenLayers.Element.addClass (memberMarker.icon.imageDiv, groupClass);

                    if (memberMarker.icon.url!=marker.layer.undefinedMarkerIconUrl) continue;

                    //---------------------------------
                    //    replace "unknown" icons
                    //    HACK specifically for histmap
                    //---------------------------------

                    memberMarker.icon.url = marker.layer.createIconUrlFromParams(
                        iconParamsFromData(marker.data, false),
                        hasImageFromData(memberMarker.data));

                    memberMarker.icon.size = new OpenLayers.Size(
                        marker.layer.undefinedMarkerIconScale*marker.icon.size.w,
                        marker.layer.undefinedMarkerIconScale*marker.icon.size.h);

                    memberMarker.icon.offset = new OpenLayers.Pixel(
                        marker.layer.undefinedMarkerIconScale*marker.icon.offset.w,
                        marker.layer.undefinedMarkerIconScale*marker.icon.offset.h);

                    memberMarker.icon.calculateOffset = marker.icon.calculateOffset;

                    memberMarker.icon.draw();
                }
            };

            marker.icon.imageDiv.onmouseout = function(evt) {

                if (evt.shiftKey || evt.ctrlKey) return;

                for (const i in groupMemberIds) {

                    const memberId = groupMemberIds[i];
                    const marker = groupLayer.getMarkerByDataId(memberId);

                    if (!marker) continue;
                    OpenLayers.Element.removeClass (marker.icon.imageDiv, groupClass);
                }
            };
        }

        //---------------------------------------------------------
        //    tooltip
        //---------------------------------------------------------

        if (this.createTooltipFromData) {

            this.setTooltip (marker);

        } else if (this.popupOnHover) {

            OpenLayers.Event.observe (marker.icon.imageDiv, 'mouseover',
                OpenLayers.Function.bindAsEventListener(this.markerMouseOver, marker));
            OpenLayers.Event.observe (marker.icon.imageDiv, 'mouseout',
                OpenLayers.Function.bindAsEventListener(this.markerMouseOut, marker));
        }

        if (this.popupOnClick) {

            OpenLayers.Event.observe (marker.icon.imageDiv, 'click',
                OpenLayers.Function.bindAsEventListener(this.markerClick, marker));
            OpenLayers.Event.observe (marker.icon.imageDiv, 'touchend',
                OpenLayers.Function.bindAsEventListener(this.markerClick, marker));
        }

        this.addMarker (marker);
        return marker;
    },

    updateMarker: function (marker, busy) {

        const lonLat=new OpenLayers.LonLat(marker.data.lon, marker.data.lat).
            transform(this.map.displayProjection, this.map.getProjectionObject());

        marker.moveTo (this.map.getLayerPxFromLonLat (lonLat));
        this.setIcon (marker, this.createIconFromData (marker.data, busy));
        this.setTooltip (marker);
    },

    setIcon: function (marker, icon) {

        marker.icon.url   = icon.url;
        marker.icon.size  = icon.size;
        marker.icon.offset= icon.offset;
        marker.icon.draw();
    },

    setTooltip: function (marker) {

        let html = this.createTooltipFromData (marker.data);
        if (!html) { return; }

        if (this.maxTooltipWidth) {
            html = this.wrap (html, this.maxTooltipWidth,
                {displayClass: 'olPopupMarkerTooltip'});
        }

        const size = OpenLayers.Util.getRenderedDimensions (
            html, null,
            {displayClass: 'olPopupMarkerTooltip'});

        let tooltipDiv = marker.tooltipDiv;
        if (!tooltipDiv) {

            tooltipDiv=document.createElement('div');
            tooltipDiv.style.position = 'absolute';
            tooltipDiv.className = 'olPopupMarkerTooltip tooltip';

            marker.tooltipDiv = tooltipDiv;
            marker.icon.imageDiv.appendChild (tooltipDiv);
        }

        tooltipDiv.style.width   = (size.w+1) + 'px';
        //tooltipDiv.style.height  = size.h + 'px';
        tooltipDiv.innerHTML = html;
    },

    wrap: function (html, width, options) {

        const result = [];

        const blocks = OpenLayers.String.trim (html.replace (/<br\/?>/,'\n')).split ('\n');
        while (blocks.length >= 1) {

            const words = OpenLayers.String.trim (blocks.shift()).split(' ');
            while (words.length >= 1) {

                let line = words.shift();
                while (words.length >= 1) {

                    const word = OpenLayers.String.trim (words[0]);
                    const probe = line + '&nbsp;' + word;
                    const size = OpenLayers.Util.getRenderedDimensions (
                        probe, null, options);
                    if (size.w > width) { break; }
                    line = probe;
                    words.shift();
                }

                result.push (line);
            }
        }

        return result.join ('<br/>');
    },

    //----------------------------------------------------------------------
    //    destroyMarker
    //----------------------------------------------------------------------

    destroyMarker: function (marker) {

        if (this.currentMarker==marker) {
            this.destroyPopup();
        }

        OpenLayers.Event.stopObservingElement(marker.icon.imageDiv);

        if(this.markers && this.markers.length) {
            OpenLayers.Util.removeItem (this.markers, marker);
            marker.destroy();
        }
    },

    erase: function (keepCurrent) {

        if (!keepCurrent) { this.destroyPopup(); }

        if (this.markers!==null) {
            for (const index in this.markers) {
                const marker = this.markers[index];
                if (marker != this.currentMarker) {
                    marker.destroy();
                }
            }
        }
        this.markers = [];
        this.loadedAreas= {};
        this.locations    = [];

        if (this.currentMarker) {
            this.markers.push (this.currentMarker);
        }
    },

    //----------------------------------------------------------------------
    //    markerClick
    //----------------------------------------------------------------------

    markerClick: function (evt) {

        if (evt) OpenLayers.Event.stop(evt);

        const layer = this.layer;

        if (evt.shiftKey && !evt.ctrlKey || layer.locateMarker) {
            return false;
        }

        if (layer.clickDistance>0 && layer.currentPopup) {
            layer.destroyPopup();
            layer.currentMarker=null;
        } else if (layer.currentMarker==this) {
            layer.destroyPopup();
            layer.currentMarker=null;
        } else if (!evt.shiftKey || !evt.ctrlKey) {
            layer.createPopup(this);
            layer.currentMarker=this;
        //} else if (layer.enableUpdate) {
            //layer.createEditPopup (this, false);
        }
        return true;
    },

    markerMouseOver: function (ev) {

        if (!ev.shiftKey && !this.layer.currentMarker) {

            this.layer.createPopup(this, true);
            return true;
        }
        return false;
    },

    markerMouseOut: function (ev) {

        if (!this.layer.currentMarker) {
            this.layer.destroyPopup();
        }
    },

    //----------------------------------------------------------------------
    //    selectMarker
    //----------------------------------------------------------------------

    selectMarker: function (marker, options) {

        if (typeof (marker) != 'object') {

            marker=this.getMarkerByDataId(marker);
        }

        if (!marker) { return null; }

        if (this.currentMarker==marker) {
            this.destroyPopup();
            this.currentMarker=null;
            return false;
        }

        if (options && options.pan) {
            this.destroyPopup ();
            this.delayedPopupMarker = marker;
            this.map.panTo (marker.lonlat);
            if (this.map.panTween && this.map.panTween.playing) {
                return true;
            }
            return null;
        }

        this.delayedPopupMarker = null;
        this.createPopup(marker);
        this.currentMarker=marker;
        return true;
    },

    //----------------------------------------------------------------------
    //    Popup - r/o
    //----------------------------------------------------------------------

    processKeyPress: null,

    createPopup: function (marker, nopan) {

        this.destroyPopup ();

        //--------------------------------------------------------------
        //    check for overlapping icons
        //--------------------------------------------------------------

        const cluster = [];
        if (this.clusterSize>0 && this.map.zoom>=this.clusterMinZoom) {

            const limit = this.clusterSize/Math.pow(2,this.map.zoom)*156543;

            for (var i=0; i<this.markers.length; i++) {

                const member=this.markers[i];
                if (Math.abs(marker.lonlat.lat-member.lonlat.lat)>limit) {
                    continue;
                }
                if (Math.abs(marker.lonlat.lon-member.lonlat.lon)>limit) {
                    continue;
                }
                cluster.push (member.data);
                if (member.data.location &&
                        this.locations[member.data.location]) {
                    for (let j=0; j<
                this.locations[member.data.location].length; j++) {
                        cluster.push (this.locations[
                            member.data.location][j]);
                    }
                }
            }
            if (this.clusterSort) {
                cluster.sort(this.clusterSort);
            }
        }

        //--------------------------------------------------------------
        //    create popup
        //--------------------------------------------------------------

        this.currentPopup = new OpenLayers.Popup.FramedCloud (null,
            marker.lonlat,
            null, //size
            (cluster.length>=2 ? this.createHtmlFromList(cluster) : this.createHtmlFromData(marker.data)),
            marker.icon,
            true,
            function (e) {this.layer.destroyPopup();}
        );

        this.currentPopup.layer = this;
        this.currentPopup.markerId = marker.data.id || null;

        if (this.cloudImage) {
            this.currentPopup.imageSrc = this.cloudImage;
        }

        if (nopan) {
            this.currentPopup.panMapIfOutOfView=false;
        }

        this.map.addPopup(this.currentPopup);
        this.map.events.triggerEvent('popupopen');

        this.currentPopup.div.control = this.currentPopup;

        if (this.closeOnClick) {
            this.currentPopup.div.onclick = function () {
                this.control.layer.destroyPopup();
                return false;
            };
        }

        if (this.closeKeyCode) {

            if (!this.processKeyPress) {

                const layer = this;
                this.processKeyPress = function (evt) {

                    if (evt.keyCode === layer.closeKeyCode) {
                        layer.destroyPopup();
                    }
                };
            }

            OpenLayers.Event.observe (document, 'keypress', this.processKeyPress);

        } else {

            this.processKeyPress = false;
        }

        //--------------------------------------------------------------
        //    editbutton
        //--------------------------------------------------------------

        if (this.enableUpdate || this.enableDelete || this.enableLocate) {

            const div = this.currentPopup.div.firstChild.firstChild;
            let buttons = div.getElementsByTagName('button');

            if (this.checkEdit (marker.data)===true && !buttons.length) {

                if (this.enableUpdate) {
                    var button = document.createElement ('button');
                    button.innerHTML = this.labelEdit;
                    button.className = 'edit';
                    div.appendChild (button);
                }

                if (this.enableDelete) {
                    button = document.createElement ('button');
                    button.innerHTML = this.labelDelete;
                    button.className = 'delete';
                    div.appendChild (button);
                }

                if (this.enableLocate) {
                    button = document.createElement ('button');
                    button.innerHTML = this.labelLocate;
                    button.className = 'locate';
                    div.appendChild (button);
                }

                this.currentPopup.updateSize();
                buttons = div.getElementsByTagName('button');
            }

            for (i=0; i<buttons.length; i++) {

                button = buttons[i];
                button.marker = marker;

                switch (button.className) {

                case 'edit':
                    button.onclick = function () {
                        this.marker.layer.createEditPopup (this.marker);
                    };
                    break;

                case 'delete':
                    button.onclick = this.deleteButtonOnClick;
                    break;

                case 'locate':
                    button.onclick = this.locateButtonOnClick;
                    break;

                default:
                    break;
                }
            }
        }
    },

    //----------------------------------------------------------------------
    //    Popup - edit
    //----------------------------------------------------------------------

    createEditPopup: function (marker, isnew) {

        this.destroyPopup ();

        this.currentMarker = marker;

        //--------------------------------------------------------------
        //    create popup
        //--------------------------------------------------------------

        this.currentPopup = new OpenLayers.Popup.FramedCloud (null,
            marker.lonlat,
            null, //size
            this.createForm (marker.data),
            marker.icon,
            true,
            function (e) {this.layer.destroyPopup();}
        );

        this.currentPopup.layer = this;
        if (this.cloudImage) {
            this.currentPopup.imageSrc = this.cloudImage;
        }

        this.map.addPopup(this.currentPopup);
        this.currentPopup.div.control = this.currentPopup;

        //--------------------------------------------------------------
        //    onsubmit + focus
        //--------------------------------------------------------------

        const div = this.currentPopup.div.firstChild.firstChild;
        const form = div.getElementsByTagName('form')[0];
        if (!form) {
            alert ('No <form> found.');
        }

        //--------------------------------------------------------------
        //    default values
        //--------------------------------------------------------------

        if (this.defaultValues) {
            for (const tag in this.defaultValues) {
                if (!marker.data[tag] && marker.data[tag]!==0) {
                    marker.data[tag]=this.defaultValues[tag];
                }
            }
        }

        this.fillForm (form, marker.data);

        form.marker = marker;
        form.onsubmit= this.formOnSubmit;
        form.onreset = this.formOnReset;
        form.elements[0].focus();
    },

    //----------------------------------------------------------------------
    //    form.submit
    //----------------------------------------------------------------------

    formOnSubmit: function () {

        const layer = this.marker.layer;

        //--------------------------------------------------------------
        //    Extrakt values
        //--------------------------------------------------------------

        const newData = {
            id:    this.marker.data.id,
            lat:    this.marker.data.lat,
            lon:    this.marker.data.lon
        };

        const inputs = this.getElementsByTagName('input');
        for (var i=0; i<inputs.length; i++) {

            const input = inputs[i];
            var value = input.value;

            switch (input.type) {
            case 'checkbox':
                if (!input.checked) { value = ''; }
                break;
            case 'radio':
                if (!input.checked) { continue; }
                break;
            default:
                value = OpenLayers.String.trim(value);
                break;
            }
            newData[input.name]=value;
        }

        const selects = this.getElementsByTagName('select');
        for (i=0; i<selects.length; i++) {

            const select = selects[i];
            value = select.selectedIndex>=0 ?
                select.options[select.selectedIndex].value : '';
            newData[select.name]=value;
        }

        const textareas = this.getElementsByTagName('textarea');
        for (i=0; i<textareas.length; i++) {

            const textarea = textareas[i];
            value    = OpenLayers.String.trim(textarea.value);
            newData[textarea.name]=value;
        }

        //--------------------------------------------------------------
        //    Check data
        //--------------------------------------------------------------

        const result = layer.checkData (newData);
        if (result) {
            alert (result);
            return false;
        }

        delete this.marker.temporary;
        layer.destroyPopup();
        layer.setTooltip (this.marker);
        layer.updateMarker(this.marker, true);

        //--------------------------------------------------------------
        //    Update on server
        //--------------------------------------------------------------

        const postData = OpenLayers.Util.getParameterString (newData);
        layer.updateMarkerOnServer (this.marker, postData);
        return true;
    },

    formOnReset: function () {
        this.marker.layer.destroyPopup();
    },

    //----------------------------------------------------------------------
    //    deleteButtonOnClick
    //----------------------------------------------------------------------

    deleteButtonOnClick: function () {

        const marker = this.marker;
        const layer  = marker.layer;

        if (!confirm (layer.labelConfirmDelete)) {
            return false;
        }

        layer.destroyPopup();

        //--------------------------------------------------------------
        //    Update on server
        //--------------------------------------------------------------

        const postData = OpenLayers.Util.getParameterString ({COMMAND: 'DELETE', id: marker.data.id});
        layer.updateMarkerOnServer (marker, postData);
        return null;
    },

    //----------------------------------------------------------------------
    //    locateButtonOnClick
    //----------------------------------------------------------------------

    locateButtonOnClick: function () {

        const marker = this.marker;
        marker.layer.relocateMarker (marker);
    },

    relocateMarker: function (marker) {

        this.locateMarker = marker;

        this.destroyPopup();

        this.map.div.style.cursor = 'crosshair';
        this.div.style.opacity = 0.5;

        //--------------------------------------------------------------
        //    temporary icon
        //--------------------------------------------------------------

        this.drawTemporaryIcon (this.createIconFromData(marker.data), marker.icon.px);
        this.map.events.register ('mousemove', this, this.moveTemporaryIcon);

        //--------------------------------------------------------------
        //    cancel locate with any key
        //--------------------------------------------------------------

        document.onkeypress = function () {
            marker.layer.cancelLocate();
        };
    },

    cancelLocate: function () {

        this.destroyTemporaryIcon();

        this.locateMarker = null;
        this.map.div.style.cursor = null;
        this.div.style.opacity = 1.0;
        document.onkeypress = null;

        const div = this.locateDiv;
        if (div) {
            this.map.events.unregister ('mousemove', div, div.onmousemove);
            this.map.layerContainerDiv.removeChild (div);
        }
        this.locateDiv = null;
    },

    //----------------------------------------------------------------------
    //    temporaryIcon
    //----------------------------------------------------------------------

    temporaryIcon: null,

    drawTemporaryIcon: function (icon, px) {

        this.destroyTemporaryIcon();    // just in case

        this.temporaryIcon = icon;
        if (px) { icon.draw (px); }
        icon.imageDiv.style.zIndex  = 10000;
        this.map.layerContainerDiv.appendChild (icon.imageDiv);
    },

    destroyTemporaryIcon: function () {

        this.map.events.unregister ('mousemove', this, this.moveTemporaryIcon);
        if (this.temporaryIcon) { this.temporaryIcon.destroy(); }
        this.temporaryIcon = null;
    },

    moveTemporaryIcon: function (ev) {

        if (!this.temporaryIcon) { return; }
        const lonLat=this.map.getLonLatFromViewPortPx(ev.xy);
        var px = px=this.map.getLayerPxFromLonLat (lonLat);
        this.temporaryIcon.moveTo (px);
    },

    //----------------------------------------------------------------------
    //    callback to Server to create, modify or delete
    //----------------------------------------------------------------------

    updateMarkerOnServer: function (marker, postData) {

        OpenLayers.Request.POST({

            url: this.editUrl || this.createUrlForBounds({left:'',right:'',top:'',bottom:''}),

            data: postData,

            user: this.requestUser,
            password: this.requestPassword,
            async: this.requestAsync,

            headers: {'Content-Type': 'application/x-www-form-urlencoded'},

            success: function (request) {

                this.layer.destroyTemporaryIcon();

                const lines = request.responseText.split ('\n');
                lines.pop();

                if (lines.length<2) {
                    this.layer.destroyMarker (this);
                    return;
                }

                const names = OpenLayers.String.trim(lines.shift()).split(this.layer.fieldSeparator);
                const values= OpenLayers.String.trim(lines.shift()).split(this.layer.fieldSeparator);

                this.data = {};
                for (const i in names) {
                    this.data[names[i]] = values[i];
                }
                this.layer.updateMarker (this);
            },

            failure: function (request) {

                this.layer.destroyTemporaryIcon();

                alert ('failure:\n' + request.responseText);

                if (this.data && this.data.id>0) {
                    this.layer.updateMarker (this);
                } else {
                    this.layer.destroyMarker (this);
                }
            },

            scope: marker
        });
    },

    //----------------------------------------------------------------------
    //    Popups
    //----------------------------------------------------------------------

    destroyPopup: function () {

        if (!this.currentPopup) { return false; }

        if (this.processKeyPress) {
            OpenLayers.Event.stopObserving (document, 'keypress', this.processKeyPress);
        }

        if (this.currentPopup.div) {
            this.currentPopup.div.control=null;
        }
        this.currentPopup.destroy();
        this.currentPopup=null;

        if (this.currentMarker && this.currentMarker.temporary) {
            this.destroyMarker (this.currentMarker);
        }
        this.currentMarker=null;

        this.map.events.triggerEvent('popupclose');

        return true;
    },

    //----------------------------------------------------------------------
    //    Parse CSV, get fieldnames from first line
    //----------------------------------------------------------------------

    parseCSV: function (text) {

        const lines=text.split('\n');
        const names = OpenLayers.String.trim(lines.shift()).split(this.fieldSeparator);
        if (names.length<2) {
            OpenLayers.Console.userError (OpenLayers.i18n ('errorLoadingCSV', {
                'url':   this.loadingUrl,
                'phase': 'not a CSV file'
            }));
        }

        if (!this.fieldTitles) {
            this.fieldTitles = {};
            for (const i in names) {
                var name = names[i];
                this.fieldTitles[name]=name;
            }
        }

        const result=[];

        for (let lineno=0;lines.length>lineno;lineno++) {
            const object = {};
            const values = OpenLayers.String.trim(lines[lineno]).split(this.fieldSeparator);
            if (values.length<=1) { continue; }
            for (let col=0; values.length>col; col++) {
                name = names[col];
                if (name) {
                    object[name] = values[col];
                } else {
                    tagval=values[col].split('=');
                    if (tagval.length >= 2 && tagval[0]) {
                        const tag = tagval.shift();
                        const val = tagval.join('=');
                        if ((val || val===0) && !object[tag]) {
                            object[tag]=val;
                        }
                    }
                }
            }
            result.push(object);
        }
        return result;
    },

    //----------------------------------------------------------------------
    //    Create Icon for marker
    //----------------------------------------------------------------------

    createIconFromData: function (data) {

        return this.icon ? this.icon.clone() : null;
    },

    //----------------------------------------------------------------------
    //    Gen HTML code for Popup
    //----------------------------------------------------------------------

    createHtmlFromData: function (data) {

        if (data._csize) {
            const icon = '<img src="'+this.getIconUrl(data)+'" alt=""/>';
            return '<div>'+icon+'&nbsp;Dieses Icon ist in der &#220;bersichtsdarstellung Platzhalter f&#252;r '+data._csize+' Knoten in der nahen Umgebung. Diese werden ab Zoomstufe '+this.minZoom+' nachgeladen und angezeigt.</div>\n';
        }

        const result = [];

        const rows = [];
        for (const tag in data) {
            if (this.fieldTypes[tag]=='hidden' || !data[tag]&&data[tag]!==0) {
                continue;
            }
            const title = this.fieldTitles[tag] || tag;
            let value = data[tag] || '';
            if (this.fieldValues[tag] && this.fieldValues[tag][value]) {
                value = this.fieldValues[tag][value];
            }
            rows.push ('<tr><th scope="row">' + this.html(title) +
                '</th><td>' +
                this.formatValue(value,tag).split('\034').join('<br/>') +
                '</td></tr>');
        }

        if (rows.length>=1) {
            result.push ('<table>\n' + rows.join('\n') + '\n</table>');
        }

        if (this.osmlinks) {
            osmlinks = this.createOsmLinks(data);
            if (osmlinks) {
                result.push ('<p>' + osmlinks + '</p>');
            }
        }

        return result.join('\n');
    },

    //----------------------------------------------------------------------
    //    Editform
    //----------------------------------------------------------------------

    createForm: function (data) {

        const result = [];
        result.push ('<form>');
        result.push ('<table>');

        for (name in this.fieldTitles) {

            if (name=='id' || name=='lat' || name=='lon') {
                continue;
            }

            const hName = this.html (name);
            const title = this.fieldTitles[name] || name;
            const valueTitles = this.fieldValues[name];
            var field;

            switch (this.fieldTypes[name]) {

            case 'select':
                var options = [];
                for (var value in valueTitles) {
                    var hTitle = this.html (valueTitles[value] || value);
                    options.push ('<option value="' + this.html(value) + '">' + hTitle + '</option>');
                }
                field = '<select name="' + hName + '">\n' + options.join('\n') + '</select>';
                break;

            case 'radios':
                choices = [];
                for (value in valueTitles) {
                    hTitle = this.html (valueTitles[value] || value);
                    choices.push ('<label><input type="radio" name="' + hName + '" value="' + this.html(value) + '"/>' + hTitle + '</label> ');
                }
                field = choices.join('\n');
                break;

            case 'textarea':
                field = '<textarea name="'+this.html(name)+'"/></textarea>';
                break;

            case 'checkbox':
                hTitle = this.html (valueTitles && valueTitles['t'] || '');
                field = '<input type="checkbox" name="'+this.html(name)+'" value="t"/>' + hTitle;
                break;

            case 'password':
                field = '<input type="password" name="'+this.html(name)+'"/>';
                break;

            default:
                field = '<input name="'+this.html(name)+'"/>';
                break;
            }

            result.push ('<tr><th scope="row">'+this.html(title) +':</th><td>'+field+'</td></tr>');
        }

        result.push ('</table>');
        for (name in this.fieldTypes) {
            if (this.fieldTypes[name]=='hidden') {
                result.push ('<input type="hidden" name="'+this.html(name)+'"/>');
            }
        }
        result.push ('<button type="submit">Speichern</button>');
        result.push ('<button type="reset">Verwerfen</button>');

        return result.join ('\n');
    },

    fillForm: function (form, data) {

        const inputs = form.getElementsByTagName ('input');
        for (var i=0; i<inputs.length; i++) {

            const input = inputs[i];
            var value = data[input.name] || '';
            switch (input.type) {
            case 'radio':
            case 'checkbox':
                if (input.value==value) { input.checked=true; }
                break;
            default:
                input.value = value;
                break;
            }
        }

        const selects = form.getElementsByTagName ('select');
        for (i=0; i<selects.length; i++) {

            const select = selects[i];
            value = data[select.name] || '';
            let missing = !value && value !== 0;
            for (let j=0; j<select.options.length; j++) {
                var option = select.options[j];
                if (option.value == value) {
                    option.selected = true;
                    missing = false;
                }
            }
            if (missing) {
                option = document.createElement('option');
                option.value=value;
                option.innerHTML = value;
                select.appendChild (option);
                option.selected=true;
            }
        }

        const textareas = form.getElementsByTagName ('textarea');
        for (i=0; i<textareas.length; i++) {

            const textarea = textareas[i];
            value = data[textarea.name] || '';
            textarea.value = value.split('\034').join('\n');
        }
    },

    checkData: function (data) {
        return 'checkData() missing.';
    },

    checkEdit: function (data) {
        return true;
    },

    //----------------------------------------------------------------------
    //    formatting
    //----------------------------------------------------------------------

    formatValue: function (text, tag) {

        if (!(text+'').match(/http:/)) {

            if (tag=='wikipedia') {
                const lang_lemma = text.match(/^(\w\w):(.+)$/);
                if (lang_lemma) {
                    var html_lemma =
                this.html(lang_lemma[2].split('\040').join('_'));
                    return '<a target="_blank" href="http://' +
                        lang_lemma[1] + '.wikipedia.org/wiki/' + html_lemma +
                        '">' + this.html(text) + '</a>';
                }

            } else if (tag.substring(0,10)=='wikipedia:' && text.match(/^\S+$/)) {

                const wiki_lang = tag.match(/^wikipedia:(\w\w)$/);

                if (wiki_lang) {
                    html_lemma = this.html(text);
                    return '<a target="_blank" href="http://' +
                        wiki_lang[1] + '.wikipedia.org/wiki/' + html_lemma +
                        '">' + html_lemma + '</a>';
                }

            } else if (tag=='wikidata' && (text+'').match(/^(Q\d+)$/)) {

                return '<a target="_blank" href="https://www.wikidata.org/wiki/' +
                    text + '">' + text + '</a>';

            } else if (tag.match(/^(image|image:\w+)$/)) {

                const interwiki = text.match (/^(File:.*\S)/);

                if (interwiki) {
                    html_interwiki = this.html (interwiki[1]);
                    return '<a target="_blank" href="http://www.wikipedia.org/wiki/' +
                        html_interwiki.replace(/\040/g,'_') + '">' +
                            html_interwiki + '</a>';
                }

            } else if (tag=='~user') {

                return '<a target="_blank" href="http://www.openstreetmap.org/user/' +
                    text + '">' + text + '</a>';

            } else if (tag=='~in') {

                var result = [];
                const rels = text.split(/[,\s]+/);
                for (const r in rels) {

                    const rel=rels[r];
                    const id=rel.substr(1);
                    result.push (
    '<a target="_blank" href="http://www.openstreetmap.org/relation/' + id + '">' + rel + '</a>');
                }
                return result.join(', ');
            }
        }

        const list=(text+'').split (';');
        var result=[];
        for (let i=0; i<list.length;i++) {
            const value = this.html (OpenLayers.String.trim (list[i]));
            if (value.substr (0,7)=='http://' || value.substr (0,8)=='https://') {
                result.push ('<a target="_blank" href="'+value+'">'+this.shrinkUrl(value)+'</a>');
                continue;
            }
            if (value.substr (0,4)=='www.') {
                result.push ('<a target="_blank" href="http://'+value+'">'+value+'</a>');
                continue;
            }
            result.push (value);
        }
        return result.join ('; ');
    },

    //----------------------------------------------------------------------
    //    Shrink URL
    //----------------------------------------------------------------------

    shrinkUrl: function (url, includeProtocol, includeHost, includePath, includeQuery, includeHash) {

        if (!url) { return ''; }

        if (!includeProtocol)    url = url.replace(/^[a-z]+:(\/\/)?/i, '');
        if (!includeQuery)    url = url.replace(/\?[^#]*/, '');
        if (!includeHash)    url = url.replace(/#.*/, '');
        if (!includePath)    url = url.replace(/\/[^?#]+\//, '/.../');

        return url;
    },

    //----------------------------------------------------------------------
    //    Parse URL
    //----------------------------------------------------------------------

    parseURL: function (url) {

        if (!url) return null;

        let match = (url+'').match (/^\s*(https?:\/\/)?([\w.-]+(:\d+)?)((\/[^\s;]*)?)([;\s].*)?$/);
        if (match) { return (match[1] || 'http://') + match[2] + (match[4] || '/'); }

        //--------------------------------------------------------------
        //    unterwiki
        //--------------------------------------------------------------

        match = url.match (/^\s*(File:.*\S)/);
        if (match) { return 'http://www.wikipedia.org/wiki/' + match[1].replace(/\040/g,'_'); }

        return null;
    },

    //----------------------------------------------------------------------
    //    Encode text as HTML
    //----------------------------------------------------------------------

    html: function (text) {

        if (text===null) { return ''; }
        return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    },

    //----------------------------------------------------------------------
    //    OSM specific links
    //----------------------------------------------------------------------

    createOsmLinks: function (data, argId) {

        const osm = (id||data.id||'').match(/^([nwr])([1-9][0-9]*)$/);
        const type = osm ? {n:'node',r:'relation',w:'way'}[osm[1]] : null;
        var id   = argId ? argId : osm ? osm[2] : null;

        let l=parseFloat(data.lon)-0.0001;
        let b=parseFloat(data.lat)-0.0002;
        let r=parseFloat(data.lon)+0.0001;
        let t=parseFloat(data.lat)+0.0002;

        if (data.bbox) {
            const lbrt = data.bbox.split(',');
            l = parseFloat(lbrt[0])-0.0001;
            b = parseFloat(lbrt[1])-0.0001;
            r = parseFloat(lbrt[2])+0.0001;
            t = parseFloat(lbrt[3])+0.0001;
        }

        const result = [];

        if (osm) {
            result.push ('<a target="_blank" href="http://www.openstreetmap.org/' +
                type + '/' + id + '">' + type + ' ' + id + '</a>' + ' - edit with');
        } else {
            result.push ('edit area with');
        }

        if (osm) {
            result.push('<a target="josmremote" href="http://127.0.0.1:8111/load_object'+
                '?objects=' + osm[0] + '&amp;select=' + osm[0] + '">josm</a>,');
        } else {
            result.push('<a target="josmremote" href="http://127.0.0.1:8111/load_and_zoom'+
                '?left='+l+'&amp;bottom='+b+'&amp;right='+r+'&amp;top='+t+'">josm</a>,');
        }

        result.push('<a target="_blank" href="http://www.openstreetmap.org/edit?editor=id&'+
            'lat='+data.lat+'&amp;lon='+data.lon+'&amp;zoom=17">iD</a> or');

        return result.join(' ');
    },

    //----------------------------------------------------------------------
    //    Lookup wikipedia URL in osm data
    //----------------------------------------------------------------------

    getWikipediaURL: function (data) {

        //------------------------------------------------------
        //    wikipedia = LANG : LEMMA
        //------------------------------------------------------

        match = (data.wikipedia||'').match(/^([a-z]+):([^\/;]*[^\/;\s])([;\s].*)?$/);
        if (match) {
            return 'http://' + match[1] + '.wikipedia.org/wiki/' +
                match[2].replace(/\040/g, '_');
        }

        //------------------------------------------------------
        //    wikipedia = http[s]://LANG.wikipedia.org/wiki/LEMMA
        //    wikipedia = LANG.wikipedia.org/wiki/LEMMA
        //------------------------------------------------------

        match = (data.wikipedia||'').match(/^(https?:\/\/)?(\w+\.wikipedia\.org\/wiki\/[^\/;]*[^\/;\s])([;\s].*)?$/);
        if (match) { return 'http://' + match[2]; }

        //------------------------------------------------------
        //    wikipedia : LANG = ...
        //------------------------------------------------------

        for (const tag in data) {

            const tagMatch = tag.match(/^wikipedia:([a-z]+)$/);

            if (!tagMatch) continue;

            //----------------------------------------------
            //    wikipedia : LANG = LEMMA
            //----------------------------------------------

            valueMatch = data[tag].match(/^([^\/;]*[^\/;\s])\s*$/);
            if (valueMatch) {
                return 'http://' + tagMatch[1] + '.wikipedia.org/wiki/' +
                    valueMatch[1].replace(/\040/g, '_');
            }

            //----------------------------------------------
            //    wikipedia : LANG = http[s]://LANG.wikipedia.org/wiki/LEMMA
            //    wikipedia : LANG = LANG.wikipedia.org/wiki/LEMMA
            //----------------------------------------------

            valueMatch = data[tag].match(/^(https?:\/\/)?(\w+\.wikipedia\.org\/wiki\/[^;\s\/]+)([\s;].*)?$/);
            if (valueMatch) {
                return 'http://' + valueMatch[2];
            }
        }

        //------------------------------------------------------
        //    No wikipedia tag
        //------------------------------------------------------

        return null;
    },

    //----------------------------------------------------------------------
    //    Combine entries to list
    //----------------------------------------------------------------------

    createHtmlFromList: function (list) {

        let items = [];
        const clusters = [];
        let nItems=0;
        const limit = this.clusterLimit && this.clusterLimit<list.length ? this.clusterLimit : list.length;
        for (let i=0; i<list.length; i++) {
            if (list[i]._csize || list[i].cluster) {
                clusters.push (this.createHtmlFromData(list[i]));
            } else {
                nItems++;
                if (items.length<limit) {
                    items.push (this.createHtmlFromData(list[i]));
                }
            }
        }

        if (nItems>limit) {

            if (limit!=1) {

                items.unshift(OpenLayers.String.format(this.textFirstItems,
                    {count: items.length, all: nItems})+':');
            }

        } else if (items.length) {

            if (limit!=1) {

                items.unshift(OpenLayers.String.format(this.textAllItems,
                    {count: items.length})+':');
            }

        } else {

            items=clusters;
        }

        return items.join('<hr/>\n');
    },

    //----------------------------------------------------------------------
    //    Bounding box for markers
    //----------------------------------------------------------------------

    getBounds: function () {

        if (!this.markers || !this.markers.length) { return null; }

        const bounds = new OpenLayers.Bounds ();

        if (this.region) {
            let count=0;
            for (var i in this.markers) {
                if (!this.markers[i].data.region) {
                    continue;
                }
                if (this.markers[i].data.region.substr(0,length)!=this.region) {
                    continue;
                }
                bounds.extend (this.markers[i].lonlat);
                count++;
            }
            if (count) { return bounds; }
        }

        for (i in this.markers) {
            bounds.extend (this.markers[i].lonlat);
        }
        return bounds;
    },

    //----------------------------------------------------------------------
    //    create query from url params
    //----------------------------------------------------------------------

    getQueryParams: function (params) {

        if (!params) { params = OpenLayers.Util.getParameters(); }

        const query=[];
        const sets=new Object();

        for (const tag in params) {
            const fov=tag.split('.');
            let val=OpenLayers.String.trim(params[tag]);

            var field = fov[0];
            var op    = fov[1];
            if (op=="value") { continue; }
            if (op=="op") { op = val; val= params[field+".value"]; }
            if (!op || val===null || val==='') { continue; }
            if (val=='~') { val = ' '; }

            switch (op) {
            case "eq":
            case "ge":
            case "gt":
            case "le":
            case "lt":
            case "ne":
            case "slength":
                var value=parseFloat(val);
                if (isNaN(value)) { continue; }
                query.push (field+"."+op+"="+value);
                continue;
                break;

            case "seq":
            case "sge":
            case "sgt":
            case "sle":
            case "slt":
            case "sne":
            case "peq":
            case "pge":
            case "ple":
            case "smatch":
            case "sregex":
                query.push (field+"."+op+"="+val);
                continue;
                break;

            case "isin":
            case "isinall":
            case "isnotin":
                if (!sets[op]) { sets[op]=new Object(); }
                if (!sets[op][field]) { sets[op][field]=[]; }
                sets[op][field].push(fov[2]?fov[2]:val);
                continue;
                break;

            default:
                break;
            }

            if (!confirm ("Fehler: field=["+field+"] op=["+op+"] val=["+val+"]")) { break; }
        }

        for (op in sets) {
            for (field in sets[op]) {
                query.push (field+"."+op+"="+sets[op][field].join(","));
            }
        }
        return query.join("&");
    },

    CLASS_NAME: 'OpenLayers.Layer.PopupMarker'
});

//--------------------------------------------------------------------------------
//    $Id: popupmarker.js,v 1.125 2014/06/28 10:14:02 wolf Exp wolf $
//--------------------------------------------------------------------------------
