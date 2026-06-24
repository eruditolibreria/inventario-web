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

// ── CALLBACKS (inyectados por initNavegacion) ──────────────────
let _verificarEstadoCaja = null;
let _cargarUsuarios = null;
let _cargarResumenServicios = null;
let _setReporteStock = null;
let _setReporteFinanciero = null;

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
    setModo(modoRestaurado && tabs.includes(modoRestaurado) ? modoRestaurado : inicio);
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

export function setModo(modo, direccion, velocidad) {
    var modoAnterior = store.modoActual;
    if (modoAnterior === modo) {
        var secMisma = document.getElementById("seccion-" + modo);
        if (secMisma) {
            secMisma.classList.remove("oculto", "push-transitioning", "push-dragging");
            secMisma.style.animation = "";
            secMisma.style.transform = "";
            secMisma.style.willChange = "";
            secMisma.style.display = "";
        }
        actualizarIndicador(modo);
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

    TODOS_MODOS.forEach(function(m) {
        document.getElementById("tab-" + m).classList.toggle("active", m === modo);
    });
    actualizarIndicador(modo);

    var tabActivo = document.getElementById("tab-" + modo);
    if (tabActivo) {
        tabActivo.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }

    if (direccion === 0) {
        TODOS_MODOS.forEach(function(m) {
            var sec = document.getElementById("seccion-" + m);
            var act = m === modo;
            if (act) {
                sec.classList.remove("oculto");
                sec.style.animation = "";
                sec.style.transform = "";
                sec.style.willChange = "";
                sec.classList.remove("push-transitioning", "push-dragging");
            } else {
                sec.classList.add("oculto");
                sec.style.animation = "";
                sec.style.transform = "";
                sec.style.willChange = "";
                sec.classList.remove("push-transitioning", "push-dragging");
            }
        });
    } else if (direccion === 1) {
        secEntrante.classList.remove("oculto", "push-dragging");
        secSaliente.classList.remove("push-dragging");

        secEntrante.style.transform = "";
        secEntrante.style.willChange = "transform";
        secEntrante.style.animation = "pushInFromRight " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";

        secSaliente.style.transform = "";
        secSaliente.style.willChange = "transform";
        secSaliente.classList.add("push-transitioning");
        secSaliente.style.animation = "pushOutToLeft " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";

        var onEnd = function() {
            secSaliente.classList.add("oculto");
            secSaliente.classList.remove("push-transitioning");
            secSaliente.style.animation = "";
            secSaliente.style.transform = "";
            secSaliente.style.willChange = "";
            secSaliente.removeEventListener("animationend", onEnd);
            secEntrante.style.animation = "";
            secEntrante.style.transform = "";
            secEntrante.style.willChange = "";
        };
        secSaliente.addEventListener("animationend", onEnd, { once: true });
    } else if (direccion === -1) {
        secEntrante.classList.remove("oculto", "push-dragging");
        secSaliente.classList.remove("push-dragging");

        secEntrante.style.transform = "";
        secEntrante.style.willChange = "transform";
        secEntrante.style.animation = "pushInFromLeft " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";

        secSaliente.style.transform = "";
        secSaliente.style.willChange = "transform";
        secSaliente.classList.add("push-transitioning");
        secSaliente.style.animation = "pushOutToRight " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";

        var onEnd = function() {
            secSaliente.classList.add("oculto");
            secSaliente.classList.remove("push-transitioning");
            secSaliente.style.animation = "";
            secSaliente.style.transform = "";
            secSaliente.style.willChange = "";
            secSaliente.removeEventListener("animationend", onEnd);
            secEntrante.style.animation = "";
            secEntrante.style.transform = "";
            secEntrante.style.willChange = "";
        };
        secSaliente.addEventListener("animationend", onEnd, { once: true });
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
    if (modo === "TRANSFERENCIAS")
        setSubModoTransf("REGISTRAR");
    if (modo === "LAMINAS")
        setSubModoLaminas("BUSCAR");
    if (modo === "SERVICIOS") {
        setSubModoServicios("COPIAS");
        document.getElementById("srvResumenFecha").value = hoy();
    }
}

// ══ SWIPE TÁCTIL (push con arrastre de dedo) ══
var _swipeStartX = 0;
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
}

function _swipeStart(e) {
    if (_swipeActive || _swipeBloqueado) return;
    _swipeStartX = e.touches[0].clientX;
    _swipeModoOrigen = store.modoActual;
    _swipeDireccion = 0;
}

function _swipeMove(e) {
    if (_swipeBloqueado) return;
    var deltaX = e.touches[0].clientX - _swipeStartX;
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
    var porcentaje = Math.max(-1, Math.min(1, deltaX / panelAncho * 0.7));
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
    var umbral = panelAncho * 0.2;
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
        _resetSwipe(secSaliente, secEntrante);
        setTimeout(function() { _swipeBloqueado = false; }, 50);
    }
    _swipeStartX = 0;
}

function _resetSwipe(secSaliente, secEntrante) {
    if (secSaliente) {
        secSaliente.classList.remove("push-dragging");
        secSaliente.style.transform = "";
        secSaliente.style.willChange = "";
    }
    if (secEntrante) {
        secEntrante.classList.remove("push-dragging");
        secEntrante.classList.add("oculto");
        secEntrante.style.transform = "";
        secEntrante.style.willChange = "";
    }
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
        if (window.cargarInventario) {
            e.preventDefault();
            window.cargarInventario().then(function() {
                if (window.mostrarMsg) window.mostrarMsg("Inventario actualizado", "ok");
            });
        }
    }
});

// ── Init: main.js llamará initNavegacion() en fase 5 ──────────
