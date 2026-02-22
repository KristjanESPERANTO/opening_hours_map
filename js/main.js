const repo_url = 'https://github.com/opening-hours/opening_hours_map';
const wiki_url = 'https://wiki.openstreetmap.org/wiki/Key:opening_hours';
const evaluation_tool_url = 'evaluation_tool/';

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

// From https://github.com/rurseekatze/OpenLinkMap/blob/master/js/small.js
function editPopupContent(content, lat, lon, type, id, oh_value) {
    // add some links to the bottom of a popup
    content += '<br />';
    const josmImport = `import?url=${encodeURIComponent(`https://overpass-api.de/api/xapi_meta?*[opening_hours=${oh_value}]`)}`;
    const josmLoad = `load_object?objects=${type}${id}&select=${type}${id}`;
    content += `<a href="https://www.openstreetmap.org/edit?editor=id&${type}=${id}" target="_blank">iD</a>&nbsp;&nbsp;`;
    content +=
        `<a href="#" class="js-josm" data-josm="${josmImport}">${i18next.t('texts.load all with JOSM')}</a>`+
        `&nbsp;&nbsp;<a href="#" class="js-josm" data-josm="${josmLoad}">JOSM</a>`+
        `&nbsp;&nbsp;<a href="https://www.openstreetmap.org/${type}/${id}" target="_blank">Details</a>`
        + `&nbsp;&nbsp;<a href="${evaluation_tool_url}?EXP=`
        + `${encodeURIComponent(oh_value)}&lat=${lat}&lon=${lon}" target="_blank">${i18next.t('texts.evaluation tool')}</a>`;
    return content;
}

