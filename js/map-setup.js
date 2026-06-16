import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import {fromLonLat} from 'ol/proj.js';
import XYZ from 'ol/source/XYZ.js';
import { clearReloadTimer, scheduleReload } from './reload-debounce.js';
import { setupPermalinkAndViewState } from './map-permalink-view-controller.js';
import { createPoiLayer } from './map-poi-layer.js';
import { createPopupController } from './popup-controller.js';
import {
    createMapInitialState,
    updateFilterState,
    setPermalinkFilter,
    addTagIfMissing,
    getActiveTags,
} from './map-initial-state.js';

function setupLayerSwitcher(options) {
    const {
        targetElement,
        mapnikLayer,
        cyclosmLayer,
        documentRef,
    } = options;

    const layerSwitcher = documentRef.createElement('div');
    layerSwitcher.className = 'ol-unselectable ol-control olLayerSwitcher';
    layerSwitcher.innerHTML = `
        <button type="button" class="olLayerSwitcherToggle" aria-label="Layers" aria-expanded="false">
            <span class="olLayerSwitcherIcon" aria-hidden="true"></span>
        </button>
        <div class="olLayerSwitcherPanel" hidden>
            <label><input type="radio" name="base-layer" value="mapnik" checked> Mapnik</label>
            <label><input type="radio" name="base-layer" value="cyclosm"> CyclOSM</label>
        </div>
    `;

    const toggle = layerSwitcher.querySelector('.olLayerSwitcherToggle');
    const panel = layerSwitcher.querySelector('.olLayerSwitcherPanel');
    const radios = layerSwitcher.querySelectorAll('input[name="base-layer"]');

    if (!toggle || !panel) {
        targetElement.appendChild(layerSwitcher);
        return;
    }

    const setLayer = function(value) {
        const useCyclosm = value === 'cyclosm';
        mapnikLayer.setVisible(!useCyclosm);
        cyclosmLayer.setVisible(useCyclosm);
    };

    const onToggleClick = event => {
        event.stopPropagation();
        const isOpen = !panel.hidden;
        panel.hidden = isOpen;
        toggle.setAttribute('aria-expanded', String(!isOpen));
    };

    toggle.addEventListener('click', onToggleClick);

    for (let i = 0; i < radios.length; i++) {
        radios[i].addEventListener('change', () => {
            if (radios[i].checked) {
                setLayer(radios[i].value);
            }
        });
    }

    const onDocumentClick = event => {
        if (!layerSwitcher.contains(event.target)) {
            panel.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
        }
    };

    documentRef.addEventListener('click', onDocumentClick);

    targetElement.appendChild(layerSwitcher);
}

function createMapActionController(options) {
    const {
        documentRef,
        relatedTags,
        tagState,
        filterState,
        permalinkParams,
        onReloadPois,
        onRedrawPois,
        onPermalinkUpdate,
    } = options;

    const useUserKey = function(key) {
        const tagResult = addTagIfMissing(relatedTags, key);
        if (tagResult.added) {
            const opt = documentRef.createElement('option');
            opt.value = key;
            opt.textContent = key;
            const select = documentRef.getElementById('tag_selector_input');
            select.appendChild(opt);
        }
        documentRef.getElementById('tag_selector_input').selectedIndex = tagResult.index;
    };

    const keyChanged = function() {
        onReloadPois();
        onPermalinkUpdate();
    };

    const applyNewFilter = function(myRadio) {
        updateFilterState(filterState, myRadio.value);
        setPermalinkFilter(permalinkParams, filterState.filter);
        onRedrawPois();
        onPermalinkUpdate();
    };

    const bindDomHandlers = function() {
        documentRef.getElementById(`filter_form_${permalinkParams.filter}`).checked = true;
        documentRef.getElementById('tag_selector_input').onchange = keyChanged;

        const filterInputs = documentRef.querySelectorAll('input[name="filter"]');
        filterInputs.forEach(input => {
            input.addEventListener('change', function() {
                if (this.checked) {
                    applyNewFilter(this);
                }
            });
        });
    };

    const initializeTagSelection = function() {
        useUserKey(getActiveTags(tagState)[0]);
    };

    return {
        useUserKey,
        keyChanged,
        applyNewFilter,
        bindDomHandlers,
        initializeTagSelection,
    };
}

