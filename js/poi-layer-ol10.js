/**
 * POI Layer for OpenLayers 10 - Opening Hours Map
 * Replaces OpenLayers.Layer.PopupMarker with OL10 Vector Layer
 */

import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Point from 'ol/geom/Point.js';
import Feature from 'ol/Feature.js';
import { Style, Circle, Fill, Stroke, Icon } from 'ol/style.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import Overlay from 'ol/Overlay.js';

export class POILayer {
    constructor(map, options = {}) {
        this.map = map;
        this.minZoom = options.minZoom || 11;
        this.clusterLimit = options.clusterLimit || 50;
        this.reftime = options.reftime || new Date();
        this.keyValues = [];
        this.poi_data = null;
        this.filter = 'none'; // Filter: none, error, warnOnly, errorOnly, open, unknown, closed, openOrUnknown

        // Create vector source and layer
        this.vectorSource = new VectorSource({
            features: []
        });

        this.vectorLayer = new VectorLayer({
            source: this.vectorSource,
            style: (feature) => this.styleFunction(feature)
        });

        this.map.addLayer(this.vectorLayer);

        // Create popup overlay
        this.createPopupOverlay();

        // Debounce timer for reload
        this.reloadTimer = null;

        // Listen to map moveend to reload POIs (with debouncing)
        this.map.on('moveend', () => {
            const zoom = this.map.getView().getZoom();
            if (zoom >= this.minZoom) {
                // Debounce: wait 500ms after last move before reloading
                clearTimeout(this.reloadTimer);
                this.reloadTimer = setTimeout(() => {
                    this.reloadPOIs();
                }, 500);
            }
        });

        // Click handler for features
        this.map.on('click', (evt) => {
            const feature = this.map.forEachFeatureAtPixel(evt.pixel, (feature) => feature, {
                hitTolerance: 5
            });
            if (feature) {
                this.showPopup(feature, evt.coordinate);
            } else {
                this.hidePopup();
            }
        });

        // Change cursor on hover
        this.map.on('pointermove', (evt) => {
            const pixel = this.map.getEventPixel(evt.originalEvent);
            const hit = this.map.hasFeatureAtPixel(pixel, {
                hitTolerance: 5
            });
            const target = this.map.getTarget();
            if (target && target.style) {
                target.style.cursor = hit ? 'pointer' : '';
            }
        });
    }

    createPopupOverlay() {
        // Create popup container
        const popupContainer = document.createElement('div');
        popupContainer.id = 'ol-popup';
        popupContainer.className = 'ol-popup';

        const popupCloser = document.createElement('a');
        popupCloser.href = '#';
        popupCloser.className = 'ol-popup-closer';
        popupCloser.onclick = () => {
            this.hidePopup();
            return false;
        };

        const popupContent = document.createElement('div');
        popupContent.id = 'ol-popup-content';

        popupContainer.appendChild(popupCloser);
        popupContainer.appendChild(popupContent);
        document.body.appendChild(popupContainer);

        this.overlay = new Overlay({
            element: popupContainer,
            autoPan: {
                animation: {
                    duration: 250
                }
            }
        });

        this.map.addOverlay(this.overlay);
    }

    showPopup(feature, coordinate) {
        const data = feature.get('data');
        if (!data) return;

        const html = this.createHtmlFromData(data);
        document.getElementById('ol-popup-content').innerHTML = html;
        this.overlay.setPosition(coordinate);
    }

    hidePopup() {
        this.overlay.setPosition(undefined);
    }

    styleFunction(feature) {
        const data = feature.get('data');
        if (!data) {
            return new Style({
                image: new Circle({
                    radius: 7,
                    fill: new Fill({ color: '#999' }),
                    stroke: new Stroke({ color: '#fff', width: 2 })
                })
            });
        }

        const iconUrl = this.getIconUrl(data);
        if (iconUrl) {
            return new Style({
                image: new Icon({
                    src: iconUrl,
                    scale: 1.0
                })
            });
        }

        return new Style({
            image: new Circle({
                radius: 7,
                fill: new Fill({ color: '#999' }),
                stroke: new Stroke({ color: '#fff', width: 2 })
            })
        });
    }