function createMap() {

    const map = new OpenLayers.Map ('map', {controls:[]});
    const mapViewStorageKey = 'opening_hours_map_view';
    let poi_layer;
    let nominatim_data_global = {};
    const permalinkParams = {};
    let permalinkObject;

    window.useUserKey = function (key) {
        if (related_tags.indexOf(key) === -1) { /* Add the new key to related_tags. */
            const opt = document.createElement('option');
            opt.value = key;
            opt.innerHTML = key;
            const select = document.getElementById('tag_selector_input');
            select.appendChild(opt);
            related_tags.push(key);
        }
        document.getElementById('tag_selector_input').selectedIndex = related_tags.indexOf(key);
    };

    window.keyChanged = function() {
        // Clear debounce timer to reload immediately on manual tag change
        if (poi_layer._reloadTimer) {
            clearTimeout(poi_layer._reloadTimer);
            poi_layer._reloadTimer = null;
        }
        poi_layer.reloadPOIs();
        permalinkObject.updateLink();
    };

    permalinkParams.filter = OpenLayers.Util.getParameters().filter || 'none';
    document.getElementById(`filter_form_${permalinkParams.filter}`).checked = true;

    window.applyNewFilter = function (myRadio) {
        permalinkParams.filter = myRadio.value;
        poi_layer.redrawPOIs();
        permalinkObject.updateLink();
    };

    let OHMode = 0;
    let OSM_tags = []; // keys for the values which should be evaluated.

    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    const hasViewInUrl = typeof params.lat === 'string'
        || typeof params.lon === 'string'
        || typeof params.zoom === 'string';

    if (typeof params['mode'] != 'undefined') {
        OHMode = parseInt(params['mode']);
    }

    if (typeof params['tags'] != 'string') {
        switch (OHMode) {
            case 2:  OSM_tags.push('collection_times'); break;
            default: OSM_tags.push('opening_hours')   ; break;
        }
    } else {
        OSM_tags.push(params['tags']);
    }

    useUserKey(OSM_tags[0]);

    /* {{{ OpenLayers */
    //----------------------------------------------------------------------------
    //    Default coordinate system for all controls
    //----------------------------------------------------------------------------
    map.displayProjection = new OpenLayers.Projection ('EPSG:4326');

    /* {{{ Patch updateLink function */
    OpenLayers.Control.Permalink.prototype.updateLink = function() {
        permalinkObject = this;
        let href=this.base;
        if(href.indexOf('?')!=-1){
            href=href.substring(0,href.indexOf('?'));
        }
        href+=`?${OpenLayers.Util.getParameterString(OpenLayers.Util.extend(this.createParams(), permalinkParams))}`;
        this.element.href=href;
    };
    /* }}} */

    /* {{{ Controls */
    map.addControl(new OpenLayers.Control.LayerSwitcher());
    map.addControl(new OpenLayers.Control.MousePosition());
    map.addControl(new OpenLayers.Control.Navigation());
    map.addControl(new OpenLayers.Control.PanZoomBar());
    map.addControl(new OpenLayers.Control.Permalink());
    map.addControl(new OpenLayers.Control.ZoomStatus({
        html: i18next.t('texts.low zoom level'),
    }));
    map.addControl(new OpenLayers.Control.LoadStatus({
        html: '<img src="img/ajax-loader.gif" /><br />${layers}'
    }));
    map.addControl(new OpenLayers.Control.Attribution());
    /* }}} */

    map.events.register('moveend', map, function() {
        const currentCenter = map.getCenter();
        const currentZoom = map.getZoom();
        if (!currentCenter || !Number.isFinite(currentZoom)) {
            return;
        }
        const currentCenterWgs84 = currentCenter.clone()
            .transform(map.getProjectionObject(), new OpenLayers.Projection('EPSG:4326'));
        const mapViewToSave = {
            lon: Number(currentCenterWgs84.lon.toFixed(6)),
            lat: Number(currentCenterWgs84.lat.toFixed(6)),
            zoom: currentZoom,
        };
        try {
            localStorage.setItem(mapViewStorageKey, JSON.stringify(mapViewToSave));
        } catch (error) {
            console.warn('Failed to persist map view in localStorage:', error);
        }
    });

    /* {{{ Base layers */
    map.addLayer(new OpenLayers.Layer.OSM(
        'Mapnik',
        'https://tile.openstreetmap.org/${z}/${x}/${y}.png',
        { numZoomLevels: 19 }
    ));
    map.addLayer(new OpenLayers.Layer.OSM(
        'CyclOSM',
        'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/${z}/${x}/${y}.png',
        {
            numZoomLevels: 20,
            attribution: 'Map style: CyclOSM (CC-BY-SA) | Map data: © OpenStreetMap contributors'
        }
    ));
    /* }}} */

    /* {{{ opening_hours layer */
    map.addLayer(poi_layer = new OpenLayers.Layer.PopupMarker('opening hours like values (opening_hours, lit, …)', {

        minZoom: 11,
        blockSize: 0, // no cache
        clusterSize: 16,
        clusterLimit: 50,
        reftime: new Date(),
        reloadDebounceMs: 800, // Wait 800ms after map movement before reloading
        _reloadTimer: null,

        createHtmlFromData: function (data) {
            const h_icon = `<img src="${this.getIconUrl(data)}" alt=""/>`;
            let h_name = this.html(data.name||data.ref||data.barrier||data.operator||data.shop||data.amenity||data.craft||data.id);
            if (typeof data.cuisine == 'string') {
                h_name += ` (cuisine: ${data.cuisine})`;
            }
            if (typeof data.barrier == 'string') {
                h_name = `barrier: ${h_name}`;
            }

            let text = `<h3>${h_icon}&#160;${h_name}</h3>\n`;
            text += `<div class="v">${this.html(data._oh_value)}</div>`;

            this.evaluateOH(data);

            if (data._oh_state == 'error' || data._oh_state == 'na') {
                text += `<div class="e">${data._oh_object}</div>`;
            } else {
                    const t= data._it_object.getComment() || '';

                    switch (data._it_object.getStateString(true)) {
                    case 'open':    text+=`<b class="o">open @ ${this.reftime.toLocaleString()}<br/>${t}</b>`; break;
                    case 'closed':  text+=`<b class="c">closed @ ${this.reftime.toLocaleString()}<br/>${t}</b>`; break;
                    case 'unknown': text+=`<b class="u">unknown @ ${this.reftime.toLocaleString()}<br/>${t}</b>`; break;
                    }

                const prettified = data._oh_object.prettifyValue();

                if (data._oh_value != prettified)
                    text += `<br/>${i18next.t('texts.prettified value', {
                            copyFunc: `${evaluation_tool_url}?EXP=${encodeURIComponent(data._oh_value)}`,
                        })}: <div class="v">${prettified}</div>`;

                const warnings = data._oh_object.getWarnings();
                if (warnings.length > 0)
                    text += `<br/>Warnings: <div class="v">${warnings.join('<br/>\n')}</div>`;

                data._it_object.setDate(this.reftime);
                text += OpeningHoursTable.drawTableAndComments(data._oh_object, data._it_object, this.reftime);
            }

            const rows=[];
            for (const tag in data) {
                if (data[tag] == '') continue;
                switch (tag) {
                case 'id': case '_id': case 'lat': case 'lon': case 'created_by':
                case '_oh_value': case '_oh_state': case '_oh_object': case '_it_object':
                    continue;
                }
                let val=this.html(data[tag]);
                if (/^https?:\/\//.test(val)) {
                    const res = [];
                    const list=data[tag].split (';');
                    for (let i=0; i<list.length;i++) {
                        const ele=this.html(OpenLayers.String.trim(list[i]));
                        res.push (`<a target="_blank" href="${ele}">${ele}</a>`);
                    }
                    val=res.join('; ');
                }
                rows.push (`<tr><td>${this.html(tag)}</td><td>${val}</td></tr>`);
            }

            if (rows.length>=1) text += `<table>${rows.join('\n')}</table>\n`;

            return editPopupContent(text, data.lat, data.lon, data._type, data._id, data._oh_value);
        },

        // Copy past from js/popupmarker.js to change the translation.
        createHtmlFromList: function (list) {
            let items = [];
            const clusters = [];
            let nItems=0;
            const limit = this.clusterLimit && this.clusterLimit<list.length ? this.clusterLimit : list.length;
            for (let i=0; i<list.length; i++) {
                if (list[i]._csize || list[i].cluster) {
                    clusters.push (this.createHtmlFromData(list[i]));
                } else {
                    nItems++;
                    if (items.length<limit) {
                        items.push (this.createHtmlFromData(list[i]));
                    }
                }
            }
            if (nItems>limit) {
                if (limit!=1) {
                    items.unshift(i18next.t('texts.the first entries', { number: items.length, total: nItems } ) );
                }
            } else if (items.length) {
                if (limit!=1) {
                    items.unshift(i18next.t('texts.all n entries', { total: nItems } ) );
                }
            } else {
                items=clusters;
            }
            return items.join('<hr/>\n');
        },

        /* {{{ Icons */
        createIconFromData: function (data) {
            return new OpenLayers.Icon(this.getIconUrl(data));
        },

        getIconUrl: function (data) {
            if (this.evaluateOH(data) != 'na') {
                switch (data._oh_state) {
                case 'ok': case 'warning': return `img/circle_${data._it_object.getState() ? 'green' : (data._it_object.getUnknown() ? 'yellow' : 'red')
                        }${data._oh_state == 'warning' ? '_warn' : ''}.png`;
                case 'error':   return 'img/circle_err.png';
                default: return false;
                }
            }
        },
        /* }}} */

        //------------------------------------------------------------
        //    Which POIs to load?
        //------------------------------------------------------------

        keyValues: [
        ],

        //------------------------------------------------------------
        //    Reload POIs after pan or zoom.
        //------------------------------------------------------------
        moveTo: function (bounds, zoomChanged, dragging) {
            OpenLayers.Layer.Markers.prototype.moveTo.apply(this,arguments);

            if (dragging || !this.visibility || this.map.zoom<this.minZoom) return;

            // Debounce: Cancel previous timer and start new one
            if (this._reloadTimer) {
                clearTimeout(this._reloadTimer);
            }

            const self = this;
            this._reloadTimer = setTimeout(function() {
                self._reloadTimer = null;
                self.reloadPOIs();
            }, this.reloadDebounceMs || 500);
        },

        //------------------------------------------------------------
        //    Reload POIs.
        //    Must be called after changing keyValues.
        //------------------------------------------------------------
        reloadPOIs: function () {
            if (this.updateKeyValues) {
                this.updateKeyValues();
            }

            const xml = this.overpassQL(this.keyValues);
            const url = `https://overpass-api.de/api/interpreter?&data=${encodeURIComponent(xml)}`;

            const self = this;

            // AbortController for timeout handling
            const controller = new AbortController();
            const timeoutId = setTimeout(function() {
                controller.abort();
            }, 30000); // 30 second timeout

            fetch(url, { signal: controller.signal })
                .then(function(response) {
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        if (response.status == 504 || response.status == 429) {
                            console.warn(`Overpass API: ${response.status === 504 ? 'Timeout' : 'Rate limit exceeded'} (HTTP ${response.status})`);
                        } else {
                            console.error(`Overpass API: Request failed (HTTP ${response.status})`);
                        }
                        return null;
                    }
                    return response.json();
                })
                .then(function(data) {
                    if (data) {
                        self.poi_data = data;
                        self.redrawPOIs();
                    }
                })
                .catch(function(error) {
                    clearTimeout(timeoutId);
                    if (error.name === 'AbortError') {
                        console.warn('Overpass API: Request timed out after 30 seconds');
                    } else {
                        console.error('Overpass API: Request failed -', error.message || error);
                    }
                });
        },

        redrawPOIs: function() {
            this.jsonCallback(this.poi_data);
        },

        /* {{{ Overpass query */
        overpassQL: function (keyvalues) {
            if (!(keyvalues instanceof Array)) keyvalues = [keyvalues];

            const bbox = this.map.getExtent()
                .transform(this.map.getProjectionObject(), this.map.displayProjection);

            if (Object.keys(nominatim_data_global).length === 0) {
                const nominatim_query = OpenLayers.String.format('&lat=${top}&lon=${left}', bbox);
                this.updateNominatimData(nominatim_query);
            }

            const bboxQuery = OpenLayers.String.format (
                '[bbox:${bottom},${left},${top},${right}]',
                bbox);

            const components = [];
            for (const i in keyvalues) {
                const key = keyvalues[i];
                components.push(`node['${key}'];`);
                components.push(`way['${key}'];`);
                components.push(`relation['${key}'];`);
            }

            const OverpassQL = `[out:json][timeout:3]${bboxQuery};(${components.join('')});out body center 1000;`;

            return OverpassQL;
        },
        /* }}} */

        evaluateOH: function (data) {
            if (typeof data._oh_value === 'undefined' && typeof data._oh_state === 'undefined') {
                for (let i=0; i < OSM_tags.length; i++) {
                    if (typeof data[OSM_tags[i]] === 'string') {
                        data._oh_key = OSM_tags[i];
                        data._oh_value = data[OSM_tags[i]];
                        break;
                    }
                }
                if (typeof data._oh_value === 'undefined') {
                    data._oh_value = false;
                    data._oh_state = 'na'; /* Not applicable. */
                    return data._oh_state;
                }

                let crashed, oh, it;
                if (["collection_times", "service_times"].includes(data._oh_key)) {
                    OHMode = 2;
                }
                try {
                    oh = new opening_hours(data._oh_value, nominatim_data_global, {
                        'mode': OHMode,
                        // 'warnings_severity': 7,
                        /* Use default for now. See: https://github.com/opening-hours/opening_hours.js/issues/81 */
                        'locale': i18next.language,
                    });
                    it = oh.getIterator(this.reftime);
                    crashed = false;
                } catch (err) {
                    crashed = err;
                    data._oh_object = crashed;
                    data._oh_state = 'error';
                }

                if (!crashed) {
                    data._oh_object = oh;
                    data._it_object = it;
                    if (oh.getWarnings().length > 0) {
                        data._oh_state = 'warning';
                    } else {
                        data._oh_state = 'ok';
                    }
                }
                return data._oh_state;
            }
        },

        lastLat: undefined,
        lastLon: undefined,
        poi_data: undefined,

        createMarkerFromData: function() {
        },

        /* FIXME */
        // nominatim_data: {},
        updateNominatimData: function (query) {
            reverseGeocodeLocation(
                query,
                function(nominatim_data) {
                    // console.log(JSON.stringify(nominatim_data, null, '\t'));
                    /* http://stackoverflow.com/a/1144249 */
                    if (JSON.stringify(nominatim_data_global) !== JSON.stringify(nominatim_data)) {
                        // this.nominatim_data = nominatim_data;
                        nominatim_data_global = nominatim_data;
                        // poi_layer.redrawPOIs();
                    }
                }
            );
        },

        jsonCallback: function (data) {
            if (typeof data === 'undefined') {
                return;
            }

            const elements = data.elements;
            if (!elements) {
                alert ('Overpass API: Missing "elements" in response data');
                return;
            }
            this.erase(true);

            for (const i in elements) {
                const element = elements[i];
                let elementData = element.tags;
                if (!elementData) elementData = {};
                if (element.id) {
                    elementData.id = (element.type ? element.type.substr(0,1) : '') + element.id;
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
                this.createMarker (elementData);
            }

            if (typeof elements[0] !== 'undefined' && (typeof this.lastLat === 'undefined'
                || Math.abs(this.lastLat - elements[0].lat) > 2
                || Math.abs(this.lastLon - elements[0].lon) > 2)) {

                // console.log("updateNominatimData inside query");
                this.updateNominatimData(`&osm_type=${elements[0].type.substr(0,1).toUpperCase()}&osm_id=${elements[0].id}`);

                this.lastLat = elements[0].lat;
                this.lastLon = elements[0].lon;
            }
        },

        //------------------------------------------------------------
        //    Update keyValues
        //------------------------------------------------------------
        updateKeyValues: function () {
            const key = related_tags[document.getElementById('tag_selector_input').selectedIndex];
            this.keyValues = [ key ];
            OSM_tags = [ key ];
            permalinkParams.tags = key;
        },

        filter: function(data) {
            const state = this.evaluateOH(data);
            const hasError = state == 'error';
            const oh = data._oh_object;
            const it = data._it_object;
            const hasWarnings = !hasError && oh && typeof oh.getWarnings === 'function'
                ? oh.getWarnings().length > 0
                : false;
            const canIterate = !hasError && it && typeof it.getState === 'function'
                && typeof it.getUnknown === 'function';
            const isOpen = canIterate ? it.getState() : false;
            const isUnknown = canIterate ? it.getUnknown() : false;

            switch (permalinkParams.filter) {
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
        },
    }));
    /* }}} */

    //----------------------------------------------------------------------------
    //    Display specific area at maximum zoom
    //----------------------------------------------------------------------------

    if (!map.getCenter()) {
        let restoredSavedView = false;

        if (!hasViewInUrl) {
            try {
                const savedMapViewRaw = localStorage.getItem(mapViewStorageKey);
                if (savedMapViewRaw) {
                    const savedMapView = JSON.parse(savedMapViewRaw);
                    const savedLon = Number(savedMapView.lon);
                    const savedLat = Number(savedMapView.lat);
                    const savedZoom = Number(savedMapView.zoom);
                    if (Number.isFinite(savedLon) && Number.isFinite(savedLat) && Number.isFinite(savedZoom)) {
                        const savedCenter = new OpenLayers.LonLat(savedLon, savedLat)
                            .transform(new OpenLayers.Projection('EPSG:4326'), map.getProjectionObject());
                        map.setCenter(savedCenter, savedZoom);
                        restoredSavedView = true;
                    }
                }
            } catch (error) {
                console.warn('Failed to restore map view from localStorage:', error);
            }
        }

        if (!restoredSavedView) {
            map.zoomToExtent(
                new OpenLayers.Bounds(7.1042, 50.7362, 7.1171, 50.7417).
                    transform(new OpenLayers.Projection('EPSG:4326'), map.getProjectionObject())
            );
        }
    }
    /* }}} */

    document.getElementById('tag_selector_input').onchange = keyChanged;

    return map;
}

function initializeUI() {
    document.title = i18next.t('texts.heading map');

    // Set HTML lang attribute based on current language
    document.documentElement.setAttribute('lang', i18next.language);

    // JOSM link handler
    document.addEventListener('click', function(event) {
        const link = event.target.closest('a.js-josm');
        if (!link) {
            return;
        }
        event.preventDefault();
        if (typeof window.josm === 'function') {
            window.josm(link.dataset.josm);
        }
    });

    // Add theme toggle button and language selector
    let headerHTML = '<div style="display: flex; justify-content: space-between; align-items: center;">';
    headerHTML += `<h1>${i18next.t('texts.heading map')}</h1>`;
    headerHTML += '<div style="display: flex; gap: 1em; align-items: center;">';
    headerHTML += '<button id="theme-toggle" style="padding: 0.5em 1em; cursor: pointer; border: 1px solid #ccc; background: transparent; border-radius: 4px;" title="Toggle dark mode">🌓</button>';
    headerHTML += getUserSelectTranslateHTMLCode();
    headerHTML += '</div></div>';
    document.getElementById('header').innerHTML = headerHTML;

    // Language selector handler
    document.getElementById('language-select').addEventListener('change', function(e) {
        const selectedLang = e.target.value;
        document.documentElement.setAttribute('lang', selectedLang);
        changeLanguage(selectedLang);
    });

    // Initialize theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.setAttribute('data-theme', 'dark');
    }

    // Theme toggle handler
    document.getElementById('theme-toggle').addEventListener('click', function() {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Key input Enter handler
    document.getElementById('key').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            useUserKey(document.getElementById('key').value);
            keyChanged();
            return false;
        }
    });

    // Tag selector
    document.getElementById('tag_selector_label').innerHTML = `<strong>${i18next.t('texts.config POIs')}</strong>:`;

    const select = document.getElementById('tag_selector_input');
    for (let tag_ind = 0; tag_ind < related_tags.length; tag_ind++) {
        select.options[select.options.length] = new Option(related_tags[tag_ind], select.options.length);
    }

    // Map description
    let desc = i18next.t('texts.map is showing', { wikiUrl: wiki_url });
    desc += '<ul>';
    desc += `<li>${i18next.t('words.green')}: ${i18next.t('texts.open now')}</li>`;
    desc += `<li>${i18next.t('words.yellow')}: ${i18next.t('texts.unknown now')}</li>`;
    desc += `<li>${i18next.t('words.red')}: ${i18next.t('texts.closed now')}</li>`;
    desc += `<li>${i18next.t('words.violet')}: ${i18next.t('texts.error')}</li>`;
    desc += '</ul>';
    desc += i18next.t('texts.warning', { sign: '<q>W</q>' });
    document.getElementById('map_description').innerHTML = desc;

    // Filter selector
    let filterHTML = `<p>${i18next.t('texts.map filter')}`;
    filterHTML += '<form name="filter_form">';
    const showFilterOptions = ['none', 'error', 'warnOnly', 'errorOnly', 'open', 'unknown', 'closed', 'openOrUnknown'];
    for (let i = 0; i < showFilterOptions.length; i++) {
        const filter_id = showFilterOptions[i];
        filterHTML += `<label><input type="radio" name="filter"`
                + ` value="${filter_id}"`
                + ` id="filter_form_${filter_id}"`
                + ` onclick="applyNewFilter(this)">${i18next.t(`texts.filter.${filter_id}`)}</input></label><br>`;
    }
    filterHTML += '</form></p>';
    document.getElementById('filter_selector').innerHTML = filterHTML;
    document.getElementById('filter_form_none').checked = true;

    // Footer
    let footer = '<p>';
    footer += `${i18next.t('texts.data source', {
        APIaTag:      '<a href="https://overpass-api.de/">Overpass API</a>',
        OSMaTag:      '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
        OSMStartaTag: '<a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
        })}<br />`;
    footer += i18next.t('texts.this website', { url: repo_url, hoster: 'GitHub' });
    footer += '</p>';
    document.getElementById('footer').innerHTML = footer;
}

