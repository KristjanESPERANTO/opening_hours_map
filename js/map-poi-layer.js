/**
 * OL10 POI Layer Implementation
 *
 * Replaces OL2's PopupMarker with OL10 VectorLayer + VectorSource
 * Handles feature rendering, filtering, and popup management
 */

import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import {fromLonLat, transformExtent} from 'ol/proj.js';
import {Circle as CircleStyle, Fill, Stroke, Style} from 'ol/style.js';
import {
    setPermalinkTags,
    setSingleActiveTag,
    getActiveTags,
} from './map-initial-state.js';
import {
    createOverpassQlForCurrentView,
    formatOverpassFailure,
    loadOverpassPois,
} from './overpass-query.js';
import {evaluateOpeningHoursFlow} from './oh-flow.js';

const STATE_COLORS = {
    green: '#00ff00',
    yellow: '#ffff00',
    red: '#ff0000',
    error: '#ff00ff',
};

function createStyleForData(data) {
    let color = STATE_COLORS.error;

    if (data._oh_state === 'ok' || data._oh_state === 'warning') {
        if (data._it_object) {
            color = data._it_object.getState()
                ? STATE_COLORS.green
                : (data._it_object.getUnknown() ? STATE_COLORS.yellow : STATE_COLORS.red);
        }
    }

    return new Style({
        image: new CircleStyle({
            radius: 6,
            fill: new Fill({color: 'rgba(0, 0, 0, 0)'}),
            stroke: new Stroke({
                color,
                width: 3,
            }),
        }),
    });
}