    getIconUrl(data) {
        if (this.evaluateOH(data) !== 'na') {
            switch (data._oh_state) {
                case 'ok':
                case 'warning': {
                    const state = data._it_object.getState();
                    const unknown = data._it_object.getUnknown();
                    const color = state ? 'green' : (unknown ? 'yellow' : 'red');
                    const warn = data._oh_state === 'warning' ? '_warn' : '';
                    return `img/circle_${color}${warn}.png`;
                }
                case 'error':
                    return 'img/circle_err.png';
                default:
                    return null;
            }
        }
        return null;
    }

    evaluateOH(data) {
        if (typeof data._oh_value === 'undefined' && typeof data._oh_state === 'undefined') {
            // Find opening_hours tag
            const OSM_tags = window.OSM_tags || ['opening_hours'];
            for (let i = 0; i < OSM_tags.length; i++) {
                if (typeof data[OSM_tags[i]] === 'string') {
                    data._oh_key = OSM_tags[i];
                    data._oh_value = data[OSM_tags[i]];
                    break;
                }
            }

            if (typeof data._oh_value === 'undefined') {
                data._oh_value = false;
                data._oh_state = 'na';
                return data._oh_state;
            }

            // Parse opening_hours value
            try {
                const OHMode = ["collection_times", "service_times"].includes(data._oh_key) ? 2 : 0;
                data._oh_object = new opening_hours(data._oh_value, {
                    address: {
                        country_code: window.nominatim_data_global.address ? window.nominatim_data_global.address.country_code : undefined,
                        state: window.nominatim_data_global.address ? window.nominatim_data_global.address.state : undefined
                    }
                }, OHMode);

                data._it_object = data._oh_object.getIterator(this.reftime);
                data._oh_state = data._oh_object.getWarnings().length ? 'warning' : 'ok';
            } catch (err) {
                data._oh_object = err.toString();
                data._oh_state = 'error';
            }
        }
        return data._oh_state;
    }

