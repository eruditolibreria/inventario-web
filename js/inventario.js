/* === INVENTARIO: Carga, busqueda, autocomplete y gestion de usuarios === */

/*
 * Funciones de inventario: carga global, panel admin, busqueda detalle,
 * autocomplete generico y toggle de estado de usuarios.
 *
 * Dependencias directas (ya modulos):
 *   - store.js   (store, setInventario)
 *   - api.js     (api)
 *   - utils.js   (mostrarMsg)
 *   - ui.js      (manejarRespuesta, renderSearchCard,
 *                 abrirModalImagen, confirmarEliminar)
 *
 * Dependencias inyectadas via initInventario() (modulos futuros):
 *   - cargarUsuarios()
 *
 * Uso:
 *   import { initInventario, cargarInventario, cargarInventarioAdmin } from './inventario.js';
 *   initInventario({ cargarUsuarios });
 */

import { store, setInventario } from './store.js';
import { api } from './api.js';
import { mostrarMsg } from './utils.js';
import { manejarRespuesta, renderSearchCard, abrirModalImagen, confirmarEliminar } from './ui.js';

// ── CALLBACKS ─────────────────────────────────────────────────
let _cargarUsuarios = null;

export function initInventario(callbacks) {
    if (callbacks.cargarUsuarios) _cargarUsuarios = callbacks.cargarUsuarios;
}


// ══ CARGA DE INVENTARIO GLOBAL ══
export async function cargarInventario() {
    if (!store.sessionToken) return;
    try {
        const d = await api({
            ACCION: "LISTAR_INVENTARIO",
            LIMITE: 200,
            TOKEN: store.sessionToken
        });
        setInventario(d.datos || []);
    } catch (e) {}
}

// Intervalos de actualizacion (se activan desde main.js en fase 5)
let _intervaloInventario = null;
let _intervaloCaja = null;

export function iniciarIntervalos(verificarEstadoCajaFn) {
    if (!_intervaloInventario) {
        _intervaloInventario = setInterval(() => {
            if (store.sessionToken) cargarInventario();
        }, 30000);
    }
    if (!_intervaloCaja && verificarEstadoCajaFn) {
        _intervaloCaja = setInterval(() => {
            if (store.sessionToken) verificarEstadoCajaFn();
        }, 20000);
    }
}

export function detenerIntervalos() {
    if (_intervaloInventario) { clearInterval(_intervaloInventario); _intervaloInventario = null; }
    if (_intervaloCaja) { clearInterval(_intervaloCaja); _intervaloCaja = null; }
}


// ══ CONSTRUCTOR DE LISTA AUTOCOMPLETE ══
export function construirAC(lista, items, onSelect) {
    lista.innerHTML = "";
    if (items.length === 0) {
        lista.classList.remove("show");
        return;
    }
    items.slice(0, 8).forEach(p => {
        const div = document.createElement("div");
        div.className = "ac-item";
        div.innerHTML = `<strong>${p.producto}</strong><small>Stock: ${p.stock} | Bs ${p.precio} | ${p.sucursal}</small>`;
        div.onclick = () => {
            onSelect(p);
            lista.classList.remove("show");
        };
        lista.appendChild(div);
    });
    lista.classList.add("show");
}


