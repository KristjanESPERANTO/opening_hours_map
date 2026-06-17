function normalizeKeyValues(keyValues) {
    return Array.isArray(keyValues) ? keyValues : [keyValues];
}

const REMOTE_OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
];

const DEFAULT_OVERPASS_ENDPOINTS = REMOTE_OVERPASS_ENDPOINTS;

const GLOBAL_RATE_LIMIT_BACKOFF_MS = 30000;
const ENDPOINT_NETWORK_BACKOFF_MS = 15000;

let globalCooldownUntil = 0;
let globalCooldownReason = 'failures';
const endpointCooldownUntil = new Map();

function getSecondsRemaining(until, now = Date.now()) {
    return Math.max(0, Math.ceil((until - now) / 1000));
}

export function createBboxQueryFromExtent(extentWgs84) {
    return `[bbox:${extentWgs84.bottom},${extentWgs84.left},${extentWgs84.top},${extentWgs84.right}]`;
}

export function createOverpassQlForKeys(bboxQuery, keyValues) {
    const components = [];
    for (const key of normalizeKeyValues(keyValues)) {
        components.push(`node['${key}'];`);
        components.push(`way['${key}'];`);
        components.push(`relation['${key}'];`);
    }

    return `[out:json][timeout:3]${bboxQuery};(${components.join('')});out body center 1000;`;
}

export function createOverpassQlFromExtent(extentWgs84, keyValues) {
    return createOverpassQlForKeys(createBboxQueryFromExtent(extentWgs84), keyValues);
}

export function createOverpassQlForCurrentView(options) {
    const {
        extentWgs84,
        keyValues,
        hasNominatimData,
        onNeedNominatim,
    } = options;

    if (!hasNominatimData && typeof onNeedNominatim === 'function') {
        onNeedNominatim(extentWgs84.top, extentWgs84.left);
    }

    return createOverpassQlFromExtent(extentWgs84, keyValues);
}

export function createOverpassInterpreterUrl(overpassQl) {
    return `${DEFAULT_OVERPASS_ENDPOINTS[0]}?data=${encodeURIComponent(overpassQl)}`;
}

export function createOverpassInterpreterUrls(overpassQl, endpoints = DEFAULT_OVERPASS_ENDPOINTS) {
    return endpoints.map(endpoint => `${endpoint}?data=${encodeURIComponent(overpassQl)}`);
}

function createOverpassPostBody(overpassQl) {
    return `data=${encodeURIComponent(overpassQl)}`;
}

function createAbortError(message) {
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
}