    html(text) {
        if (typeof text !== 'string') return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    createHtmlFromData(data) {
        const h_icon = `<img src="${this.getIconUrl(data)}" alt=""/>`;
        let h_name = this.html(data.name || data.ref || data.barrier || data.operator ||
                               data.shop || data.amenity || data.craft || data.id);

        if (typeof data.cuisine === 'string') {
            h_name += ` (cuisine: ${data.cuisine})`;
        }
        if (typeof data.barrier === 'string') {
            h_name = `barrier: ${h_name}`;
        }

        let text = `<h3>${h_icon}&#160;${h_name}</h3>\n`;
        text += `<div class="v">${this.html(data._oh_value)}</div>`;

        this.evaluateOH(data);

        if (data._oh_state === 'error' || data._oh_state === 'na') {
            text += `<div class="e">${data._oh_object}</div>`;
        } else {
            const t = data._it_object.getComment() || '';

            switch (data._it_object.getStateString(true)) {
                case 'open':
                    text += `<b class="o">open @ ${this.reftime.toLocaleString()}<br/>${t}</b>`;
                    break;
                case 'closed':
                    text += `<b class="c">closed @ ${this.reftime.toLocaleString()}<br/>${t}</b>`;
                    break;
                case 'unknown':
                    text += `<b class="u">unknown @ ${this.reftime.toLocaleString()}<br/>${t}</b>`;
                    break;
            }

            const prettified = data._oh_object.prettifyValue();
            if (data._oh_value !== prettified) {
                text += '<br/>' + i18next.t('texts.prettified value', {
                    copyFunc: `javascript:Evaluate(null, null, '${data._oh_value}')`
                }) + `: <div class="v">${prettified}</div>`;
            }

            const warnings = data._oh_object.getWarnings();
            if (warnings.length > 0) {
                text += `<br/>Warnings: <div class="v">${warnings.join('<br/>\n')}</div>`;
            }

            data._it_object.setDate(this.reftime);
            text += window.OpeningHoursTable.drawTableAndComments(data._oh_object, data._it_object, this.reftime);
        }

        // Add OSM tags table
        const rows = [];
        for (const tag in data) {
            if (data[tag] === '') continue;
            switch (tag) {
                case 'id': case '_id': case 'lat': case 'lon': case 'created_by':
                case '_oh_value': case '_oh_state': case '_oh_object': case '_it_object':
                    continue;
            }
            let val = this.html(data[tag]);
            if (/^https?:\/\//.test(val)) {
                const res = [];
                const list = data[tag].split(';');
                for (let i = 0; i < list.length; i++) {
                    const ele = this.html(list[i].trim());
                    res.push(`<a target="_blank" href="${ele}">${ele}</a>`);
                }
                val = res.join('; ');
            }
            rows.push(`<tr><td>${this.html(tag)}</td><td>${val}</td></tr>`);
        }

        if (rows.length >= 1) {
            text += `<table>${rows.join('\n')}</table>\n`;
        }

        return window.editPopupContent(text, data.lat, data.lon, data._type, data._id, data._oh_value);
    }

    overpassQL(keyvalues) {
        if (!(keyvalues instanceof Array)) {
            keyvalues = [keyvalues];
        }

        // Get extent in map projection (Web Mercator)
        const extent = this.map.getView().calculateExtent();

        // Transform corners from Web Mercator to WGS84
        const bottomLeft = [extent[0], extent[1]];
        const topRight = [extent[2], extent[3]];

        const [left, bottom] = toLonLat(bottomLeft);
        const [right, top] = toLonLat(topRight);

        const bboxQuery = `[bbox:${bottom},${left},${top},${right}]`;

        const components = [];
        for (const key of keyvalues) {
            components.push(`node['${key}'];`);
            components.push(`way['${key}'];`);
            components.push(`relation['${key}'];`);
        }

        return `[out:json][timeout:3]${bboxQuery};(${components.join('')});out body center 1000;`;
    }

    reloadPOIs() {
        if (this.updateKeyValues) {
            this.updateKeyValues();
        }

        const xml = this.overpassQL(this.keyValues);
        const url = `https://overpass-api.de/api/interpreter?&data=${encodeURIComponent(xml)}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        fetch(url, { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                if (!response.ok) {
                    if (response.status === 504 || response.status === 429) {
                        console.warn(`Overpass API timeout or rate limit (status ${response.status})`);
                    } else {
                        console.error('Overpass API request failed with status:', response.status);
                    }
                    return null;
                }
                return response.json();
            })
            .then(data => {
                if (data) {
                    this.poi_data = data;
                    this.redrawPOIs();
                }
            })
            .catch(error => {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    console.warn('Overpass API request timed out');
                } else {
                    console.error('Overpass API request failed:', error);
                }
            });
    }

    redrawPOIs() {
        if (!this.poi_data || !this.poi_data.elements) {
            return;
        }

        this.vectorSource.clear();

        const features = [];
        for (const element of this.poi_data.elements) {
            let lon, lat;

            if (element.type === 'node') {
                lon = element.lon;
                lat = element.lat;
            } else if (element.center) {
                lon = element.center.lon;
                lat = element.center.lat;
            } else {
                continue;
            }

            const feature = new Feature({
                geometry: new Point(fromLonLat([lon, lat])),
                data: {
                    ...element.tags,
                    lat: lat,
                    lon: lon,
                    _type: element.type,
                    _id: element.id
                }
            });

            // Apply filter
            if (!this.passesFilter(feature.get('data'))) {
                continue;
            }

            features.push(feature);
        }

        this.vectorSource.addFeatures(features);
    }

    passesFilter(data) {
        // Evaluate opening hours state
        this.evaluateOH(data);

        switch (this.filter) {
            case 'none':
                return true;
            case 'error':
                return data._oh_state === 'error' || data._oh_state === 'warning';
            case 'warnOnly':
                return data._oh_state === 'warning';
            case 'errorOnly':
                return data._oh_state === 'error';
            case 'open':
                return data._oh_state === 'ok' && data._it_object && data._it_object.getState();
            case 'unknown':
                return data._oh_state === 'ok' && data._it_object && data._it_object.getUnknown();
            case 'closed':
                return data._oh_state === 'ok' && data._it_object && !data._it_object.getState() && !data._it_object.getUnknown();
            case 'openOrUnknown':
                return data._oh_state === 'ok' && data._it_object && (data._it_object.getState() || data._it_object.getUnknown());
            default:
                return true;
        }
    }

    setFilter(filter) {
        this.filter = filter;
        this.redrawPOIs();
    }

    updateKeyValues() {
        // Will be set from main.js
        this.keyValues = window.OSM_tags || ['opening_hours'];
    }
}

// Export factory function
export function createPOILayer(map, options) {
    return new POILayer(map, options);
}
