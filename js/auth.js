/* === AUTH: Login, logout, mensajes de sesion === */

/*
 * Gestion de autenticacion: loginSubmit, cerrarSesion, mostrarMensajeLogin.
 *
 * Dependencias directas (ya modulos):
 *   - config.js  (CARRITO_KEY)
 *   - store.js   (store, setSession, setTokens, clearSession, setInventario, clearCarrito)
 *   - api.js     (api)
 *   - utils.js   (hoy, mostrarToast)
 *
 * Dependencias inyectadas via initAuth() (modulos futuros):
 *   - aplicarRol(rol)
 *   - cargarInventario()
 *   - verificarEstadoCaja()
 *   - restaurarCarritoDraft(draft)
 *   - toggleClienteVenta()
 *   - toggleClienteCompra()
 *   - toggleAcreedorGasto()
 *
 * Uso:
 *   import { initAuth, loginSubmit, cerrarSesion } from './auth.js';
 *   initAuth({ aplicarRol, cargarInventario, verificarEstadoCaja, ... });
 */

import { CARRITO_KEY } from './config.js';
import { store, setSession, setTokens, clearSession, setInventario, clearCarrito } from './store.js';
import { api } from './api.js';
import { hoy, mostrarToast } from './utils.js';

// ── CALLBACKS (inyectados por initAuth) ────────────────────────
let _aplicarRol = null;
let _cargarInventario = null;
let _verificarEstadoCaja = null;
let _toggleClienteVenta = null;
let _toggleClienteCompra = null;
let _toggleAcreedorGasto = null;
let _restaurarCarritoDraft = null;

/**
 * Registra las dependencias que auth necesita y que seran provistas
 * por modulos extraidos en fases posteriores.
 */
export function initAuth(callbacks) {
    if (callbacks.aplicarRol) _aplicarRol = callbacks.aplicarRol;
    if (callbacks.cargarInventario) _cargarInventario = callbacks.cargarInventario;
    if (callbacks.verificarEstadoCaja) _verificarEstadoCaja = callbacks.verificarEstadoCaja;
    if (callbacks.toggleClienteVenta) _toggleClienteVenta = callbacks.toggleClienteVenta;
    if (callbacks.toggleClienteCompra) _toggleClienteCompra = callbacks.toggleClienteCompra;
    if (callbacks.toggleAcreedorGasto) _toggleAcreedorGasto = callbacks.toggleAcreedorGasto;
    if (callbacks.restaurarCarritoDraft) _restaurarCarritoDraft = callbacks.restaurarCarritoDraft;
}


// ══ LOGIN ══
export async function loginSubmit() {
    const usuario = document.getElementById("loginUser").value.trim()
      , password = document.getElementById("loginPass").value;
    if (!usuario || !password) {
        mostrarMensajeLogin("Completa usuario y contraseña", "err");
        return;
    }
    const loader = document.getElementById("loginLoader")
      , btn = document.querySelector("#loginScreen .btn");
    loader.style.display = "block";
    btn.disabled = true;
    try {
        const data = await api({
            ACCION: "LOGIN",
            USUARIO: usuario,
            PASSWORD: password
        });
        if (data.ok) {
            setSession(data.token, data.usuario, (data.rol || "").toUpperCase());
            setTokens(data.refreshToken || null, data.expiresAt || 0);

            // UI post-login
            document.getElementById("badgeUser").textContent = store.sessionUser;
            const pill = document.getElementById("badgeRol");
            pill.textContent = store.sessionRol;
            pill.className = "rol-pill rol-" + store.sessionRol;
            document.getElementById("loginScreen").classList.add("oculto");
            document.getElementById("appScreen").classList.remove("oculto");

            // Fechas por defecto
            const fh = hoy();
            ["gastoFecha", "aporteFecha", "abonarCobrarFecha",
             "abonarPagarFecha", "fechaCompra", "repFechaHasta"]
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = fh;
                });
            const desde = document.getElementById("repFechaDesde");
            if (desde) desde.value = fh.slice(0, 7) + "-01";
            const srv = document.getElementById("srvResumenFecha");
            if (srv) srv.value = fh;

            // Callbacks a modulos externos
            if (_toggleClienteVenta) _toggleClienteVenta();
            if (_toggleClienteCompra) _toggleClienteCompra();
            if (_toggleAcreedorGasto) _toggleAcreedorGasto();
            if (_aplicarRol) _aplicarRol(store.sessionRol);
            if (_cargarInventario) _cargarInventario();

            // Restaurar carrito draft
            if (_restaurarCarritoDraft) {
                try {
                    const raw = localStorage.getItem(CARRITO_KEY);
                    if (raw) {
                        const draft = JSON.parse(raw);
                        if (draft.carrito?.length &&
                            (Date.now() - draft.ts) < 8 * 60 * 60 * 1000) {
                            _restaurarCarritoDraft(draft);
                        } else {
                            localStorage.removeItem(CARRITO_KEY);
                        }
                    }
                } catch(e) {}
            }

            if (_verificarEstadoCaja) _verificarEstadoCaja();
        } else {
            mostrarMensajeLogin(data.motivo || "Usuario o contraseña incorrectos", "err");
        }
    } catch (e) {
        mostrarMensajeLogin("Error de conexión. Intenta de nuevo.", "err");
    }
    loader.style.display = "none";
    btn.disabled = false;
}


export function mostrarMensajeLogin(t, tipo) {
    const m = document.getElementById("loginMsg");
    m.className = "mensaje " + (tipo === "ok" ? "msg-ok" : "msg-err");
    m.textContent = t;
    m.style.display = "block";
    setTimeout(() => m.style.display = "none", 3000);
}


export function cerrarSesion() {
    if (!confirm("¿Cerrar sesión?")) return;
    if (store.sessionToken) {
        api({
            ACCION: "LOGOUT",
            TOKEN: store.sessionToken
        }).catch(() => {});
    }
    // Limpiar estado
    clearSession();
    setInventario([]);
    clearCarrito();
    // Limpiar UI
    document.getElementById("loginUser").value = "";
    document.getElementById("loginPass").value = "";
    document.getElementById("appScreen").classList.add("oculto");
    document.getElementById("loginScreen").classList.remove("oculto");
    const cajaBadge = document.getElementById("cajaBadge");
    if (cajaBadge) cajaBadge.style.display = "none";
}


// ── Inicializar al cargar el DOM ──────────────────────────────
// (La llamada real a initAuth() vendra desde main.js en fase 5)
