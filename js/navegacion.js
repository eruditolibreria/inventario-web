/* === NAVEGACION: Cambio de modos, submodos, permisos y rol === */

/*
 * Gestion de navegacion entre modos (VENTA, COMPRA, etc.),
 * submodos (subpestañas), permisos y aplicacion de rol.
 * Incluye animaciones push entre secciones.
 *
 * Dependencias directas (ya modulos):
 *   - config.js   (TODOS_MODOS, ORDEN_MODOS, PERMISOS, PERMISOS_DEFAULT)
 *   - store.js    (store, setModoActual y setters de submodo cuando se extraigan)
 *   - utils.js    (hoy)
 *
 * Dependencias inyectadas via initNavegacion() (modulos futuros):
 *   - verificarEstadoCaja()
 *   - cargarUsuarios()
 *   - cargarResumenServicios()
 *   - setReporteStock(submodo)
 *   - setReporteFinanciero(submodo)
 *
 * Uso:
 *   import { initNavegacion, setModo, aplicarRol } from './navegacion.js';
 *   initNavegacion({ verificarEstadoCaja, cargarUsuarios, ... });
 */

import { TODOS_MODOS, ORDEN_MODOS, PERMISOS, PERMISOS_DEFAULT } from './config.js';
import { store, setModoActual } from './store.js';
import { hoy } from './utils.js';
import { cargarSucursalesEnDropdowns } from './modos/admin.js';

// ── CALLBACKS (inyectados por initNavegacion) ──────────────────
let _verificarEstadoCaja = null;
let _cargarUsuarios = null;
let _cargarResumenServicios = null;
let _setReporteStock = null;
let _setReporteFinanciero = null;
let _cargarClientesModulo = null;

/**
 * Registra las dependencias que navegacion necesita y que seran
 * provistas por modulos extraidos en fases posteriores.
 */
export function initNavegacion(callbacks) {
    if (callbacks.verificarEstadoCaja) _verificarEstadoCaja = callbacks.verificarEstadoCaja;
    if (callbacks.cargarUsuarios) _cargarUsuarios = callbacks.cargarUsuarios;
    if (callbacks.cargarResumenServicios) _cargarResumenServicios = callbacks.cargarResumenServicios;
    if (callbacks.setReporteStock) _setReporteStock = callbacks.setReporteStock;
    if (callbacks.setReporteFinanciero) _setReporteFinanciero = callbacks.setReporteFinanciero;
    if (callbacks.cargarClientesModulo) _cargarClientesModulo = callbacks.cargarClientesModulo;
    _bindTabClicks();
}

function _bindTabClicks() {
    TODOS_MODOS.forEach(function(modo) {
        var tab = document.getElementById("tab-" + modo);
        if (tab) tab.addEventListener("click", function() { setModo(modo); });
    });
    _bindSubTabClicks();
}

function _bindSubTabClicks() {
    var subMap = {
        caja:      { fn: setSubModoCaja,   keys: ["APERTURA","CIERRE","APORTES"] },
        cuentas:   { fn: setSubModoCuentas, keys: ["COBRAR","PAGAR"] },
        devol:     { fn: setSubModoDevol,   keys: ["REGISTRAR","LISTAR"] },
        transf:    { fn: setSubModoTransf,  keys: ["REGISTRAR","HISTORIAL"] },
        rep:       { fn: setSubModoReportes,keys: ["MAS","MENOS","STOCK","FINANCIERO"] },
        lam:       { fn: setSubModoLaminas, keys: ["BUSCAR","AGREGAR"] },
        srv:       { fn: setSubModoServicios,keys: ["COPIAS","ANILLADOS","PLASTIFICADOS","OTROS","RESUMEN"] },
        "stock":   { fn: function(s) { if (_setReporteStock) _setReporteStock(s); }, keys: ["ALERTAS","ROTACION","VALORIZACION","MOVIMIENTOS"] },
        "fin":     { fn: function(s) { if (_setReporteFinanciero) _setReporteFinanciero(s); }, keys: ["VENTAS","UTILIDAD","FLUJO","COBRAR"] },
    };
    Object.keys(subMap).forEach(function(prefix) {
        subMap[prefix].keys.forEach(function(key) {
            var el = document.getElementById("subtab-" + prefix + "-" + key);
            if (el) el.addEventListener("click", function() { subMap[prefix].fn(key); });
        });
    });
}


