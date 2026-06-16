export function createAppLogger(consoleRef = console) {
    return {
        warn: (...args) => consoleRef.warn(...args),
        error: (...args) => consoleRef.error(...args),
        debug: (...args) => consoleRef.debug(...args),
        overpassFallbackSwitched: endpoint => {
            consoleRef.warn(`Overpass API: primary endpoint unavailable, switched to ${endpoint}`);
        },
        overpassFailure: failure => {
            if (failure.severity === 'warn') {
                consoleRef.warn(failure.message);
            } else {
                consoleRef.error(failure.message);
            }
            consoleRef.debug('Overpass API failure detail:', failure.detail);
        },
        mapViewPersistFailed: error => {
            consoleRef.warn('Failed to persist map view in localStorage:', error);
        },
        mapViewRestoreFailed: error => {
            consoleRef.warn('Failed to restore map view from localStorage:', error);
        },
        geolocationUnavailable: message => {
            consoleRef.error(message);
        },
        geolocationError: (prefix, message) => {
            consoleRef.error(prefix, message);
        },
    };
}

export const appLogger = createAppLogger();