// ══ BUSQUEDA DETALLADA DE PRODUCTOS ══
export async function ejecutarBusquedaDetalle(t) {
    if (!store.sessionToken) {
        mostrarMsg("Sesión expirada", "err");
        return;
    }
    const loader = document.getElementById("loaderBusqueda"),
          l = document.getElementById("listaBusqueda"),
          co = document.getElementById("searchResultsList"),
          sucActual = document.getElementById("busquedaSucursal")?.value || "";
    l.classList.remove("show");
    loader.style.display = "block";
    co.innerHTML = "";
    try {
        const body = {
            ACCION: "BUSCAR_PRODUCTO_DETALLE",
            PRODUCTO: t,
            TOKEN: store.sessionToken
        };
        if (sucActual) body.SUCURSAL = sucActual;
        const data = await api(body);
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return;
        }
        const rs = data.datos || [];
        if (rs.length === 0) {
            co.innerHTML = `<div class="empty-state">Sin resultados para "<b style="color:var(--text)">${t}</b>"</div>`;
        } else {
            rs.forEach(p => co.appendChild(renderSearchCard(p)));
        }
    } catch (e) {
        co.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>`;
    }
    loader.style.display = "none";
}


// ══ INVENTARIO PANEL ADMIN ══
export async function cargarInventarioAdmin() {
    if (!store.sessionToken || store.sessionRol !== "ADMIN") {
        mostrarMsg("Sin permisos", "err");
        return;
    }
    const loader = document.getElementById("loaderInvAdmin"),
          grid = document.getElementById("inventarioGrid"),
          filtroSuc = document.getElementById("filtroInvSucursal").value,
          filtroProd = document.getElementById("filtroInvProducto").value.toLowerCase();
    loader.style.display = "block";
    grid.innerHTML = "";
    try {
        const data = await api({
            ACCION: "LISTAR_INVENTARIO_ADMIN",
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return;
        }
        let datos = data.datos || [];
        if (filtroSuc)
            datos = datos.filter(p => p.sucursal === filtroSuc);
        if (filtroProd)
            datos = datos.filter(p => p.producto.toLowerCase().includes(filtroProd));
        if (datos.length === 0) {
            grid.innerHTML = `<div class="empty-state">Sin productos encontrados</div>`;
        } else {
            datos.forEach(p => {
                const card = document.createElement("div");
                card.className = "inventario-card";
                card.innerHTML = `<div class="inventario-img">${p.imagen ? `<img src="${p.imagen}" alt="${p.producto}">` : ``}</div>
                <div class="inventario-info">
                  <div class="nombre">${p.producto}</div>
                  <div class="detalle">Costo: Bs ${p.precioUnidad?.toFixed(2) || '-'}</div>
                  <div class="detalle">Venta: Bs ${p.precioVenta?.toFixed(2) || '-'}</div>
                  <div class="detalle">Stock: <b style="color:var(--accent)">${p.stock}</b></div>
                  <div class="detalle" style="color:var(--muted);font-size:10px">${p.sucursal}</div>
                </div>
                <div class="inventario-actions">
                  <button class="btn-xs btn-xs-edit" data-accion="imagen" data-producto="${p.producto}" data-sucursal="${p.sucursal}" data-imagen="${p.imagen || ''}">🖼️ Imagen</button>
                  <button class="btn-xs btn-xs-del" data-accion="eliminar" data-id="${p.id}" data-producto="${p.producto}">🗑️ Eliminar</button>
                </div>`;
                grid.appendChild(card);
            });
            // Vincular eventos a los botones generados dinamicamente
            grid.querySelectorAll('[data-accion="imagen"]').forEach(btn => {
                btn.addEventListener('click', function() {
                    abrirModalImagen(this.dataset.producto, this.dataset.sucursal, this.dataset.imagen);
                });
            });
            grid.querySelectorAll('[data-accion="eliminar"]').forEach(btn => {
                btn.addEventListener('click', function() {
                    confirmarEliminar(this.dataset.id, this.dataset.producto);
                });
            });
        }
    } catch (e) {
        grid.innerHTML = `<div style="color:var(--red);padding:10px">Error de conexión</div>`;
    }
    loader.style.display = "none";
}


// ══ ACTIVAR/DESACTIVAR USUARIO ══
export async function toggleEstadoUsuario(usuario, estadoActual) {
    const nuevoEstado = estadoActual === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    if (!confirm(`¿${nuevoEstado === "INACTIVO" ? "Desactivar" : "Activar"} al usuario ${usuario}?`))
        return;
    try {
        const data = await api({
            ACCION: "CAMBIAR_ESTADO_USUARIO",
            USUARIO: usuario,
            ESTADO: nuevoEstado,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        if (data.ok) {
            mostrarMsg(`✅ ${usuario} ${nuevoEstado === "ACTIVO" ? "activado" : "desactivado"}`, "ok");
            if (_cargarUsuarios) await _cargarUsuarios();
        } else {
            mostrarMsg("Error: " + data.error, "err");
        }
    } catch (e) {
        mostrarMsg("Error de conexión", "err");
    }
}


// ── Init: main.js llamará initInventario() en fase 5 ──────────
// Tambien iniciara los intervalos con iniciarIntervalos(verificarEstadoCaja)
