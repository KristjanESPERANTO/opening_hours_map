/* global OpenLayers */

var repo_url = 'https://github.com/opening-hours/opening_hours_map';
var wiki_url = 'https://wiki.openstreetmap.org/wiki/Key:opening_hours';
var evaluation_tool_url = 'evaluation_tool/';

/* Source ../opening_hours.js/related_tags.txt */
var related_tags = [
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

if (!document.onLoadFunctions) {
    document.onLoadFunctions = new Array();
    window.onload = function () { for (var i=0; document.onLoadFunctions.length>i;i++) document.onLoadFunctions[i](); }
}

// From https://github.com/rurseekatze/OpenLinkMap/blob/master/js/small.js
function editPopupContent(content, lat, lon, type, id, oh_value) {
    // add some links to the bottom of a popup
    content += '<br />';
    content += '<a href="https://www.openstreetmap.org/edit?editor=id&'+type+'='+id+'" target="_blank">iD</a>&nbsp;&nbsp;';
    content +=
        '<a href="javascript:josm(\'import?url=' + encodeURIComponent('https://overpass-api.de/api/xapi_meta?*[opening_hours=' + oh_value + ']') + '\')">' + i18next.t('texts.load all with JOSM') + '</a>'+
        '&nbsp;&nbsp;<a href="javascript:josm(\'load_object?objects=' + type + id + '&select=' + type + id + '\')">JOSM</a>'+
        '&nbsp;&nbsp;<a href="https://www.openstreetmap.org/'+type+'/'+id+'" target="_blank">Details</a>'
        + '&nbsp;&nbsp;<a href="' + evaluation_tool_url + '?EXP='
        + encodeURIComponent(oh_value) + '&lat=' + lat + '&lon=' + lon + '" target="_blank">' + i18next.t('texts.evaluation tool') + '</a>';
    return content;
}

function createMap() {

    var map;
    var poi_layer;
    var nominatim_data_global = {};
    var permalinkParams = {};
    var permalinkObject;

    window.useUserKey = function (key) {
        if (related_tags.indexOf(key) === -1) { /* Add the new key to related_tags. */
            var opt = document.createElement('option');
            opt.value = key;
            opt.innerHTML = key;
            var select = document.getElementById('tag_selector_input');
            select.appendChild(opt);
            related_tags.push(key);
        }
        document.getElementById('tag_selector_input').selectedIndex = related_tags.indexOf(key);
    };

    window.keyChanged = function() {
        poi_layer.reloadPOIs();
        permalinkObject.updateLink();
    };

    permalinkParams.filter = OpenLayers.Util.getParameters().filter || 'none';
    document.getElementById('filter_form_' + permalinkParams.filter).checked = true;

    window.applyNewFilter = function (myRadio) {
        permalinkParams.filter = myRadio.value;
        poi_layer.redrawPOIs();
        permalinkObject.updateLink();
    };

    var OHMode = 0;
    var OSM_tags = []; // keys for the values which should be evaluated.

    var prmarr = window.location.search.replace( "?", "" ).split("&");
    var params = {};
    for ( var i = 0; i < prmarr.length; i++) {
        var tmparr = prmarr[i].split("=");
        params[tmparr[0]] = tmparr[1];
    }

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
    //    Karte - der Name ('map') muss mit der id des <div> uebereinstimmen.
    //----------------------------------------------------------------------------
    map = new OpenLayers.Map ('map', {controls:[]});

    //----------------------------------------------------------------------------
    //    Default-Koordinatensystem fuer alle Controls
    //----------------------------------------------------------------------------
    map.displayProjection = new OpenLayers.Projection ('EPSG:4326');

    /* {{{ Patch updateLink function */
    OpenLayers.Control.Permalink.prototype.updateLink = function() {
        permalinkObject = this;
        var href=this.base;
        if(href.indexOf('?')!=-1){
            href=href.substring(0,href.indexOf('?'));
        }
        href+='?'+OpenLayers.Util.getParameterString(OpenLayers.Util.extend(this.createParams(), permalinkParams));
        this.element.href=href;
    };
    /* }}} */

    /* {{{ Steuerelemente */
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

    /* {{{ Base layers */
    map.addLayer(new OpenLayers.Layer.OSM.Mapnik('Mapnik'));
    map.addLayer(new OpenLayers.Layer.OSM.CyclOSM('CyclOSM'));
    /* }}} */

    /* {{{ opening_hours layer */
    map.addLayer(poi_layer = new OpenLayers.Layer.PopupMarker('opening hours like values (opening_hours, lit, …)', {

        minZoom: 11,
        blockSize: 0, // no cache
        clusterSize: 16,
        clusterLimit: 50,
        reftime: new Date(),

        createHtmlFromData: function (data) {
            var h_icon = '<img src="' + this.getIconUrl(data) + '" alt=""/>';
            var h_name = this.html(data.name||data.ref||data.barrier||data.operator||data.shop||data.amenity||data.craft||data.id);
            if (typeof data.cuisine == 'string') {
                h_name += ' (cuisine: ' + data.cuisine + ')';
            }
            if (typeof data.barrier == 'string') {
                h_name = 'barrier: ' + h_name;
            }

            var text = '<h3>'+h_icon+'&#160;'+h_name+'</h3>\n';
            text += '<div class="v">'+this.html(data._oh_value)+'</div>';

            this.evaluateOH(data);

            if (data._oh_state == 'error' || data._oh_state == 'na') {
                text += '<div class="e">'+data._oh_object+'</div>';
            } else {
                    var t= data._it_object.getComment() || '';

                    switch (data._it_object.getStateString(true)) {
                    case 'open':    text+='<b class="o">open @ '   +this.reftime.toLocaleString()+'<br/>'+t+'</b>'; break;
                    case 'closed':  text+='<b class="c">closed @ ' +this.reftime.toLocaleString()+'<br/>'+t+'</b>'; break;
                    case 'unknown': text+='<b class="u">unknown @ '+this.reftime.toLocaleString()+'<br/>'+t+'</b>'; break;
                    }

                var prettified = data._oh_object.prettifyValue();

                if (data._oh_value != prettified)
                    text += '<br/>' + i18next.t('texts.prettified value', {
                            copyFunc: 'javascript:Evaluate(null, null, \'' + data._oh_value + '\')',
                        }) + ': <div class="v">'+prettified+'</div>';

                var warnings = data._oh_object.getWarnings();
                if (warnings.length > 0)
                    text += '<br/>Warnings: <div class="v">'+warnings.join('<br/>\n')+'</div>';

                data._it_object.setDate(this.reftime);
                text += OpeningHoursTable.drawTableAndComments(data._oh_object, data._it_object, this.reftime);
            }

            var rows=[];
            for (var tag in data) {
                if (data[tag] == '') continue;
                switch (tag) {
                case 'id': case '_id': case 'lat': case 'lon': case 'created_by':
                case '_oh_value': case '_oh_state': case '_oh_object': case '_it_object':
                    continue;
                }
                var val=this.html(data[tag]);
                if (/^https?:\/\//.test(val)) {
                    var res = [];
                    var list=data[tag].split (';');
                    for (var i=0; i<list.length;i++) {
                        var ele=this.html(OpenLayers.String.trim(list[i]));
                        res.push ('<a target="_blank" href="' + ele+'">'+ele+'</a>');
                    }
                    val=res.join('; ');
                }
                rows.push ('<tr><td>'+this.html(tag)+'</td><td>'+val+'</td></tr>');
            }

            if (rows.length>=1) text += '<table>'+rows.join('\n')+'</table>\n';

            return editPopupContent(text, data.lat, data.lon, data._type, data._id, data._oh_value);
        },

        // Copy past from js/popupmarker.js to change the translation.
        createHtmlFromList: function (list) {
            var items = [];
            var clusters = [];
            var nItems=0;
            var limit = this.clusterLimit && this.clusterLimit<list.length ? this.clusterLimit : list.length;
            for (var i=0; i<list.length; i++) {
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
                case 'ok': case 'warning': return 'img/circle_' + (data._it_object.getState() ? 'green' : (data._it_object.getUnknown() ? 'yellow' : 'red'))
                       + (data._oh_state == 'warning' ? '_warn' : '') + '.png';
                case 'error':   return 'img/circle_err.png';
                default: return false;
                }
            }
        },
        /* }}} */

        //------------------------------------------------------------
        //    Welche POIs laden?
        //------------------------------------------------------------

        keyValues: [
        ],

        //------------------------------------------------------------
        //    Nach pan oder zoom: POIs neuladen.
        //------------------------------------------------------------
        moveTo: function (bounds, zoomChanged, dragging) {
            OpenLayers.Layer.Markers.prototype.moveTo.apply(this,arguments);

            if (dragging || !this.visibility || this.map.zoom<this.minZoom) return;

            this.reloadPOIs();
        },

        //------------------------------------------------------------
        //    POIs neuladen.
        //    Muss nach Ändern von keyValues augerufen werden.
        //------------------------------------------------------------
        reloadPOIs: function () {
            if (this.updateKeyValues) {
                this.updateKeyValues();
            }

            var xml = this.overpassQL(this.keyValues);
            var url = 'https://overpass-api.de/api/interpreter?&data=' + encodeURIComponent(xml);

            var self = this;

            // AbortController for timeout handling
            var controller = new AbortController();
            var timeoutId = setTimeout(function() {
                controller.abort();
            }, 30000); // 30 second timeout

            fetch(url, { signal: controller.signal })
                .then(function(response) {
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        if (response.status == 504 || response.status == 429) {
                            console.warn('Overpass API timeout or rate limit (status ' + response.status + ')');
                        } else {
                            console.error('Overpass API request failed with status:', response.status);
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
                        console.warn('Overpass API request timed out');
                    } else {
                        console.error('Overpass API request failed:', error);
                    }
                });
        },

        redrawPOIs: function() {
            this.jsonCallback(this.poi_data);
        },

        /* {{{ Overpass query */
        overpassQL: function (keyvalues) {
            if (!(keyvalues instanceof Array)) keyvalues = [keyvalues];

            var bbox = this.map.getExtent()
                .transform(this.map.getProjectionObject(), this.map.displayProjection);

            if (Object.keys(nominatim_data_global).length === 0) {
                var nominatim_query = OpenLayers.String.format('&lat=${top}&lon=${left}', bbox);
                this.updateNominatimData(nominatim_query);
            }

            var bboxQuery = OpenLayers.String.format (
                '[bbox:${bottom},${left},${top},${right}]',
                bbox);

            var components = [];
            for (var i in keyvalues) {
                var key = keyvalues[i];
                components.push("node['" + key + "'];");
                components.push("way['" + key + "'];");
                components.push("relation['" + key + "'];");
            }

            var OverpassQL = '[out:json][timeout:3]' + bboxQuery + ';(' + components.join('') + ');out body center 1000;';

            return OverpassQL;
        },
        /* }}} */

        evaluateOH: function (data) {
            if (typeof data._oh_value === 'undefined' && typeof data._oh_state === 'undefined') {
                for (var i=0; i < OSM_tags.length; i++) {
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

                var crashed = true;
                if (["collection_times", "service_times"].includes(data._oh_key)) {
                    OHMode = 2;
                }
                try {
                    var oh = new opening_hours(data._oh_value, nominatim_data_global, {
                        'mode': OHMode,
                        // 'warnings_severity': 7,
                        /* Use default for now. See: https://github.com/opening-hours/opening_hours.js/issues/81 */
                        'locale': i18next.language,
                    });
                    var it = oh.getIterator(this.reftime);
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

            var elements = data.elements;
            if (!elements) {
                alert ('Missing "elements" in overpassQL json data.');
                return;
            }
            this.erase(true);

            for (var i in elements) {
                var element = elements[i];
                var elementData = element.tags;
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
                this.createMarker (data);
            }

            if (typeof elements[0] !== 'undefined' && (typeof this.lastLat === 'undefined'
                || Math.abs(this.lastLat - elements[0].lat) > 2
                || Math.abs(this.lastLon - elements[0].lon) > 2)) {

                // console.log("updateNominatimData inside query");
                this.updateNominatimData('&osm_type=' + elements[0].type.substr(0,1).toUpperCase() + '&osm_id=' + elements[0].id);

                this.lastLat = elements[0].lat;
                this.lastLon = elements[0].lon;
            }
        },

        //------------------------------------------------------------
        //    Update keyValues
        //------------------------------------------------------------
        updateKeyValues: function () {
            var key = related_tags[document.getElementById('tag_selector_input').selectedIndex];
            this.keyValues = [ key ];
            OSM_tags = [ key ];
            permalinkParams.tags = key;
        },

        filter: function(data) {
            switch (permalinkParams.filter) {
                case 'error':
                    return this.evaluateOH(data) == 'error' || data._oh_object.getWarnings().length > 0;
                case 'errorOnly':
                    return this.evaluateOH(data) == 'error';
                case 'warnOnly':
                    return this.evaluateOH(data) != 'error' && data._oh_object.getWarnings().length > 0;
                case 'open':
                    if (this.evaluateOH(data) == 'error')
                        return false;
                    else
                        return data._it_object.getState();
                case 'unknown':
                    if (this.evaluateOH(data) == 'error')
                        return false;
                    else
                        return data._it_object.getUnknown();
                case 'closed':
                    if (this.evaluateOH(data) == 'error')
                        return false;
                    else
                        return !data._it_object.getState() && !data._it_object.getUnknown();
                case 'openOrUnknown':
                    if (this.evaluateOH(data) == 'error')
                        return false;
                    else
                        return data._it_object.getState() || data._it_object.getUnknown();
                case 'none':
                default:
                    return true;
            }
        },
    }));
    /* }}} */

    //----------------------------------------------------------------------------
    //    Stelle bestimmten Bereich in maximaler Groesse dar
    //----------------------------------------------------------------------------

    if (!map.getCenter()) {
        map.zoomToExtent(
            new OpenLayers.Bounds(7.1042, 50.7362, 7.1171, 50.7417).
                transform(new OpenLayers.Projection('EPSG:4326'), map.getProjectionObject())
        );
    }
    /* }}} */

    document.getElementById('tag_selector_input').onchange = keyChanged;
}

function initializeUI() {
    document.title = i18next.t('texts.heading map');

    // Set HTML lang attribute based on current language
    document.documentElement.setAttribute('lang', i18next.language);

    // Add theme toggle button and language selector
    var headerHTML = '<div style="display: flex; justify-content: space-between; align-items: center;">';
    headerHTML += '<h1>' + i18next.t('texts.heading map') + '</h1>';
    headerHTML += '<div style="display: flex; gap: 1em; align-items: center;">';
    headerHTML += '<button id="theme-toggle" style="padding: 0.5em 1em; cursor: pointer; border: 1px solid #ccc; background: transparent; border-radius: 4px;" title="Toggle dark mode">🌓</button>';
    headerHTML += getUserSelectTranslateHTMLCode();
    headerHTML += '</div></div>';
    document.getElementById('header').innerHTML = headerHTML;

    // Language selector handler
    document.getElementById('language-select').addEventListener('change', function(e) {
        var selectedLang = e.target.value;
        document.documentElement.setAttribute('lang', selectedLang);
        changeLanguage(selectedLang);
    });

    // Initialize theme
    var savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.setAttribute('data-theme', 'dark');
    }

    // Theme toggle handler
    document.getElementById('theme-toggle').addEventListener('click', function() {
        var currentTheme = document.body.getAttribute('data-theme');
        var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
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
    document.getElementById('tag_selector_label').innerHTML = '<strong>' + i18next.t('texts.config POIs') + '</strong>:';

    var select = document.getElementById('tag_selector_input');
    for (var tag_ind = 0; tag_ind < related_tags.length; tag_ind++) {
        select.options[select.options.length] = new Option(related_tags[tag_ind], select.options.length);
    }

    // Map description
    var desc = i18next.t('texts.map is showing', { wikiUrl: wiki_url });
    desc += '<ul>';
    desc += '<li>' + i18next.t('words.green')  + ': ' + i18next.t('texts.open now') + '</li>';
    desc += '<li>' + i18next.t('words.yellow') + ': ' + i18next.t('texts.unknown now') + '</li>';
    desc += '<li>' + i18next.t('words.red')    + ': ' + i18next.t('texts.closed now') + '</li>';
    desc += '<li>' + i18next.t('words.violet')    + ': ' + i18next.t('texts.error') + '</li>';
    desc += '</ul>';
    desc += i18next.t('texts.warning', { sign: '<q>W</q>' });
    document.getElementById('map_description').innerHTML = desc;

    // Filter selector
    var filterHTML = '<p>' + i18next.t('texts.map filter');
    filterHTML += '<form name="filter_form">';
    var showFilterOptions = ['none', 'error', 'warnOnly', 'errorOnly', 'open', 'unknown', 'closed', 'openOrUnknown'];
    for (var i = 0; i < showFilterOptions.length; i++) {
        var filter_id = showFilterOptions[i];
        filterHTML += '<label><input type="radio" name="filter"'
                + ' value="' + filter_id + '"'
                + ' id="filter_form_' + filter_id + '"'
                + ' onclick="applyNewFilter(this)">' + i18next.t('texts.filter.' + filter_id) + '</input></label><br>';
    }
    filterHTML += '</form></p>';
    document.getElementById('filter_selector').innerHTML = filterHTML;
    document.getElementById('filter_form_none').checked = true;

    // Footer
    var footer = '<p>';
    footer += i18next.t('texts.data source', {
        APIaTag:      '<a href="https://overpass-api.de/">Overpass API</a>',
        OSMaTag:      '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
        OSMStartaTag: '<a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
        }) + '<br />';
    footer += i18next.t('texts.this website', { url: repo_url, hoster: 'GitHub' });
    footer += '</p>';
    document.getElementById('footer').innerHTML = footer;
}

// Wait for both DOM and modules to be ready
function initialize() {
    initializeUI();
    createMap();
}

// Initialize when modules are ready
if (window.modulesLoaded) {
    initialize();
} else {
    window.addEventListener('modulesLoaded', initialize, { once: true });
}
