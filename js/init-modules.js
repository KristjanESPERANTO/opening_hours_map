// Initialize ES modules and make necessary functions globally available
import i18next from '../opening_hours.js/node_modules/i18next/dist/esm/i18next.bundled.js';
import { resources, getUserSelectTranslateHTMLCode, changeLanguage, detectLanguage } from '../opening_hours.js/site/js/i18n-resources.js';
import { OpeningHoursTable } from '../opening_hours.js/site/js/opening_hours_table.js';

// Make i18next globally available for inline scripts and other scripts
window.i18next = i18next;

// JOSM remote control function (defined here to avoid importing helpers.js which imports main.js)
function josm(url_param) {
    fetch(`http://localhost:8111/${url_param}`)
        .then(response => {
            if (!response.ok) {
                alert(i18next.t('texts.JOSM remote conn error'));
            }
        })
        .catch(() => {
            alert(i18next.t('texts.JOSM remote conn error'));
        });
}

// reverseGeocodeLocation function (adapted for compatibility with old callback-based API)
window.reverseGeocodeLocation = function(query, on_success, on_error) {
    const nominatim_api_url = 'https://nominatim.openstreetmap.org/reverse';
    // Parse query parameters properly
    let params = 'format=json&zoom=5&addressdetails=1&email=ypid23@aol.de';
    if (query) {
        // Remove leading & if present
        params += query.startsWith('&') ? query : `&${query}`;
    }
    const nominatim_api_url_query = `${nominatim_api_url}?${params}`;

    fetch(nominatim_api_url_query)
        .then(response => {
            if (!response.ok) {
                // Silently fail for 400/404 errors (invalid/deleted nodes)
                if (response.status === 400 || response.status === 404) {
                    return null;
                }
                throw new Error('Nominatim request failed');
            }
            return response.json();
        })
        .then(nominatim_data => {
            if (nominatim_data && on_success) {
                on_success(nominatim_data);
            }
        })
        .catch(error => {
            // Only call error handler if provided, otherwise silently ignore
            if (on_error) {
                on_error(error);
            }
            // Don't log to console - these errors are not critical
        });
};

// Initialize i18next
i18next.init({
    lng: detectLanguage(),
    fallbackLng: 'en',
    resources: resources,
    interpolation: {
        escapeValue: false // Allow HTML in translations
    }
});

// Export functions that might be needed globally
window.getUserSelectTranslateHTMLCode = getUserSelectTranslateHTMLCode;
window.changeLanguage = changeLanguage;
window.OpeningHoursTable = OpeningHoursTable;
window.josm = josm;

// Signal that modules are loaded
window.modulesLoaded = true;
window.dispatchEvent(new Event('modulesLoaded'));
