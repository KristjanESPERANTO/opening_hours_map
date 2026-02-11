/**
 * PopupMarker Layer for OpenLayers
 */

OpenLayers.Layer.PopupMarker = OpenLayers.Class(OpenLayers.Layer.Markers, {
  // Configuration
  minZoom: 10,
  clusterSize: 0,
  clusterMinZoom: 0,
  clusterLimit: 10,
  clusterSort: null,

  // State
  currentPopup: null,
  nextId: 0,

  /**
   * Initialize the layer
   */
  // eslint-disable-next-line no-unused-vars
  initialize: function (_name, _options) {
    OpenLayers.Layer.Markers.prototype.initialize.apply(this, arguments);
    this.markers = [];
  },

  /**
   * Create a marker from data
   * @param {Object} data - Marker data with lat/lon
   * @returns {OpenLayers.Marker|null} Created marker or null
   */
  createMarker: function (data) {
    if (!data) return null;

    // Filter if needed
    if (this.filter && !this.filter(data)) return null;

    // Assign ID if missing
    if (!data.id) {
      ++this.nextId;
      data.id = `${this.nextId}`;
    }

    // Parse coordinates
    const lon = parseFloat(data.lon, 10);
    const lat = parseFloat(data.lat, 10);

    if (isNaN(lon) || isNaN(lat)) return null;

    // Transform coordinates
    const lonLat = new OpenLayers.LonLat(lon, lat).transform(this.map.displayProjection, this.map.getProjectionObject());

    // Create marker with icon
    const icon = this.createIconFromData(data);
    const marker = new OpenLayers.Marker(lonLat, icon);

    // Set CSS classes
    if (marker.icon && marker.icon.imageDiv) {
      marker.icon.imageDiv.className = "olPopupMarker";
      if (marker.icon.imageDiv.firstChild) {
        marker.icon.imageDiv.firstChild.className = "olPopupMarker";
      }
    }

    // Store data and layer reference
    marker.data = data;
    marker.layer = this;

    // Attach click handler
    if (marker.icon && marker.icon.imageDiv) {
      OpenLayers.Event.observe(marker.icon.imageDiv, "click", OpenLayers.Function.bindAsEventListener(this.markerClick, marker));
      OpenLayers.Event.observe(marker.icon.imageDiv, "touchend", OpenLayers.Function.bindAsEventListener(this.markerClick, marker));
    }
    this.addMarker(marker);
    return marker;
  },

  /**
   * Handle marker click
   * @param {Event} evt - Click event
   */
  markerClick: function (evt) {
    if (evt) OpenLayers.Event.stop(evt);

    const layer = this.layer;

    // Toggle popup: close if same marker clicked, open otherwise
    if (layer.currentPopup && layer.currentPopup.markerId === this.data.id) {
      layer.destroyPopup();
    } else {
      layer.createPopup(this);
    }

    return true;
  },

  /**
   * Create and show popup for marker
   * @param {OpenLayers.Marker} marker - Marker to show popup for
   * @param {boolean} nopan - Don't pan map to fit popup
   */
  createPopup: function (marker, nopan) {
    this.destroyPopup();

    // Find clustered markers
    const cluster = [];
    if (this.clusterSize > 0 && this.map.zoom >= this.clusterMinZoom) {
      const limit = (this.clusterSize / Math.pow(2, this.map.zoom)) * 156543;

      for (let i = 0; i < this.markers.length; i++) {
        const member = this.markers[i];
        if (Math.abs(marker.lonlat.lat - member.lonlat.lat) > limit) continue;
        if (Math.abs(marker.lonlat.lon - member.lonlat.lon) > limit) continue;
        cluster.push(member.data);
      }

      if (this.clusterSort) {
        cluster.sort(this.clusterSort);
      }
    }

    // Generate HTML content
    const html = cluster.length >= 2 ? this.createHtmlFromList(cluster) : this.createHtmlFromData(marker.data);

    // Create popup
    this.currentPopup = new OpenLayers.Popup.FramedCloud(null, marker.lonlat, null, html, marker.icon, true, () => {
      this.destroyPopup();
    });

    this.currentPopup.layer = this;
    this.currentPopup.markerId = marker.data.id || null;

    if (nopan) {
      this.currentPopup.panMapIfOutOfView = false;
    }

    this.map.addPopup(this.currentPopup);
    this.map.events.triggerEvent("popupopen");
  },

  /**
   * Close and destroy current popup
   */
  destroyPopup: function () {
    if (!this.currentPopup) return false;

    this.currentPopup.destroy();
    this.currentPopup = null;

    this.map.events.triggerEvent("popupclose");
    return true;
  },

  /**
   * Remove all markers
   * @param {boolean} keepCurrent - Don't close current popup
   */
  erase: function (keepCurrent) {
    if (!keepCurrent) {
      this.destroyPopup();
    }

    if (this.markers) {
      for (const marker of this.markers) {
        if (marker.icon && marker.icon.imageDiv) {
          OpenLayers.Event.stopObservingElement(marker.icon.imageDiv);
        }
        marker.destroy();
      }
    }

    this.markers = [];
  },

  /**
   * HTML escape utility
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   */
  html: function (text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  },

  /**
   * Create icon for marker - OVERRIDE THIS
   * @param {Object} data - Marker data
   * @returns {OpenLayers.Icon} Icon instance
   */
  // eslint-disable-next-line no-unused-vars
  createIconFromData: function (_data) {
    return this.icon ? this.icon.clone() : null;
  },

  /**
   * Create HTML for single marker popup - OVERRIDE THIS
   * @param {Object} data - Marker data
   * @returns {string} HTML content
   */
  createHtmlFromData: function (data) {
    return `<div>Marker: ${this.html(data.id || "unknown")}</div>`;
  },

  /**
   * Create HTML for cluster popup - OVERRIDE THIS
   * @param {Array} list - Array of marker data objects
   * @returns {string} HTML content
   */
  createHtmlFromList: function (list) {
    const items = [];
    const limit = this.clusterLimit && this.clusterLimit < list.length ? this.clusterLimit : list.length;

    for (let i = 0; i < limit; i++) {
      items.push(this.createHtmlFromData(list[i]));
    }

    return items.join("<hr/>\n");
  },

  CLASS_NAME: "OpenLayers.Layer.PopupMarker",
});
