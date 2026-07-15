import {toLonLat, fromLonLat, transformExtent} from 'ol/proj.js';

function toFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function createPersistedMapView(centerWgs84, zoom) {
    return {
        lon: Number(centerWgs84.lon.toFixed(6)),
        lat: Number(centerWgs84.lat.toFixed(6)),
        zoom,
    };
}

function saveMapView(storage, storageKey, mapView, onError) {
    try {
        storage.setItem(storageKey, JSON.stringify(mapView));
    } catch (error) {
        if (onError) {
            onError(error);
        }
    }
}

function loadMapView(storage, storageKey, onError) {
    try {
        const rawValue = storage.getItem(storageKey);
        if (!rawValue) {
            return null;
        }

        const parsed = JSON.parse(rawValue);
        const lon = toFiniteNumber(parsed.lon);
        const lat = toFiniteNumber(parsed.lat);
        const zoom = toFiniteNumber(parsed.zoom);

        if (lon === null || lat === null || zoom === null) {
            return null;
        }

        return { lon, lat, zoom };
    } catch (error) {
        if (onError) {
            onError(error);
        }
        return null;
    }
}

function toPermalinkNumber(value, digits = 5) {
    return Number(value.toFixed(digits));
}

function createPermalinkQueryParams(map, view, permalinkParams) {
    const center = view.getCenter();
    const zoom = view.getZoom();
    const params = new URLSearchParams();

    if (center) {
        const centerWgs84 = toLonLat(center);
        params.set('lat', String(toPermalinkNumber(centerWgs84[1])));
        params.set('lon', String(toPermalinkNumber(centerWgs84[0])));
    }

    if (Number.isFinite(zoom)) {
        params.set('zoom', String(toPermalinkNumber(zoom, 2)));
    }

    if (permalinkParams && typeof permalinkParams.filter === 'string' && permalinkParams.filter.length > 0) {
        params.set('filter', permalinkParams.filter);
    }

    if (permalinkParams && typeof permalinkParams.tags === 'string' && permalinkParams.tags.length > 0) {
        params.set('tags', permalinkParams.tags);
    }

    if (permalinkParams && typeof permalinkParams.mock === 'string' && permalinkParams.mock.length > 0) {
        params.set('mock', permalinkParams.mock);
    }

    if (map && map.getView && map.getView().getRotation && Number.isFinite(map.getView().getRotation())) {
        const rotation = map.getView().getRotation();
        if (rotation !== 0) {
            params.set('rotation', String(toPermalinkNumber(rotation, 5)));
        }
    }

    return params;
}

function updateBrowserPermalink(windowRef, map, view, permalinkParams) {
    if (!windowRef || !windowRef.location || !windowRef.history || typeof windowRef.history.replaceState !== 'function') {
        return;
    }

    const params = createPermalinkQueryParams(map, view, permalinkParams);
    const query = params.toString();
    const nextUrl = `${windowRef.location.pathname}${query ? `?${query}` : ''}`;
    windowRef.history.replaceState({}, '', nextUrl);
}

export function setupPermalinkAndViewState(options) {
    const {
        map,
        localStorageRef,
        mapViewStorageKey,
        permalinkParams,
        onPermalinkControl,
        windowRef,
        onPersistError,
        onRestoreError,
        fallbackBoundsWgs84,
        hasViewInUrl,
    } = options;

    const view = map.getView();
    const permalinkControl = {
        updateLink: () => {
            updateBrowserPermalink(windowRef, map, view, permalinkParams);
        },
    };

    if (typeof onPermalinkControl === 'function') {
        onPermalinkControl(permalinkControl);
    }

    // Handle moveend event to persist view state to localStorage
    map.on('moveend', () => {
        const center = view.getCenter();
        const zoom = view.getZoom();

        if (!center || !Number.isFinite(zoom)) {
            return;
        }

        const centerWgs84 = toLonLat(center);
        const mapViewToSave = createPersistedMapView({lon: centerWgs84[0], lat: centerWgs84[1]}, zoom);
        saveMapView(localStorageRef, mapViewStorageKey, mapViewToSave, onPersistError);
        permalinkControl.updateLink();
    });

    // Keep explicit URL view as source of truth.
    if (hasViewInUrl) {
        return;
    }

    let restoredSavedView = false;

    // Restore from localStorage when URL has no explicit view params.
    const savedMapView = loadMapView(localStorageRef, mapViewStorageKey, onRestoreError);
    if (savedMapView) {
        view.setCenter(fromLonLat([savedMapView.lon, savedMapView.lat]));
        view.setZoom(savedMapView.zoom);
        restoredSavedView = true;
    }

    // Fall back to initial bounds if no saved view
    if (!restoredSavedView) {
        const extent = transformExtent(
            [
                fallbackBoundsWgs84.left,
                fallbackBoundsWgs84.bottom,
                fallbackBoundsWgs84.right,
                fallbackBoundsWgs84.top,
            ],
            'EPSG:4326',
            'EPSG:3857'
        );
        view.fit(extent, {
            maxZoom: 12,
            nearest: true,
        });
    }

    permalinkControl.updateLink();
}
