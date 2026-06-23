/* === UI: Respuestas, búsqueda, modales de imagen / rol / pass === */

/*
 * Funciones de UI reutilizables y modales auxiliares.
 *
 * Dependencias directas (ya modulos):
 *   - store.js   (store, setModalImagenData)
 *   - api.js     (api)
 *   - utils.js   (mostrarMsg, formatearBs)
 *
 * Dependencias inyectadas via initUI() (modulos futuros):
 *   - cargarInventarioAdmin()   -> Fase 3G (inventario.js)
 *
 * Uso:
 *   import { initUI, manejarRespuesta, renderSearchCard,
 *            abrirModalImagen, cerrarModalImagen, guardarImagenProducto,
 *            confirmarEliminar,
 *            abrirModalRol, cerrarModalRol,
 *            abrirModalPass, cerrarModalPass, confirmarResetPass } from './ui.js';
 *
 *   initUI({ cargarInventarioAdmin });
 */

import { store, setModalImagenData } from './store.js';
import { api } from './api.js';
import { mostrarMsg, formatearBs } from './utils.js';

// ── CALLBACKS (inyectados por initUI) ─────────────────────────
let _cargarInventarioAdmin = null;

/**
 * Registra las dependencias que ui necesita y que seran provistas
 * por modulos extraidos en fases posteriores.
 */
export function initUI(callbacks) {
    if (callbacks.cargarInventarioAdmin) _cargarInventarioAdmin = callbacks.cargarInventarioAdmin;
}


// ══ MANEJADOR DE RESPUESTAS API ══
/**
 * Devuelve true si la respuesta es OK o si el error no es de autorizacion.
 * Si la sesion expiro o no hay permisos, muestra mensaje y retorna false.
 */
export function manejarRespuesta(d) {
    if (!d.ok && (d.error === "NO_AUTORIZADO" || d.error === "PERMISO_DENEGADO")) {
        mostrarMsg("⛔ Sin permisos para esta acción", "err");
        return false;
    }
    return true;
}


// ══ TARJETA DE RESULTADO DE BUSQUEDA ══
export function renderSearchCard(p) {
    const div = document.createElement("div");
    div.className = "search-result show";
    div.setAttribute("data-clave", p.clave || "");
    div.style.cursor = "pointer";
    div.addEventListener("click", function() { abrirDetalleProducto(p); });
    const sc = p.stock <= 0 ? "warn" : p.stock <= 5 ? "orange" : "ok",
          sl = p.stock <= 0 ? "🚫 Sin stock" : p.stock <= 5 ? "⚠️ Stock bajo" : "✅ En stock";
    div.innerHTML = `<div class="sr-name">🔍 ${p.producto}</div>
<div class="sr-grid">
<div class="sr-field accent"><div class="sr-key">Precio Venta</div><div class="sr-val ok">${formatearBs(p.precioVenta)}</div></div>
<div class="sr-field accent"><div class="sr-key">Precio Unidad</div><div class="sr-val ok">${formatearBs(p.precioUnidad)}</div></div>
<div class="sr-field ${sc === 'warn' ? 'red' : sc === 'orange' ? 'orange' : 'accent'}"><div class="sr-key">Stock Actual</div><div class="sr-val ${sc}">${p.stock} ud.  ${sl}</div></div>
<div class="sr-field blue"><div class="sr-key">Sucursal</div><div class="sr-val" style="color:#6eb4ff">${p.sucursal ?? '—'}</div></div>
<div class="sr-field"><div class="sr-key">Ubicación</div><div class="sr-val">${p.ubicacion || '—'}</div></div>
<div class="sr-field"><div class="sr-key">Proveedor</div><div class="sr-val">${p.proveedor || '—'}</div></div>
</div>`;
    return div;
}

// ══ DETALLE DE PRODUCTO (overlay al hacer clic en card de búsqueda) ══
export function abrirDetalleProducto(p) {
    const overlay = document.getElementById("productoDetalleOverlay");
    const imgDiv = document.getElementById("productoDetalleImg");
    const infoDiv = document.getElementById("productoDetalleInfo");
    if (p.imagen) {
        imgDiv.innerHTML = `<img src="${p.imagen}" alt="${p.producto}" loading="lazy">`;
    } else {
        imgDiv.innerHTML = `<div class="detalle-sin-img">Sin vista previa</div>`;
    }
    infoDiv.innerHTML = `<div class="detalle-nombre">${p.producto}</div>
<div class="detalle-item"><span class="detalle-key">Precio Venta</span><span class="detalle-val">${formatearBs(p.precioVenta)}</span></div>
<div class="detalle-item"><span class="detalle-key">Precio Unidad</span><span class="detalle-val">${formatearBs(p.precioUnidad)}</span></div>
<div class="detalle-item"><span class="detalle-key">Stock</span><span class="detalle-val">${p.stock} ud.</span></div>
<div class="detalle-item"><span class="detalle-key">Sucursal</span><span class="detalle-val">${p.sucursal || '—'}</span></div>
<div class="detalle-item"><span class="detalle-key">Ubicación</span><span class="detalle-val">${p.ubicacion || '—'}</span></div>
<div class="detalle-item"><span class="detalle-key">Proveedor</span><span class="detalle-val">${p.proveedor || '—'}</span></div>`;
    overlay.style.display = "flex";
}

