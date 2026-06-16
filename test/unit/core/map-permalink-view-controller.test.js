import test from 'node:test';
import assert from 'node:assert';
import { setupPermalinkAndViewState } from '../../../js/map-permalink-view-controller.js';

function createMapAndViewTestDoubles(initialCenter = [1000, 2000], initialZoom = 12) {
    const eventHandlers = new Map();

    const view = {
        _center: initialCenter,
        _zoom: initialZoom,
        setCenterCalls: [],
        setZoomCalls: [],
        fitCalls: [],
        getCenter() {
            return this._center;
        },
        getZoom() {
            return this._zoom;
        },
        setCenter(value) {
            this._center = value;
            this.setCenterCalls.push(value);
        },
        setZoom(value) {
            this._zoom = value;
            this.setZoomCalls.push(value);
        },
        fit(extent, options) {
            this.fitCalls.push({extent, options});
        },
    };

    const map = {
        on(eventName, handler) {
            eventHandlers.set(eventName, handler);
        },
        getView() {
            return view;
        },
    };

    return {
        map,
        view,
        trigger(eventName) {
            const handler = eventHandlers.get(eventName);
            if (handler) {
                handler();
            }
        },
    };
}

function createStorageDouble(rawSavedValue) {
    const writes = [];

    return {
        writes,
        getItem(key) {
            if (key !== 'opening_hours_map_view') {
                return null;
            }
            return rawSavedValue;
        },
        setItem(key, value) {
            writes.push({key, value});
        },
    };
}

function baseOptions(overrides = {}) {
    return {
        mapViewStorageKey: 'opening_hours_map_view',
        permalinkParams: {
            filter: 'none',
            tags: 'opening_hours',
        },
        onPermalinkControl: () => {},
        windowRef: {
            location: {
                pathname: '/index.html',
            },
            history: {
                replaceState: () => {},
            },
        },
        onPersistError: () => {},
        onRestoreError: () => {},
        fallbackBoundsWgs84: {
            left: 7.1042,
            bottom: 50.7362,
            right: 7.1171,
            top: 50.7417,
        },
        hasViewInUrl: false,
        ...overrides,
    };
}

test('map-permalink-view-controller', async t => {
    await t.test('keeps URL view priority and skips restore/fallback', () => {
        const doubles = createMapAndViewTestDoubles();
        const storage = createStorageDouble('{"lon":8.1,"lat":50.7,"zoom":15}');

        setupPermalinkAndViewState(baseOptions({
            map: doubles.map,
            localStorageRef: storage,
            hasViewInUrl: true,
        }));

        assert.strictEqual(doubles.view.setCenterCalls.length, 0);
        assert.strictEqual(doubles.view.setZoomCalls.length, 0);
        assert.strictEqual(doubles.view.fitCalls.length, 0);
    });

    await t.test('restores center and zoom from localStorage when URL has no view', () => {
        const doubles = createMapAndViewTestDoubles();
        const storage = createStorageDouble('{"lon":8.1,"lat":50.7,"zoom":15}');

        setupPermalinkAndViewState(baseOptions({
            map: doubles.map,
            localStorageRef: storage,
            hasViewInUrl: false,
        }));

        assert.strictEqual(doubles.view.setCenterCalls.length, 1);
        assert.strictEqual(doubles.view.setZoomCalls.length, 1);
        assert.strictEqual(doubles.view.setZoomCalls[0], 15);
        assert.strictEqual(doubles.view.fitCalls.length, 0);
    });

    await t.test('falls back to configured bounds when no saved view exists', () => {
        const doubles = createMapAndViewTestDoubles();
        const storage = createStorageDouble(null);

        setupPermalinkAndViewState(baseOptions({
            map: doubles.map,
            localStorageRef: storage,
            hasViewInUrl: false,
        }));

        assert.strictEqual(doubles.view.setCenterCalls.length, 0);
        assert.strictEqual(doubles.view.setZoomCalls.length, 0);
        assert.strictEqual(doubles.view.fitCalls.length, 1);
    });

    await t.test('persists center and zoom to localStorage on moveend', () => {
        const doubles = createMapAndViewTestDoubles([900000, 6500000], 13);
        const storage = createStorageDouble(null);

        setupPermalinkAndViewState(baseOptions({
            map: doubles.map,
            localStorageRef: storage,
            hasViewInUrl: true,
        }));

        doubles.trigger('moveend');

        assert.strictEqual(storage.writes.length, 1);
        assert.strictEqual(storage.writes[0].key, 'opening_hours_map_view');

        const parsed = JSON.parse(storage.writes[0].value);
        assert.ok(Number.isFinite(parsed.lon));
        assert.ok(Number.isFinite(parsed.lat));
        assert.strictEqual(parsed.zoom, 13);
    });

    await t.test('exposes permalink control and updates URL with view/filter/tags', () => {
        const doubles = createMapAndViewTestDoubles();
        const storage = createStorageDouble(null);
        const replaceCalls = [];
        let permalinkControl;

        setupPermalinkAndViewState(baseOptions({
            map: doubles.map,
            localStorageRef: storage,
            hasViewInUrl: true,
            permalinkParams: {
                filter: 'open',
                tags: 'opening_hours:kitchen',
            },
            onPermalinkControl: control => {
                permalinkControl = control;
            },
            windowRef: {
                location: {
                    pathname: '/map.html',
                },
                history: {
                    replaceState: (...args) => {
                        replaceCalls.push(args);
                    },
                },
            },
        }));

        assert.ok(permalinkControl);
        assert.strictEqual(typeof permalinkControl.updateLink, 'function');

        permalinkControl.updateLink();

        assert.ok(replaceCalls.length >= 1);
        const url = replaceCalls[replaceCalls.length - 1][2];
        assert.ok(url.startsWith('/map.html?'));
        assert.ok(url.includes('lat='));
        assert.ok(url.includes('lon='));
        assert.ok(url.includes('zoom='));
        assert.ok(url.includes('filter=open'));
        assert.ok(url.includes('tags=opening_hours%3Akitchen'));
    });

    await t.test('updates permalink on moveend after persisting map view', () => {
        const doubles = createMapAndViewTestDoubles([900000, 6500000], 13);
        const storage = createStorageDouble(null);
        const replaceCalls = [];

        setupPermalinkAndViewState(baseOptions({
            map: doubles.map,
            localStorageRef: storage,
            hasViewInUrl: true,
            windowRef: {
                location: {
                    pathname: '/map.html',
                },
                history: {
                    replaceState: (...args) => {
                        replaceCalls.push(args);
                    },
                },
            },
        }));

        const beforeMoveend = replaceCalls.length;
        doubles.trigger('moveend');

        assert.strictEqual(storage.writes.length, 1);
        assert.ok(replaceCalls.length > beforeMoveend);
    });
});
