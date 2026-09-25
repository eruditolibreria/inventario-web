import { api } from '../api.js';
import { can } from '../authorization.js';
import { store } from '../store.js';
import { construirAC } from '../inventario.js';
import { buscarSugerenciasVenta, listarProductos } from '../db.js';
import { debounce, normBusqueda } from '../utils.js';
import { nombreSucursalVisible } from '../sucursales.js';
import { comprimirImagen } from '../ui.js';
import { normalizarUrlPublica } from '../config.js';

let inicializado = false;
let premios = [];
let noticias = [];
let productoPremioSeleccionado = null;
let productoBusquedaSecuencia = 0;
let productoBusquedaControl = null;
let canjeEntregaId = null;
let canjeObjetivo = null;

const $ = (id) => document.getElementById(id);
const esc = (valor) => String(valor ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const fecha = (valor) => valor ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor)) : '—';

function renderEstructura() {
    const root = $('clubRoot');
    if (!root || root.childElementCount) return;
    root.innerHTML = `
      <div class="club-heading"><div><div class="section-label">Club Eruditos</div><p class="muted">Fidelización, premios y canjes conectados al inventario.</p></div><button id="clubActualizar" class="btn btn-ghost" type="button">Actualizar</button></div>
      <div class="club-metrics"><article><span>Cuentas</span><strong id="clubCuentas">0</strong></article><article><span>Canjes pendientes</span><strong id="clubCanjesPendientes">0</strong></article><article><span>Puntos disponibles</span><strong id="clubPuntosDisponibles">0</strong></article><article><span>Puntos pendientes</span><strong id="clubPuntosPendientes">0</strong></article></div>
      <div id="clubEstado" class="muted" aria-live="polite"></div>
      <div class="club-admin-grid">
        <form id="clubConfigForm" class="club-panel"><h3>Configuración</h3><div class="row-2"><div class="field-group"><label class="field-label">Bolivianos por punto</label><input id="clubMontoPunto" type="number" min="0.01" step="0.01" required></div><div class="field-group"><label class="field-label">Vigencia (meses)</label><input id="clubVigencia" type="number" min="1" max="120" required></div></div><div class="field-group"><label class="field-label">Puntos de bienvenida</label><input id="clubBienvenida" type="number" min="0" step="1" required></div><div class="field-group"><label class="field-label">Términos visibles</label><textarea id="clubTerminos" rows="3" placeholder="Ej.: Se obtiene 1 punto por cada Bs 5 pagados. Los puntos vencen a los 12 meses y no pueden cambiarse por dinero."></textarea><small>Estas condiciones se mostrarán al cliente en el portal.</small></div><label class="check-row"><input id="clubActivo" type="checkbox"> Programa activo</label><div class="row-2 mt-8"><button class="btn btn-primary" type="submit">Guardar configuración</button><button id="clubExpirar" class="btn btn-ghost" type="button">Procesar vencimientos</button></div></form>
        <form id="clubPremioForm" class="club-panel"><h3>Premio</h3><input id="clubPremioId" type="hidden"><div class="row-2"><div class="field-group"><label class="field-label">Nombre visible del premio</label><input id="clubPremioNombre" placeholder="Ej.: Cuaderno universitario" required><small>Es el título que verá el cliente en el catálogo.</small></div><div class="field-group"><label class="field-label">Código interno</label><input id="clubPremioCodigo" placeholder="Automático"><small>Sirve para identificarlo dentro del sistema.</small></div></div><div class="row-2"><div class="field-group"><label class="field-label">Costo en puntos</label><input id="clubPremioCosto" type="number" min="1" required></div><div class="field-group"><label class="field-label">Control de stock</label><select id="clubPremioTipo"><option value="EXTERNO">Stock fuera de Inventario</option><option value="INVENTARIO">Producto de Inventario</option></select></div></div><div class="field-group"><label class="field-label">Stock disponible para canjes</label><input id="clubPremioStock" type="number" min="1" step="1" value="1" required><small>Es la cantidad máxima que ofrecerás en el Club, aunque Inventario tenga más unidades.</small></div><div id="clubPremioProductoCampo" class="field-group oculto"><label class="field-label">Producto de inventario</label><input id="clubPremioProducto" placeholder="Escribe para buscar y elige una sugerencia" autocomplete="off"><div id="clubPremioProductoLista" class="autocomplete"></div><small id="clubPremioProductoInfo">Cada canje descuenta una unidad del cupo Club y una del Inventario.</small></div><div class="field-group"><label class="field-label">Descripción para el cliente</label><textarea id="clubPremioDescripcion" rows="2" placeholder="Ej.: Cuaderno de 100 hojas. Sujeto a disponibilidad de color."></textarea><small>Explica qué recibe el cliente y cualquier condición importante.</small></div><div class="field-group"><label class="field-label">Sucursales</label><div id="clubPremioSucursales" class="club-checks"></div></div><label class="check-row"><input id="clubPremioActivo" type="checkbox" checked> Premio activo</label><div class="row-2 mt-8"><button class="btn btn-primary" type="submit">Guardar premio</button><button id="clubLimpiarPremio" class="btn btn-ghost" type="button">Nuevo</button></div></form>
      </div>
      <div id="clubCatalogoPanel" class="club-panel"><h3>Catálogo de premios</h3><div id="clubPremiosLista"></div></div>
      <div id="clubCanjesPanel" class="club-panel"><div class="club-heading"><h3>Canjes</h3><select id="clubFiltroCanjes"><option value="">Todos</option><option value="SOLICITADO">Solicitados</option><option value="PREPARANDO">Preparando</option><option value="LISTO">Listos</option><option value="ENTREGADO">Entregados</option><option value="CANCELADO">Cancelados</option></select></div><div id="clubCanjesLista"></div></div>
      <dialog id="clubEntregaDialog" class="club-entrega-dialog"><form method="dialog"><h3>Confirmar entrega</h3><p class="muted">Introduce el código de 4 caracteres que muestra el cliente.</p><input id="clubCodigoRetiro" maxlength="4" inputmode="text" autocomplete="one-time-code" aria-label="Código de retiro"><div id="clubCodigoRetiroError" class="club-codigo-error" aria-live="polite"></div><div class="row-2 mt-8"><button id="clubCerrarEntrega" class="btn btn-ghost" value="cancel">Cancelar</button><button id="clubConfirmarEntrega" class="btn btn-primary" type="button">Entregar</button></div></form></dialog>`;
    $('clubPremioProductoCampo').insertAdjacentHTML('afterend', `<div id="clubPremioImagenCampo" class="field-group"><label class="field-label">Imagen para el portal</label><div style="display:flex;align-items:center;gap:12px"><div style="display:grid;place-items:center;width:92px;height:92px;overflow:hidden;border:1px solid var(--border);border-radius:14px;background:var(--surface2)"><img id="clubPremioImagenPreview" alt="Vista previa del premio" hidden style="width:100%;height:100%;object-fit:cover"><span id="clubPremioImagenVacia" class="muted">Sin imagen</span></div><div id="clubPremioImagenAcciones" style="display:grid;gap:8px;flex:1"><div class="row-2"><button id="clubPremioTomarFoto" class="btn btn-ghost btn-sm" type="button">Tomar foto</button><button id="clubPremioElegirImagen" class="btn btn-ghost btn-sm" type="button">Elegir de galería</button></div><small>Disponible para premios que no pertenecen al inventario.</small></div></div><input id="clubPremioImagenUrl" type="hidden"><input id="clubPremioImagenCamara" type="file" accept="image/*" capture="environment" hidden><input id="clubPremioImagenGaleria" type="file" accept="image/*" hidden><small id="clubPremioImagenEstado">La imagen aparecerá en el portal del cliente.</small></div>`);
    root.querySelector('.club-admin-grid').insertAdjacentHTML('afterend', `<div id="clubNoticiasPanel" class="club-panel"><div class="club-heading"><div><h3>Noticias del portal</h3><p class="muted">Publicaciones visibles para todos los clientes del Club.</p></div></div><form id="clubNoticiaForm"><input id="clubNoticiaId" type="hidden"><div class="field-group"><label class="field-label">Título</label><input id="clubNoticiaTitulo" maxlength="120" placeholder="Ej.: Semana del libro" required></div><div class="field-group"><label class="field-label">Mensaje</label><textarea id="clubNoticiaMensaje" maxlength="2000" rows="3" placeholder="Escribe la noticia que aparecerá en el portal." required></textarea></div><label class="check-row"><input id="clubNoticiaPublicada" type="checkbox" checked> Publicar inmediatamente</label><div class="row-2 mt-8"><button class="btn btn-primary" type="submit">Guardar noticia</button><button id="clubLimpiarNoticia" class="btn btn-ghost" type="button">Nueva</button></div></form><div id="clubNoticiasLista" class="mt-8"></div></div>`);
    prepararPanelPlegable('clubConfigForm', 'Configuración');
    prepararPanelPlegable('clubPremioForm', 'Premios');
    prepararPanelPlegable('clubNoticiasPanel', 'Noticias del portal');
    prepararPanelPlegable('clubCatalogoPanel', 'Catálogo de premios');
    prepararPanelPlegable('clubCanjesPanel', 'Canjes');
}