// ══ PERMISOS Y ROL ══
export function obtenerPermisos(r) {
    return PERMISOS[(r || "").toUpperCase()] || PERMISOS_DEFAULT;
}


export function aplicarRol(rol) {
    const {tabs, inicio} = obtenerPermisos(rol);
    TODOS_MODOS.forEach(t => document.getElementById("tab-" + t).classList.toggle("hidden-tab", !tabs.includes(t)));
    const ru = (rol || "").toUpperCase();
    document.getElementById("subtab-cuentas-COBRAR").classList.toggle("hidden-tab", !["ADMIN", "VENDEDOR"].includes(ru));
    document.getElementById("subtab-rep-FINANCIERO").classList.toggle("hidden-tab", !["ADMIN"].includes(ru));
    document.getElementById("subtab-cuentas-PAGAR").classList.toggle("hidden-tab", !["ADMIN", "ALMACEN"].includes(ru));
    if (ru === "VENDEDOR")
        setSubModoCuentas("COBRAR");
    else if (ru === "ALMACEN")
        setSubModoCuentas("PAGAR");
    else
        setSubModoCuentas("COBRAR");
    document.getElementById("subtab-lam-AGREGAR").classList.toggle("hidden-tab", !["ADMIN", "ALMACEN"].includes(ru));
    var modoRestaurado = _leerModoGuardado();
    // La restauración no debe animarse: garantiza un único panel visible al volver a la app.
    setModo(modoRestaurado && tabs.includes(modoRestaurado) ? modoRestaurado : inicio, 0);
}


export function actualizarIndicador(modo) {
    const nav = document.querySelector('.mode-tabs');
    const tab = document.getElementById('tab-' + modo);
    const indicator = document.getElementById('navIndicator');
    if (!nav || !tab || !indicator) return;
    const navRect = nav.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    indicator.style.left = (tabRect.left - navRect.left + nav.scrollLeft) + 'px';
    indicator.style.width = tabRect.width + 'px';
}


// ══ SETMODO CON PUSH EFFECT ══
export function initPushContainer() {
    var panel = document.querySelector(".panel-body");
    if (!panel) return;
    var secciones = panel.querySelectorAll("[id^=\"seccion-\"]");
    if (secciones.length === 0) return;
    var stack = document.createElement("div");
    stack.id = "seccionesStack";
    panel.appendChild(stack);
    secciones.forEach(function(sec) {
        stack.appendChild(sec);
    });
}

var _transicionActiva = false;

function _actualizarTabs(modo) {
    TODOS_MODOS.forEach(function(m) {
        var tab = document.getElementById("tab-" + m);
        if (tab) tab.classList.toggle("active", m === modo);
        var sidebarTab = document.getElementById("sidebar-tab-" + m);
        if (sidebarTab) sidebarTab.classList.toggle("active", m === modo);
    });
    actualizarIndicador(modo);
}

function _mostrarSoloModo(modo) {
    TODOS_MODOS.forEach(function(m) {
        var sec = document.getElementById("seccion-" + m);
        if (!sec) return;
        sec.classList.toggle("oculto", m !== modo);
        sec.classList.remove("push-transitioning", "push-dragging");
        sec.style.animation = "";
        sec.style.transform = "";
        sec.style.transition = "";
        sec.style.willChange = "";
    });
}

function _prepararTransicion(origen, destino) {
    TODOS_MODOS.forEach(function(m) {
        if (m === origen || m === destino) return;
        var sec = document.getElementById("seccion-" + m);
        if (!sec) return;
        sec.classList.add("oculto");
        sec.classList.remove("push-transitioning", "push-dragging");
        sec.style.animation = "";
        sec.style.transform = "";
        sec.style.transition = "";
        sec.style.willChange = "";
    });
}

