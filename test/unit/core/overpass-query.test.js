import test from 'node:test';
import assert from 'node:assert';
import {
    createOverpassQlForKeys,
    fetchOverpassJsonWithFallback,
    formatOverpassFailure,
    loadOverpassPois,
} from '../../../js/overpass-query.js';

test('overpass-query', async t => {
    await t.test('createOverpassQlForKeys supports string and array input', () => {
        const single = createOverpassQlForKeys('[bbox:1,2,3,4]', 'opening_hours');
        assert.ok(single.includes('node[\'opening_hours\'];'));
        assert.ok(single.includes('way[\'opening_hours\'];'));
        assert.ok(single.includes('relation[\'opening_hours\'];'));

        const multiple = createOverpassQlForKeys('[bbox:1,2,3,4]', ['opening_hours', 'service_times']);
        assert.ok(multiple.includes('node[\'opening_hours\'];'));
        assert.ok(multiple.includes('node[\'service_times\'];'));
    });

    await t.test('fetchOverpassJsonWithFallback retries next endpoint after HTTP failure', async () => {
        const originalFetch = globalThis.fetch;
        let calls = 0;

        globalThis.fetch = async () => {
            calls += 1;

            if (calls === 1) {
                return {
                    ok: false,
                    status: 500,
                    text: async () => 'temporary upstream error',
                };
            }

            return {
                ok: true,
                status: 200,
                json: async () => ({ elements: [{ id: 123 }] }),
                text: async () => '',
            };
        };

        try {
            const result = await fetchOverpassJsonWithFallback('dummy-query', {
                timeoutMs: 200,
                endpoints: ['https://first.example/api', 'https://second.example/api'],
            });

            assert.strictEqual(result.endpoint, 'https://second.example/api');
            assert.strictEqual(result.attempts, 2);
            assert.deepStrictEqual(result.data, { elements: [{ id: 123 }] });
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    await t.test('loadOverpassPois exposes fallbackEndpoint when second endpoint succeeded', async () => {
        const originalFetch = globalThis.fetch;
        let calls = 0;

        globalThis.fetch = async () => {
            calls += 1;
            if (calls === 1) {
                return {
                    ok: false,
                    status: 502,
                    text: async () => 'bad gateway',
                };
            }

            return {
                ok: true,
                status: 200,
                json: async () => ({ elements: [] }),
                text: async () => '',
            };
        };

        try {
            const result = await loadOverpassPois('dummy-query', {
                timeoutMs: 200,
                endpoints: ['https://a.example/api', 'https://b.example/api'],
            });

            assert.strictEqual(result.fallbackEndpoint, 'https://b.example/api');
            assert.deepStrictEqual(result.data, { elements: [] });
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    await t.test('formatOverpassFailure returns file:// CORS guidance for failed fetch', () => {
        const originalLocation = globalThis.location;
        globalThis.location = {
            hostname: '',
            protocol: 'file:',
        };

        try {
            const formatted = formatOverpassFailure('Failed to fetch while contacting endpoints');

            assert.strictEqual(formatted.severity, 'warn');
            assert.ok(formatted.message.includes('blocked by CORS in file:// context'));
        } finally {
            globalThis.location = originalLocation;
        }
    });

    await t.test('formatOverpassFailure returns generic network guidance outside file://', () => {
        const originalLocation = globalThis.location;
        globalThis.location = {
            hostname: 'example.com',
            protocol: 'http:',
        };

        try {
            const formatted = formatOverpassFailure('Failed to fetch while contacting endpoints');

            assert.strictEqual(formatted.severity, 'warn');
            assert.ok(formatted.message.includes('network/CORS error while contacting all endpoints'));
        } finally {
            globalThis.location = originalLocation;
        }
    });
});
