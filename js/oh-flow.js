function detectOpeningHoursValue(data, activeTags) {
    for (let i = 0; i < activeTags.length; i++) {
        const key = activeTags[i];
        if (typeof data[key] === 'string') {
            return {
                key,
                value: data[key],
            };
        }
    }

    return undefined;
}

function applyNotApplicableOhState(data) {
    if (typeof data._oh_value === 'undefined') {
        data._oh_value = false;
        data._oh_state = 'na'; /* Not applicable. */
        return true;
    }

    return false;
}

function getEffectiveOhModeForKey(ohKey, currentMode) {
    if (['collection_times', 'service_times'].includes(ohKey)) {
        return 2;
    }

    return currentMode;
}

function createOpeningHoursEvaluation(options) {
    const {
        openingHoursConstructor,
        ohValue,
        nominatimData,
        mode,
        locale,
        reftime,
    } = options;

    try {
        const oh = new openingHoursConstructor(ohValue, nominatimData, {
            mode,
            warnings_severity: 7,
            locale,
        });
        const it = oh.getIterator(reftime);
        return {
            error: undefined,
            oh,
            it,
        };
    } catch (error) {
        return {
            error,
            oh: undefined,
            it: undefined,
        };
    }
}

function getOhStateFromEvaluation(evaluation) {
    if (evaluation.error) {
        return {
            ohState: 'error',
            ohObject: evaluation.error,
            itObject: undefined,
        };
    }

    const hasWarnings = evaluation.oh.getWarnings().length > 0;
    return {
        ohState: hasWarnings ? 'warning' : 'ok',
        ohObject: evaluation.oh,
        itObject: evaluation.it,
    };
}

export function evaluateOpeningHoursFlow(options) {
    const {
        data,
        activeTags,
        currentOhMode,
        openingHoursConstructor,
        nominatimData,
        locale,
        reftime,
    } = options;

    if (typeof data._oh_value !== 'undefined' || typeof data._oh_state !== 'undefined') {
        return {
            handled: false,
            nextOhMode: currentOhMode,
        };
    }

    const detectedOHValue = detectOpeningHoursValue(data, activeTags);
    if (detectedOHValue) {
        data._oh_key = detectedOHValue.key;
        data._oh_value = detectedOHValue.value;
    }

    if (applyNotApplicableOhState(data)) {
        return {
            handled: true,
            nextOhMode: currentOhMode,
        };
    }

    const nextOhMode = getEffectiveOhModeForKey(data._oh_key, currentOhMode);
    const evaluation = createOpeningHoursEvaluation({
        openingHoursConstructor,
        ohValue: data._oh_value,
        nominatimData,
        mode: nextOhMode,
        locale,
        reftime,
    });
    const stateResult = getOhStateFromEvaluation(evaluation);
    data._oh_object = stateResult.ohObject;
    data._it_object = stateResult.itObject;
    data._oh_state = stateResult.ohState;

    return {
        handled: true,
        nextOhMode,
    };
}