function prepararPanelPlegable(id, titulo) {
    const panel = $(id);
    if (!panel || panel.dataset.plegable) return;
    panel.dataset.plegable = 'true';
    panel.querySelector('h3')?.remove();
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-ghost club-panel-toggle';
    boton.style.cssText = 'width:100%;display:flex;justify-content:space-between';
    boton.setAttribute('aria-expanded', 'false');
    boton.innerHTML = `<span>${esc(titulo)}</span><span aria-hidden="true">⌄</span>`;
    boton.addEventListener('click', () => alternarPanel(panel));
    panel.prepend(boton);
    panel.classList.add('club-panel-contraido');
    [...panel.children].forEach(hijo => { if (hijo !== boton) hijo.hidden = true; });
}

function alternarPanel(panel, abierto) {
    if (!panel) return;
    const expandir = abierto ?? panel.classList.contains('club-panel-contraido');
    panel.classList.toggle('club-panel-contraido', !expandir);
    const boton = panel.querySelector(':scope > .club-panel-toggle');
    boton?.setAttribute('aria-expanded', String(expandir));
    [...panel.children].forEach(hijo => { if (hijo !== boton) hijo.hidden = !expandir; });
}

function estado(texto, error = false) {
    const el = $('clubEstado');
    if (!el) return;
    el.textContent = texto || '';
    el.style.color = error ? 'var(--red)' : 'var(--muted)';
}

