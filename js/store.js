/* === STORE: Estado global de la aplicacion === */
/* Objeto store con getters y setters para control centralizado del estado. */


const SESSION_KEY = "eruditos_session";

// ========== ESTADO INTERNO (no exportado directamente) ==========
const _state = {
    sessionToken: null,
    sessionUsuarioId: null,
    sessionUser: null,
    sessionRol: null,
    sessionSucursal: null,
    sessionSucursalPrincipalId: null,
    sessionSucursales: [],
    sessionAccesoGlobalSucursales: false,
    sessionPermisos: [],
    sessionRefreshToken: null,
    sessionExpiresAt: 0,
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
    get sessionUsuarioId() { return _state.sessionUsuarioId; },
    get sessionUser() { return _state.sessionUser; },
    get sessionRol() { return _state.sessionRol; },
    get sessionSucursal() { return _state.sessionSucursal; },
    get sessionSucursalPrincipalId() { return _state.sessionSucursalPrincipalId; },
    get sessionSucursales() { return _state.sessionSucursales; },
    get sessionAccesoGlobalSucursales() { return _state.sessionAccesoGlobalSucursales; },
    get sessionPermisos() { return _state.sessionPermisos; },
    get sessionRefreshToken() { return _state.sessionRefreshToken; },
    get sessionExpiresAt() { return _state.sessionExpiresAt; },
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
export function setSession(token, user, rol, sucursal, contexto = {}) {
    _state.sessionToken = token;
    _state.sessionUsuarioId = contexto.usuarioId || null;
    _state.sessionUser = user;
    _state.sessionRol = rol;
    _state.sessionSucursal = sucursal || null;
    _state.sessionSucursalPrincipalId = contexto.sucursalPrincipalId || null;
    _state.sessionSucursales = Array.isArray(contexto.sucursales) ? contexto.sucursales : [];
    _state.sessionAccesoGlobalSucursales = Boolean(contexto.accesoGlobalSucursales);
    _state.sessionPermisos = Array.isArray(contexto.permisos) ? [...new Set(contexto.permisos)] : [];
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
            usuarioId: _state.sessionUsuarioId,
            usuario: _state.sessionUser,
            rol: _state.sessionRol || "VENDEDOR",
            sucursal: _state.sessionSucursal || null,
            sucursalPrincipalId: _state.sessionSucursalPrincipalId,
            sucursales: _state.sessionSucursales,
            accesoGlobalSucursales: _state.sessionAccesoGlobalSucursales,
            permisos: _state.sessionPermisos,
            refreshToken: _state.sessionRefreshToken,
            expiresAt: _state.sessionExpiresAt,
        }));
    } catch (_) {}
}

/** Actualiza solo el token de sesion (usado por refresh) */
export function setToken(token) {
    _state.sessionToken = token;
    _persistSession();
}

export function setSucursalActiva(sucursal) {
    const encontrada = _state.sessionSucursales.find(item => item.nombre === sucursal || item.id === sucursal);
    if (!encontrada && !_state.sessionAccesoGlobalSucursales) return false;
    _state.sessionSucursal = encontrada?.nombre || sucursal || null;
    _state.sessionSucursalPrincipalId = encontrada?.id || null;
    _persistSession();
    return true;
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
    _state.sessionUsuarioId = null;
    _state.sessionUser = null;
    _state.sessionRol = null;
    _state.sessionSucursal = null;
    _state.sessionSucursalPrincipalId = null;
    _state.sessionSucursales = [];
    _state.sessionAccesoGlobalSucursales = false;
    _state.sessionPermisos = [];
    _state.sessionRefreshToken = null;
    _state.sessionExpiresAt = 0;
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
}

/** Vacia el carrito de compras */
export function clearCarrito() {
    _state.carrito = [];
}
