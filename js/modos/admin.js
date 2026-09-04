/* === MODO ADMIN: Detalle, inventario, usuarios === */
import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, mostrarValorInput, obtenerValorInput, debounce } from '../utils.js';
import { manejarRespuesta, renderSearchCard, confirmarEliminar,
         abrirModalImagen, cerrarModalImagen, guardarImagenProducto,
         abrirModalRol, cerrarModalRol, abrirModalPass, cerrarModalPass,
         confirmarResetPass } from '../ui.js';
import { listarProductos } from '../db.js';
import { iniciarEscanerCamara, detenerEscanerCamara } from '../escaner.js';
import { can } from '../authorization.js';

let busquedaTimer = null;
let _detalleSeq = 0;
let _verif = null;
let _sucursalesCache = [];
let _usuariosCache = [];
let _sucursalDetalleId = null;
let _rolesCache = [];
let _permisosCache = [];
let _asignacionesRol = [];
let _usuarioAccesoActual = null;
export function initAdmin(cb) {
    if (cb && cb.verificarEstadoCaja) _verif = cb.verificarEstadoCaja;
}

const ROL_LABELS = {
    ADMIN: "Admin",
    ENCARGADO: "Encargado",
    VENDEDOR: "Vendedor",
    ALMACEN: "Almacén",
    SOLO_LECTURA: "Solo lectura"
};

const escaparSucursal = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nombreSucursal = sucursal => sucursal.nombre_visible || sucursal.nombre;

function asegurarPanelSeguridad() {
    const seccion = document.getElementById("seccion-USUARIOS");
    if (seccion && !document.getElementById("panelPermisosRoles")) {
        const panel = document.createElement("div");
        panel.innerHTML = '<div class="divider"></div><div class="section-label">Permisos por rol</div><div id="panelPermisosRoles"></div>';
        seccion.appendChild(panel);
    }
    if (!document.getElementById("usuarioAccesoOverlay")) {
        document.body.insertAdjacentHTML("beforeend", `
          <div id="usuarioAccesoOverlay" class="modal-overlay" style="display:none">
            <div class="modal-content" style="max-width:760px;max-height:88vh;overflow:auto">
              <button class="modal-close" id="cerrarUsuarioAcceso">✕</button>
              <div class="modal-header">Acceso de <span id="usuarioAccesoNombre"></span></div>
              <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" id="usuarioAccesoGlobal"> Acceso global a todas las sucursales</label>
              <div class="section-label">Sucursales autorizadas</div>
              <div id="usuarioAccesoSucursales" class="row-2"></div>
              <div class="field-group mt-8"><label class="field-label">Sucursal principal</label><select id="usuarioAccesoPrincipal"><option value="">Sin principal</option></select></div>
              <div class="section-label">Excepciones individuales</div>
              <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Heredar usa el permiso del rol. Permitir o denegar prevalece sobre el rol.</div>
              <div id="usuarioAccesoPermisos"></div>
              <div class="loader" id="loaderUsuarioAcceso"></div>
              <div class="row-2 mt-8"><button class="btn btn-primary" id="guardarUsuarioAcceso">Guardar acceso</button><button class="btn btn-ghost" id="cancelarUsuarioAcceso">Cancelar</button></div>
            </div>
          </div>`);
        const cerrar = () => { document.getElementById("usuarioAccesoOverlay").style.display = "none"; _usuarioAccesoActual = null; };
        document.getElementById("cerrarUsuarioAcceso").addEventListener("click", cerrar);
        document.getElementById("cancelarUsuarioAcceso").addEventListener("click", cerrar);
        document.getElementById("usuarioAccesoOverlay").addEventListener("click", e => { if (e.target.id === "usuarioAccesoOverlay") cerrar(); });
        document.getElementById("guardarUsuarioAcceso").addEventListener("click", guardarAccesoUsuario);
        document.getElementById("usuarioAccesoGlobal").addEventListener("change", actualizarPrincipalAcceso);
    }
}