function setupGeolocation(map) {
    const geolocationLayer = new OpenLayers.Layer.Vector('Geolocation', {
        displayInLayerSwitcher: false,
    });
    map.addLayer(geolocationLayer);
    let geolocationFeatures = [];

    // Geolocation button
    const geolocateBtn = document.createElement('button');
    geolocateBtn.type = 'button';
    geolocateBtn.innerHTML = '📍';
    geolocateBtn.title = 'Zoom to my location';
    geolocateBtn.setAttribute('aria-label', 'Zoom to my location');
    geolocateBtn.className = 'olControlGeolocate';
    geolocateBtn.addEventListener('click', function() {
        if (!navigator.geolocation) {
            console.error('Geolocation is not supported by your browser');
            return;
        }
        geolocateBtn.style.opacity = '0.5';
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lon = position.coords.longitude;
                const lat = position.coords.latitude;
                const point = new OpenLayers.LonLat(lon, lat)
                    .transform(new OpenLayers.Projection('EPSG:4326'), map.getProjectionObject());

                if (geolocationFeatures.length > 0) {
                    geolocationLayer.removeFeatures(geolocationFeatures);
                    geolocationFeatures = [];
                }

                const positionGeometry = new OpenLayers.Geometry.Point(point.lon, point.lat);
                geolocationFeatures.push(new OpenLayers.Feature.Vector(positionGeometry));

                if (typeof position.coords.accuracy === 'number' && position.coords.accuracy > 0) {
                    const accuracyGeometry = OpenLayers.Geometry.Polygon.createRegularPolygon(
                        positionGeometry,
                        position.coords.accuracy,
                        40,
                        0
                    );
                    geolocationFeatures.push(new OpenLayers.Feature.Vector(accuracyGeometry));
                }

                geolocationLayer.addFeatures(geolocationFeatures);
                map.setCenter(point, 16);
                geolocateBtn.style.opacity = '1';
            },
            function(error) {
                console.error('Geolocation error:', error.message);
                geolocateBtn.style.opacity = '1';
            }
        );
    });
    document.getElementById('map').appendChild(geolocateBtn);
}

// Wait for both DOM and modules to be ready
function initialize() {
    initializeUI();
    const map = createMap();
    setupGeolocation(map);
}

// Initialize when modules are ready
if (window.modulesLoaded) {
    initialize();
} else {
    window.addEventListener('modulesLoaded', initialize, { once: true });
}
