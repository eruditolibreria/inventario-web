/* === MODO ADMIN: Detalle, inventario, usuarios === */
import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg } from '../utils.js';
import { manejarRespuesta, renderSearchCard, confirmarEliminar,
         abrirModalImagen, cerrarModalImagen, guardarImagenProducto,
         abrirModalRol, cerrarModalRol, abrirModalPass, cerrarModalPass,
         confirmarResetPass } from '../ui.js';
import { cargarInventario } from '../inventario.js';

let busquedaTimer = null;
let _verif = null;
export function initAdmin(cb) {
    if (cb && cb.verificarEstadoCaja) _verif = cb.verificarEstadoCaja;
}

const ROL_LABELS = {
    ADMIN: "Admin",
    VENDEDOR: "Vendedor",
    ALMACEN: "Almacen"
};

// ── buscarProductoDetalle ──
export function buscarProductoDetalle() {
    const t = document.getElementById("busquedaInput").value.trim()
      , l = document.getElementById("listaBusqueda")
      , sucFiltro = document.getElementById("busquedaSucursal")?.value || "";
    clearTimeout(busquedaTimer);
    document.getElementById("searchResultsList").innerHTML = "";
    if (t.length < 2) {
        l.classList.remove("show");
        return
    }
    let sg = store.inventarioGlobal.filter(p => p.producto.toLowerCase().includes(t.toLowerCase()));
    if (sucFiltro) {
        sg = sg.filter(p => p.sucursal === sucFiltro);
    }
    l.innerHTML = "";
    if (sg.length > 0) {
        sg.slice(0, 8).forEach(p => {
            const div = document.createElement("div");
            div.className = "ac-item";
            div.innerHTML = `<strong>${p.producto}</strong><small>${p.sucursal} | Stock: ${p.stock}</small>`;
            div.addEventListener("click", () => {
                document.getElementById("busquedaInput").value = p.producto;
                l.classList.remove("show");
                ejecutarBusquedaDetalle(p.clave || p.producto)
            });
            l.appendChild(div)
        });
        l.classList.add("show")
    } else {
        l.classList.remove("show")
    }
    busquedaTimer = setTimeout(() => ejecutarBusquedaDetalle(t), 600)
}

