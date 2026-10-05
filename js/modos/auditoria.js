/* === MODO AUDITORIA: consulta inmutable de acciones del sistema === */
import { api } from '../api.js';
import { store } from '../store.js';
import { manejarRespuesta } from '../ui.js';

const LIMITE = 25;
let paginaActual = 1;
let filtrosSesion = '';
let filtrosAplicados = null;
let sesionConsulta = '';
let consultaSecuencia = 0;

const $ = (id) => document.getElementById(id);

function escapar(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[caracter]);
}

function fechaTexto(valor) {
    if (!valor) return '—';
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? String(valor) : fecha.toLocaleString('es-BO', { hour12: false, timeZone: 'America/La_Paz' });
}

function valor(id) {
    return $(id)?.value.trim() || '';
}

function sucursalTexto(evento) {
    return evento.sucursal_visible || evento.sucursal || '—';
}

function llenarSelect(id, etiquetaInicial, opciones, valorOpcion, etiquetaOpcion) {
    const select = $(id);
    if (!select) return;
    const seleccionado = select.value;
    select.replaceChildren(new Option(etiquetaInicial, ''));
    opciones.forEach((opcion) => select.add(new Option(etiquetaOpcion(opcion), valorOpcion(opcion))));
    if ([...select.options].some((opcion) => opcion.value === seleccionado)) select.value = seleccionado;
}

function aplicarFiltrosAuditoria(data) {
    llenarSelect(
        'auditoriaSucursal',
        'Selecciona una sucursal',
        data.sucursales || [],
        (sucursal) => sucursal.nombre,
        (sucursal) => sucursal.nombreVisible || sucursal.nombre,
    );
    llenarSelect(
        'auditoriaUsuario',
        'Selecciona un usuario',
        data.usuarios || [],
        (usuario) => usuario.usuario,
        (usuario) => usuario.estado === 'ACTIVO' ? usuario.usuario : `${usuario.usuario} (inactivo)`,
    );
}

async function cargarFiltrosAuditoria() {
    if (!store.sessionToken) return false;
    if (filtrosSesion === store.sessionToken) return true;
    const token = store.sessionToken;
    const data = await api({ ACCION: 'LISTAR_FILTROS_AUDITORIA', TOKEN: token });
    if (store.sessionToken !== token) return false;
    if (!manejarRespuesta(data) || !data.ok) throw new Error(data?.error || 'No se pudieron cargar los filtros');
    aplicarFiltrosAuditoria(data);
    filtrosSesion = token;
    return true;
}

function detalleCambios(titulo, cambios) {
    if (!cambios || (typeof cambios === 'object' && Object.keys(cambios).length === 0)) return '';
    return `<div class="field-group"><label class="field-label">${titulo}</label><pre style="margin:0;white-space:pre-wrap;word-break:break-word">${escapar(JSON.stringify(cambios, null, 2))}</pre></div>`;
}