function permisosAgrupadosHtml(permisos, valorPorCodigo, editable = true) {
    const grupos = new Map();
    permisos.forEach(p => {
        if (!grupos.has(p.modulo)) grupos.set(p.modulo, []);
        grupos.get(p.modulo).push(p);
    });
    return [...grupos].map(([modulo, items]) => `<details><summary style="cursor:pointer;padding:8px 0"><strong>${escaparSucursal(modulo)}</strong> (${items.length})</summary>${items.map(p => {
        const valor = valorPorCodigo(p.codigo);
        return `<label style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:5px 0"><span>${escaparSucursal(p.descripcion)}${p.critico ? ' <b style="color:var(--red)">crítico</b>' : ''}</span>${editable === 'rol' ? `<input type="checkbox" data-permiso-rol="${escaparSucursal(p.codigo)}" ${valor ? 'checked' : ''}>` : `<select data-permiso-usuario="${escaparSucursal(p.codigo)}"><option value="" ${!valor ? 'selected' : ''}>Heredar</option><option value="ALLOW" ${valor === 'ALLOW' ? 'selected' : ''}>Permitir</option><option value="DENY" ${valor === 'DENY' ? 'selected' : ''}>Denegar</option></select>`}</label>`;
    }).join('')}</details>`).join('');
}

function renderPermisosRoles() {
    asegurarPanelSeguridad();
    const panel = document.getElementById("panelPermisosRoles");
    if (!panel) return;
    if (!can("usuarios.cambiar_permisos")) { panel.innerHTML = '<div class="empty-state">Sin permiso para modificar roles</div>'; return; }
    const activos = _rolesCache.filter(r => r.activo);
    panel.innerHTML = `${can("roles.crear") ? '<details style="margin-bottom:10px"><summary style="cursor:pointer">Crear rol personalizado</summary><div class="row-2 mt-8"><input id="nuevoRolCodigo" placeholder="Código, ej. SUPERVISOR"><input id="nuevoRolNombre" placeholder="Nombre visible"></div><input id="nuevoRolDescripcion" class="mt-8" placeholder="Descripción"><button class="btn btn-primary mt-8" id="crearRolBtn">Crear rol</button></details>' : ''}<div class="field-group"><label class="field-label">Rol</label><select id="rolPermisosSelect">${activos.map(r => `<option value="${escaparSucursal(r.codigo)}">${escaparSucursal(r.nombre)}</option>`).join('')}</select></div><div id="rolPermisosLista"></div><button class="btn btn-primary mt-8" id="guardarRolPermisos">Guardar permisos del rol</button>`;
    const render = () => {
        const rol = document.getElementById("rolPermisosSelect").value;
        const actuales = new Set(_asignacionesRol.filter(a => a.rol === rol).map(a => a.permiso));
        document.getElementById("rolPermisosLista").innerHTML = permisosAgrupadosHtml(_permisosCache.filter(p => p.activo), codigo => actuales.has(codigo), 'rol');
    };
    document.getElementById("rolPermisosSelect").addEventListener("change", render);
    document.getElementById("guardarRolPermisos").addEventListener("click", guardarPermisosRol);
    document.getElementById("crearRolBtn")?.addEventListener("click", crearRol);
    render();
}

async function crearRol() {
    const data = await api({
        ACCION: "CREAR_ROL",
        CODIGO: document.getElementById("nuevoRolCodigo").value,
        NOMBRE: document.getElementById("nuevoRolNombre").value,
        DESCRIPCION: document.getElementById("nuevoRolDescripcion").value,
        TOKEN: store.sessionToken,
    });
    if (!manejarRespuesta(data) || !data.ok) return;
    mostrarMsg("Rol creado; ahora asigna sus permisos", "ok");
    await cargarUsuarios();
    const select = document.getElementById("rolPermisosSelect");
    if (select) { select.value = data.rol.codigo; select.dispatchEvent(new Event("change")); }
}

async function guardarPermisosRol() {
    const rol = document.getElementById("rolPermisosSelect")?.value;
    const permisos = [...document.querySelectorAll("[data-permiso-rol]:checked")].map(el => el.dataset.permisoRol);
    const data = await api({ ACCION: "ACTUALIZAR_ROL_PERMISOS", ROL: rol, PERMISOS: permisos, TOKEN: store.sessionToken });
    if (!manejarRespuesta(data) || !data.ok) return;
    _asignacionesRol = _asignacionesRol.filter(a => a.rol !== rol).concat((data.permisos || []).map(permiso => ({ rol, permiso })));
    mostrarMsg("Permisos del rol actualizados", "ok");
    renderPermisosRoles();
}

function actualizarPrincipalAcceso() {
    const principal = document.getElementById("usuarioAccesoPrincipal");
    const marcadas = [...document.querySelectorAll("[data-sucursal-usuario]:checked")].map(el => el.value);
    principal.innerHTML = '<option value="">Sin principal</option>' + _sucursalesCache.filter(s => marcadas.includes(s.id)).map(s => `<option value="${escaparSucursal(s.id)}">${escaparSucursal(nombreSucursal(s))}</option>`).join('');
    if (_usuarioAccesoActual?.sucursal_principal_id && marcadas.includes(_usuarioAccesoActual.sucursal_principal_id)) principal.value = _usuarioAccesoActual.sucursal_principal_id;
}

function abrirAccesoUsuario(usuarioId) {
    asegurarPanelSeguridad();
    const usuario = _usuariosCache.find(u => String(u.id) === String(usuarioId));
    if (!usuario) return;
    _usuarioAccesoActual = usuario;
    document.getElementById("usuarioAccesoNombre").textContent = usuario.usuario;
    document.getElementById("usuarioAccesoGlobal").checked = Boolean(usuario.acceso_global_sucursales);
    document.getElementById("usuarioAccesoGlobal").disabled = !can("usuarios.asignar_roles_criticos");
    const asignadas = new Set((usuario.usuario_sucursales || []).map(s => String(s.sucursal_id)));
    document.getElementById("usuarioAccesoSucursales").innerHTML = _sucursalesCache.filter(s => s.estado === "ACTIVO").map(s => `<label style="display:flex;gap:7px;align-items:center"><input type="checkbox" data-sucursal-usuario value="${escaparSucursal(s.id)}" ${asignadas.has(String(s.id)) ? 'checked' : ''}> ${escaparSucursal(nombreSucursal(s))}</label>`).join('');
    document.querySelectorAll("[data-sucursal-usuario]").forEach(el => el.addEventListener("change", actualizarPrincipalAcceso));
    actualizarPrincipalAcceso();
    const excepciones = new Map((usuario.usuario_permisos || []).map(p => [p.permiso, p.efecto]));
    document.getElementById("usuarioAccesoPermisos").innerHTML = permisosAgrupadosHtml(_permisosCache.filter(p => p.activo), codigo => excepciones.get(codigo), true);
    document.getElementById("usuarioAccesoOverlay").style.display = "flex";
}

async function guardarAccesoUsuario() {
    if (!_usuarioAccesoActual) return;
    const loader = document.getElementById("loaderUsuarioAcceso");
    loader.style.display = "block";
    try {
        const excepciones = [...document.querySelectorAll("[data-permiso-usuario]")].filter(el => el.value).map(el => ({ permiso: el.dataset.permisoUsuario, efecto: el.value }));
        const permisos = await api({ ACCION: "ACTUALIZAR_PERMISOS_USUARIO", USUARIO_ID: _usuarioAccesoActual.id, EXCEPCIONES: excepciones, TOKEN: store.sessionToken });
        if (!manejarRespuesta(permisos) || !permisos.ok) return;
        const acceso = await api({ ACCION: "ACTUALIZAR_ACCESO_USUARIO", USUARIO_ID: _usuarioAccesoActual.id, SUCURSAL_IDS: [...document.querySelectorAll("[data-sucursal-usuario]:checked")].map(el => el.value), SUCURSAL_PRINCIPAL_ID: document.getElementById("usuarioAccesoPrincipal").value || null, ACCESO_GLOBAL_SUCURSALES: document.getElementById("usuarioAccesoGlobal").checked, TOKEN: store.sessionToken });
        if (!manejarRespuesta(acceso) || !acceso.ok) return;
        document.getElementById("usuarioAccesoOverlay").style.display = "none";
        mostrarMsg("Acceso del usuario actualizado", "ok");
        await cargarUsuarios();
    } finally { loader.style.display = "none"; }
}

function renderListaSucursales(sucursales) {
    const lista = document.getElementById("listaSucursales");
    if (!lista) return;
    if (!sucursales.length) {
        lista.innerHTML = '<div class="empty-state">Sin sucursales registradas</div>';
        return;
    }
    lista.innerHTML = "";
    sucursales.forEach(sucursal => {
        const card = document.createElement("div");
        card.className = "usuario-card";
        card.style.cursor = "pointer";
        card.innerHTML = '<div><div class="u-name">🏪 ' + escaparSucursal(nombreSucursal(sucursal)) + '</div><span style="font-size:11px;color:var(--muted)">Código: ' + escaparSucursal(sucursal.nombre) + '</span></div><span class="u-estado-' + (sucursal.estado === "ACTIVO" ? "ok" : "err") + '">● ' + escaparSucursal(sucursal.estado) + '</span>';
        card.addEventListener("click", () => abrirDetalleSucursal(sucursal.id));
        lista.appendChild(card);
    });
}

// ── buscarProductoDetalle ──
// Autocomplete rapido: consulta paginada server-side con debounce de 300ms
const _busquedaAcBuscar = debounce(async function(t, sucFiltro, l) {
    try {
        const { datos } = await listarProductos({ query: t, sucursal: sucFiltro || null, limite: 8 });
        l.innerHTML = "";
        if (datos.length > 0) {
            datos.forEach(p => {
                const div = document.createElement("div");
                div.className = "ac-item";
                div.innerHTML = `<strong>${p.producto}</strong><small>${p.sucursal} | Stock: ${p.stock}</small>`;
                div.addEventListener("click", () => {
                    document.getElementById("busquedaInput").value = p.producto;
                    l.classList.remove("show");
                    ejecutarBusquedaDetalle(p.producto)
                });
                l.appendChild(div)
            });
            l.classList.add("show")
        } else {
            l.classList.remove("show")
        }
    } catch (_) {}
}, 300);

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
    _busquedaAcBuscar(t, sucFiltro, l);
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
        const seq = ++_detalleSeq;
        const data = await api(body);
        if (seq !== _detalleSeq) return;
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return
        }
        var rs = data.datos || [];
        if (sucActual) rs = rs.filter(function(p) { return (p.sucursal || "").toUpperCase() === sucActual.toUpperCase(); });
        if (rs.length === 0) {
            co.innerHTML = `<div class="empty-state">Sin resultados para "<b style="color:var(--text)">${t}</b>"</div>`
        } else {
            const vistos = new Set();
            rs.forEach(p => {
                const k = (p.producto || "") + "_" + (p.sucursal || "");
                if (vistos.has(k)) return;
                vistos.add(k);
                co.appendChild(renderSearchCard(p))
            })
        }
    } catch (e) {
        co.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>`
    }
    loader.style.display = "none"
}

