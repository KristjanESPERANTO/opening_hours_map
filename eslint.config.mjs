import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js';
import globals from 'globals';

export default defineConfig([
  globalIgnores([
            'build/*',
            'js/OpenLayers-*/**',
            'opening_hours.js/**',
            'node_modules/**'
          ]),

    {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Globals from init-modules.js
                i18next: 'readonly',
                getUserSelectTranslateHTMLCode: 'readonly',
                changeLanguage: 'readonly',
                OpeningHoursTable: 'readonly',
                reverseGeocodeLocation: 'readonly',
                // Globals from external scripts (opening_hours.js/build/opening_hours+deps.min.js)
                opening_hours: 'readonly',
                // Globals defined in main.js
                OpenLayers: 'readonly',
                useUserKey: 'writable',
                keyChanged: 'writable',
            },
        },
        rules: {
            "no-var": "error",
            "prefer-const": "error",
        },
    },
    {
    // Legacy non-module scripts (OpenLayers, etc.)
        files: [
            'js/OpenStreetMap.js',
            'js/popupmarker.js',
            'js/loadstatus.js',
            'js/zoomstatus.js',
        ],
        languageOptions: {
            sourceType: 'script',
            globals: {
                ...globals.browser,
                OpenLayers: 'readonly',
            },
        },
        rules: {
        },
    },
])
