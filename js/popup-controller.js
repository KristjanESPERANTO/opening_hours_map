import Overlay from 'ol/Overlay.js';
import { computePopupFocusCenter } from './popup-focus.js';

export function createPopupController(options) {
    const {
        map,
        documentRef,
        poiLayer,
    } = options;

    const popup = documentRef.createElement('div');
    popup.className = 'olPopupCard';
    popup.style.display = 'none';
    map.getTargetElement().appendChild(popup);

    const popupOverlay = new Overlay({
        element: popup,
        offset: [0, 0],
        positioning: 'top-center',
        stopEvent: true,
    });
    map.addOverlay(popupOverlay);

    const closePopup = () => {
        popupOverlay.setPosition(undefined);
        popup.style.display = 'none';
        popup.innerHTML = '';
    };

    const focusMarkerForPopup = coordinate => {
        const size = map.getSize();
        if (!size || !coordinate) {
            return;
        }

        const targetPixelY = size[1] * 0.16;
        const currentPixel = map.getPixelFromCoordinate(coordinate);
        if (!currentPixel) {
            return;
        }

        const targetCoord = map.getCoordinateFromPixel([size[0] * 0.5, targetPixelY]);
        const center = map.getView().getCenter();
        if (!targetCoord || !center) {
            return;
        }

        const nextCenter = computePopupFocusCenter({
            size,
            currentPixel,
            coordinate,
            targetCoord,
            center,
            anchorRatioY: 0.16,
        });
        if (!nextCenter) {
            return;
        }

        map.getView().animate({
            center: nextCenter,
            duration: 220,
        });
    };

    popup.addEventListener('click', evt => {
        const closeButton = evt.target.closest('.olPopupClose');
        if (!closeButton) {
            return;
        }

        evt.preventDefault();
        evt.stopPropagation();
        closePopup();
    });

    map.on('singleclick', evt => {
        const feature = map.forEachFeatureAtPixel(evt.pixel, candidate => candidate, {
            layerFilter: layer => layer === poiLayer,
        });

        if (!feature) {
            closePopup();
            return;
        }

        const data = feature.get('data') || {};
        popup.className = 'olPopupCard olFramedCloudPopupContent';
        popup.innerHTML = `<button type="button" class="olPopupClose" aria-label="Close popup"><span class="olPopupCloseGlyph">×</span></button><div class="olPopupCardBody">${poiLayer.buildPopupHtml(data)}</div>`;

        focusMarkerForPopup(evt.coordinate);
        popupOverlay.setPosition(evt.coordinate);
        popup.style.display = 'block';
    });

    return {
        closePopup,
    };
}