function renderListado(datos, total, pagina) {
    const tabla = $('tablaAuditoria');
    const paginacion = $('paginacionAuditoria');
    paginaActual = pagina;

    if (!datos.length) {
        tabla.innerHTML = '<div class="empty-state">Sin eventos para los filtros seleccionados</div>';
        paginacion.innerHTML = '';
        return;
    }

    tabla.innerHTML = `<div class="auditoria-tabla-wrap"><table class="auditoria-tabla"><thead><tr><th>Fecha</th><th>Acción</th><th>Módulo</th><th>Usuario</th><th>Sucursal</th><th>Resultado</th><th></th></tr></thead><tbody>${datos.map((evento) => `<tr>
        <td style="font-family:var(--mono);font-size:10px">${escapar(fechaTexto(evento.fecha))}</td>
        <td>${escapar(evento.accion)}</td>
        <td>${escapar(evento.modulo || 'SIN CLASIFICAR')}</td>
        <td>${escapar(evento.usuario || 'SISTEMA')}</td>
        <td>${escapar(sucursalTexto(evento))}</td>
        <td>${escapar(evento.resultado || '—')}</td>
        <td><button class="btn btn-ghost" onclick="verDetalleAuditoria(${Number(evento.id)})">Ver</button></td>
    </tr>`).join('')}</tbody></table></div>
    <div class="auditoria-lista-movil">${datos.map((evento) => `<article class="auditoria-tarjeta">
        <div class="auditoria-tarjeta-cabecera"><div><strong>${escapar(evento.accion)}</strong><small>${escapar(fechaTexto(evento.fecha))}</small></div><span class="auditoria-resultado ${evento.resultado === 'OK' ? 'ok' : 'error'}">${escapar(evento.resultado || '—')}</span></div>
        <div class="auditoria-tarjeta-datos"><div><span>Módulo</span><strong>${escapar(evento.modulo || 'SIN CLASIFICAR')}</strong></div><div><span>Usuario</span><strong>${escapar(evento.usuario || 'SISTEMA')}</strong></div><div><span>Sucursal</span><strong>${escapar(sucursalTexto(evento))}</strong></div></div>
        <button class="btn btn-ghost auditoria-ver-detalle" onclick="verDetalleAuditoria(${Number(evento.id)})">Ver detalle</button>
    </article>`).join('')}</div>`;

    const totalPaginas = Math.max(1, Math.ceil(Number(total || 0) / LIMITE));
    paginacion.innerHTML = `<div class="pagination"><button class="btn btn-ghost" ${pagina <= 1 ? 'disabled' : ''} onclick="cambiarPaginaAuditoria(-1)">← Anterior</button><span>Página ${pagina} de ${totalPaginas} · ${Number(total || 0)} eventos</span><button class="btn btn-ghost" ${pagina >= totalPaginas ? 'disabled' : ''} onclick="cambiarPaginaAuditoria(1)">Siguiente →</button></div>`;
}

