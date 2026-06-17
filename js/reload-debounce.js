export function clearReloadTimer(target) {
    if (target._reloadTimer) {
        clearTimeout(target._reloadTimer);
        target._reloadTimer = null;
    }
}

export function scheduleReload(target, callback, delayMs) {
    clearReloadTimer(target);
    target._reloadTimer = setTimeout(() => {
        target._reloadTimer = null;
        callback();
    }, delayMs);
}
