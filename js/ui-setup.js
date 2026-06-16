function setDocumentLanguage(lang, setHtmlLang) {
    setHtmlLang(lang);
}

function applyLanguageSelection(selectedLang, options) {
    const {
        setHtmlLang,
        onLanguageChange,
    } = options;

    setDocumentLanguage(selectedLang, setHtmlLang);
    onLanguageChange(selectedLang);
}

function resolveInitialTheme(savedTheme, prefersDark) {
    if (savedTheme) {
        return savedTheme;
    }

    return prefersDark ? 'dark' : null;
}

function getToggledTheme(currentTheme) {
    return currentTheme === 'dark' ? 'light' : 'dark';
}

function applyTheme(theme, options) {
    const {
        setThemeAttribute,
        saveTheme,
    } = options;

    setThemeAttribute(theme);
    if (typeof saveTheme === 'function') {
        saveTheme(theme);
    }
}

function handleJosmLinkClick(event, options) {
    const {
        findClosestLink,
        onJosm,
    } = options;

    const link = findClosestLink(event.target);
    if (!link) {
        return false;
    }

    event.preventDefault();
    onJosm(link.dataset.josm);
    return true;
}

function buildHeaderHtml(options) {
    const {
        heading,
        languageSelectorHtml,
    } = options;

    let headerHtml = '<div style="display: flex; justify-content: space-between; align-items: center;">';
    headerHtml += `<h1>${heading}</h1>`;
    headerHtml += '<div style="display: flex; gap: 1em; align-items: center;">';
    headerHtml += '<button id="theme-toggle" style="padding: 0.5em 1em; cursor: pointer; border: 1px solid #ccc; background: transparent; border-radius: 4px;" title="Toggle dark mode">🌓</button>';
    headerHtml += languageSelectorHtml;
    headerHtml += '</div></div>';

    return headerHtml;
}

function initializeTagSelectorUi(options) {
    const {
        labelElement,
        selectElement,
        labelHtml,
        tags,
        createOption,
    } = options;

    labelElement.innerHTML = labelHtml;

    for (let i = 0; i < tags.length; i++) {
        selectElement.options[selectElement.options.length] = createOption(tags[i], selectElement.options.length);
    }
}

function buildMapDescriptionHtml(options) {
    const {
        mapIsShowingHtml,
        greenLabel,
        openNowLabel,
        yellowLabel,
        unknownNowLabel,
        redLabel,
        closedNowLabel,
        violetLabel,
        errorLabel,
        warningHtml,
    } = options;

    let html = mapIsShowingHtml;
    html += '<ul>';
    html += `<li>${greenLabel}: ${openNowLabel}</li>`;
    html += `<li>${yellowLabel}: ${unknownNowLabel}</li>`;
    html += `<li>${redLabel}: ${closedNowLabel}</li>`;
    html += `<li>${violetLabel}: ${errorLabel}</li>`;
    html += '</ul>';
    html += warningHtml;

    return html;
}

function buildFilterSelectorHtml(options) {
    const {
        introHtml,
        filterIds,
        filterLabelById,
    } = options;

    let html = `<p>${introHtml}`;
    html += '<form name="filter_form">';

    for (let i = 0; i < filterIds.length; i++) {
        const filterId = filterIds[i];
        html += '<label><input type="radio" name="filter"'
            + ` value="${filterId}"`
            + ` id="filter_form_${filterId}"`
            + `>${filterLabelById(filterId)}</input></label><br>`;
    }

    html += '</form></p>';
    return html;
}

function buildFooterHtml(options) {
    const {
        dataSourceHtml,
        thisWebsiteHtml,
    } = options;

    let html = '<p>';
    html += `${dataSourceHtml}<br />`;
    html += thisWebsiteHtml;
    html += '</p>';

    return html;
}

