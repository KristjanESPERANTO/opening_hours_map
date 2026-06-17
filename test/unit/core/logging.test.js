import test from 'node:test';
import assert from 'node:assert';
import { createAppLogger } from '../../../js/logging.js';

test('logging', async t => {
    await t.test('createAppLogger creates logger with all methods', () => {
        const logger = createAppLogger();

        assert.ok(typeof logger.warn === 'function', 'has warn method');
        assert.ok(typeof logger.error === 'function', 'has error method');
        assert.ok(typeof logger.debug === 'function', 'has debug method');
        assert.ok(typeof logger.overpassFallbackSwitched === 'function', 'has overpassFallbackSwitched method');
        assert.ok(typeof logger.overpassFailure === 'function', 'has overpassFailure method');
        assert.ok(typeof logger.mapViewPersistFailed === 'function', 'has mapViewPersistFailed method');
        assert.ok(typeof logger.mapViewRestoreFailed === 'function', 'has mapViewRestoreFailed method');
        assert.ok(typeof logger.geolocationUnavailable === 'function', 'has geolocationUnavailable method');
        assert.ok(typeof logger.geolocationError === 'function', 'has geolocationError method');
    });

    await t.test('createAppLogger uses provided console reference', () => {
        const mockConsole = {
            warn: (...args) => args,
            error: (...args) => args,
            debug: (...args) => args,
        };
        let warnCalled = false;

        const originalWarn = mockConsole.warn;
        mockConsole.warn = function(...args) {
            warnCalled = true;
            return originalWarn.apply(this, args);
        };

        const logger = createAppLogger(mockConsole);
        logger.warn('test message');

        assert.ok(warnCalled, 'logger.warn delegates to console.warn');
    });

    await t.test('warn, error, debug pass through to console', () => {
        const callLog = {
            warns: [],
            errors: [],
            debugs: [],
        };

        const mockConsole = {
            warn: (...args) => { callLog.warns.push(args); },
            error: (...args) => { callLog.errors.push(args); },
            debug: (...args) => { callLog.debugs.push(args); },
        };

        const logger = createAppLogger(mockConsole);
        logger.warn('warning');
        logger.error('error');
        logger.debug('debug info');

        assert.strictEqual(callLog.warns.length, 1, 'warn called once');
        assert.strictEqual(callLog.errors.length, 1, 'error called once');
        assert.strictEqual(callLog.debugs.length, 1, 'debug called once');
    });

    await t.test('overpassFallbackSwitched logs endpoint switch', () => {
        const callLog = { warns: [] };
        const mockConsole = {
            warn: (...args) => { callLog.warns.push(args); },
            error: () => {},
            debug: () => {},
        };

        const logger = createAppLogger(mockConsole);
        logger.overpassFallbackSwitched('https://fallback.example.com');

        assert.strictEqual(callLog.warns.length, 1, 'overpassFallbackSwitched logs warn');
        assert.ok(
            callLog.warns[0][0].includes('fallback.example.com'),
            'warn message includes fallback endpoint'
        );
    });

    await t.test('overpassFailure logs with appropriate severity', () => {
        const callLog = { warns: [], errors: [], debugs: [] };
        const mockConsole = {
            warn: (...args) => { callLog.warns.push(args); },
            error: (...args) => { callLog.errors.push(args); },
            debug: (...args) => { callLog.debugs.push(args); },
        };

        const logger = createAppLogger(mockConsole);

        // Test warning severity
        logger.overpassFailure({
            severity: 'warn',
            message: 'Overpass warning',
            detail: 'Some detail',
        });

        assert.strictEqual(callLog.warns.length, 1, 'warn severity logs to warn');
        assert.strictEqual(callLog.debugs.length, 1, 'debug detail logged');

        // Test error severity
        logger.overpassFailure({
            severity: 'error',
            message: 'Overpass error',
            detail: 'Error detail',
        });

        assert.strictEqual(callLog.errors.length, 1, 'error severity logs to error');
        assert.strictEqual(callLog.debugs.length, 2, 'debug detail logged again');
    });

    await t.test('mapViewPersistFailed logs persistence errors', () => {
        const callLog = { warns: [] };
        const mockConsole = {
            warn: (...args) => { callLog.warns.push(args); },
            error: () => {},
            debug: () => {},
        };

        const logger = createAppLogger(mockConsole);
        const error = new Error('Storage full');
        logger.mapViewPersistFailed(error);

        assert.strictEqual(callLog.warns.length, 1, 'mapViewPersistFailed logs warn');
    });

    await t.test('mapViewRestoreFailed logs restore errors', () => {
        const callLog = { warns: [] };
        const mockConsole = {
            warn: (...args) => { callLog.warns.push(args); },
            error: () => {},
            debug: () => {},
        };

        const logger = createAppLogger(mockConsole);
        const error = new Error('Corrupted data');
        logger.mapViewRestoreFailed(error);

        assert.strictEqual(callLog.warns.length, 1, 'mapViewRestoreFailed logs warn');
    });

    await t.test('geolocationUnavailable logs error message', () => {
        const callLog = { errors: [] };
        const mockConsole = {
            warn: () => {},
            error: (...args) => { callLog.errors.push(args); },
            debug: () => {},
        };

        const logger = createAppLogger(mockConsole);
        logger.geolocationUnavailable('Geolocation not supported');

        assert.strictEqual(callLog.errors.length, 1, 'geolocationUnavailable logs error');
    });

    await t.test('geolocationError logs prefix and message', () => {
        const callLog = { errors: [] };
        const mockConsole = {
            warn: () => {},
            error: (...args) => { callLog.errors.push(args); },
            debug: () => {},
        };

        const logger = createAppLogger(mockConsole);
        logger.geolocationError('Permission denied:', 'User rejected location access');

        assert.strictEqual(callLog.errors.length, 1, 'geolocationError logs error');
    });
});