export function createConfiguredMap(options) {
    const {
        relatedTags,
        evaluationToolUrl,
        onActionsReady,
        runtimeContext,
        windowRef,
        localStorageRef,
    } = options;

    const {
        documentRef,
        logger,
    } = runtimeContext;

    const initialState = createMapInitialState({
        search: windowRef.location.search,
        fallbackTagByMode: {
            2: 'collection_times',
            default: 'opening_hours',
        },
    });

    // Create OL10 map
    const map = new Map({
        target: 'map',
        layers: [],
        view: new View({
            center: fromLonLat([initialState.lon, initialState.lat]),
            zoom: initialState.zoom,
            maxZoom: 19,
        }),
    });

    let permalinkObject;

    const mapnikLayer = new TileLayer({
        source: new XYZ({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attributions: '© OpenStreetMap contributors',
            referrerPolicy: 'strict-origin',
            maxZoom: 19,
        }),
        properties: { title: 'Mapnik', type: 'base' },
        visible: true,
    });
    map.addLayer(mapnikLayer);

    const cyclosmLayer = new TileLayer({
        source: new XYZ({
            url: 'https://{a-c}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
            attributions: 'CyclOSM | © OpenStreetMap contributors',
            referrerPolicy: 'strict-origin',
            maxZoom: 19,
        }),
        properties: { title: 'CyclOSM', type: 'base' },
        visible: false,
    });
    map.addLayer(cyclosmLayer);

    setupLayerSwitcher({
        targetElement: map.getTargetElement(),
        mapnikLayer,
        cyclosmLayer,
        documentRef,
    });

    const poiLayer = createPoiLayer({
        map,
        runtimeContext,
        relatedTags,
        tagState: initialState.tagState,
        permalinkParams: initialState.permalinkParams,
        evaluationToolUrl,
        initialOhMode: initialState.initialUrlState.ohMode,
    });

    map.addLayer(poiLayer);

    setupPermalinkAndViewState({
        map,
        windowRef,
        localStorageRef,
        mapViewStorageKey: initialState.mapViewStorageKey,
        permalinkParams: initialState.permalinkParams,
        hasViewInUrl: initialState.hasViewInUrl,
        onPermalinkControl: control => {
            permalinkObject = control;
        },
        onPersistError: error => {
            logger.mapViewPersistFailed(error);
        },
        onRestoreError: error => {
            logger.mapViewRestoreFailed(error);
        },
        fallbackBoundsWgs84: {
            left: 7.1042,
            bottom: 50.7362,
            right: 7.1171,
            top: 50.7417,
        },
    });

    const mapActions = createMapActionController({
        documentRef,
        relatedTags,
        tagState: initialState.tagState,
        filterState: initialState.filterState,
        permalinkParams: initialState.permalinkParams,
        onReloadPois: () => {
            // Clear debounce timer to reload immediately on manual tag change.
            clearReloadTimer(poiLayer);
            poiLayer.reloadPOIs();
        },
        onRedrawPois: () => {
            poiLayer.redrawPOIs();
        },
        onPermalinkUpdate: () => {
            if (permalinkObject) {
                permalinkObject.updateLink();
            }
        },
    });
    mapActions.bindDomHandlers();
    mapActions.initializeTagSelection();
    mapActions.keyChanged();

    createPopupController({
        map,
        documentRef,
        poiLayer,
    });

    const onPointerMove = evt => {
        const hit = map.hasFeatureAtPixel(evt.pixel, {
            layerFilter: layer => layer === poiLayer,
        });
        map.getTargetElement().style.cursor = hit ? 'pointer' : '';
    };

    map.on('pointermove', onPointerMove);

    const onMoveEnd = () => {
        scheduleReload(poiLayer, () => {
            poiLayer.reloadPOIs();
        }, 1200);
    };

    map.on('moveend', onMoveEnd);

    if (typeof onActionsReady === 'function') {
        onActionsReady(mapActions);
    }

    return map;
}