export function cerrarDetalleProducto(e) {
    var overlay = document.getElementById("productoDetalleOverlay");
    if (!overlay) return;
    if (e && e.target !== overlay) return;
    overlay.style.display = "none";
}


// ══ MODAL DE IMAGEN DE PRODUCTO ══
export function abrirModalImagen(producto, sucursal, imagenUrl) {
    document.getElementById("modalImagenProducto").value = producto;
    document.getElementById("modalImagenSucursal").value = sucursal;
    document.getElementById("modalImagenUrl").value = imagenUrl || "";
    setModalImagenData(producto, sucursal);
    document.getElementById("modalImagen").classList.add("show");
}

export function cerrarModalImagen() {
    document.getElementById("modalImagen").classList.remove("show");
}

export async function guardarImagenProducto() {
    if (!store.sessionToken) {
        mostrarMsg("Sesión expirada", "err");
        return;
    }
    const url = document.getElementById("modalImagenUrl").value.trim();
    if (!url) {
        mostrarMsg("Ingresa una URL de imagen", "err");
        return;
    }
    const loader = document.getElementById("loaderModalImagen");
    loader.style.display = "block";
    try {
        const data = await api({
            ACCION: "ACTUALIZAR_IMAGEN_PRODUCTO",
            PRODUCTO: store.modalImagenData.producto,
            SUCURSAL: store.modalImagenData.sucursal,
            IMAGEN_URL: url,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return;
        }
        if (data.ok) {
            mostrarMsg("✅ Imagen actualizada", "ok");
            cerrarModalImagen();
            if (_cargarInventarioAdmin) _cargarInventarioAdmin();
        } else {
            mostrarMsg("Error: " + data.error, "err");
        }
    } catch (e) {
        mostrarMsg("Error de conexión", "err");
    }
    loader.style.display = "none";
}


// ══ ELIMINAR PRODUCTO (ADMIN) ══
export async function confirmarEliminar(id, producto) {
    if (!confirm(`¿Eliminar definitivamente "${producto}"? Esta acción no se puede deshacer.`)) return;
    try {
        const data = await api({
            ACCION: "ELIMINAR_PRODUCTO",
            ID: id,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        if (data.ok) {
            mostrarMsg(`🗑️ "${producto}" eliminado`, "ok");
            if (_cargarInventarioAdmin) _cargarInventarioAdmin();
        } else {
            mostrarMsg("Error: " + data.error, "err");
        }
    } catch (e) {
        mostrarMsg("Error de conexión", "err");
    }
}


// ══ MODAL CAMBIO DE ROL ══
export function abrirModalRol(usuario, rolActual) {
    document.getElementById("modalRolUsuario").value = usuario;
    document.getElementById("modalRolNombre").value = usuario;
    document.getElementById("modalRolNuevo").value = rolActual;
    document.getElementById("modalRol").classList.add("show");
}

export function cerrarModalRol() {
    document.getElementById("modalRol").classList.remove("show");
}


// ══ MODAL RESETEO DE CONTRASEÑA ══
export function abrirModalPass(usuario) {
    document.getElementById("modalPassUsuario").value = usuario;
    document.getElementById("modalPassNombre").value = usuario;
    document.getElementById("modalPassNueva").value = "";
    document.getElementById("modalPass").classList.add("show");
}

export function cerrarModalPass() {
    document.getElementById("modalPass").classList.remove("show");
}

export async function confirmarResetPass() {
    const usuario = document.getElementById("modalPassUsuario").value,
          pass = document.getElementById("modalPassNueva").value;
    if (!pass || pass.length < 6) {
        mostrarMsg("La contraseña debe tener al menos 6 caracteres", "err");
        return;
    }
    const loader = document.getElementById("loaderModalPass");
    loader.style.display = "block";
    try {
        const data = await api({
            ACCION: "CAMBIAR_PASSWORD_USUARIO",
            USUARIO: usuario,
            PASSWORD: pass,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return;
        }
        if (data.ok) {
            mostrarMsg(`✅ Contraseña de ${usuario} actualizada`, "ok");
            cerrarModalPass();
        } else {
            mostrarMsg("Error: " + data.error, "err");
        }
    } catch (e) {
        mostrarMsg("Error de conexión", "err");
    }
    loader.style.display = "none";
}


// ── Inicializar al cargar el DOM ──────────────────────────────
// (La llamada real a initUI() vendra desde main.js en fase 5)
