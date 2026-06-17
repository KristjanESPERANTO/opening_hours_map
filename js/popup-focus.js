function isCoordinate(value) {
    return Array.isArray(value)
        && value.length >= 2
        && Number.isFinite(value[0])
        && Number.isFinite(value[1]);
}

export function computePopupFocusCenter(options) {
    const {
        size,
        currentPixel,
        coordinate,
        targetCoord,
        center,
        anchorRatioY = 0.16,
    } = options;

    if (!Array.isArray(size) || size.length < 2 || !Number.isFinite(size[1])) {
        return null;
    }

    if (!isCoordinate(currentPixel) || !isCoordinate(coordinate) || !isCoordinate(targetCoord) || !isCoordinate(center)) {
        return null;
    }

    const targetPixelY = size[1] * anchorRatioY;
    const deltaX = coordinate[0] - targetCoord[0];
    const deltaY = currentPixel[1] > targetPixelY
        ? coordinate[1] - targetCoord[1]
        : 0;

    if (deltaX === 0 && deltaY === 0) {
        return null;
    }

    return [
        center[0] + deltaX,
        center[1] + deltaY,
    ];
}