// ── cargarInventarioAdmin ──
// Paginado server-side: solo 20 cards por pagina (Fase 1/3)
const INV_PAGINA_TAM = 20;
let _invPagina = 1;
let _invTotal = 0;
let _invSeq = 0;
let _invTimer = null;

function _renderPaginacionInv() {
    const pdiv = document.getElementById("paginInv");
    if (!pdiv) return;
    const totalPaginas = Math.max(1, Math.ceil(_invTotal / INV_PAGINA_TAM));
    if (totalPaginas > 1) {
        pdiv.style.display = "flex";
        document.getElementById("paginInv-info").textContent = "Pág " + _invPagina + " de " + totalPaginas + " (" + _invTotal + " productos)";
        pdiv.querySelector("button:first-child").disabled = (_invPagina <= 1);
        pdiv.querySelector("button:last-child").disabled = (_invPagina >= totalPaginas);
    } else {
        pdiv.style.display = "none";
    }
}

export function cambiarPaginaInv(d) {
    const totalPaginas = Math.max(1, Math.ceil(_invTotal / INV_PAGINA_TAM));
    const nueva = Math.min(totalPaginas, Math.max(1, _invPagina + d));
    if (nueva !== _invPagina) cargarInventarioAdmin(nueva);
}

export function filtrarInventario() {
    clearTimeout(_invTimer);
    _invTimer = setTimeout(() => cargarInventarioAdmin(1), 300);
}

