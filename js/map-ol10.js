// OpenLayers 10 map implementation
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import {fromLonLat} from 'ol/proj.js';

// Default center: Bonn, Germany (opening_hours.js origin)
const DEFAULT_CENTER = [7.1106, 50.7374];
const DEFAULT_ZOOM = 13;

// Create and export the map
export function initMap() {
    // Parse URL for initial position
    const params = new URLSearchParams(window.location.search);
    const zoom = parseFloat(params.get('zoom')) || DEFAULT_ZOOM;
    const lat = parseFloat(params.get('lat')) || DEFAULT_CENTER[1];
    const lon = parseFloat(params.get('lon')) || DEFAULT_CENTER[0];

    const map = new Map({
        target: 'map',
        layers: [
            // Base OSM layer
            new TileLayer({
                source: new OSM(),
                visible: true,
                properties: {
                    title: 'OpenStreetMap',
                    type: 'base'
                }
            }),
            // Mapnik layer
            new TileLayer({
                source: new XYZ({
                    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    attributions: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }),
                visible: false,
                properties: {
                    title: 'Mapnik',
                    type: 'base'
                }
            }),
            // CyclOSM layer
            new TileLayer({
                source: new XYZ({
                    url: 'https://{a-c}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
                    attributions: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, CyclOSM style by <a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases">CyclOSM</a>'
                }),
                visible: false,
                properties: {
                    title: 'CyclOSM',
                    type: 'base'
                }
            })
        ],
        view: new View({
            center: fromLonLat([lon, lat]),
            zoom: zoom
        })
    });

    return map;
}

// Function to switch base layers
export function switchBaseLayer(map, layerTitle) {
    map.getLayers().forEach(layer => {
        if (layer.get('type') === 'base') {
            layer.setVisible(layer.get('title') === layerTitle);
        }
    });
}

// Export map instance (will be set by init)
export let mapInstance = null;

// Initialize on module load
if (window.modulesLoaded) {
    mapInstance = initMap();
} else {
    window.addEventListener('modulesLoaded', () => {
        mapInstance = initMap();
    });
}
