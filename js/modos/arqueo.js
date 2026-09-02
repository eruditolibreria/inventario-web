import { store } from '../store.js';
import { api } from '../api.js';
import { manejarRespuesta } from '../ui.js';
import { formatearBs, mostrarMsg } from '../utils.js';

const DENOMINACIONES = [200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10];
let _arqueoId = null;
let _verificarEstadoCaja = null;
let _paginaHistorial = 1;

const numero = value => Number(value || 0);
const formato = value => formatearBs(numero(value));

export function initArqueo({ verificarEstadoCaja } = {}) {
    _verificarEstadoCaja = verificarEstadoCaja || null;
    const select = document.getElementById('arqueoCajaId');
    if (select && !select._arqueoBound) {
        select._arqueoBound = true;
        select.addEventListener('change', () => { _arqueoId = null; _limpiarResumen(); });
    }
    _renderConteo();
}

function _renderConteo() {
    const contenedor = document.getElementById('arqueoConteo');
    if (!contenedor || contenedor.dataset.renderizado) return;
    contenedor.dataset.renderizado = 'true';
    contenedor.innerHTML = DENOMINACIONES.map(d =>
        `<div class="arqueo-denominacion"><span>Bs ${d.toFixed(d < 1 ? 2 : 0)}</span><input class="arqueo-cantidad" data-denominacion="${d}" type="number" min="0" step="1" value="0"><strong id="arqueoSub-${d}">Bs 0.00</strong></div>`
    ).join('');
    contenedor.addEventListener('input', _actualizarConteo);
}

function _actualizarConteo() {
    let total = 0;
    document.querySelectorAll('.arqueo-cantidad').forEach(input => {
        const cantidad = Math.max(0, Math.floor(numero(input.value)));
        if (String(cantidad) !== input.value && input.value !== '') input.value = cantidad;
        const subtotal = numero(input.dataset.denominacion) * cantidad;
        total += subtotal;
        const target = document.getElementById(`arqueoSub-${input.dataset.denominacion}`);
        if (target) target.textContent = formato(subtotal);
    });
    const totalEl = document.getElementById('arqueoTotalContado');
    if (totalEl) totalEl.textContent = formato(total);
    const esperado = numero(document.getElementById('arqueoSaldoEsperado')?.dataset.valor);
    const diferencia = total - esperado;
    const diferenciaEl = document.getElementById('arqueoDiferencia');
    const resultadoEl = document.getElementById('arqueoResultado');
    if (diferenciaEl) {
        diferenciaEl.textContent = (diferencia > 0 ? '+' : '') + formato(diferencia);
        diferenciaEl.className = `arqueo-diferencia ${diferencia === 0 ? 'cuadra' : diferencia > 0 ? 'sobrante' : 'faltante'}`;
    }
    if (resultadoEl) resultadoEl.textContent = diferencia === 0 ? 'CUADRA' : diferencia > 0 ? 'SOBRANTE' : 'FALTANTE';
}

function _limpiarResumen() {
    _arqueoId = null;
    ['arqueoSaldoEsperado', 'arqueoSaldoInicial', 'arqueoVentas', 'arqueoIngresos', 'arqueoGastos', 'arqueoRetiros'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = '—'; delete el.dataset.valor; }
    });
    _actualizarConteo();
}

function _mostrarResumen(resumen) {
    const valores = {
        arqueoSaldoEsperado: resumen.saldoEsperado,
        arqueoSaldoInicial: resumen.saldoInicial,
        arqueoVentas: resumen.totalVentasEfectivo,
        arqueoIngresos: resumen.totalIngresos,
        arqueoGastos: resumen.totalGastos,
        arqueoRetiros: numero(resumen.totalRetiros) + numero(resumen.totalOtrosEgresos),
    };
    Object.entries(valores).forEach(([id, valor]) => {
        const el = document.getElementById(id);
        if (el) { el.textContent = formato(valor); el.dataset.valor = String(numero(valor)); }
    });
    const periodo = document.getElementById('arqueoPeriodo');
    if (periodo) periodo.textContent = resumen.fechaInicio ? new Date(resumen.fechaInicio).toLocaleString('es-BO') : '—';
    _actualizarConteo();
}