export function setModo(modo, direccion, velocidad) {
    if (_transicionActiva) return;

    var modoAnterior = store.modoActual;
    _actualizarTabs(modo);
    if (modoAnterior === modo) {
        _mostrarSoloModo(modo);
        return;
    }

    var prefiereReducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefiereReducido) direccion = 0;

    if (direccion === undefined || direccion === null) {
        var idxAnterior = ORDEN_MODOS.indexOf(modoAnterior);
        var idxNuevo = ORDEN_MODOS.indexOf(modo);
        if (idxAnterior >= 0 && idxNuevo >= 0) {
            direccion = idxNuevo > idxAnterior ? 1 : -1;
        } else {
            direccion = 1;
        }
    }

    setModoActual(modo);
    _guardarModo(modo);
    var duracion = 300;
    if (velocidad && velocidad > 0 && direccion !== 0) {
        var anchoPanel = document.querySelector('.panel-body')?.offsetWidth || 360;
        duracion = Math.round(anchoPanel / velocidad);
        duracion = Math.max(180, Math.min(400, duracion));
    }

    var secEntrante = document.getElementById("seccion-" + modo);
    var secSaliente = document.getElementById("seccion-" + modoAnterior);

    var tabActivo = document.getElementById("tab-" + modo);
    if (tabActivo) {
        tabActivo.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }

    if (direccion === 0) {
        _mostrarSoloModo(modo);
    } else if (secEntrante && secSaliente) {
        _transicionActiva = true;
        _prepararTransicion(modoAnterior, modo);
        secEntrante.classList.remove("oculto", "push-dragging");
        secSaliente.classList.remove("oculto", "push-dragging");

        secEntrante.style.transform = "";
        secEntrante.style.willChange = "transform";
        secSaliente.style.transform = "";
        secSaliente.style.willChange = "transform";
        secSaliente.classList.add("push-transitioning");
        var entra = direccion === 1 ? "pushInFromRight" : "pushInFromLeft";
        var sale = direccion === 1 ? "pushOutToLeft" : "pushOutToRight";
        secEntrante.style.animation = entra + " " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";
        secSaliente.style.animation = sale + " " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";

        var terminada = false;
        var finalizar = function(e) {
            if (e && e.target !== secSaliente) return;
            if (terminada) return;
            terminada = true;
            _mostrarSoloModo(modo);
            _transicionActiva = false;
        };
        secSaliente.addEventListener("animationend", finalizar, { once: true });
        setTimeout(finalizar, duracion + 80);
    } else {
        _mostrarSoloModo(modo);
    }

    /* Acciones al entrar a cada modo */
    if (modo === "CAJA" && store.sessionToken)
        if (_verificarEstadoCaja) _verificarEstadoCaja();
    if (modo === "DEVOLUCIONES")
        setSubModoDevol("REGISTRAR");
    if (modo === "REPORTES") {
        setSubModoReportes("MAS");
        const ruSM = (store.sessionRol || "").toUpperCase();
        document.getElementById("subtab-rep-FINANCIERO").classList.toggle("hidden-tab", ruSM !== "ADMIN");
    }
    if (modo === "USUARIOS")
        if (_cargarUsuarios) _cargarUsuarios();
    if (modo === "CLIENTES" && store.sessionToken)
        if (_cargarClientesModulo) _cargarClientesModulo(1);
    if (modo === "TRANSFERENCIAS")
        setSubModoTransf("REGISTRAR");
    if (modo === "LAMINAS")
        setSubModoLaminas("BUSCAR");
    if (modo === "SERVICIOS") {
        setSubModoServicios("COPIAS");
        document.getElementById("srvResumenFecha").value = hoy();
    }
    if (store.sessionToken) cargarSucursalesEnDropdowns();
    bloquearSucursalParaNoAdmin();
}

function bloquearSucursalParaNoAdmin() {
    const suc = store.sessionSucursal;
    const esAdmin = store.sessionRol === "ADMIN";
    document.querySelectorAll(
        "select[id*='Sucursal'], select#sucursalVenta, select#sucursalCompra, select#sucursalGasto"
    ).forEach(sel => {
        if (!esAdmin) {
            sel.value = suc || "";
            sel.disabled = true;
        } else {
            sel.disabled = false;
        }
    });
}

