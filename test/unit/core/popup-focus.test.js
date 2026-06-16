import test from 'node:test';
import assert from 'node:assert';
import { computePopupFocusCenter } from '../../../js/popup-focus.js';

test('popup-focus', async t => {
    await t.test('centers horizontally even when marker is already above anchor zone', () => {
        const nextCenter = computePopupFocusCenter({
            size: [1000, 1000],
            currentPixel: [900, 120],
            coordinate: [100, 200],
            targetCoord: [80, 200],
            center: [10, 10],
            anchorRatioY: 0.16,
        });

        assert.deepStrictEqual(nextCenter, [30, 10]);
    });

    await t.test('moves vertically when marker is below anchor zone', () => {
        const nextCenter = computePopupFocusCenter({
            size: [1000, 1000],
            currentPixel: [500, 500],
            coordinate: [100, 300],
            targetCoord: [80, 250],
            center: [10, 10],
            anchorRatioY: 0.16,
        });

        assert.deepStrictEqual(nextCenter, [30, 60]);
    });

    await t.test('returns null when no movement is needed', () => {
        const nextCenter = computePopupFocusCenter({
            size: [1000, 1000],
            currentPixel: [500, 120],
            coordinate: [100, 200],
            targetCoord: [100, 200],
            center: [10, 10],
            anchorRatioY: 0.16,
        });

        assert.strictEqual(nextCenter, null);
    });
});