function htmlEscape(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function popupMarkerHtmlForData(data) {
    let color = STATE_COLORS.error;
    let warningBadge = '';

    if (data._oh_state === 'ok' || data._oh_state === 'warning') {
        const isOpen = data._it_object?.getState();
        const isUnknown = data._it_object?.getUnknown();
        color = isOpen ? STATE_COLORS.green : (isUnknown ? STATE_COLORS.yellow : STATE_COLORS.red);

        if (data._oh_state === 'warning') {
            warningBadge = '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1;color:#2457ff;font-weight:bold;">W</span>';
        }
    }

    return `<span aria-hidden="true" style="position:relative;display:inline-block;width:16px;height:16px;border:3px solid ${color};border-radius:50%;box-sizing:border-box;vertical-align:text-bottom;">${warningBadge}</span>`;
}

function buildPopupHeaderHtml(data, options) {
    const { iconHtml, html } = options;
    let name = html(data.name || data.ref || data.barrier || data.operator || data.shop || data.amenity || data.craft || data.id);

    if (typeof data.cuisine === 'string') {
        name += ` (cuisine: ${data.cuisine})`;
    }
    if (typeof data.barrier === 'string') {
        name = `barrier: ${name}`;
    }

    let text = `<h3>${iconHtml}&#160;${name}</h3>\n`;
    text += `<div class="v">${html(data._oh_value)}</div>`;
    return text;
}

function buildPopupActionLinks(options) {
    const {
        type,
        id,
        ohValue,
        lat,
        lon,
        evaluationToolUrl,
        josmAllLabel,
        evaluationLabel,
    } = options;

    const josmImport = `import?url=${encodeURIComponent(`https://overpass-api.de/api/xapi_meta?*[opening_hours=${ohValue}]`)}`;
    const josmLoad = `load_object?objects=${type}${id}&select=${type}${id}`;

    return '<br />'
        + `<a href="https://www.openstreetmap.org/edit?editor=id&${type}=${id}" target="_blank">iD</a>&nbsp;&nbsp;`
        + `<a href="#" class="js-josm" data-josm="${josmImport}">${josmAllLabel}</a>`
        + `&nbsp;&nbsp;<a href="#" class="js-josm" data-josm="${josmLoad}">JOSM</a>`
        + `&nbsp;&nbsp;<a href="https://www.openstreetmap.org/${type}/${id}" target="_blank">Details</a>`
        + `&nbsp;&nbsp;<a href="${evaluationToolUrl}?EXP=${encodeURIComponent(ohValue)}&lat=${lat}&lon=${lon}" target="_blank">${evaluationLabel}</a>`;
}

function createPrettifiedLabel(i18nextRef, evaluationToolUrl, ohValue) {
    return i18nextRef.t('texts.prettified value', {
        copyFunc: `${evaluationToolUrl}?EXP=${encodeURIComponent(ohValue)}`,
    });
}

function appendOpeningHoursDetails(options) {
    const {
        text,
        data,
        reftime,
        prettifiedLabel,
        drawTableAndComments,
    } = options;

    try {
        const comment = htmlEscape(data._it_object.getComment() || '');
        let nextText = text;

        switch (data._it_object.getStateString(true)) {
            case 'open':
                nextText += `<b class="o">open @ ${reftime.toLocaleString()}<br/>${comment}</b>`;
                break;
            case 'closed':
                nextText += `<b class="c">closed @ ${reftime.toLocaleString()}<br/>${comment}</b>`;
                break;
            case 'unknown':
                nextText += `<b class="u">unknown @ ${reftime.toLocaleString()}<br/>${comment}</b>`;
                break;
            default:
                break;
        }

        const prettified = data._oh_object.prettifyValue();
        if (data._oh_value != prettified) {
            nextText += `<br/>${prettifiedLabel}: <div class="v">${htmlEscape(prettified)}</div>`;
        }

        const warnings = data._oh_object.getWarnings();
        if (warnings.length > 0) {
            nextText += `<br/>Warnings: <div class="v">${warnings.map(warning => htmlEscape(warning)).join('<br/>\n')}</div>`;
        }

        data._it_object.setDate(reftime);
        nextText += drawTableAndComments(data._oh_object, data._it_object, reftime);

        return nextText;
    } catch (error) {
        const message = error?.message || error;
        return `${text}<div class="e">Failed to render opening_hours details: ${htmlEscape(message)}</div>`;
    }
}

const EXCLUDED_TAGS = new Set([
    'id',
    '_id',
    'lat',
    'lon',
    'created_by',
    '_oh_value',
    '_oh_state',
    '_oh_object',
    '_it_object',
]);

function matchesPoiFilter(filterId, flags) {
    const {
        hasError,
        hasWarnings,
        canIterate,
        isOpen,
        isUnknown,
    } = flags;

    switch (filterId) {
        case 'error':
            return hasError || hasWarnings;
        case 'errorOnly':
            return hasError;
        case 'warnOnly':
            return hasWarnings;
        case 'open':
            return isOpen;
        case 'unknown':
            return isUnknown;
        case 'closed':
            return canIterate && !isOpen && !isUnknown;
        case 'openOrUnknown':
            return isOpen || isUnknown;
        case 'none':
        default:
            return true;
    }
}

function derivePoiFilterFlags(options) {
    const {
        state,
        ohObject,
        iteratorObject,
    } = options;

    const hasError = state == 'error';
    const hasWarnings = !hasError && ohObject && typeof ohObject.getWarnings === 'function'
        ? ohObject.getWarnings().length > 0
        : false;
    const canIterate = !hasError && iteratorObject && typeof iteratorObject.getState === 'function'
        && typeof iteratorObject.getUnknown === 'function';
    const isOpen = canIterate ? iteratorObject.getState() : false;
    const isUnknown = canIterate ? iteratorObject.getUnknown() : false;

    return {
        hasError,
        hasWarnings,
        canIterate,
        isOpen,
        isUnknown,
    };
}

function syncSelectedKeyValues(options) {
    const {
        relatedTags,
        selectedIndex,
        tagState,
        permalinkParams,
        setSingleActiveTag,
        setPermalinkTags,
    } = options;

    const key = relatedTags[selectedIndex];
    const keyValues = [key];

    setSingleActiveTag(tagState, key);
    setPermalinkTags(permalinkParams, key);

    return {
        key,
        keyValues,
    };
}

function buildPopupTagTableHtml(data, options) {
    const { html, trim } = options;
    const rows = [];

    for (const tag in data) {
        if (data[tag] == '' || EXCLUDED_TAGS.has(tag)) {
            continue;
        }

        let val = html(data[tag]);
        if (/^https?:\/\//.test(val)) {
            const links = [];
            const list = data[tag].split(';');
            for (let i = 0; i < list.length; i++) {
                const item = html(trim(list[i]));
                links.push(`<a target="_blank" href="${item}">${item}</a>`);
            }
            val = links.join('; ');
        }

        rows.push(`<tr><td>${html(tag)}</td><td>${val}</td></tr>`);
    }

    return rows.length >= 1 ? `<table>${rows.join('\n')}</table>\n` : '';
}

function getValidatedOverpassElements(data, onMissingElements) {
    if (typeof data === 'undefined') {
        return undefined;
    }

    const elements = data.elements;
    if (!elements) {
        onMissingElements();
        return undefined;
    }

    return elements;
}

function mapOverpassElementToPoiData(element) {
    let elementData = element.tags;
    if (!elementData) {
        elementData = {};
    }

    if (element.id) {
        elementData.id = (element.type ? element.type.substr(0, 1) : '') + element.id;
        elementData._id = element.id;
    }

    elementData._type = element.type;
    if (elementData._type == 'way' || elementData._type == 'relation') {
        elementData.lat = element.center.lat;
        elementData.lon = element.center.lon;
    } else {
        elementData.lat = element.lat;
        elementData.lon = element.lon;
    }

    return elementData;
}

function renderPoiMarkersFromElements(elements, createMarker) {
    for (const i in elements) {
        const element = elements[i];
        const elementData = mapOverpassElementToPoiData(element);
        createMarker(elementData);
    }
}

function extractElementCoordinates(element) {
    const lat = element?.center?.lat ?? element?.lat;
    const lon = element?.center?.lon ?? element?.lon;
    return { lat, lon };
}

function getNominatimRefreshCoordinates(options) {
    const {
        elements,
        lastLat,
        lastLon,
        thresholdDegrees = 2,
    } = options;

    if (!elements || !elements.length) {
        return null;
    }

    const first = extractElementCoordinates(elements[0]);
    if (!Number.isFinite(first.lat) || !Number.isFinite(first.lon)) {
        return null;
    }

    if (typeof lastLat === 'undefined' || typeof lastLon === 'undefined') {
        return first;
    }

    const movedFarEnough = Math.abs(lastLat - first.lat) > thresholdDegrees
        || Math.abs(lastLon - first.lon) > thresholdDegrees;

    return movedFarEnough ? first : null;
}

function applyNominatimRefreshUpdate(options) {
    const {
        refreshCoordinates,
        lastLat,
        lastLon,
        onRefresh,
    } = options;

    if (!refreshCoordinates) {
        return {
            lastLat,
            lastLon,
            refreshed: false,
        };
    }

    onRefresh(refreshCoordinates.lat, refreshCoordinates.lon);
    return {
        lastLat: refreshCoordinates.lat,
        lastLon: refreshCoordinates.lon,
        refreshed: true,
    };
}

export function createPoiLayer(options) {
    const {
        map,
        runtimeContext,
        relatedTags,
        tagState,
        permalinkParams,
        evaluationToolUrl,
        initialOhMode,
    } = options;

    const {
        i18nextRef,
        openingHoursConstructor,
        reverseGeocode,
        alertFn,
        documentRef,
        logger,
        openingHoursTable,
    } = runtimeContext;

    const vectorSource = new VectorSource();
    const vectorLayer = new VectorLayer({
        source: vectorSource,
        minZoom: 11,
        style: feature => createStyleForData(feature.get('data')),
        properties: {title: 'POI Layer'},
    });

    // Global state tracking for reverse-geocoding (nominatim).
    // Maintained across reloadPOIs/redrawPOIs cycles to avoid redundant queries.
    let nominatimDataGlobal = {};
    let currentOhMode = initialOhMode;
    let poiData = undefined;
    let keyValues = [];
    let lastLat = undefined;
    let lastLon = undefined;
    let activeOverpassRequestController = null;

    const abortActiveOverpassRequest = function() {
        if (activeOverpassRequestController) {
            activeOverpassRequestController.abort();
            activeOverpassRequestController = null;
        }
    };

    const updateKeyValues = function() {
        const selection = syncSelectedKeyValues({
            relatedTags,
            selectedIndex: documentRef.getElementById('tag_selector_input').selectedIndex,
            tagState,
            permalinkParams,
            setSingleActiveTag,
            setPermalinkTags,
        });
        keyValues = selection.keyValues;
    };

    const evaluateOH = function(data) {
        const result = evaluateOpeningHoursFlow({
            data,
            activeTags: getActiveTags(tagState),
            currentOhMode,
            openingHoursConstructor,
            nominatimData: nominatimDataGlobal,
            locale: i18nextRef.language,
            reftime: new Date(),
        });
        if (result.handled) {
            currentOhMode = result.nextOhMode;
            return data._oh_state;
        }
    };

    const filterFeature = function(data) {
        const state = evaluateOH(data);
        const flags = derivePoiFilterFlags({
            state,
            ohObject: data._oh_object,
            iteratorObject: data._it_object,
        });
        return matchesPoiFilter(permalinkParams.filter, flags);
    };

    const reloadPOIs = function() {
        abortActiveOverpassRequest();
        const requestController = new AbortController();
        activeOverpassRequestController = requestController;

        updateKeyValues();

        const extent3857 = map.getView().calculateExtent(map.getSize());
        const extent4326 = transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
        const bbox = {
            left: extent4326[0],
            bottom: extent4326[1],
            right: extent4326[2],
            top: extent4326[3],
        };

        const xml = createOverpassQlForCurrentView({
            extentWgs84: bbox,
            keyValues,
            hasNominatimData: Object.keys(nominatimDataGlobal).length !== 0,
            onNeedNominatim: (lat, lon) => {
                // Asynchronously fetch nominatim reverse-geocode data on-demand.
                // Updates nominatimDataGlobal state to cache result for subsequent evaluations.
                reverseGeocode(lat, lon, (data) => {
                    nominatimDataGlobal = data;
                });
            },
        });

        const applyLoadedPoiData = result => {
            poiData = result.data;
            redrawPOIs();
            if (result.fallbackEndpoint) {
                logger.overpassFallbackSwitched(result.fallbackEndpoint);
            }
        };

        loadOverpassPois(xml, {
            timeoutMs: 30000,
            signal: requestController.signal,
        })
            .then(result => {
                if (activeOverpassRequestController !== requestController) {
                    return;
                }
                activeOverpassRequestController = null;
                applyLoadedPoiData(result);
            })
            .catch(error => {
                if (activeOverpassRequestController === requestController) {
                    activeOverpassRequestController = null;
                }
                if (error && error.name === 'AbortError') {
                    return;
                }
                const failure = formatOverpassFailure(error);
                logger.overpassFailure(failure);
            });
    };

    const redrawPOIs = function() {
        vectorSource.clear();

        const elements = getValidatedOverpassElements(poiData, () => {
            alertFn('Overpass API: Missing "elements" in response data');
        });

        if (!elements) {
            return;
        }

        renderPoiMarkersFromElements(elements, elementData => {
            if (!filterFeature(elementData)) {
                return;
            }

            const feature = new Feature({
                geometry: new Point(fromLonLat([elementData.lon, elementData.lat])),
                data: elementData,
            });
            vectorSource.addFeature(feature);
        });

        const refreshCoordinates = getNominatimRefreshCoordinates({
            elements,
            lastLat,
            lastLon,
        });
        const refreshResult = applyNominatimRefreshUpdate({
            refreshCoordinates,
            lastLat,
            lastLon,
            onRefresh: (lat, lon) => {
                reverseGeocode(lat, lon, (data) => {
                    if (JSON.stringify(nominatimDataGlobal) !== JSON.stringify(data)) {
                        nominatimDataGlobal = data;
                    }
                });
            },
        });
        lastLat = refreshResult.lastLat;
        lastLon = refreshResult.lastLon;
    };

    const buildPopupHtml = function(data) {
        evaluateOH(data);

        let text = buildPopupHeaderHtml(data, {
            iconHtml: popupMarkerHtmlForData(data),
            html: htmlEscape,
        });

        if (data._oh_state === 'error' || data._oh_state === 'na') {
            text += `<div class="e">${htmlEscape(data._oh_object || 'n/a')}</div>`;
        } else {
            text = appendOpeningHoursDetails({
                text,
                data,
                reftime: new Date(),
                prettifiedLabel: createPrettifiedLabel(i18nextRef, evaluationToolUrl, data._oh_value),
                drawTableAndComments: openingHoursTable.drawTableAndComments.bind(openingHoursTable),
            });
        }

        text += buildPopupTagTableHtml(data, {
            html: htmlEscape,
            trim: value => String(value).trim(),
        });

        text += buildPopupActionLinks({
            type: data._type,
            id: data._id,
            ohValue: data._oh_value || '',
            lat: data.lat,
            lon: data.lon,
            evaluationToolUrl,
            josmAllLabel: i18nextRef.t('texts.load all with JOSM'),
            evaluationLabel: i18nextRef.t('texts.evaluation tool'),
        });

        return text;
    };

    // Expose required methods matching old layer interface
    vectorLayer.reloadPOIs = reloadPOIs;
    vectorLayer.redrawPOIs = redrawPOIs;
    vectorLayer.buildPopupHtml = buildPopupHtml;

    return vectorLayer;
}