function fechaValida(texto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
    const fecha = new Date(`${texto}T00:00:00Z`);
    return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

function leerFiltrosAuditoria() {
    return {
        FECHA_DESDE: valor('auditoriaFechaDesde'),
        FECHA_HASTA: valor('auditoriaFechaHasta'),
        SUCURSAL: valor('auditoriaSucursal'),
        USUARIO: valor('auditoriaUsuario'),
        MODULO: valor('auditoriaModulo'),
        RESULTADO: valor('auditoriaResultado'),
        BUSQUEDA: valor('auditoriaBusqueda'),
    };
}

function errorFiltros(filtros) {
    if (!fechaValida(filtros.FECHA_DESDE) || !fechaValida(filtros.FECHA_HASTA))
        return 'Selecciona una fecha válida desde y hasta.';
    if (filtros.FECHA_DESDE > filtros.FECHA_HASTA)
        return 'La fecha desde debe ser igual o anterior a la fecha hasta.';
    if (!filtros.SUCURSAL) return 'Selecciona una sucursal.';
    if (!filtros.USUARIO) return 'Selecciona un usuario.';
    return '';
}

export async function prepararAuditoria() {
    const secuencia = ++consultaSecuencia;
    const token = store.sessionToken;
    filtrosAplicados = null;
    sesionConsulta = '';
    paginaActual = 1;
    if ($('loaderAuditoria')) $('loaderAuditoria').style.display = 'none';
    if ($('btnConsultarAuditoria')) $('btnConsultarAuditoria').disabled = false;
    if ($('tablaAuditoria')) $('tablaAuditoria').innerHTML = '<div class="empty-state">Selecciona las fechas, la sucursal y el usuario para consultar la auditoría.</div>';
    if ($('paginacionAuditoria')) $('paginacionAuditoria').innerHTML = '';
    try {
        await cargarFiltrosAuditoria();
    } catch (error) {
        if (secuencia === consultaSecuencia && token === store.sessionToken && $('tablaAuditoria'))
            $('tablaAuditoria').innerHTML = `<div class="empty-state">${escapar(error.message || 'No se pudieron cargar los filtros')}</div>`;
    }
}

export function initAuditoria() {
    return prepararAuditoria();
}

export async function cargarAuditoria(pagina = 1, usarFiltrosAplicados = false) {
    if (!store.sessionToken) return;
    const token = store.sessionToken;
    const secuencia = ++consultaSecuencia;
    const loader = $('loaderAuditoria');
    const tabla = $('tablaAuditoria');
    const boton = $('btnConsultarAuditoria');
    const filtros = usarFiltrosAplicados && sesionConsulta === token ? filtrosAplicados : leerFiltrosAuditoria();
    const error = filtros ? errorFiltros(filtros) : 'Selecciona los filtros y pulsa Consultar auditoría.';
    if (loader) loader.style.display = 'none';
    if (boton) boton.disabled = false;
    if ($('paginacionAuditoria')) $('paginacionAuditoria').innerHTML = '';
    if (error) {
        filtrosAplicados = null;
        if (tabla) tabla.innerHTML = `<div class="empty-state">${escapar(error)}</div>`;
        return;
    }
    if (loader) loader.style.display = 'block';
    if (boton) boton.disabled = true;
    if (tabla) tabla.innerHTML = '';
    try {
        const data = await api({
            ACCION: 'LISTAR_AUDITORIA', ...filtros,
            PAGINA: pagina, LIMITE, TOKEN: token,
        });
        if (secuencia !== consultaSecuencia || token !== store.sessionToken) return;
        if (!manejarRespuesta(data)) return;
        if (!data.ok) throw new Error(data.error || 'No se pudo consultar la auditoría');
        filtrosAplicados = { ...filtros };
        sesionConsulta = token;
        renderListado(data.datos || [], data.total || 0, Number(data.pagina || pagina));
    } catch (error) {
        if (secuencia !== consultaSecuencia || token !== store.sessionToken) return;
        filtrosAplicados = null;
        if (tabla) tabla.innerHTML = `<div class="empty-state">${escapar(error.message || 'Error de conexión')}</div>`;
    } finally {
        if (secuencia === consultaSecuencia && token === store.sessionToken) {
            if (loader) loader.style.display = 'none';
            if (boton) boton.disabled = false;
        }
    }
}

export function cambiarPaginaAuditoria(delta) {
    if (!filtrosAplicados || sesionConsulta !== store.sessionToken) return;
    return cargarAuditoria(Math.max(1, paginaActual + Number(delta || 0)), true);
}

export async function verDetalleAuditoria(id) {
    const destino = $('auditoriaDetalleContenido');
    const overlay = $('auditoriaDetalleOverlay');
    if (!destino || !overlay || !store.sessionToken) return;
    destino.innerHTML = '<div class="loader" style="display:block"></div>';
    overlay.style.display = 'flex';
    try {
        const token = store.sessionToken;
        const data = await api({ ACCION: 'DETALLE_AUDITORIA', ID: id, TOKEN: token });
        if (token !== store.sessionToken) return;
        if (!manejarRespuesta(data)) return;
        if (!data.ok || !data.evento) throw new Error(data.error || 'Evento no encontrado');
        const evento = data.evento;
        destino.innerHTML = `<div class="section-label">Detalle del evento #${Number(evento.id)}</div>
            <div class="row-2"><div><span class="field-label">Fecha</span><div>${escapar(fechaTexto(evento.fecha))}</div></div><div><span class="field-label">Origen</span><div>${escapar(evento.origen || 'WEB')}</div></div></div>
            <div class="row-2 mt-8"><div><span class="field-label">Acción</span><div>${escapar(evento.accion)}</div></div><div><span class="field-label">Resultado</span><div>${escapar(evento.resultado || '—')}</div></div></div>
            <div class="row-2 mt-8"><div><span class="field-label">Usuario</span><div>${escapar(evento.usuario || 'SISTEMA')}</div></div><div><span class="field-label">Sucursal</span><div>${escapar(sucursalTexto(evento))}</div></div></div>
            <div class="field-group mt-8"><label class="field-label">Detalle</label><div>${escapar(evento.detalle || 'Sin detalle')}</div></div>
            ${detalleCambios('Valores anteriores', evento.valores_anteriores)}
            ${detalleCambios('Valores nuevos', evento.valores_nuevos)}`;
    } catch (error) {
        destino.innerHTML = `<div class="empty-state">${escapar(error.message || 'No se pudo cargar el detalle')}</div>`;
    }
}

export function cerrarDetalleAuditoria(event) {
    const overlay = $('auditoriaDetalleOverlay');
    if (!overlay || (event && event.target !== overlay)) return;
    overlay.style.display = 'none';
}