function sucursalesDisponibles() {
    const filas = (store.sessionSucursales || []).filter(s => s.estado !== 'INACTIVO');
    if (filas.length) return filas.map(s => ({ id: s.id, codigo: s.nombre, nombre: s.nombreVisible || s.nombre_visible || s.nombre || s.id }));
    return store.sessionSucursal ? [{ id: store.sessionSucursal, codigo: store.sessionSucursal, nombre: nombreSucursalVisible(store.sessionSucursal) }] : [];
}

function renderSucursales() {
    const cont = $('clubPremioSucursales');
    if (!cont) return;
    cont.innerHTML = sucursalesDisponibles().map(s => `<label class="check-row"><input type="checkbox" value="${esc(s.id)}" data-sucursal-codigo="${esc(s.codigo)}"> ${esc(s.nombre)}</label>`).join('') || '<span class="muted">No hay sucursales asignadas.</span>';
}

function renderResumen(data) {
    $('clubCuentas').textContent = Number(data.cuentas || 0).toLocaleString('es-BO');
    $('clubCanjesPendientes').textContent = Number(data.canjesPendientes || 0).toLocaleString('es-BO');
    $('clubPuntosDisponibles').textContent = Number(data.disponibles || 0).toLocaleString('es-BO');
    $('clubPuntosPendientes').textContent = Number(data.pendientes || 0).toLocaleString('es-BO');
    const p = data.programa || {};
    $('clubMontoPunto').value = p.monto_por_punto ?? 5;
    $('clubVigencia').value = p.vigencia_meses ?? 12;
    $('clubBienvenida').value = p.puntos_bienvenida ?? 0;
    $('clubTerminos').value = p.terminos || '';
    $('clubActivo').checked = p.activo !== false;
}

function renderPremios() {
    const cont = $('clubPremiosLista');
    if (!cont) return;
    if (!premios.length) {
        cont.innerHTML = '<div class="empty-state">Aún no hay premios configurados.</div>';
        return;
    }
    cont.innerHTML = premios.map(p => {
        const sucursales = (p.club_premios_sucursales || []).map(s => s.sucursal_nombre || nombreSucursalVisible(s.sucursal_id)).join(', ');
        const advertencia = p.requiere_configuracion ? '<span class="club-config-warning">Requiere volver a elegir el producto</span>' : '';
        const imagen = normalizarUrlPublica(p.imagen_url);
        return `<article class="club-list-card">
            <div style="display:flex;gap:10px;align-items:center">${imagen ? `<img src="${esc(imagen)}" alt="${esc(p.nombre)}" loading="lazy" style="width:58px;height:58px;object-fit:cover;border-radius:10px">` : ''}<div><strong>${esc(p.nombre)}</strong><div class="muted">${esc(p.descripcion || 'Sin descripción')}</div><small>${esc(sucursales || 'Sin sucursal')}</small>${advertencia}</div></div>
            <div class="club-list-actions"><strong>${Number(p.costo_puntos).toLocaleString('es-BO')} pts</strong><span class="rol-pill">Stock: ${Number(p.stock_disponible || 0)}</span><span class="rol-pill">${p.tipo_stock === 'INVENTARIO' ? 'INVENTARIO' : 'FUERA DE INVENTARIO'}</span>${can('club.gestionar_premios') ? `<button class="btn btn-ghost btn-sm" data-club-editar-premio="${p.id}">Editar</button>` : ''}</div>
        </article>`;
    }).join('');
    cont.querySelectorAll('[data-club-editar-premio]').forEach(btn => btn.addEventListener('click', () => editarPremio(Number(btn.dataset.clubEditarPremio))));
}

