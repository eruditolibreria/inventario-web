/* === ESCANER: Codigo de barras (camara + USB scanner) === */

import { store } from './store.js';

let _stream = null;
let _activo = false;

export const CODIGO_REGEX = /^[A-Za-z0-9\-]{8,}$/;

/** Inicia camara, detecta codigo con BarcodeDetector, resuelve con el valor escaneado */
export async function iniciarEscanerCamara(videoElement) {
    if (!('BarcodeDetector' in window)) {
        throw new Error("NO_SOPORTADO");
    }
    _stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    videoElement.srcObject = _stream;
    videoElement.play();
    _activo = true;

    const detector = new BarcodeDetector();

    return new Promise((resolve, reject) => {
        const tick = () => {
            if (!_activo) return;
            detector.detect(videoElement).then(barcodes => {
                if (barcodes.length > 0) {
                    detenerEscanerCamara();
                    resolve(barcodes[0].rawValue);
                    return;
                }
                requestAnimationFrame(tick);
            }).catch(() => {
                requestAnimationFrame(tick);
            });
        };
        requestAnimationFrame(tick);
    });
}

/** Inicia la camara y mantiene el escaneo activo hasta detenerlo explicitamente. */
export async function iniciarEscanerContinuo(videoElement, onCodigo) {
    if (!('BarcodeDetector' in window)) {
        throw new Error("NO_SOPORTADO");
    }
    _stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    videoElement.srcObject = _stream;
    videoElement.play();
    _activo = true;

    const detector = new BarcodeDetector();
    let ultimoCodigo = "";
    let ultimoEscaneo = 0;
    let procesando = false;

    const tick = () => {
        if (!_activo) return;
        detector.detect(videoElement).then(async barcodes => {
            const codigo = barcodes[0]?.rawValue || "";
            const ahora = Date.now();
            const repetido = codigo === ultimoCodigo && (ahora - ultimoEscaneo) < 1200;
            if (codigo && !procesando && !repetido) {
                procesando = true;
                ultimoCodigo = codigo;
                try {
                    await onCodigo(codigo);
                } finally {
                    ultimoEscaneo = Date.now();
                    procesando = false;
                }
            }
            if (_activo) requestAnimationFrame(tick);
        }).catch(() => {
            if (_activo) requestAnimationFrame(tick);
        });
    };
    requestAnimationFrame(tick);
}

/** Detiene camara */
export function detenerEscanerCamara() {
    _activo = false;
    if (_stream) {
        _stream.getTracks().forEach(t => t.stop());
        _stream = null;
    }
}

/** Busca producto por codigo_barras + sucursal en inventarioGlobal */
export function buscarPorCodigo(codigo, sucursal) {
    if (!store.inventarioGlobal || !store.inventarioGlobal.length) return null;
    const c = codigo.toUpperCase();
    return store.inventarioGlobal.find(p =>
        (p.codigoBarras || "").toUpperCase() === c && p.sucursal === sucursal
    ) || null;
}

const SCAN_TIMER = {};
const SCAN_DELAY = 600;

/** Detecta si un valor de input fue escrito por un scanner USB (rapido, patron codigo).
 *  Si es asi, busca producto y llama cb. Retorna true si fue scan, false si es input manual. */
export function onInputScanner(valor, sucursal, cb) {
    if (!CODIGO_REGEX.test(valor)) return false;
    clearTimeout(SCAN_TIMER._t);
    SCAN_TIMER._t = setTimeout(() => {
        const prod = buscarPorCodigo(valor, sucursal);
        cb(prod);
    }, SCAN_DELAY);
    return true;
}
