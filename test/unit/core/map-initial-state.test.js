import test from 'node:test';
import assert from 'node:assert';
import { createMapInitialState } from '../../../js/map-initial-state.js';

test('map-initial-state', async t => {
    await t.test('uses defaults when search is empty', () => {
        const state = createMapInitialState({
            search: '',
            fallbackTagByMode: {
                2: 'collection_times',
                default: 'opening_hours',
            },
        });

        assert.strictEqual(state.zoom, 13);
        assert.strictEqual(state.lat, 50.7374);
        assert.strictEqual(state.lon, 7.1106);
        assert.strictEqual(state.hasViewInUrl, false);
        assert.deepStrictEqual(state.tagState.osmTags, ['opening_hours']);
        assert.strictEqual(state.filterState.filter, 'none');
    });

    await t.test('reads view, filter and tag state from the search string', () => {
        const state = createMapInitialState({
            search: '?zoom=15&lat=51.1&lon=7.2&filter=opened&mode=2',
            fallbackTagByMode: {
                2: 'collection_times',
                default: 'opening_hours',
            },
        });

        assert.strictEqual(state.zoom, 15);
        assert.strictEqual(state.lat, 51.1);
        assert.strictEqual(state.lon, 7.2);
        assert.strictEqual(state.hasViewInUrl, true);
        assert.deepStrictEqual(state.tagState.osmTags, ['collection_times']);
        assert.strictEqual(state.filterState.filter, 'opened');
        assert.strictEqual(state.permalinkParams.filter, 'opened');
    });

    await t.test('preserves custom map view storage key', () => {
        const state = createMapInitialState({
            search: '',
            fallbackTagByMode: {
                default: 'opening_hours',
            },
            mapViewStorageKey: 'custom-key',
        });

        assert.strictEqual(state.mapViewStorageKey, 'custom-key');
    });
});