function renderNoticias() {
    const cont = $('clubNoticiasLista');
    if (!cont) return;
    cont.innerHTML = noticias.length ? noticias.map(noticia => `<article class="club-list-card"><div><strong>${esc(noticia.titulo)}</strong><div class="muted">${esc(noticia.mensaje)}</div><small>${fecha(noticia.publicada_en || noticia.creado_en)}</small></div><div class="club-list-actions"><span class="rol-pill">${noticia.publicada ? 'PUBLICADA' : 'BORRADOR'}</span><button class="btn btn-ghost btn-sm" type="button" data-club-editar-noticia="${noticia.id}">Editar</button></div></article>`).join('') : '<div class="empty-state">Aún no hay noticias creadas.</div>';
    cont.querySelectorAll('[data-club-editar-noticia]').forEach(btn => btn.addEventListener('click', () => editarNoticia(Number(btn.dataset.clubEditarNoticia))));
}

function clienteCanje(canje) {
    const cuenta = Array.isArray(canje.club_cuentas) ? canje.club_cuentas[0] : canje.club_cuentas;
    const cliente = Array.isArray(cuenta?.clientes) ? cuenta.clientes[0] : cuenta?.clientes;
    return cliente || {};
}

function premioCanje(canje) {
    return Array.isArray(canje.club_premios) ? canje.club_premios[0] : canje.club_premios || {};
}

function renderCanjes(datos) {
    const cont = $('clubCanjesLista');
    if (!cont) return;
    if (!datos.length) {
        cont.innerHTML = '<div class="empty-state">No hay canjes para este filtro.</div>';
        return;
    }
    cont.innerHTML = datos.map(c => {
        const cliente = clienteCanje(c);
        const premio = premioCanje(c);
        const acciones = ['SOLICITADO', 'PREPARANDO', 'LISTO'].includes(c.estado) && can('club.entregar_canjes')
          ? `<select data-club-estado="${c.id}"><option value="">Cambiar estado…</option>${c.estado === 'SOLICITADO' ? '<option value="PREPARANDO">Preparando</option>' : ''}${['SOLICITADO','PREPARANDO'].includes(c.estado) ? '<option value="LISTO">Listo</option>' : ''}${c.estado === 'LISTO' ? '<option value="ENTREGADO">Entregado</option>' : ''}</select>` : '';
        const cancelar = ['SOLICITADO', 'PREPARANDO', 'LISTO'].includes(c.estado) && can('club.cancelar_canjes') ? `<button class="btn btn-ghost btn-sm" data-club-cancelar="${c.id}">Cancelar</button>` : '';
        return `<article class="club-list-card" data-club-canje="${c.id}">
            <div><strong>#${c.id} · ${esc(premio.nombre || 'Premio')}</strong><div>${esc(cliente.nombre || 'Cliente')} · ${esc(cliente.codigo_cliente || '')}</div><small>${fecha(c.solicitado_en)} · ${esc(c.sucursal_nombre || nombreSucursalVisible(c.sucursal_id))}</small></div>
            <div class="club-list-actions"><span class="rol-pill">${esc(c.estado)}</span><strong>${Number(c.puntos_total).toLocaleString('es-BO')} pts</strong>${acciones}${cancelar}</div>
        </article>`;
    }).join('');
    cont.querySelectorAll('[data-club-estado]').forEach(sel => sel.addEventListener('change', async () => {
        if (!sel.value) return;
        if (sel.value === 'ENTREGADO') {
            abrirEntrega(Number(sel.dataset.clubEstado));
            sel.value = '';
            return;
        }
        estado('Actualizando canje…');
        const data = await api({ ACCION: 'CLUB_ACTUALIZAR_CANJE', CANJE_ID: Number(sel.dataset.clubEstado), ESTADO: sel.value });
        estado(data.ok ? 'Canje actualizado.' : (data.error || 'No se pudo actualizar.'), !data.ok);
        if (data.ok) await cargarCanjes();
    }));
    cont.querySelectorAll('[data-club-cancelar]').forEach(btn => btn.addEventListener('click', async () => {
        const motivo = window.prompt('Motivo de la cancelación:');
        if (!motivo?.trim()) return;
        estado('Cancelando canje…');
        const data = await api({ ACCION: 'CLUB_CANCELAR_CANJE', CANJE_ID: Number(btn.dataset.clubCancelar), MOTIVO: motivo.trim() });
        estado(data.ok ? 'Canje cancelado y puntos devueltos.' : (data.error || 'No se pudo cancelar.'), !data.ok);
        if (data.ok) await cargarCanjes();
    }));
    if (canjeObjetivo) {
        const objetivo = cont.querySelector(`[data-club-canje="${canjeObjetivo}"]`);
        if (objetivo) {
            objetivo.classList.add('club-canje-destacado');
            objetivo.scrollIntoView({ behavior: 'smooth', block: 'center' });
            canjeObjetivo = null;
        }
    }
}

function mensajeEntrega(error) {
    return ({
        CODIGO_RETIRO_INVALIDO: 'El código de retiro es incorrecto. Verifícalo con el cliente e intenta nuevamente.',
        CODIGO_RETIRO_FORMATO: 'El código debe tener exactamente 4 caracteres.',
        CODIGO_RETIRO_VENCIDO: 'El código de retiro venció. Cancela el canje o solicita asistencia administrativa.',
    })[error] || error || 'No se pudo completar la entrega.';
}