// ── ejecutarBusquedaDetalle ──
export async function ejecutarBusquedaDetalle(t) {
    if (!store.sessionToken) {
        mostrarMsg("Sesion expirada", "err");
        return
    }
    const loader = document.getElementById("loaderBusqueda")
      , l = document.getElementById("listaBusqueda")
      , co = document.getElementById("searchResultsList")
      , sucActual = document.getElementById("busquedaSucursal")?.value || "";
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
            return
        }
        const rs = data.datos || [];
        if (rs.length === 0) {
            co.innerHTML = `<div class="empty-state">Sin resultados para "<b style="color:var(--text)">${t}</b>"</div>`
        } else {
            rs.forEach(p => co.appendChild(renderSearchCard(p)))
        }
    } catch (e) {
        co.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>`
    }
    loader.style.display = "none"
}

// ── cargarInventarioAdmin ──
export async function cargarInventarioAdmin() {
    if (!store.sessionToken || store.sessionRol !== "ADMIN") {
        mostrarMsg("Sin permisos", "err");
        return
    }
    const loader = document.getElementById("loaderInvAdmin")
      , grid = document.getElementById("inventarioGrid")
      , filtroSuc = document.getElementById("filtroInvSucursal").value
      , filtroProd = document.getElementById("filtroInvProducto").value.toLowerCase();
    loader.style.display = "block";
    grid.innerHTML = "";
    try {
        const data = await api({
            ACCION: "LISTAR_INVENTARIO_ADMIN",
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return
        }
        let datos = data.datos || [];
        if (filtroSuc) datos = datos.filter(p => p.sucursal === filtroSuc);
        if (filtroProd) datos = datos.filter(p => p.producto.toLowerCase().includes(filtroProd));
        if (datos.length === 0) {
            grid.innerHTML = `<div class="empty-state">Sin productos encontrados</div>`
        } else {
            datos.forEach(p => {
                const card = document.createElement("div");
                card.className = "inventario-card";
                card.innerHTML = `<div class="inventario-img">${p.imagen ? `<img src="${p.imagen}" alt="${p.producto}">` : ``}</div>
                <div class="inventario-info">
                  <div class="nombre">${p.producto}</div>
                  <div class="detalle">Costo: Bs ${p.precioUnidad?.toFixed(2) || '—'}</div>
                  <div class="detalle">Venta: Bs ${p.precioVenta?.toFixed(2) || '—'}</div>
                  <div class="detalle">Stock: <b style="color:var(--accent)">${p.stock}</b></div>
                  <div class="detalle" style="color:var(--muted);font-size:10px">${p.sucursal}</div>
                </div>
                <div class="inventario-actions">
                  <button class="btn-xs btn-xs-edit" data-accion="imagen" data-producto="${p.producto}" data-sucursal="${p.sucursal}" data-imagen="${p.imagen || ''}">Imagen</button>
                  <button class="btn-xs btn-xs-del" data-accion="eliminar" data-id="${p.id}" data-producto="${p.producto}">Eliminar</button>
                </div>`;
                grid.appendChild(card)
            });
            // Delegated listeners
            grid.querySelectorAll('[data-accion="imagen"]').forEach(btn => {
                btn.addEventListener("click", function() {
                    abrirModalImagen(this.dataset.producto, this.dataset.sucursal, this.dataset.imagen);
                });
            });
            grid.querySelectorAll('[data-accion="eliminar"]').forEach(btn => {
                btn.addEventListener("click", function() {
                    confirmarEliminar(this.dataset.id, this.dataset.producto);
                });
            });
        }
    } catch (e) {
        grid.innerHTML = `<div style="color:var(--red);padding:10px">Error de conexion</div>`
    }
    loader.style.display = "none"
}

// ── cargarUsuarios ──
export async function cargarUsuarios() {
    if (!store.sessionToken) return;
    const loader = document.getElementById("loaderUsuarios")
      , lista = document.getElementById("listaUsuarios");
    loader.style.display = "block";
    lista.innerHTML = "";
    try {
        const data = await api({
            ACCION: "LISTAR_USUARIOS_ADMIN",
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return
        }
        const usuarios = data.datos || [];
        if (usuarios.length === 0) {
            lista.innerHTML = `<div class="empty-state">Sin usuarios encontrados</div>`
        } else {
            usuarios.forEach(u => {
                const card = document.createElement("div");
                card.className = "usuario-card";
                const esYo = u.usuario === store.sessionUser;
                card.innerHTML = `<div><div class="u-name">${u.usuario}${esYo ? ' <span style="font-size:10px;color:var(--muted)">(tu)</span>' : ''}</div><span class="rol-pill rol-${u.rol}" style="margin-top:4px;display:inline-block">${ROL_LABELS[u.rol] || u.rol}</span><span class="u-estado-${u.estado === 'ACTIVO' ? 'ok' : 'err'}" style="margin-left:8px">${u.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}</span></div><div class="u-actions"><button class="btn-icon" data-accion="editar-rol" data-usuario="${u.usuario}" data-rol="${u.rol}" title="Cambiar rol"></button><button class="btn-icon" data-accion="reset-pass" data-usuario="${u.usuario}" title="Resetear clave"></button>${!esYo ? `<button class="btn-icon danger" data-accion="toggle-estado" data-usuario="${u.usuario}" data-estado="${u.estado}" title="${u.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}"></button>` : ''}</div>`;
                lista.appendChild(card)
            });
            // Delegated listeners
            lista.querySelectorAll('[data-accion="editar-rol"]').forEach(btn => {
                btn.addEventListener("click", function() {
                    abrirModalRol(this.dataset.usuario, this.dataset.rol);
                });
            });
            lista.querySelectorAll('[data-accion="reset-pass"]').forEach(btn => {
                btn.addEventListener("click", function() {
                    abrirModalPass(this.dataset.usuario);
                });
            });
            lista.querySelectorAll('[data-accion="toggle-estado"]').forEach(btn => {
                btn.addEventListener("click", function() {
                    toggleEstadoUsuario(this.dataset.usuario, this.dataset.estado);
                });
            });
        }
    } catch (e) {
        lista.innerHTML = `<div style="color:var(--red);padding:10px">Error de conexion</div>`
    }
    loader.style.display = "none"
}

// ── crearUsuario ──
export async function crearUsuario() {
    if (!store.sessionToken) {
        mostrarMsg("Sesion expirada", "err");
        return
    }
    const nombre = document.getElementById("nuevoUsuarioNombre").value.trim().toUpperCase()
      , pass = document.getElementById("nuevoUsuarioPass").value
      , rol = document.getElementById("nuevoUsuarioRol").value;
    if (!nombre) {
        mostrarMsg("Ingresa un nombre de usuario", "err");
        return
    }
    if (!pass || pass.length < 6) {
        mostrarMsg("La clave debe tener al menos 6 caracteres", "err");
        return
    }
    const loader = document.getElementById("loaderCrearUsuario");
    loader.style.display = "block";
    try {
        const data = await api({
            ACCION: "CREAR_USUARIO",
            USUARIO: nombre,
            PASSWORD: pass,
            ROL: rol,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return
        }
        if (data.ok) {
            mostrarMsg("Usuario " + data.usuario + " creado como " + (ROL_LABELS[data.rol] || data.rol), "ok");
            document.getElementById("nuevoUsuarioNombre").value = "";
            document.getElementById("nuevoUsuarioPass").value = "";
            document.getElementById("nuevoUsuarioRol").value = "VENDEDOR";
            await cargarUsuarios();
        } else if (data.error === "USUARIO_DUPLICADO") {
            mostrarMsg("Ese nombre de usuario ya existe", "err")
        } else {
            mostrarMsg("Error: " + data.error, "err")
        }
    } catch (e) {
        mostrarMsg("Error de conexion", "err")
    }
    loader.style.display = "none"
}

// ── confirmarCambioRol ──
export async function confirmarCambioRol() {
    const usuario = document.getElementById("modalRolUsuario").value
      , nuevoRol = document.getElementById("modalRolNuevo").value;
    const loader = document.getElementById("loaderModalRol");
    loader.style.display = "block";
    try {
        const data = await api({
            ACCION: "CAMBIAR_ROL_USUARIO",
            USUARIO: usuario,
            ROL: nuevoRol,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return
        }
        if (data.ok) {
            mostrarMsg(usuario + " ahora es " + (ROL_LABELS[data.rol] || data.rol), "ok");
            cerrarModalRol();
            await cargarUsuarios();
        } else if (data.error === "NO_PUEDES_QUITARTE_ADMIN") {
            mostrarMsg("No puedes quitarte el rol de Admin", "err")
        } else {
            mostrarMsg("Error: " + data.error, "err")
        }
    } catch (e) {
        mostrarMsg("Error de conexion", "err")
    }
    loader.style.display = "none"
}

// ── toggleEstadoUsuario ──
export async function toggleEstadoUsuario(usuario, estadoActual) {
    const nuevoEstado = estadoActual === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    if (!confirm("Cambiar estado de " + usuario + " a " + nuevoEstado + "?")) return;
    try {
        const data = await api({
            ACCION: "CAMBIAR_ESTADO_USUARIO",
            USUARIO: usuario,
            ESTADO: nuevoEstado,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        if (data.ok) {
            mostrarMsg(usuario + ": " + (nuevoEstado === "ACTIVO" ? "activado" : "desactivado"), "ok");
            await cargarUsuarios();
        } else {
            mostrarMsg("Error: " + data.error, "err")
        }
    } catch (e) {
        mostrarMsg("Error de conexion", "err")
    }
}

// ── Init admin ──
export function initAdminMode() {}
