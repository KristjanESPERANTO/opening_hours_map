import {defineConfig} from 'vite';
import {readFile} from 'node:fs/promises';

const DEV_MOCK_OVERPASS_ENDPOINT = '/api/mock/interpreter';
const DEV_MOCK_DATA_FILE = new URL('./data/dev-overpass-sample.json', import.meta.url);

export default defineConfig({
    server: {
        host: '127.0.0.1',
        port: 5502,
        strictPort: false,
    },
    plugins: [
        {
            name: 'dev-overpass-mock-endpoint',
            configureServer(server) {
                server.middlewares.use(async (req, res, next) => {
                    const path = String(req.url || '').split('?')[0];
                    if (req.method !== 'POST' || path !== DEV_MOCK_OVERPASS_ENDPOINT) {
                        return next();
                    }

                    try {
                        const mockJson = await readFile(DEV_MOCK_DATA_FILE, 'utf8');
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json; charset=utf-8');
                        res.end(mockJson);
                    } catch (error) {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json; charset=utf-8');
                        res.end(JSON.stringify({
                            message: 'dev overpass mock unavailable',
                            detail: String(error?.message || error || 'unknown error'),
                        }));
                    }

                    return undefined;
                });
            },
        },
    ],
});
