/* === STORE: Estado global de la aplicacion === */
/* Objeto store con getters y setters para control centralizado del estado. */


const SESSION_KEY = "eruditos_session";

// ========== ESTADO INTERNO (no exportado directamente) ==========
const _state = {
    sessionToken: null,
    sessionUser: null,
    sessionRol: null,
    sessionRefreshToken: null,
    sessionExpiresAt: 0,
    inventarioGlobal: [],
    carrito: [],
    devolPaginaActual: 1,
    transfPaginaActual: 1,
    movPaginaActual: 1,
    _rptCache: {},
    ultimaVenta: null,
    modalImagenData: {
        producto: "",
        sucursal: "",
    },
    modoActual: 'VENTA',
    devolTransaccionSeleccionada: null
};

// ========== STORE PUBLICO (solo lectura via getters) ==========
export const store = {
    get sessionToken() { return _state.sessionToken; },
    get sessionUser() { return _state.sessionUser; },
    get sessionRol() { return _state.sessionRol; },
    get sessionRefreshToken() { return _state.sessionRefreshToken; },
    get sessionExpiresAt() { return _state.sessionExpiresAt; },
    get inventarioGlobal() { return _state.inventarioGlobal; },
    get carrito() { return _state.carrito; },
    get devolPaginaActual() { return _state.devolPaginaActual; },
    get transfPaginaActual() { return _state.transfPaginaActual; },
    get movPaginaActual() { return _state.movPaginaActual; },
    get _rptCache() { return _state._rptCache; },
    get ultimaVenta() { return _state.ultimaVenta; },
    get modalImagenData() { return _state.modalImagenData; },
    get modoActual() { return _state.modoActual; },
    get devolTransaccionSeleccionada() { return _state.devolTransaccionSeleccionada; }
};

// ========== FUNCIONES DE ACTUALIZACION ==========

/** Actualiza los datos de sesion tras login exitoso */
export function setSession(token, user, rol) {
    _state.sessionToken = token;
    _state.sessionUser = user;
    _state.sessionRol = rol;
    _persistSession();
}

/** Actualiza tokens de refresco */
export function setTokens(refreshToken, expiresAt) {
    _state.sessionRefreshToken = refreshToken;
    _state.sessionExpiresAt = expiresAt;
    _persistSession();
}

/** Guarda la sesion actual en localStorage */
function _persistSession() {
    if (!_state.sessionToken || !_state.sessionUser) return;
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            token: _state.sessionToken,
            usuario: _state.sessionUser,
            rol: _state.sessionRol || "VENDEDOR",
            refreshToken: _state.sessionRefreshToken,
            expiresAt: _state.sessionExpiresAt,
        }));
    } catch (_) {}
}

/** Reemplaza el inventario global completo */

/** Actualiza solo el token de sesion (usado por refresh) */
export function setToken(token) {
    _state.sessionToken = token;
    _persistSession();
}
export function setInventario(data) {
    _state.inventarioGlobal = data;
}

/** Reemplaza el carrito de compras */
export function setCarrito(items) {
    _state.carrito = items;
}

/** Cambia el modo actual de navegacion */
export function setModoActual(modo) {
    _state.modoActual = modo;
}

/** Actualiza pagina actual de devoluciones */
export function setDevolPagina(pag) {
    _state.devolPaginaActual = pag;
}

/** Actualiza pagina actual de transferencias */
export function setTransfPagina(pag) {
    _state.transfPaginaActual = pag;
}

/** Actualiza pagina actual de movimientos */
export function setMovPagina(pag) {
    _state.movPaginaActual = pag;
}

/** Guarda el resumen de la ultima venta realizada */
export function setUltimaVenta(data) {
    _state.ultimaVenta = data;
}

/** Actualiza cache de reportes */
export function setRptCache(tipo, datos) {
    _state._rptCache[tipo] = datos;
}

/** Actualiza datos del modal de imagen */
export function setModalImagenData(producto, sucursal) {
    _state.modalImagenData.producto = producto;
    _state.modalImagenData.sucursal = sucursal;
}

/** Establece la transaccion seleccionada para devolucion */
export function setDevolTransaccionSeleccionada(tx) {
    _state.devolTransaccionSeleccionada = tx;
}

/** Limpia los datos de sesion (logout) */
export function clearSession() {
    _state.sessionToken = null;
    _state.sessionUser = null;
    _state.sessionRol = null;
    _state.sessionRefreshToken = null;
    _state.sessionExpiresAt = 0;
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
}

/** Vacia el carrito de compras */
export function clearCarrito() {
    _state.carrito = [];
}