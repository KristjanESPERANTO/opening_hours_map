import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Circle from 'ol/geom/Circle.js';
import {fromLonLat} from 'ol/proj.js';
import {appLogger} from './logging.js';

const DEFAULT_GEOLOCATE_ZOOM = 16;
const GEOLOCATION_ERROR_LOG_PREFIX = 'Geolocation error:';
const GEOLOCATION_UNSUPPORTED_MESSAGE = 'Geolocation is not supported by your browser';

function createGeolocateButton(options = {}) {
    const {
        title = 'Zoom to my location',
        symbolHtml = '<span>⊹</span>',
        className = 'olControlGeolocate',
    } = options;

    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = symbolHtml;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.className = className;

    return button;
}

function setGeolocateButtonBusy(button, isBusy) {
    button.style.opacity = isBusy ? '0.5' : '1';
}

function mountGeolocateButton(mapElement, button) {
    mapElement.appendChild(button);
}

function ensureGeolocationAvailable(options) {
    const {
        navigatorRef,
        onUnavailable,
    } = options;

    const available = !!(navigatorRef && navigatorRef.geolocation);
    if (!available) {
        onUnavailable(GEOLOCATION_UNSUPPORTED_MESSAGE);
        return false;
    }

    return true;
}

function rebuildGeolocationFeatures(options) {
    const {
        geolocationSource,
        lon,
        lat,
        accuracy,
    } = options;

    geolocationSource.clear();

    const center = fromLonLat([lon, lat]);
    const positionFeature = new Feature({geometry: new Point(center)});
    geolocationSource.addFeature(positionFeature);

    if (typeof accuracy === 'number' && accuracy > 0) {
        const accuracyFeature = new Feature({geometry: new Circle(center, accuracy)});
        geolocationSource.addFeature(accuracyFeature);
    }
}

function applyGeolocationPosition(options) {
    const {
        position,
        map,
        geolocationSource,
        zoom = DEFAULT_GEOLOCATE_ZOOM,
    } = options;

    const lon = position.coords.longitude;
    const lat = position.coords.latitude;

    rebuildGeolocationFeatures({
        geolocationSource,
        lon,
        lat,
        accuracy: position.coords.accuracy,
    });

    map.getView().animate({center: fromLonLat([lon, lat]), zoom});
}

function handleGeolocationError(error, onResetButtonOpacity) {
    appLogger.geolocationError(GEOLOCATION_ERROR_LOG_PREFIX, error.message);
    onResetButtonOpacity();
}

function handleGeolocateClick(options) {
    const {
        navigatorRef,
        geolocateButton,
        map,
        geolocationSource,
        zoom = DEFAULT_GEOLOCATE_ZOOM,
        onUnavailable,
        onPositionApplied,
    } = options;

    if (!ensureGeolocationAvailable({
        navigatorRef,
        onUnavailable,
    })) {
        return;
    }

    setGeolocateButtonBusy(geolocateButton, true);
    navigatorRef.geolocation.getCurrentPosition(
        position => {
            applyGeolocationPosition({
                position,
                map,
                geolocationSource,
                zoom,
            });
            if (typeof onPositionApplied === 'function') {
                onPositionApplied();
            }
            setGeolocateButtonBusy(geolocateButton, false);
        },
        error => {
            handleGeolocationError(error, () => {
                setGeolocateButtonBusy(geolocateButton, false);
            });
        }
    );
}

export function setupGeolocationControls(options) {
    const {
        map,
        mapElement,
        navigatorRef,
        onUnavailable,
        onPositionApplied,
    } = options;

    const geolocationSource = new VectorSource();
    const geolocationLayer = new VectorLayer({
        source: geolocationSource,
        // pointer-events: none via CSS class so clicks pass through to POI layer
        className: 'ol-geolocation-layer',
        properties: {title: 'Geolocation'},
    });
    map.addLayer(geolocationLayer);

    const geolocateButton = createGeolocateButton({
        title: 'Zoom to my location',
        symbolHtml: '<span>⊹</span>',
        className: 'olControlGeolocate',
    });

    geolocateButton.addEventListener('click', function() {
        handleGeolocateClick({
            navigatorRef,
            geolocateButton,
            map,
            geolocationSource,
            onUnavailable,
            onPositionApplied,
        });
    });

    mountGeolocateButton(mapElement, geolocateButton);

    return {
        geolocationLayer,
        geolocateButton,
    };
}
