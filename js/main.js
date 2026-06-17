import { setupGeolocationControls } from './geolocation-setup.js';
import { createConfiguredMap } from './map-setup.js';
import { appLogger } from './logging.js';
import { setupUi } from './ui-setup.js';

const repo_url = 'https://github.com/opening-hours/opening_hours_map';
const wiki_url = 'https://wiki.openstreetmap.org/wiki/Key:opening_hours';
const evaluation_tool_url = 'evaluation_tool/';
let mapActions = null;
const runtimeContext = {
    i18nextRef: i18next,
    openingHoursConstructor: opening_hours,
    openingHoursTable: OpeningHoursTable,
    reverseGeocode: reverseGeocodeLocation,
    alertFn: alert,
    documentRef: document,
    logger: appLogger,
};

const uiRuntimeContext = {
    i18nextRef: i18next,
    documentRef: document,
    windowRef: window,
    localStorageRef: localStorage,
};

/* Source ../opening_hours.js/related_tags.txt */
const related_tags = [
    'opening_hours',
    'opening_hours:kitchen',
    'opening_hours:warm_kitchen',
    'happy_hours',
    'delivery_hours',
    'opening_hours:delivery',
    'lit',
    'smoking_hours',
    'collection_times',
    'service_times',
    //
    // 'fee',
];

function createMap() {
    return createConfiguredMap({
        relatedTags: related_tags,
        evaluationToolUrl: evaluation_tool_url,
        onActionsReady: actions => {
            mapActions = actions;
        },
        runtimeContext,
        windowRef: window,
        localStorageRef: localStorage,
    });
}

function setupGeolocation(map) {
    const { documentRef, logger } = runtimeContext;

    setupGeolocationControls({
        map,
        mapElement: documentRef.getElementById('map'),
        navigatorRef: navigator,
        onUnavailable: message => logger.geolocationUnavailable(message),
        onPositionApplied: () => {
            if (mapActions) {
                mapActions.keyChanged();
            }
        },
    });
}

const initializeUi = () => setupUi({
    ...uiRuntimeContext,
    relatedTags: related_tags,
    wikiUrl: wiki_url,
    repoUrl: repo_url,
    getUserSelectTranslateHTMLCode,
    changeLanguage,
    useUserKey: key => {
        if (mapActions) {
            mapActions.useUserKey(key);
        }
    },
    keyChanged: () => {
        if (mapActions) {
            mapActions.keyChanged();
        }
    },
});

const initialize = function() {
    initializeUi();
    const map = createMap();
    setupGeolocation(map);
};

if (window.modulesLoaded) {
    initialize();
} else {
    window.addEventListener('modulesLoaded', initialize, { once: true });
}