function abrirEntrega(canjeId) {
    canjeEntregaId = canjeId;
    $('clubCodigoRetiro').value = '';
    $('clubCodigoRetiroError').textContent = '';
    $('clubEntregaDialog').showModal();
    setTimeout(() => $('clubCodigoRetiro').focus(), 0);
}

async function confirmarEntrega() {
    const input = $('clubCodigoRetiro');
    const codigo = input.value.trim().toUpperCase();
    input.value = codigo;
    if (!/^[A-Z0-9]{4}$/.test(codigo)) {
        $('clubCodigoRetiroError').textContent = mensajeEntrega('CODIGO_RETIRO_FORMATO');
        input.focus();
        return;
    }
    $('clubConfirmarEntrega').disabled = true;
    const data = await api({ ACCION: 'CLUB_ACTUALIZAR_CANJE', CANJE_ID: canjeEntregaId, ESTADO: 'ENTREGADO', CODIGO_RETIRO: codigo });
    $('clubConfirmarEntrega').disabled = false;
    if (!data.ok) {
        $('clubCodigoRetiroError').textContent = mensajeEntrega(data.error);
        input.select();
        return;
    }
    $('clubEntregaDialog').close();
    estado('Canje entregado correctamente.');
    await cargarCanjes();
}

async function cargarResumen() {
    const data = await api({ ACCION: 'CLUB_RESUMEN' });
    if (!data.ok) throw new Error(data.error || 'No se pudo cargar el resumen');
    renderResumen(data);
}

async function cargarPremios() {
    const data = await api({ ACCION: 'CLUB_LISTAR_PREMIOS' });
    if (!data.ok) throw new Error(data.error || 'No se pudieron cargar los premios');
    premios = data.datos || [];
    renderPremios();
}

async function cargarNoticias() {
    if (!can('club.configurar')) return;
    const data = await api({ ACCION: 'CLUB_LISTAR_NOTICIAS' });
    if (!data.ok) throw new Error(data.error || 'No se pudieron cargar las noticias');
    noticias = data.datos || [];
    renderNoticias();
}

async function cargarCanjes() {
    if (!can('club.ver_canjes')) {
        $('clubCanjesLista').innerHTML = '<div class="empty-state">Tu rol no gestiona canjes.</div>';
        return;
    }
    const data = await api({ ACCION: 'CLUB_LISTAR_CANJES', ESTADO: $('clubFiltroCanjes')?.value || undefined });
    if (!data.ok) throw new Error(data.error || 'No se pudieron cargar los canjes');
    renderCanjes(data.datos || []);
}

async function guardarConfiguracion(event) {
    event.preventDefault();
    estado('Guardando configuración…');
    const data = await api({
        ACCION: 'CLUB_ACTUALIZAR_CONFIG', MONTO_POR_PUNTO: Number($('clubMontoPunto').value),
        VIGENCIA_MESES: Number($('clubVigencia').value), PUNTOS_BIENVENIDA: Number($('clubBienvenida').value),
        TERMINOS: $('clubTerminos').value, ACTIVO: $('clubActivo').checked,
    });
    estado(data.ok ? 'Configuración guardada.' : (data.error || 'No se pudo guardar.'), !data.ok);
    if (data.ok) await cargarResumen();
}

async function expirarPuntos() {
    estado('Procesando puntos vencidos…');
    const data = await api({ ACCION: 'CLUB_EXPIRAR_PUNTOS' });
    estado(data.ok ? `${Number(data.lotesProcesados || 0)} lote(s) vencido(s) procesado(s).` : (data.error || 'No se pudo procesar.'), !data.ok);
    if (data.ok) await cargarResumen();
}

function limpiarNoticia() {
    $('clubNoticiaId').value = '';
    $('clubNoticiaTitulo').value = '';
    $('clubNoticiaMensaje').value = '';
    $('clubNoticiaPublicada').checked = true;
}

