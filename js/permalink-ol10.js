/**
 * Permalink functionality for OpenLayers 10
 * Syncs map state with URL parameters
 */

import { fromLonLat, toLonLat } from 'ol/proj.js';

export class Permalink {
    constructor(map, additionalParams = {}) {
        this.map = map;
        this.additionalParams = additionalParams;

        // Parse initial URL
        this.parseUrl();

        // Update URL when map changes (with debouncing)
        this.updateTimer = null;
        this.map.on('moveend', () => {
            clearTimeout(this.updateTimer);
            this.updateTimer = setTimeout(() => this.updateUrl(), 100);
        });
    }

    parseUrl() {
        const params = new URLSearchParams(window.location.search);

        // Parse map position (zoom/lat/lon)
        const zoom = parseFloat(params.get('zoom'));
        const lat = parseFloat(params.get('lat'));
        const lon = parseFloat(params.get('lon'));

        if (!isNaN(zoom) && !isNaN(lat) && !isNaN(lon)) {
            const view = this.map.getView();
            view.setCenter(fromLonLat([lon, lat]));
            view.setZoom(zoom);
        }
    }

    updateUrl() {
        const view = this.map.getView();
        const center = view.getCenter();
        const zoom = view.getZoom();

        if (!center || isNaN(zoom)) return;

        // Convert center from Web Mercator to WGS84
        const [lon, lat] = toLonLat(center);

        // Build URL parameters
        const params = new URLSearchParams();
        params.set('zoom', zoom.toFixed(2));
        params.set('lat', lat.toFixed(5));
        params.set('lon', lon.toFixed(5));

        // Add additional parameters
        for (const [key, value] of Object.entries(this.additionalParams)) {
            if (value !== null && value !== undefined) {
                params.set(key, value);
            }
        }

        // Update URL without reloading page
        const newUrl = window.location.pathname + '?' + params.toString();
        window.history.replaceState({}, '', newUrl);
    }

    updateLink() {
        // Compatibility method for legacy code
        this.updateUrl();
    }
}

export function createPermalink(map, additionalParams) {
    return new Permalink(map, additionalParams);
}