// ══ SWIPE TÁCTIL (push con arrastre de dedo) ══
var _swipeStartX = 0;
var _swipeStartY = 0;
var _swipeModoOrigen = "";
var _swipeActive = false;
var _swipeDireccion = 0;
var _swipeBloqueado = false;

export function initSwipe() {
    var panel = document.querySelector(".panel-body");
    if (!panel) return;
    panel.addEventListener("touchstart", _swipeStart, { passive: true });
    panel.addEventListener("touchmove", _swipeMove, { passive: true });
    panel.addEventListener("touchend", _swipeEnd, { passive: true });
    panel.addEventListener("touchcancel", _swipeCancel, { passive: true });
}

function _swipeStart(e) {
    if (_swipeActive || _swipeBloqueado || _transicionActiva) return;
    if (e.target.closest(".mode-tabs, input, select, textarea, button, a, label, [contenteditable='true'], .sub-tabs")) return;
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
    _swipeModoOrigen = store.modoActual;
    _swipeDireccion = 0;
}

function _swipeMove(e) {
    if (_swipeBloqueado || _transicionActiva) return;
    if (e.target.closest(".mode-tabs, input, select, textarea, button, a, label, [contenteditable='true'], .sub-tabs")) return;
    var deltaX = e.touches[0].clientX - _swipeStartX;
    var deltaY = e.touches[0].clientY - _swipeStartY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (!_swipeActive) {
        if (Math.abs(deltaX) < 15) return;
        var modoDestino = _modoVecino(_swipeModoOrigen, deltaX > 0 ? -1 : 1);
        if (!modoDestino || modoDestino === _swipeModoOrigen) return;
        _swipeActive = true;
        _swipeDireccion = deltaX > 0 ? -1 : 1;
        var secSaliente = document.getElementById("seccion-" + _swipeModoOrigen);
        var secEntrante = document.getElementById("seccion-" + modoDestino);
        if (!secSaliente || !secEntrante) { _swipeActive = false; return; }
        secSaliente.classList.add("push-dragging");
        secEntrante.classList.add("push-dragging");
        secEntrante.classList.remove("oculto");
        secSaliente.style.willChange = "transform";
        secEntrante.style.willChange = "transform";
    }
    var secSaliente = document.getElementById("seccion-" + _swipeModoOrigen);
    var modoDestino = _modoVecino(_swipeModoOrigen, _swipeDireccion);
    var secEntrante = modoDestino ? document.getElementById("seccion-" + modoDestino) : null;
    if (!secSaliente || !secEntrante) return;
    var panelAncho = document.querySelector(".panel-body")?.offsetWidth || 360;
    var porcentaje = Math.max(-1, Math.min(1, deltaX / panelAncho));
    if (_swipeDireccion === 1) {
        secEntrante.style.transform = "translateX(" + ((1 + porcentaje) * 100) + "%)";
        secSaliente.style.transform = "translateX(" + (porcentaje * 100) + "%)";
    } else {
        secEntrante.style.transform = "translateX(" + ((porcentaje - 1) * 100) + "%)";
        secSaliente.style.transform = "translateX(" + (porcentaje * 100) + "%)";
    }
}

function _swipeEnd(e) {
    if (!_swipeActive) { _swipeStartX = 0; return; }
    _swipeActive = false;
    _swipeBloqueado = true;
    var deltaX = e.changedTouches[0].clientX - _swipeStartX;
    var panelAncho = document.querySelector(".panel-body")?.offsetWidth || 360;
    var modoDestino = _modoVecino(_swipeModoOrigen, _swipeDireccion);
    var secSaliente = document.getElementById("seccion-" + _swipeModoOrigen);
    var secEntrante = modoDestino ? document.getElementById("seccion-" + modoDestino) : null;
    var umbral = panelAncho * 0.3;
    if (Math.abs(deltaX) > umbral && secSaliente && secEntrante) {
        secSaliente.classList.remove("push-dragging");
        secEntrante.classList.remove("push-dragging");
        secSaliente.style.transform = "";
        secSaliente.style.willChange = "";
        secEntrante.style.transform = "";
        secEntrante.style.willChange = "";
        setModo(modoDestino, _swipeDireccion, 0);
        setTimeout(function() { _swipeBloqueado = false; }, 350);
    } else {
        _resetSwipe(secSaliente, secEntrante, _swipeDireccion);
        setTimeout(function() { _swipeBloqueado = false; }, 220);
    }
    _swipeStartX = 0;
    _swipeStartY = 0;
}

