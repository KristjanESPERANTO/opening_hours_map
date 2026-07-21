import test from 'node:test';
import assert from 'node:assert';
import { shouldShowPublicHolidayNoticeToday } from '../../../js/map-poi-layer.js';

// Stub mimics opening_hours: a value without a PH rule warns about it at severity 7,
// and a 'PH' value reports an open state only on 2026-12-25.
class StubOpeningHours {
    constructor(value) {
        this.value = value;
    }

    getIterator(reftime) {
        const isPublicHoliday = reftime.getUTCMonth() === 11 && reftime.getUTCDate() === 25;
        return {
            getState: () => this.value === 'PH' && isPublicHoliday,
            getUnknown: () => false,
        };
    }
}

const nominatim = {};
const phDay = new Date('2026-12-25T12:00:00Z');
const normalDay = new Date('2026-12-24T12:00:00Z');

test('public-holiday-note', async t => {
    await t.test('shows note on a public holiday when the value has no PH rule', () => {
        assert.strictEqual(
            shouldShowPublicHolidayNoticeToday({
                getStructuredWarnings: () => [{ type: 'public_holiday' }],
            }, StubOpeningHours, nominatim, 'en', phDay),
            true,
        );
    });

    await t.test('no note on a non-holiday day', () => {
        assert.strictEqual(
            shouldShowPublicHolidayNoticeToday({
                getStructuredWarnings: () => [{ type: 'public_holiday' }],
            }, StubOpeningHours, nominatim, 'en', normalDay),
            false,
        );
    });

    await t.test('no note when the value already handles PH', () => {
        assert.strictEqual(
            shouldShowPublicHolidayNoticeToday({
                getStructuredWarnings: () => [],
            }, StubOpeningHours, nominatim, 'en', phDay),
            false,
        );
    });

    await t.test('no note when structured warnings are unavailable', () => {
        assert.strictEqual(
            shouldShowPublicHolidayNoticeToday(undefined, StubOpeningHours, nominatim, 'en', phDay),
            false,
        );
    });
});