export async function cargarArqueo() {
    if (!store.sessionToken) return;
    const select = document.getElementById('arqueoCajaId');
    if (!select) return;
    try {
        const data = await api({ ACCION: 'ESTADO_CAJA', TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        const seleccionado = select.value;
        select.innerHTML = '<option value="">Seleccionar caja abierta</option>';
        (data.cajas || []).forEach(caja => {
            const option = document.createElement('option');
            option.value = caja.cajaId;
            option.textContent = `${caja.sucursal} · ${formato(caja.saldoActual)}`;
            select.appendChild(option);
        });
        if (seleccionado && [...select.options].some(o => o.value === seleccionado)) select.value = seleccionado;
        if ((data.cajas || []).length === 1) select.value = data.cajas[0].cajaId;
    } catch (_) {
        mostrarMsg('No se pudo cargar las cajas abiertas', 'err');
    }
}

export async function iniciarArqueo() {
    const cajaId = document.getElementById('arqueoCajaId')?.value;
    if (!cajaId) { mostrarMsg('Selecciona una caja abierta', 'err'); return; }
    const loader = document.getElementById('loaderArqueo');
    if (loader) loader.style.display = 'block';
    try {
        const data = await api({ ACCION: 'INICIAR_ARQUEO', CAJA_ID: cajaId, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        if (!data.ok) { mostrarMsg(data.error || 'No se pudo iniciar el arqueo', 'err'); return; }
        _arqueoId = data.arqueoId;
        _mostrarResumen(data.resumen);
        mostrarMsg('Arqueo preparado. Ingresa el conteo físico.', 'ok');
    } catch (_) {
        mostrarMsg('Error de conexión', 'err');
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

export async function cerrarArqueo() {
    if (!_arqueoId) { mostrarMsg('Primero prepara el arqueo de la caja', 'err'); return; }
    const conteos = [];
    let invalido = false;
    document.querySelectorAll('.arqueo-cantidad').forEach(input => {
        const cantidad = numero(input.value);
        if (!Number.isInteger(cantidad) || cantidad < 0) invalido = true;
        conteos.push({ denominacion: numero(input.dataset.denominacion), cantidad });
    });
    if (invalido) { mostrarMsg('Las cantidades deben ser enteros no negativos', 'err'); return; }
    const diferencia = numero(document.getElementById('arqueoDiferencia')?.textContent?.replace(/[^0-9.-]/g, ''));
    const observaciones = document.getElementById('arqueoObservaciones')?.value.trim() || '';
    if (diferencia !== 0 && !observaciones) { mostrarMsg('Agrega una observación para la diferencia', 'err'); return; }
    if (!confirm('¿Cerrar el arqueo? Esta acción cerrará la caja.')) return;
    const loader = document.getElementById('loaderArqueo');
    if (loader) loader.style.display = 'block';
    try {
        const data = await api({ ACCION: 'CERRAR_ARQUEO', ARQUEO_ID: _arqueoId, CONTEOS: conteos, OBSERVACIONES: observaciones, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        if (!data.ok) { mostrarMsg(data.error || 'No se pudo cerrar el arqueo', 'err'); return; }
        mostrarMsg(`Arqueo cerrado · ${data.tipoDiferencia}: ${data.diferencia >= 0 ? '+' : ''}${formato(data.diferencia)}`, 'ok');
        _arqueoId = null;
        document.getElementById('arqueoObservaciones').value = '';
        await cargarArqueo();
        _limpiarResumen();
        if (_verificarEstadoCaja) _verificarEstadoCaja();
        listarArqueos();
    } catch (_) {
        mostrarMsg('Error de conexión', 'err');
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

export async function listarArqueos(pagina = 1) {
    if (!store.sessionToken) return;
    const tabla = document.getElementById('tablaArqueos');
    if (!tabla) return;
    try {
        const data = await api({
            ACCION: 'LISTAR_ARQUEOS', PAGINA: pagina, LIMITE: 20,
            FECHA_DESDE: document.getElementById('arqueoFechaDesde')?.value,
            FECHA_HASTA: document.getElementById('arqueoFechaHasta')?.value,
            ESTADO: document.getElementById('arqueoEstadoFiltro')?.value,
            RESULTADO: document.getElementById('arqueoResultadoFiltro')?.value,
            SUCURSAL: document.getElementById('arqueoSucursalFiltro')?.value,
            USUARIO: document.getElementById('arqueoUsuarioFiltro')?.value,
            BUSQUEDA: document.getElementById('arqueoBusqueda')?.value.trim(),
            TOKEN: store.sessionToken,
        });
        if (!manejarRespuesta(data)) return;
        _paginaHistorial = data.pagina || pagina;
        if (!(data.datos || []).length) { tabla.innerHTML = '<div class="empty-state">Sin arqueos registrados</div>'; return; }
        tabla.innerHTML = `<div class="arqueo-tabla-wrap"><table><thead><tr><th>Fecha</th><th>Sucursal</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Resultado</th></tr></thead><tbody>${data.datos.map(a => `<tr data-id="${a.id}"><td>${new Date(a.fechaInicio).toLocaleString('es-BO')}</td><td>${a.sucursal}</td><td>${formato(a.saldoEsperado)}</td><td>${formato(a.efectivoContado)}</td><td>${a.diferencia > 0 ? '+' : ''}${formato(a.diferencia)}</td><td>${a.tipoDiferencia || a.estado}</td></tr>`).join('')}</tbody></table></div>`;
        if (data.paginas > 1) tabla.innerHTML += `<div class="arqueo-paginacion"><button class="btn btn-ghost" ${_paginaHistorial <= 1 ? 'disabled' : ''} data-pagina="${_paginaHistorial - 1}">← Anterior</button><span>Pág. ${_paginaHistorial} de ${data.paginas}</span><button class="btn btn-ghost" ${_paginaHistorial >= data.paginas ? 'disabled' : ''} data-pagina="${_paginaHistorial + 1}">Siguiente →</button></div>`;
        tabla.querySelectorAll('tr[data-id]').forEach(row => row.addEventListener('click', () => verDetalleArqueo(row.dataset.id)));
        tabla.querySelectorAll('button[data-pagina]').forEach(button => button.addEventListener('click', () => listarArqueos(Number(button.dataset.pagina))));
    } catch (_) {
        tabla.innerHTML = '<div class="empty-state">No se pudo cargar el historial</div>';
    }
}

export async function verDetalleArqueo(id) {
    try {
        const data = await api({ ACCION: 'DETALLE_ARQUEO', ARQUEO_ID: id, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data) || !data.ok) return;
        const a = data.arqueo;
        document.getElementById('arqueoDetalleContenido').innerHTML = `<div class="arqueo-detalle-grid"><div><span>Periodo</span><strong>${new Date(a.fechaInicio).toLocaleString('es-BO')} — ${new Date(a.fechaFin).toLocaleString('es-BO')}</strong></div><div><span>Caja / sucursal</span><strong>${a.cajaId} · ${a.sucursal}</strong></div><div><span>Saldo esperado</span><strong>${formato(a.saldoEsperado)}</strong></div><div><span>Contado</span><strong>${formato(a.efectivoContado)}</strong></div><div><span>Diferencia</span><strong>${a.diferencia > 0 ? '+' : ''}${formato(a.diferencia)} · ${a.tipoDiferencia}</strong></div><div><span>Movimientos</span><strong>Ventas ${formato(a.totalVentasEfectivo)} · Ingresos ${formato(a.totalIngresos)} · Gastos ${formato(a.totalGastos)} · Retiros ${formato(a.totalRetiros)}</strong></div></div><div class="arqueo-detalle-conteo">${a.conteos.map(c => `<span>Bs ${numero(c.denominacion).toFixed(numero(c.denominacion) < 1 ? 2 : 0)} × ${c.cantidad} = ${formato(c.subtotal)}</span>`).join('')}</div><p><strong>Observaciones:</strong> ${a.observaciones || '—'}</p>`;
        document.getElementById('arqueoDetalleOverlay').style.display = 'flex';
    } catch (_) { mostrarMsg('No se pudo cargar el detalle', 'err'); }
}

export function cerrarDetalleArqueo(event) {
    const overlay = document.getElementById('arqueoDetalleOverlay');
    if (!event || event.target === overlay) overlay.style.display = 'none';
}