function _swipeCancel() {
    if (!_swipeActive) return;
    _swipeActive = false;
    _swipeBloqueado = true;
    _resetSwipe(
        document.getElementById("seccion-" + _swipeModoOrigen),
        document.getElementById("seccion-" + _modoVecino(_swipeModoOrigen, _swipeDireccion)),
        _swipeDireccion
    );
    setTimeout(function() { _swipeBloqueado = false; }, 220);
}

function _resetSwipe(secSaliente, secEntrante, direccion) {
    var transicion = "transform 180ms cubic-bezier(0.25, 0.8, 0.25, 1)";
    if (secSaliente) {
        secSaliente.classList.remove("push-dragging");
        secSaliente.style.transition = transicion;
        secSaliente.style.willChange = "";
    }
    if (secEntrante) {
        secEntrante.classList.remove("push-dragging");
        secEntrante.style.transition = transicion;
        secEntrante.style.willChange = "";
    }
    requestAnimationFrame(function() {
        if (secSaliente) secSaliente.style.transform = "translateX(0)";
        if (secEntrante) secEntrante.style.transform = "translateX(" + (direccion === 1 ? 100 : -100) + "%)";
    });
    setTimeout(function() {
        if (secEntrante) secEntrante.classList.add("oculto");
        if (secSaliente) secSaliente.style.transform = "";
        if (secEntrante) secEntrante.style.transform = "";
        if (secSaliente) secSaliente.style.transition = "";
        if (secEntrante) secEntrante.style.transition = "";
    }, 180);
}

function _modoVecino(modoActual, direccion) {
    var idx = ORDEN_MODOS.indexOf(modoActual);
    if (idx < 0) return null;
    if (direccion === 1) {
        for (var i = idx + 1; i < ORDEN_MODOS.length; i++) {
            var t = ORDEN_MODOS[i];
            var sec = document.getElementById("seccion-" + t);
            if (sec && !sec.classList.contains("hidden-tab") && !document.getElementById("tab-" + t)?.classList.contains("hidden-tab")) return t;
        }
    } else {
        for (var i = idx - 1; i >= 0; i--) {
            var t = ORDEN_MODOS[i];
            var sec = document.getElementById("seccion-" + t);
            if (sec && !sec.classList.contains("hidden-tab") && !document.getElementById("tab-" + t)?.classList.contains("hidden-tab")) return t;
        }
    }
    return null;
}


export function setSubModoCaja(s) {
    ["APERTURA", "CIERRE", "APORTES"].forEach(x => {
        document.getElementById("caja-" + x).classList.toggle("oculto", x !== s);
        document.getElementById("subtab-caja-" + x).classList.toggle("active", x === s);
    });
    if (s !== "CIERRE")
        document.getElementById("cierreResumen").classList.remove("show");
}


export function setSubModoCuentas(s) {
    ["COBRAR", "PAGAR"].forEach(x => {
        document.getElementById("cuentas-" + x).classList.toggle("oculto", x !== s);
        document.getElementById("subtab-cuentas-" + x).classList.toggle("active", x === s);
    });
}


export function setSubModoDevol(s) {
    ["REGISTRAR", "LISTAR"].forEach(x => {
        document.getElementById("devol-" + x).classList.toggle("oculto", x !== s);
        document.getElementById("subtab-devol-" + x).classList.toggle("active", x === s);
    });
}


export function setSubModoReportes(s) {
    ["MAS", "MENOS", "STOCK", "FINANCIERO"].forEach(x => {
        var el = document.getElementById("rep-" + x);
        if (el) el.classList.toggle("oculto", x !== s);
        var st = document.getElementById("subtab-rep-" + x);
        if (st) st.classList.toggle("active", x === s);
    });
    var fh = document.getElementById("reportes-filtros");
    if (fh) fh.style.display = (s === "MAS" || s === "MENOS") ? "" : "none";
    if (s === "STOCK" && _setReporteStock) _setReporteStock("ALERTAS");
    if (s === "FINANCIERO" && _setReporteFinanciero) _setReporteFinanciero("VENTAS");
}