export function setupUi(options) {
    const {
        i18nextRef,
        documentRef,
        windowRef,
        localStorageRef,
        relatedTags,
        wikiUrl,
        repoUrl,
        getUserSelectTranslateHTMLCode,
        changeLanguage,
        useUserKey,
        keyChanged,
    } = options;

    documentRef.title = i18nextRef.t('texts.heading map');

    // Set HTML lang attribute based on current language.
    setDocumentLanguage(i18nextRef.language, lang => documentRef.documentElement.setAttribute('lang', lang));

    // JOSM link handler.
    documentRef.addEventListener('click', function(event) {
        handleJosmLinkClick(event, {
            findClosestLink: target => target.closest('a.js-josm'),
            onJosm: josmData => {
                if (typeof windowRef.josm === 'function') {
                    windowRef.josm(josmData);
                }
            },
        });
    });

    // Add theme toggle button and language selector.
    documentRef.getElementById('header').innerHTML = buildHeaderHtml({
        heading: i18nextRef.t('texts.heading map'),
        languageSelectorHtml: getUserSelectTranslateHTMLCode(),
    });

    // Language selector handler.
    documentRef.getElementById('language-select').addEventListener('change', function(e) {
        const selectedLang = e.target.value;
        applyLanguageSelection(selectedLang, {
            setHtmlLang: lang => documentRef.documentElement.setAttribute('lang', lang),
            onLanguageChange: changeLanguage,
        });
    });

    // Initialize theme.
    const savedTheme = localStorageRef.getItem('theme');
    const prefersDark = !!(windowRef.matchMedia && windowRef.matchMedia('(prefers-color-scheme: dark)').matches);
    const initialTheme = resolveInitialTheme(savedTheme, prefersDark);
    if (initialTheme) {
        applyTheme(initialTheme, {
            setThemeAttribute: theme => documentRef.body.setAttribute('data-theme', theme),
        });
    }

    // Theme toggle handler.
    documentRef.getElementById('theme-toggle').addEventListener('click', function() {
        const currentTheme = documentRef.body.getAttribute('data-theme');
        const newTheme = getToggledTheme(currentTheme);
        applyTheme(newTheme, {
            setThemeAttribute: theme => documentRef.body.setAttribute('data-theme', theme),
            saveTheme: theme => localStorageRef.setItem('theme', theme),
        });
    });

    // Key input Enter handler.
    documentRef.getElementById('key').addEventListener('keypress', function(e) {
        if (e.key !== 'Enter') {
            return;
        }

        e.preventDefault();
        useUserKey(documentRef.getElementById('key').value);
        keyChanged();
        return false;
    });

    // Tag selector.
    initializeTagSelectorUi({
        labelElement: documentRef.getElementById('tag_selector_label'),
        selectElement: documentRef.getElementById('tag_selector_input'),
        labelHtml: `<strong>${i18nextRef.t('texts.config POIs')}</strong>:`,
        tags: relatedTags,
        createOption: (label, value) => new Option(label, value),
    });

    // Map description.
    documentRef.getElementById('map_description').innerHTML = buildMapDescriptionHtml({
        mapIsShowingHtml: i18nextRef.t('texts.map is showing', { wikiUrl }),
        greenLabel: i18nextRef.t('words.green'),
        openNowLabel: i18nextRef.t('texts.open now'),
        yellowLabel: i18nextRef.t('words.yellow'),
        unknownNowLabel: i18nextRef.t('texts.unknown now'),
        redLabel: i18nextRef.t('words.red'),
        closedNowLabel: i18nextRef.t('texts.closed now'),
        violetLabel: i18nextRef.t('words.violet'),
        errorLabel: i18nextRef.t('texts.error'),
        warningHtml: i18nextRef.t('texts.warning', { sign: '<q>W</q>' }),
    });

    // Filter selector.
    const showFilterOptions = ['none', 'error', 'warnOnly', 'errorOnly', 'open', 'unknown', 'closed', 'openOrUnknown'];
    documentRef.getElementById('filter_selector').innerHTML = buildFilterSelectorHtml({
        introHtml: i18nextRef.t('texts.map filter'),
        filterIds: showFilterOptions,
        filterLabelById: filterId => i18nextRef.t(`texts.filter.${filterId}`),
    });
    documentRef.getElementById('filter_form_none').checked = true;

    // Footer.
    documentRef.getElementById('footer').innerHTML = buildFooterHtml({
        dataSourceHtml: i18nextRef.t('texts.data source', {
            APIaTag: '<a href="https://overpass-api.de/">Overpass API</a>',
            OSMaTag: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
            OSMStartaTag: '<a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
        }),
        thisWebsiteHtml: i18nextRef.t('texts.this website', { url: repoUrl, hoster: 'GitHub' }),
    });
}
