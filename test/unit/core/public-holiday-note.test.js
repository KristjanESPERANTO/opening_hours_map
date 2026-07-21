import test from 'node:test';
import assert from 'node:assert';
import { shouldShowPublicHolidayNoticeToday } from '../../../js/map-poi-layer.js';

// Stub mimics opening_hours: a value without a PH rule warns about it at severity 7,
// and a 'PH' value reports an open state only on 2026-12-25.
class StubOpeningHours {
    constructor(value, _nominatimData, config = {}) {
        this.value = value;
        this.config = config;
    }

    getStructuredWarnings() {
        const valueLacksPublicHoliday = !this.value.includes('PH') && this.config.warnings_severity === 7;
        return valueLacksPublicHoliday ? [{ type: 'public_holiday' }] : [];
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
            shouldShowPublicHolidayNoticeToday(StubOpeningHours, 'Mo-Fr 10:00-20:00', nominatim, 'en', phDay),
            true,
        );
    });

    await t.test('no note on a non-holiday day', () => {
        assert.strictEqual(
            shouldShowPublicHolidayNoticeToday(StubOpeningHours, 'Mo-Fr 10:00-20:00', nominatim, 'en', normalDay),
            false,
        );
    });

    await t.test('no note when the value already handles PH', () => {
        assert.strictEqual(
            shouldShowPublicHolidayNoticeToday(StubOpeningHours, 'Mo-Fr 10:00-20:00; PH off', nominatim, 'en', phDay),
            false,
        );
    });

    await t.test('no note for an empty value', () => {
        assert.strictEqual(
            shouldShowPublicHolidayNoticeToday(StubOpeningHours, '', nominatim, 'en', phDay),
            false,
        );
    });
});