export function setSubModoTransf(s) {
    ["REGISTRAR", "HISTORIAL"].forEach(x => {
        document.getElementById("transf-" + x).classList.toggle("oculto", x !== s);
        document.getElementById("subtab-transf-" + x).classList.toggle("active", x === s);
    });
}


export function setSubModoLaminas(s) {
    ["BUSCAR", "AGREGAR"].forEach(x => {
        document.getElementById("lam-" + x).classList.toggle("oculto", x !== s);
        document.getElementById("subtab-lam-" + x).classList.toggle("active", x === s);
    });
}


export function setSubModoServicios(s) {
    ["COPIAS", "ANILLADOS", "PLASTIFICADOS", "OTROS", "RESUMEN"].forEach(x => {
        document.getElementById("srv-" + x).classList.toggle("oculto", x !== s);
        document.getElementById("subtab-srv-" + x).classList.toggle("active", x === s);
    });
    if (s === "RESUMEN" && _cargarResumenServicios) _cargarResumenServicios();
}


// ── Persistencia del modo activo en localStorage ──────────
function _guardarModo(modo) {
    try { localStorage.setItem("eruditos_modo", modo); } catch (_) {}
}
function _leerModoGuardado() {
    try { return localStorage.getItem("eruditos_modo"); } catch (_) { return null; }
}

// ── Registrar listener resize para indicador ──────────────────
window.addEventListener('resize', function() {
    if (typeof store !== 'undefined' && store.modoActual)
        actualizarIndicador(store.modoActual);
});

// ── Cerrar autocompletes al hacer clic fuera ───────────────
document.addEventListener("click", function(e) {
    if (!e.target.closest(".autocomplete") && !e.target.closest("input")) {
        document.querySelectorAll(".autocomplete").forEach(a => a.classList.remove("show"));
    }
});

// ── Atajos de teclado globales ─────────────────────────────
document.addEventListener("keydown", function(e) {
    if (!store.sessionToken) return;

    if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay.show").forEach(m => m.classList.remove("show"));
        document.querySelectorAll(".autocomplete.show").forEach(a => a.classList.remove("show"));
        return;
    }

    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault();
        var inputs = {
            VENTA: "productoVenta",
            BUSQUEDA: "busquedaInput",
            COMPRA: "productoCompra",
            LAMINAS: "laminaInput",
            TRANSFERENCIAS: "transfProducto",
        };
        var tabActivo = TODOS_MODOS.find(function(m) {
            var sec = document.getElementById("seccion-" + m);
            return sec && !sec.classList.contains("oculto");
        });
        var inputId = inputs[tabActivo];
        if (inputId) {
            var inputEl = document.getElementById(inputId);
            if (inputEl) inputEl.focus();
        }
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        var tabActivo = TODOS_MODOS.find(function(m) {
            var sec = document.getElementById("seccion-" + m);
            return sec && !sec.classList.contains("oculto");
        });
        if (tabActivo === "VENTA") {
            var btnCobrar = document.getElementById("btnCobrar");
            if (btnCobrar) { e.preventDefault(); btnCobrar.click(); }
        }
        if (tabActivo === "COMPRA") {
            if (window.registrarCompra) { e.preventDefault(); window.registrarCompra(); }
        }
        if (tabActivo === "GASTO") {
            if (window.registrarGasto) { e.preventDefault(); window.registrarGasto(); }
        }
        return;
    }

    if (e.key === "F5" && !e.ctrlKey) {
        if (window.cargarInventarioAdmin) {
            e.preventDefault();
            window.cargarInventarioAdmin().then(function() {
                if (window.mostrarMsg) window.mostrarMsg("Inventario actualizado", "ok");
            });
        }
    }
});

// ── Init: main.js llamará initNavegacion() en fase 5 ──────────
