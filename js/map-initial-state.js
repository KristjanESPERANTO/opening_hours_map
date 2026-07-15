export function parseUrlState(search, fallbackTagByMode) {
    const params = Object.fromEntries(new URLSearchParams(search));
    const hasViewInUrl = typeof params.lat === 'string'
        || typeof params.lon === 'string'
        || typeof params.zoom === 'string';

    const parsedMode = Number.parseInt(params.mode, 10);
    const ohMode = Number.isFinite(parsedMode) ? parsedMode : 0;
    const selectedTag = typeof params.tags === 'string'
        ? params.tags
        : (fallbackTagByMode[ohMode] || fallbackTagByMode.default);

    return {
        hasViewInUrl,
        ohMode,
        selectedTag,
    };
}

export function createFilterState(search, defaultFilter = 'none') {
    const params = new URLSearchParams(search);
    return {
        filter: params.get('filter') || defaultFilter,
    };
}

export function updateFilterState(filterState, nextFilter) {
    filterState.filter = nextFilter;
    return filterState;
}

export function createPermalinkParams(initialParams = {}) {
    return { ...initialParams };
}

export function setPermalinkFilter(permalinkParams, filter) {
    permalinkParams.filter = filter;
    return permalinkParams;
}

export function setPermalinkTags(permalinkParams, tags) {
    permalinkParams.tags = tags;
    return permalinkParams;
}

export function createTagState(initialTag) {
    return {
        osmTags: [initialTag],
    };
}

export function addTagIfMissing(relatedTags, tag) {
    let index = relatedTags.indexOf(tag);
    if (index === -1) {
        relatedTags.push(tag);
        index = relatedTags.length - 1;
        return { index, added: true };
    }
    return { index, added: false };
}

export function setSingleActiveTag(tagState, tag) {
    tagState.osmTags = [tag];
    return tagState;
}

export function getActiveTags(tagState) {
    return tagState.osmTags;
}

export function createMapInitialState(options) {
    const {
        search,
        fallbackTagByMode,
        defaultZoom = 13,
        defaultLat = 50.7374,
        defaultLon = 7.1106,
        mapViewStorageKey = 'opening_hours_map_view',
    } = options;

    const params = new URLSearchParams(search);
    const zoom = parseFloat(params.get('zoom')) || defaultZoom;
    const lat = parseFloat(params.get('lat')) || defaultLat;
    const lon = parseFloat(params.get('lon')) || defaultLon;

    const initialUrlState = parseUrlState(search, fallbackTagByMode);
    const filterState = createFilterState(search);
    const mockParam = params.get('mock');
    const permalinkParams = createPermalinkParams({
        filter: filterState.filter,
        ...(typeof mockParam === 'string' ? {mock: mockParam} : {}),
    });

    return {
        mapViewStorageKey,
        zoom,
        lat,
        lon,
        filterState,
        permalinkParams,
        initialUrlState,
        tagState: createTagState(initialUrlState.selectedTag),
        hasViewInUrl: initialUrlState.hasViewInUrl,
    };
}