export async function fetchOverpassJsonWithFallback(overpassQl, options = {}) {
    const {
        timeoutMs = 30000,
        endpoints = DEFAULT_OVERPASS_ENDPOINTS,
        signal,
    } = options;

    if (signal?.aborted) {
        throw createAbortError('overpass request aborted before start');
    }

    const now = Date.now();
    if (globalCooldownUntil > now) {
        throw new Error(
            `global overpass cooldown active for ${getSecondsRemaining(globalCooldownUntil, now)}s after ${globalCooldownReason}`
        );
    }

    const failures = [];
    let sawRateLimit = false;
    let sawNetwork = false;

    for (let i = 0; i < endpoints.length; i++) {
        if (signal?.aborted) {
            throw createAbortError('overpass request aborted');
        }

        const endpoint = endpoints[i];
        const endpointCooldown = endpointCooldownUntil.get(endpoint) || 0;
        const cooldownNow = Date.now();
        if (endpointCooldown > cooldownNow) {
            failures.push(`${endpoint} -> skipped (cooldown ${getSecondsRemaining(endpointCooldown, cooldownNow)}s)`);
            continue;
        }

        const controller = new AbortController();
        let timeoutTriggered = false;
        const onExternalAbort = () => {
            controller.abort();
        };
        if (signal) {
            signal.addEventListener('abort', onExternalAbort, {once: true});
        }
        const timeoutId = setTimeout(() => {
            timeoutTriggered = true;
            controller.abort();
        }, timeoutMs);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                },
                body: createOverpassPostBody(overpassQl),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 429) {
                    sawRateLimit = true;
                }
                let detailSnippet = '';
                try {
                    const bodyText = await response.text();
                    if (bodyText) {
                        detailSnippet = ` (${bodyText.slice(0, 280)})`;
                    }
                } catch {
                    // ignore body read failures for diagnostics
                }
                failures.push(`${endpoint} -> HTTP ${response.status}${detailSnippet}`);
                continue;
            }

            return {
                data: await response.json(),
                endpoint,
                attempts: i + 1,
            };
        } catch (error) {
            clearTimeout(timeoutId);
            if (signal) {
                signal.removeEventListener('abort', onExternalAbort);
            }
            if (error && error.name === 'AbortError') {
                if (timeoutTriggered) {
                    failures.push(`${endpoint} -> timeout after ${timeoutMs}ms`);
                    continue;
                }

                throw createAbortError('overpass request aborted');
            } else {
                const message = String(error?.message || error || 'unknown error');
                const lower = message.toLowerCase();
                if (lower.includes('networkerror') || lower.includes('failed to fetch')) {
                    sawNetwork = true;
                    endpointCooldownUntil.set(endpoint, Date.now() + ENDPOINT_NETWORK_BACKOFF_MS);
                }
                failures.push(`${endpoint} -> ${message}`);
            }
        } finally {
            clearTimeout(timeoutId);
            if (signal) {
                signal.removeEventListener('abort', onExternalAbort);
            }
        }
    }

    if (sawRateLimit) {
        globalCooldownReason = 'rate-limit';
        globalCooldownUntil = Date.now() + GLOBAL_RATE_LIMIT_BACKOFF_MS;
        throw new Error(
            `all Overpass endpoints failed with rate-limit/network issues; global cooldown ${getSecondsRemaining(globalCooldownUntil)}s; ${failures.join('; ')}`
        );
    }

    if (sawNetwork) {
        globalCooldownReason = 'network/CORS issues';
        globalCooldownUntil = Date.now() + ENDPOINT_NETWORK_BACKOFF_MS;
        throw new Error(
            `all Overpass endpoints failed with network/CORS issues; global cooldown ${getSecondsRemaining(globalCooldownUntil)}s; ${failures.join('; ')}`
        );
    }

    throw new Error(`all Overpass endpoints failed: ${failures.join('; ')}`);
}

export function formatOverpassFailure(error) {
    const raw = String(error?.message || error || 'unknown error');
    const lower = raw.toLowerCase();

    if (lower.includes('cooldown')) {
        return {
            severity: 'warn',
            message: 'Overpass API: temporary cooldown active after failures',
            detail: raw,
        };
    }

    if (lower.includes('timeout')) {
        return {
            severity: 'warn',
            message: 'Overpass API: request timed out across all endpoints',
            detail: raw,
        };
    }

    if (lower.includes('http 429')) {
        return {
            severity: 'warn',
            message: 'Overpass API: rate-limited on all endpoints',
            detail: raw,
        };
    }

    if (lower.includes('networkerror') || lower.includes('failed to fetch')) {
        const isFileProtocol = typeof globalThis !== 'undefined'
            && globalThis.location
            && globalThis.location.protocol === 'file:';
        return {
            severity: 'warn',
            message: isFileProtocol
                ? 'Overpass API: blocked by CORS in file:// context (serve via a local static server)'
                : 'Overpass API: network/CORS error while contacting all endpoints',
            detail: raw,
        };
    }

    return {
        severity: 'error',
        message: 'Overpass API: request failed on all endpoints',
        detail: raw,
    };
}

export async function loadOverpassPois(overpassQl, options = {}) {
    const {
        timeoutMs = 30000,
        endpoints = DEFAULT_OVERPASS_ENDPOINTS,
        signal,
    } = options;
    const result = await fetchOverpassJsonWithFallback(overpassQl, {
        timeoutMs,
        endpoints,
        signal,
    });

    return {
        data: result.data,
        fallbackEndpoint: result.attempts > 1 ? result.endpoint : null,
    };
}