function editarNoticia(id) {
    const noticia = noticias.find(item => item.id === id);
    if (!noticia) return;
    $('clubNoticiaId').value = noticia.id;
    $('clubNoticiaTitulo').value = noticia.titulo || '';
    $('clubNoticiaMensaje').value = noticia.mensaje || '';
    $('clubNoticiaPublicada').checked = noticia.publicada !== false;
    alternarPanel($('clubNoticiasPanel'), true);
    $('clubNoticiaTitulo').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function guardarNoticia(event) {
    event.preventDefault();
    estado('Guardando noticia…');
    const data = await api({
        ACCION: 'CLUB_GUARDAR_NOTICIA',
        ID: Number($('clubNoticiaId').value) || undefined,
        TITULO: $('clubNoticiaTitulo').value,
        MENSAJE: $('clubNoticiaMensaje').value,
        PUBLICADA: $('clubNoticiaPublicada').checked,
    });
    estado(data.ok ? 'Noticia guardada.' : (data.error || 'No se pudo guardar la noticia.'), !data.ok);
    if (data.ok) { limpiarNoticia(); await cargarNoticias(); }
}

function limpiarPremio() {
    $('clubPremioId').value = '';
    $('clubPremioNombre').value = '';
    $('clubPremioCodigo').value = '';
    $('clubPremioCosto').value = '';
    $('clubPremioDescripcion').value = '';
    $('clubPremioTipo').value = 'EXTERNO';
    $('clubPremioStock').value = '1';
    $('clubPremioProducto').value = '';
    $('clubPremioImagenUrl').value = '';
    productoPremioSeleccionado = null;
    $('clubPremioActivo').checked = true;
    $('clubPremioSucursales').querySelectorAll('input').forEach(i => { i.checked = false; });
    actualizarTipoStock();
    renderImagenPremio('', 'La imagen aparecerá en el portal del cliente.');
}

function editarPremio(id) {
    const p = premios.find(item => item.id === id);
    if (!p) return;
    $('clubPremioId').value = p.id;
    $('clubPremioNombre').value = p.nombre || '';
    $('clubPremioCodigo').value = p.codigo || '';
    $('clubPremioCosto').value = p.costo_puntos || '';
    $('clubPremioDescripcion').value = p.descripcion || '';
    $('clubPremioTipo').value = p.tipo_stock === 'INVENTARIO' ? 'INVENTARIO' : 'EXTERNO';
    $('clubPremioStock').value = Number(p.stock_disponible || 0);
    $('clubPremioProducto').value = p.producto || '';
    $('clubPremioImagenUrl').value = p.imagen_url || '';
    const inventarios = (p.club_premios_sucursales || []).flatMap(s => {
        const inventario = Array.isArray(s.inventario) ? s.inventario[0] : s.inventario;
        return inventario ? [{ ...inventario, sucursalId: s.sucursal_id }] : [];
    });
    productoPremioSeleccionado = p.producto ? { producto: p.producto, inventarios } : null;
    $('clubPremioActivo').checked = p.activo !== false;
    const seleccionadas = new Set((p.club_premios_sucursales || []).map(s => String(s.sucursal_id)));
    $('clubPremioSucursales').querySelectorAll('input').forEach(i => { i.checked = seleccionadas.has(i.value); });
    actualizarTipoStock();
    $('clubPremioImagenUrl').value = p.imagen_url || '';
    actualizarSucursalesProducto();
    if (p.tipo_stock === 'INVENTARIO') actualizarImagenPremioDesdeInventario(true);
    else renderImagenPremio(p.imagen_url || '', p.imagen_url ? 'Imagen actual del premio.' : 'Puedes tomar una foto o elegirla de la galería.');
    alternarPanel($('clubPremioForm'), true);
    $('clubPremioNombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function guardarPremio(event) {
    event.preventDefault();
    const seleccionadas = [...$('clubPremioSucursales').querySelectorAll('input:checked')];
    const usaInventario = $('clubPremioTipo').value === 'INVENTARIO';
    const stockClub = Number($('clubPremioStock').value);
    if (!Number.isSafeInteger(stockClub) || stockClub <= 0) {
        estado('Indica una cantidad de stock mayor a cero.', true);
        $('clubPremioStock').focus();
        return;
    }
    if (usaInventario && (!productoPremioSeleccionado || productoPremioSeleccionado.producto !== $('clubPremioProducto').value.trim())) {
        estado('Busca y elige un producto de las sugerencias.', true);
        $('clubPremioProducto').focus();
        return;
    }
    const asignaciones = seleccionadas.map(input => {
        const inventario = usaInventario ? (productoPremioSeleccionado.inventarios || []).find(item =>
            String(item.sucursalId || '') === input.value || normBusqueda(item.sucursal) === normBusqueda(input.dataset.sucursalCodigo)
        ) : null;
        return { sucursalId: input.value, inventarioId: inventario?.id || null };
    });
    if (!asignaciones.length || (usaInventario && asignaciones.some(item => !item.inventarioId))) {
        estado('Selecciona al menos una sucursal donde exista el producto elegido.', true);
        return;
    }
    if (usaInventario) {
        const ids = new Set(asignaciones.map(item => item.inventarioId));
        const stockInventario = (productoPremioSeleccionado.inventarios || []).filter(item => ids.has(item.id)).reduce((total, item) => total + Number(item.stock || 0), 0);
        if (stockClub > stockInventario) {
            estado(`El cupo Club no puede superar las ${stockInventario} unidades disponibles en Inventario.`, true);
            return;
        }
    }
    estado('Guardando premio…');
    const data = await api({
        ACCION: 'CLUB_GUARDAR_PREMIO', ID: Number($('clubPremioId').value) || undefined,
        NOMBRE: $('clubPremioNombre').value, CODIGO: $('clubPremioCodigo').value,
        COSTO_PUNTOS: Number($('clubPremioCosto').value), DESCRIPCION: $('clubPremioDescripcion').value,
        TIPO_STOCK: $('clubPremioTipo').value,
        STOCK: stockClub,
        IMAGEN_URL: $('clubPremioImagenUrl').value,
        ASIGNACIONES: asignaciones, ACTIVO: $('clubPremioActivo').checked,
    });
    estado(data.ok ? 'Premio guardado.' : (data.error || 'No se pudo guardar.'), !data.ok);
    if (data.ok) { limpiarPremio(); await cargarPremios(); }
}

function actualizarTipoStock() {
    const usaInventario = $('clubPremioTipo')?.value === 'INVENTARIO';
    $('clubPremioProductoCampo')?.classList.toggle('oculto', !usaInventario);
    $('clubPremioImagenAcciones')?.classList.toggle('oculto', usaInventario);
    if ($('clubPremioProducto')) $('clubPremioProducto').required = usaInventario;
    if (!usaInventario) {
        $('clubPremioProductoLista')?.classList.remove('show');
        productoBusquedaControl?.abort();
    }
    if (usaInventario) actualizarImagenPremioDesdeInventario(false);
    else renderImagenPremio($('clubPremioImagenUrl')?.value || '', $('clubPremioImagenUrl')?.value ? 'Imagen actual del premio.' : 'Puedes tomar una foto o elegirla de la galería.');
    actualizarSucursalesProducto();
}

function renderImagenPremio(url, mensaje) {
    url = normalizarUrlPublica(url);
    const preview = $('clubPremioImagenPreview');
    const vacia = $('clubPremioImagenVacia');
    if (!preview || !vacia) return;
    preview.hidden = !url;
    vacia.hidden = Boolean(url);
    preview.onerror = () => {
        preview.hidden = true;
        vacia.hidden = false;
        $('clubPremioImagenEstado').textContent = 'No se pudo abrir la imagen guardada.';
    };
    if (url) preview.src = url;
    else preview.removeAttribute('src');
    $('clubPremioImagenEstado').textContent = mensaje;
}

function actualizarImagenPremioDesdeInventario(conservarActual) {
    const inventarios = productoPremioSeleccionado?.inventarios || [];
    const imagenInventario = inventarios.find(item => String(item.imagen || '').trim())?.imagen || '';
    const url = imagenInventario || (conservarActual ? $('clubPremioImagenUrl')?.value || '' : '');
    if ($('clubPremioImagenUrl')) $('clubPremioImagenUrl').value = url;
    renderImagenPremio(url, imagenInventario ? 'Se usará automáticamente la imagen del inventario.' : 'El producto seleccionado no tiene una imagen en inventario.');
}

async function subirImagenPremio(input) {
    const archivo = input?.files?.[0];
    if (!archivo) return;
    $('clubPremioTomarFoto').disabled = true;
    $('clubPremioElegirImagen').disabled = true;
    renderImagenPremio($('clubPremioImagenUrl').value, 'Procesando y subiendo imagen…');
    try {
        const data = await api({ ACCION: 'CLUB_SUBIR_IMAGEN_PREMIO', IMAGEN_BASE64: await comprimirImagen(archivo) });
        if (!data.ok || !data.imagen) throw new Error(data.error || 'No se pudo subir la imagen.');
        const imagen = normalizarUrlPublica(data.imagen);
        $('clubPremioImagenUrl').value = imagen;
        renderImagenPremio(imagen, 'Imagen lista. Guarda el premio para publicarla.');
    } catch (error) {
        renderImagenPremio($('clubPremioImagenUrl').value, error.message || 'No se pudo procesar la imagen.');
    } finally {
        $('clubPremioTomarFoto').disabled = false;
        $('clubPremioElegirImagen').disabled = false;
        input.value = '';
    }
}

function actualizarSucursalesProducto() {
    const usaInventario = $('clubPremioTipo')?.value === 'INVENTARIO';
    const inventarios = productoPremioSeleccionado?.inventarios || [];
    $('clubPremioSucursales')?.querySelectorAll('input').forEach(input => {
        const disponible = inventarios.some(item =>
            String(item.sucursalId || '') === input.value || normBusqueda(item.sucursal) === normBusqueda(input.dataset.sucursalCodigo)
        );
        input.disabled = usaInventario && !disponible;
        if (input.disabled) input.checked = false;
    });
}

const buscarProductoPremio = debounce(async () => {
    const input = $('clubPremioProducto');
    const lista = $('clubPremioProductoLista');
    const texto = normBusqueda(input?.value);
    const secuencia = ++productoBusquedaSecuencia;
    productoPremioSeleccionado = null;
    productoBusquedaControl?.abort();
    if (!texto || $('clubPremioTipo')?.value !== 'INVENTARIO') {
        lista?.classList.remove('show');
        return;
    }
    const control = new AbortController();
    productoBusquedaControl = control;
    try {
        const datos = await buscarSugerenciasVenta({ query: texto, sucursal: null, signal: control.signal });
        if (secuencia !== productoBusquedaSecuencia || control.signal.aborted || normBusqueda(input.value) !== texto) return;
        construirAC(lista, datos, async producto => {
            input.value = producto.producto;
            let coincidencias = datos.filter(item => normBusqueda(item.producto) === normBusqueda(producto.producto));
            productoPremioSeleccionado = { producto: producto.producto, inventarios: coincidencias };
            $('clubPremioProductoInfo').textContent = `${producto.producto} · ${nombreSucursalVisible(producto.sucursal)} · stock ${producto.stock}`;
            actualizarSucursalesProducto();
            actualizarImagenPremioDesdeInventario(false);
            try {
                const resultado = await listarProductos({ query: producto.producto, sucursal: null, limite: 100, contar: false });
                if (input.value !== producto.producto) return;
                coincidencias = (resultado.datos || []).filter(item => normBusqueda(item.producto) === normBusqueda(producto.producto));
                productoPremioSeleccionado = { producto: producto.producto, inventarios: coincidencias };
                actualizarSucursalesProducto();
                actualizarImagenPremioDesdeInventario(false);
            } catch (_) {}
        });
    } catch (error) {
        if (error.name !== 'AbortError') estado('No se pudieron buscar productos del inventario.', true);
    }
}, 200);

function initClub() {
    if (inicializado) return;
    renderEstructura();
    inicializado = true;
    renderSucursales();
    $('clubConfigForm')?.addEventListener('submit', guardarConfiguracion);
    $('clubPremioForm')?.addEventListener('submit', guardarPremio);
    $('clubNoticiaForm')?.addEventListener('submit', guardarNoticia);
    $('clubLimpiarNoticia')?.addEventListener('click', limpiarNoticia);
    $('clubLimpiarPremio')?.addEventListener('click', limpiarPremio);
    $('clubPremioTipo')?.addEventListener('change', actualizarTipoStock);
    $('clubPremioProducto')?.addEventListener('input', buscarProductoPremio);
    $('clubPremioTomarFoto')?.addEventListener('click', () => $('clubPremioImagenCamara').click());
    $('clubPremioElegirImagen')?.addEventListener('click', () => $('clubPremioImagenGaleria').click());
    $('clubPremioImagenCamara')?.addEventListener('change', event => subirImagenPremio(event.target));
    $('clubPremioImagenGaleria')?.addEventListener('change', event => subirImagenPremio(event.target));
    $('clubFiltroCanjes')?.addEventListener('change', () => cargarCanjes().catch(e => estado(e.message, true)));
    $('clubActualizar')?.addEventListener('click', () => cargarClub());
    $('clubExpirar')?.addEventListener('click', expirarPuntos);
    $('clubConfirmarEntrega')?.addEventListener('click', confirmarEntrega);
    $('clubCodigoRetiro')?.addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
    $('clubCodigoRetiro')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); confirmarEntrega(); } });
    $('clubConfigForm')?.classList.toggle('oculto', !can('club.configurar'));
    $('clubNoticiasPanel')?.classList.toggle('oculto', !can('club.configurar'));
    $('clubPremioForm')?.classList.toggle('oculto', !can('club.gestionar_premios'));
    actualizarTipoStock();
}