export async function cargarInventarioAdmin(pagina) {
    if (pagina === undefined) pagina = _invPagina;
    if (!store.sessionToken || !can("inventario.ver_costos")) {
        mostrarMsg("Sin permisos", "err");
        return
    }
    const loader = document.getElementById("loaderInvAdmin")
      , grid = document.getElementById("inventarioGrid")
      , filtroSuc = document.getElementById("filtroInvSucursal").value
      , filtroProd = document.getElementById("filtroInvProducto").value;
    loader.style.display = "block";
    grid.innerHTML = "";
    const seq = ++_invSeq;
    try {
        const { datos, total } = await listarProductos({
            query: filtroProd,
            sucursal: filtroSuc || null,
            pagina: pagina - 1,
            limite: INV_PAGINA_TAM
        });
        if (seq !== _invSeq) return;
        if (datos.length === 0 && pagina > 1 && total > 0) {
            // La pagina quedo vacia (p.ej. tras eliminar el ultimo producto): retroceder
            return cargarInventarioAdmin(pagina - 1);
        }
        _invPagina = pagina;
        _invTotal = total;
        if (datos.length === 0) {
            grid.innerHTML = `<div class="empty-state">Sin productos encontrados</div>`
        } else {
            datos.forEach(p => {
                const card = document.createElement("div");
                card.className = "inventario-card";
                card.style.cursor = "pointer";
                card.innerHTML = `<div class="inventario-img">${p.imagen ? `<img src="${p.imagen}" alt="${p.producto}">` : ``}</div>
                <div class="inventario-info">
                  <div class="nombre">${p.producto}</div>
                  <div class="detalle">Costo: Bs ${p.precioUnidad?.toFixed(2) || '—'}</div>
                  <div class="detalle">Venta: Bs ${p.precioVenta?.toFixed(2) || '—'}</div>
                  <div class="detalle">Stock: <b style="color:var(--accent-text)">${p.stock}</b></div>
                  <div class="detalle" style="color:var(--muted);font-size:10px">${p.sucursal}</div>
                </div>
                <div class="inventario-actions">
                  <button class="btn-xs btn-xs-edit" data-accion="imagen" data-producto="${p.producto}" data-sucursal="${p.sucursal}" data-imagen="${p.imagen || ''}">Imagen</button>
                  <button class="btn-xs btn-xs-del" data-accion="eliminar" data-id="${p.id}" data-producto="${p.producto}">Eliminar</button>
                </div>`;
                card.addEventListener("click", function(e) {
                    if (e.target.closest(".btn-xs")) return;
                    abrirEditarProducto(p);
                });
                var imgDiv = card.querySelector(".inventario-img");
                if (imgDiv && p.imagen) {
                    imgDiv.style.cursor = "zoom-in";
                    imgDiv.addEventListener("click", function(e) {
                        e.stopPropagation();
                        abrirZoomImagen(p.imagen);
                    });
                }
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
        _renderPaginacionInv();
    } catch (e) {
        grid.innerHTML = `<div style="color:var(--red);padding:10px">Error de conexion</div>`
    }
    loader.style.display = "none"
}

// Realtime: si cambia el inventario y el panel admin esta visible, refresca la pagina actual
let _invRTOtimer = null;
window.addEventListener("inventario:cambio", function() {
    if (store.modoActual !== "INVENTARIO") return;
    clearTimeout(_invRTOtimer);
    _invRTOtimer = setTimeout(() => cargarInventarioAdmin(), 500);
});

// ── cargarUsuarios ──
export async function cargarUsuarios() {
    if (!store.sessionToken) return;
    asegurarPanelSeguridad();
    const sucursales = await cargarSucursalesEnDropdowns();
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
        _usuariosCache = usuarios;
        const seguridad = await api({ ACCION: "LISTAR_ROLES_PERMISOS", TOKEN: store.sessionToken });
        if (seguridad.ok) {
            _rolesCache = seguridad.roles || [];
            _permisosCache = seguridad.permisos || [];
            _asignacionesRol = seguridad.asignaciones || [];
            Object.keys(ROL_LABELS).forEach(key => delete ROL_LABELS[key]);
            _rolesCache.forEach(rol => { ROL_LABELS[rol.codigo] = rol.nombre; });
            ["nuevoUsuarioRol", "modalRolNuevo"].forEach(idSelect => {
                const select = document.getElementById(idSelect);
                if (!select) return;
                const valor = select.value;
                select.innerHTML = _rolesCache.filter(rol => rol.activo).map(rol => `<option value="${escaparSucursal(rol.codigo)}">${escaparSucursal(rol.nombre)}</option>`).join('');
                if ([...select.options].some(op => op.value === valor)) select.value = valor;
            });
            renderPermisosRoles();
        }
        renderListaSucursales(sucursales);
        if (usuarios.length === 0) {
            lista.innerHTML = `<div class="empty-state">Sin usuarios encontrados</div>`
        } else {
            usuarios.forEach(u => {
                const card = document.createElement("div");
                card.className = "usuario-card";
                const esYo = u.usuario === store.sessionUser;
                const cantidadSucursales = u.acceso_global_sucursales ? "Todas" : String((u.usuario_sucursales || []).length);
                card.innerHTML = `<div><div class="u-name">${u.usuario}${esYo ? ' <span style="font-size:10px;color:var(--muted)">(tú)</span>' : ''}${u.protegido ? ' <span title="Cuenta protegida">🔒</span>' : ''}</div><span class="rol-pill rol-${u.rol}" style="margin-top:4px;display:inline-block">${ROL_LABELS[u.rol] || u.rol}</span><span class="u-estado-${u.estado === 'ACTIVO' ? 'ok' : 'err'}" style="margin-left:8px">${u.estado === 'ACTIVO' ? '● Activo' : '● Inactivo'}</span><span style="margin-left:8px;font-size:11px;color:var(--muted)">🏪 ${cantidadSucursales} · principal: ${u.sucursal || 'ninguna'}</span></div><div class="u-actions"><button class="btn-icon" data-accion="editar-rol" data-usuario="${u.usuario}" data-rol="${u.rol}" title="Cambiar rol">✏️</button><button class="btn-icon" data-accion="reset-pass" data-usuario="${u.usuario}" title="Resetear clave">🔑</button><button class="btn-icon" data-accion="editar-acceso" data-id="${u.id}" title="Sucursales y excepciones">🛡️</button>${!esYo ? `<button class="btn-icon danger" data-accion="toggle-estado" data-usuario="${u.usuario}" data-estado="${u.estado}" title="${u.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}">${u.estado === 'ACTIVO' ? '🚫' : '✅'}</button>` : ''}</div>`;
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
            lista.querySelectorAll('[data-accion="editar-acceso"]').forEach(btn => {
                btn.addEventListener("click", function() {
                    abrirAccesoUsuario(this.dataset.id);
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
      , rol = document.getElementById("nuevoUsuarioRol").value
      , sucursal = document.getElementById("nuevoUsuarioSucursal").value;
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
        const body = {
            ACCION: "CREAR_USUARIO",
            USUARIO: nombre,
            PASSWORD: pass,
            ROL: rol,
            TOKEN: store.sessionToken
        };
        if (sucursal) body.SUCURSAL = sucursal;
        const data = await api(body);
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return
        }
        if (data.ok) {
            mostrarMsg("Usuario " + data.usuario + " creado como " + (ROL_LABELS[data.rol] || data.rol) + (data.sucursal ? " en " + data.sucursal : ""), "ok");
            document.getElementById("nuevoUsuarioNombre").value = "";
            document.getElementById("nuevoUsuarioPass").value = "";
            document.getElementById("nuevoUsuarioRol").value = "VENDEDOR";
            document.getElementById("nuevoUsuarioSucursal").value = "";
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

// ── cambiarSucursalUsuario ──
let _cambiarSucursalTarget = null;

export function abrirCambiarSucursal(usuario, sucursalActual) {
    _cambiarSucursalTarget = usuario;
    const sel = document.getElementById("cambiarSucursalSelect");
    const overlay = document.getElementById("cambiarSucursalOverlay");
    document.getElementById("cambiarSucursalUsuario").textContent = usuario;
    sel.value = sucursalActual || "";
    overlay.style.display = "flex";
}

export function cerrarCambiarSucursal() {
    document.getElementById("cambiarSucursalOverlay").style.display = "none";
    _cambiarSucursalTarget = null;
}

export async function confirmarCambiarSucursal() {
    if (!_cambiarSucursalTarget || !store.sessionToken) return;
    const sucursal = document.getElementById("cambiarSucursalSelect").value;
    try {
        const data = await api({
            ACCION: "CAMBIAR_SUCURSAL_USUARIO",
            USUARIO: _cambiarSucursalTarget,
            SUCURSAL: sucursal || null,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        if (data.ok) {
            mostrarMsg(_cambiarSucursalTarget + ": sucursal " + (data.sucursal || "eliminada"), "ok");
            cerrarCambiarSucursal();
            await cargarUsuarios();
        } else {
            mostrarMsg("Error: " + data.error, "err")
        }
    } catch (e) {
        mostrarMsg("Error de conexion", "err")
    }
}

// ══ Editar producto (ubicación / proveedor) ══
var _productoEditando = null;

export function abrirEditarProducto(p) {
    _productoEditando = p;
    var ubicacion = p.ubicacion || "", proveedor = p.proveedor || "";
    document.getElementById("inventarioEditNombre").textContent = p.producto;
    document.getElementById("inventarioEditUbicacion").value = ubicacion;
    document.getElementById("inventarioEditProveedor").value = proveedor;
    mostrarValorInput(document.getElementById("inventarioEditPrecioVenta"), p.precioVenta);
    document.getElementById("inventarioEditCodigoBarras").value = p.codigoBarras || "";
    var imgDiv = document.getElementById("inventarioEditImg");
    if (p.imagen) {
        imgDiv.innerHTML = `<img src="${p.imagen}" alt="${p.producto}" loading="lazy">`;
        imgDiv.onclick = function(e) { e.stopPropagation(); abrirZoomImagen(p.imagen); };
    } else {
        imgDiv.innerHTML = `<div class="detalle-sin-img">Sin vista previa</div>`;
        imgDiv.onclick = null;
    }
    document.getElementById("inventarioEditOverlay").style.display = "flex";
}

export async function guardarEdicionProducto() {
    if (!_productoEditando || !store.sessionToken) return;
    var id = _productoEditando.id;
    var ubicacion = document.getElementById("inventarioEditUbicacion").value.trim();
    var proveedor = document.getElementById("inventarioEditProveedor").value.trim();
    var precioVenta = parseFloat(obtenerValorInput(document.getElementById("inventarioEditPrecioVenta")));
    var codigoBarras = document.getElementById("inventarioEditCodigoBarras").value.trim();
    try {
        var data = await api({
            ACCION: "ACTUALIZAR_PRODUCTO",
            ID: id,
            UBICACION: ubicacion,
            PROVEEDOR: proveedor,
            PRECIO_VENTA: isNaN(precioVenta) ? undefined : precioVenta,
            CODIGO_BARRAS: codigoBarras || undefined,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        if (data.ok) {
            mostrarMsg("✅ Producto actualizado", "ok");
            cerrarEditarProducto();
            cargarInventarioAdmin();
        } else {
            mostrarMsg("Error: " + (data.error || "desconocido"), "err");
        }
    } catch (e) {
        mostrarMsg("Error de conexion", "err");
    }
}

export function cerrarEditarProducto(e) {
    if (e && e.target !== document.getElementById("inventarioEditOverlay")) return;
    document.getElementById("inventarioEditOverlay").style.display = "none";
    _productoEditando = null;
}

export async function abrirEscanerInventarioEdit() {
    const modal = document.getElementById("escanerModal");
    const video = document.getElementById("escanerVideo");
    const estado = document.getElementById("escanerEstado");
    modal.style.display = "flex";
    estado.textContent = "Apuntando cámara...";
    try {
        const codigo = await iniciarEscanerCamara(video);
        document.getElementById("inventarioEditCodigoBarras").value = codigo;
    } catch(e) {
        if (e.message !== "NO_SOPORTADO") mostrarMsg("Error de cámara", "err");
    }
    detenerEscanerCamara();
    modal.style.display = "none";
}

export function abrirZoomImagen(url) {
    document.getElementById("imagenZoomImg").src = url;
    document.getElementById("imagenZoomOverlay").style.display = "flex";
}

export function cerrarZoomImagen() {
    document.getElementById("imagenZoomOverlay").style.display = "none";
}

// ── crearSucursal ──
export async function crearSucursal() {
    if (!store.sessionToken) {
        mostrarMsg("Sesion expirada", "err");
        return
    }
    const nombre = document.getElementById("nuevaSucursalNombre").value.trim().toUpperCase();
    const nombreVisible = document.getElementById("nuevaSucursalNombreVisible").value.trim() || nombre;
    if (!nombre || nombre.length < 2) {
        mostrarMsg("Ingresa un nombre valido (min. 2 caracteres)", "err");
        return
    }
    try {
        const data = await api({
            ACCION: "CREAR_SUCURSAL",
            NOMBRE: nombre,
            NOMBRE_VISIBLE: nombreVisible,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        if (data.ok) {
            mostrarMsg("Sucursal " + (data.nombreVisible || data.nombre) + " creada", "ok");
            document.getElementById("nuevaSucursalNombre").value = "";
            document.getElementById("nuevaSucursalNombreVisible").value = "";
            await cargarUsuarios();
            if (_verif) _verif();
        } else if (data.error === "SUCURSAL_DUPLICADA") {
            mostrarMsg("Esa sucursal ya existe", "err")
        } else if (data.error === "CODIGO_SUCURSAL_INVALIDO") {
            mostrarMsg("El código interno usa solo letras, números o guion bajo", "err")
        } else {
            mostrarMsg("Error: " + data.error, "err")
        }
    } catch (e) {
        mostrarMsg("Error de conexion", "err")
    }
}

// ── cargarSucursalesEnDropdowns ──
export async function cargarSucursalesEnDropdowns() {
    try {
        const data = await api({
            ACCION: "LISTAR_SUCURSALES",
            TOKEN: store.sessionToken
        });
        if (!data.ok) return [];
        const sucursales = data.datos || [];
        _sucursalesCache = sucursales;
        if (sucursales.length === 0) return sucursales;
        const selects = document.querySelectorAll("select[id$='Sucursal'], select[id*='Sucursal'], select#sucursalVenta, select#sucursalCompra, select#sucursalGasto");
        selects.forEach(function(sel) {
            if (sel.disabled) return;
            const actual = sel.value;
            while (sel.options.length > 0) sel.remove(0);
            if (sel.hasAttribute("data-opcional") || sel.querySelector("option") || true) {
                sel.add(new Option("🏪 Seleccionar sucursal", ""));
            }
            sucursales.forEach(function(s) {
                if (s.estado !== "ACTIVO") return;
                sel.add(new Option(nombreSucursal(s), s.nombre));
            });
            if (actual) {
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value === actual) { sel.value = actual; break; }
                }
            }
        });
        return sucursales;
    } catch (_) { return []; }
}

export function abrirDetalleSucursal(sucursalId) {
    const sucursal = _sucursalesCache.find(s => s.id === sucursalId);
    if (!sucursal) return;
    _sucursalDetalleId = sucursal.id;
    document.getElementById("sucursalDetalleNombre").textContent = nombreSucursal(sucursal);
    document.getElementById("sucursalDetalleEstado").value = sucursal.estado;
    let estadoBtn = document.getElementById("btnEstadoSucursal");
    if (!estadoBtn) {
        estadoBtn = document.createElement("button");
        estadoBtn.id = "btnEstadoSucursal";
        estadoBtn.className = "btn btn-ghost mt-8";
        document.getElementById("sucursalDetalleEstado").parentElement.appendChild(estadoBtn);
        estadoBtn.addEventListener("click", cambiarEstadoSucursal);
    }
    estadoBtn.style.display = can("sucursales.desactivar") ? "inline-block" : "none";
    estadoBtn.textContent = sucursal.estado === "ACTIVO" ? "Desactivar" : "Activar";
    document.getElementById("sucursalDetalleCodigo").value = sucursal.nombre || "";
    document.getElementById("sucursalDetalleNombreVisible").value = nombreSucursal(sucursal);
    document.getElementById("sucursalDetalleDireccion").value = sucursal.direccion || "";
    document.getElementById("sucursalDetalleTelefono").value = sucursal.telefono || "";
    document.getElementById("sucursalDetalleObservaciones").value = sucursal.observaciones || "";
    document.getElementById("sucursalDetalleCreada").textContent = sucursal.creado_en ? new Date(sucursal.creado_en).toLocaleString("es-BO") : "—";
    const encargado = document.getElementById("sucursalDetalleEncargado");
    encargado.innerHTML = '<option value="">Sin encargado asignado</option>';
    _usuariosCache.filter(u => u.estado === "ACTIVO" || u.usuario === sucursal.encargado_usuario).forEach(u => {
        encargado.add(new Option(u.usuario, u.usuario));
    });
    encargado.value = sucursal.encargado_usuario || "";
    editarSucursal(false);
    document.getElementById("sucursalDetalleOverlay").style.display = "flex";
}

async function cambiarEstadoSucursal() {
    const sucursal = _sucursalesCache.find(s => s.id === _sucursalDetalleId);
    if (!sucursal || !can("sucursales.desactivar")) return;
    const estado = sucursal.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    if (!confirm(`¿Cambiar ${nombreSucursal(sucursal)} a ${estado.toLowerCase()}?`)) return;
    const data = await api({ ACCION: "CAMBIAR_ESTADO_SUCURSAL", ID: sucursal.id, ESTADO: estado, TOKEN: store.sessionToken });
    if (!manejarRespuesta(data) || !data.ok) return;
    mostrarMsg("Estado de la sucursal actualizado", "ok");
    cerrarDetalleSucursal();
    await cargarUsuarios();
}

export function cerrarDetalleSucursal(e) {
    if (e && e.target !== document.getElementById("sucursalDetalleOverlay")) return;
    document.getElementById("sucursalDetalleOverlay").style.display = "none";
    _sucursalDetalleId = null;
}

export function editarSucursal(activo = true) {
    if (activo && !can("sucursales.editar")) return;
    ["sucursalDetalleNombreVisible", "sucursalDetalleDireccion", "sucursalDetalleTelefono"].forEach(id => {
        document.getElementById(id).readOnly = !activo;
    });
    ["sucursalDetalleEncargado", "sucursalDetalleObservaciones"].forEach(id => {
        document.getElementById(id).disabled = !activo;
    });
    document.getElementById("btnEditarSucursal").style.display = activo || !can("sucursales.editar") ? "none" : "inline-block";
    document.getElementById("btnGuardarSucursal").style.display = activo ? "inline-block" : "none";
}

export async function guardarSucursal() {
    if (!_sucursalDetalleId || !store.sessionToken) return;
    const nombreVisible = document.getElementById("sucursalDetalleNombreVisible").value.trim();
    if (nombreVisible.length < 2) return mostrarMsg("El nombre visible debe tener al menos 2 caracteres", "err");
    try {
        const data = await api({
            ACCION: "ACTUALIZAR_SUCURSAL",
            ID: _sucursalDetalleId,
            NOMBRE_VISIBLE: nombreVisible,
            DIRECCION: document.getElementById("sucursalDetalleDireccion").value.trim(),
            TELEFONO: document.getElementById("sucursalDetalleTelefono").value.trim(),
            ENCARGADO_USUARIO: document.getElementById("sucursalDetalleEncargado").value,
            OBSERVACIONES: document.getElementById("sucursalDetalleObservaciones").value.trim(),
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        if (!data.ok) return mostrarMsg("Error: " + data.error, "err");
        await cargarUsuarios();
        abrirDetalleSucursal(_sucursalDetalleId);
        if (_verif) _verif();
        mostrarMsg("Sucursal actualizada", "ok");
    } catch (_) {
        mostrarMsg("Error de conexión", "err");
    }
}

// ── Init admin ──
export function initAdminMode() {}
