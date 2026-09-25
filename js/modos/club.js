import { api } from '../api.js';
import { can } from '../authorization.js';
import { store } from '../store.js';
import { construirAC } from '../inventario.js';
import { buscarSugerenciasVenta } from '../db.js';
import { debounce, normBusqueda } from '../utils.js';

let inicializado = false;
let premios = [];
let productoPremioSeleccionado = null;
let productoBusquedaSecuencia = 0;
let productoBusquedaControl = null;

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
        <form id="clubPremioForm" class="club-panel"><h3>Premio</h3><input id="clubPremioId" type="hidden"><div class="row-2"><div class="field-group"><label class="field-label">Nombre visible del premio</label><input id="clubPremioNombre" placeholder="Ej.: Cuaderno universitario" required><small>Es el título que verá el cliente en el catálogo.</small></div><div class="field-group"><label class="field-label">Código interno</label><input id="clubPremioCodigo" placeholder="Automático"><small>Sirve para identificarlo dentro del sistema.</small></div></div><div class="row-2"><div class="field-group"><label class="field-label">Costo en puntos</label><input id="clubPremioCosto" type="number" min="1" required></div><div class="field-group"><label class="field-label">Control de stock</label><select id="clubPremioTipo"><option value="ILIMITADO">Ilimitado (no descuenta inventario)</option><option value="INVENTARIO">Producto de inventario (descuenta 1 unidad)</option></select></div></div><div id="clubPremioProductoCampo" class="field-group oculto"><label class="field-label">Producto de inventario</label><input id="clubPremioProducto" placeholder="Escribe para buscar y elige una sugerencia" autocomplete="off"><div id="clubPremioProductoLista" class="autocomplete"></div><small id="clubPremioProductoInfo">Al canjear, se descontará una unidad en la sucursal elegida.</small></div><div class="field-group"><label class="field-label">Descripción para el cliente</label><textarea id="clubPremioDescripcion" rows="2" placeholder="Ej.: Cuaderno de 100 hojas. Sujeto a disponibilidad de color."></textarea><small>Explica qué recibe el cliente y cualquier condición importante.</small></div><div class="field-group"><label class="field-label">Sucursales</label><div id="clubPremioSucursales" class="club-checks"></div></div><label class="check-row"><input id="clubPremioActivo" type="checkbox" checked> Premio activo</label><div class="row-2 mt-8"><button class="btn btn-primary" type="submit">Guardar premio</button><button id="clubLimpiarPremio" class="btn btn-ghost" type="button">Nuevo</button></div></form>
      </div>
      <div class="club-panel"><h3>Catálogo de premios</h3><div id="clubPremiosLista"></div></div>
      <div class="club-panel"><div class="club-heading"><h3>Canjes</h3><select id="clubFiltroCanjes"><option value="">Todos</option><option value="SOLICITADO">Solicitados</option><option value="PREPARANDO">Preparando</option><option value="LISTO">Listos</option><option value="ENTREGADO">Entregados</option><option value="CANCELADO">Cancelados</option></select></div><div id="clubCanjesLista"></div></div>`;
}

function estado(texto, error = false) {
    const el = $('clubEstado');
    if (!el) return;
    el.textContent = texto || '';
    el.style.color = error ? 'var(--red)' : 'var(--muted)';
}

function sucursalesDisponibles() {
    const filas = (store.sessionSucursales || []).filter(s => s.estado !== 'INACTIVO');
    if (filas.length) return filas.map(s => ({ id: s.id, nombre: s.nombreVisible || s.nombre || s.id }));
    return store.sessionSucursal ? [{ id: store.sessionSucursal, nombre: store.sessionSucursal }] : [];
}

function renderSucursales() {
    const cont = $('clubPremioSucursales');
    if (!cont) return;
    cont.innerHTML = sucursalesDisponibles().map(s => `<label class="check-row"><input type="checkbox" value="${esc(s.id)}"> ${esc(s.nombre)}</label>`).join('') || '<span class="muted">No hay sucursales asignadas.</span>';
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
        const sucursales = (p.club_premios_sucursales || []).map(s => s.sucursal_id).join(', ');
        return `<article class="club-list-card">
            <div><strong>${esc(p.nombre)}</strong><div class="muted">${esc(p.descripcion || 'Sin descripción')}</div><small>${esc(sucursales || 'Sin sucursal')}</small></div>
            <div class="club-list-actions"><strong>${Number(p.costo_puntos).toLocaleString('es-BO')} pts</strong><span class="rol-pill">${esc(p.tipo_stock)}</span>${can('club.gestionar_premios') ? `<button class="btn btn-ghost btn-sm" data-club-editar-premio="${p.id}">Editar</button>` : ''}</div>
        </article>`;
    }).join('');
    cont.querySelectorAll('[data-club-editar-premio]').forEach(btn => btn.addEventListener('click', () => editarPremio(Number(btn.dataset.clubEditarPremio))));
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
        return `<article class="club-list-card">
            <div><strong>#${c.id} · ${esc(premio.nombre || 'Premio')}</strong><div>${esc(cliente.nombre || 'Cliente')} · ${esc(cliente.codigo_cliente || '')}</div><small>${fecha(c.solicitado_en)} · ${esc(c.sucursal_id)}</small></div>
            <div class="club-list-actions"><span class="rol-pill">${esc(c.estado)}</span><strong>${Number(c.puntos_total).toLocaleString('es-BO')} pts</strong>${acciones}${cancelar}</div>
        </article>`;
    }).join('');
    cont.querySelectorAll('[data-club-estado]').forEach(sel => sel.addEventListener('change', async () => {
        if (!sel.value) return;
        let codigo;
        if (sel.value === 'ENTREGADO') {
            codigo = window.prompt('Código de retiro mostrado por el cliente:');
            if (!codigo) { sel.value = ''; return; }
        }
        estado('Actualizando canje…');
        const data = await api({ ACCION: 'CLUB_ACTUALIZAR_CANJE', CANJE_ID: Number(sel.dataset.clubEstado), ESTADO: sel.value, CODIGO_RETIRO: codigo });
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

function limpiarPremio() {
    $('clubPremioId').value = '';
    $('clubPremioNombre').value = '';
    $('clubPremioCodigo').value = '';
    $('clubPremioCosto').value = '';
    $('clubPremioDescripcion').value = '';
    $('clubPremioTipo').value = 'ILIMITADO';
    $('clubPremioProducto').value = '';
    productoPremioSeleccionado = null;
    $('clubPremioActivo').checked = true;
    $('clubPremioSucursales').querySelectorAll('input').forEach(i => { i.checked = false; });
    actualizarTipoStock();
}

function editarPremio(id) {
    const p = premios.find(item => item.id === id);
    if (!p) return;
    $('clubPremioId').value = p.id;
    $('clubPremioNombre').value = p.nombre || '';
    $('clubPremioCodigo').value = p.codigo || '';
    $('clubPremioCosto').value = p.costo_puntos || '';
    $('clubPremioDescripcion').value = p.descripcion || '';
    $('clubPremioTipo').value = p.tipo_stock || 'ILIMITADO';
    $('clubPremioProducto').value = p.producto || '';
    productoPremioSeleccionado = p.producto ? { producto: p.producto } : null;
    $('clubPremioActivo').checked = p.activo !== false;
    const seleccionadas = new Set((p.club_premios_sucursales || []).map(s => String(s.sucursal_id)));
    $('clubPremioSucursales').querySelectorAll('input').forEach(i => { i.checked = seleccionadas.has(i.value); });
    actualizarTipoStock();
    $('clubPremioNombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function guardarPremio(event) {
    event.preventDefault();
    const sucursales = [...$('clubPremioSucursales').querySelectorAll('input:checked')].map(i => i.value);
    const usaInventario = $('clubPremioTipo').value === 'INVENTARIO';
    if (usaInventario && (!productoPremioSeleccionado || productoPremioSeleccionado.producto !== $('clubPremioProducto').value.trim())) {
        estado('Busca y elige un producto de las sugerencias.', true);
        $('clubPremioProducto').focus();
        return;
    }
    estado('Guardando premio…');
    const data = await api({
        ACCION: 'CLUB_GUARDAR_PREMIO', ID: Number($('clubPremioId').value) || undefined,
        NOMBRE: $('clubPremioNombre').value, CODIGO: $('clubPremioCodigo').value,
        COSTO_PUNTOS: Number($('clubPremioCosto').value), DESCRIPCION: $('clubPremioDescripcion').value,
        TIPO_STOCK: $('clubPremioTipo').value, PRODUCTO: usaInventario ? productoPremioSeleccionado.producto : '',
        SUCURSALES: sucursales, ACTIVO: $('clubPremioActivo').checked,
    });
    estado(data.ok ? 'Premio guardado.' : (data.error || 'No se pudo guardar.'), !data.ok);
    if (data.ok) { limpiarPremio(); await cargarPremios(); }
}

function actualizarTipoStock() {
    const usaInventario = $('clubPremioTipo')?.value === 'INVENTARIO';
    $('clubPremioProductoCampo')?.classList.toggle('oculto', !usaInventario);
    if ($('clubPremioProducto')) $('clubPremioProducto').required = usaInventario;
    if (!usaInventario) {
        $('clubPremioProductoLista')?.classList.remove('show');
        productoBusquedaControl?.abort();
    }
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
        construirAC(lista, datos, producto => {
            productoPremioSeleccionado = producto;
            input.value = producto.producto;
            $('clubPremioProductoInfo').textContent = `${producto.producto} · ${producto.sucursal} · stock ${producto.stock}`;
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
    $('clubLimpiarPremio')?.addEventListener('click', limpiarPremio);
    $('clubPremioTipo')?.addEventListener('change', actualizarTipoStock);
    $('clubPremioProducto')?.addEventListener('input', buscarProductoPremio);
    $('clubFiltroCanjes')?.addEventListener('change', () => cargarCanjes().catch(e => estado(e.message, true)));
    $('clubActualizar')?.addEventListener('click', () => cargarClub());
    $('clubExpirar')?.addEventListener('click', expirarPuntos);
    $('clubConfigForm')?.classList.toggle('oculto', !can('club.configurar'));
    $('clubPremioForm')?.classList.toggle('oculto', !can('club.gestionar_premios'));
    actualizarTipoStock();
}

export async function cargarClub() {
    initClub();
    renderSucursales();
    $('clubConfigForm')?.classList.toggle('oculto', !can('club.configurar'));
    $('clubPremioForm')?.classList.toggle('oculto', !can('club.gestionar_premios'));
    estado('Cargando Club Eruditos…');
    try {
        await Promise.all([cargarResumen(), cargarPremios(), cargarCanjes()]);
        estado('Información actualizada.');
    } catch (error) {
        estado(error.message || 'No se pudo cargar Club Eruditos.', true);
    }
}