window.addEventListener('club:abrir-canje', event => {
    canjeObjetivo = Number(event.detail?.canjeId) || null;
    window.__clubCanjeObjetivo = null;
    if ($('clubFiltroCanjes')) $('clubFiltroCanjes').value = '';
    alternarPanel($('clubCanjesPanel'), true);
    cargarCanjes().catch(error => estado(error.message, true));
});

export async function cargarClub() {
    initClub();
    const objetivoPendiente = Number(window.__clubCanjeObjetivo);
    if (objetivoPendiente) {
        canjeObjetivo = objetivoPendiente;
        window.__clubCanjeObjetivo = null;
        if ($('clubFiltroCanjes')) $('clubFiltroCanjes').value = '';
        alternarPanel($('clubCanjesPanel'), true);
    }
    renderSucursales();
    $('clubConfigForm')?.classList.toggle('oculto', !can('club.configurar'));
    $('clubNoticiasPanel')?.classList.toggle('oculto', !can('club.configurar'));
    $('clubPremioForm')?.classList.toggle('oculto', !can('club.gestionar_premios'));
    estado('Cargando Club Eruditos…');
    try {
        await Promise.all([cargarResumen(), cargarNoticias(), cargarPremios(), cargarCanjes()]);
        estado('Información actualizada.');
    } catch (error) {
        estado(error.message || 'No se pudo cargar Club Eruditos.', true);
    }
}
