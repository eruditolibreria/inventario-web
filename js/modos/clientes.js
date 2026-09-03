/* === MODO CLIENTES: catálogo, perfil, deudas y pagos nuevos === */
import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, formatearBs } from '../utils.js';
import { manejarRespuesta } from '../ui.js';

let _pagina = 1;
let _paginas = 1;
let _clienteActual = null;
let _perfil = null;
let _timerBusqueda = null;

const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const fecha = (v) => {
    if (!v) return '—';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-');
        return `${d}/${m}/${y}`;
    }
    return new Date(s).toLocaleDateString('es-BO');
};

function detalleMetodoVenta(venta) {
    if (venta.metodoPago !== 'MIXTO') return venta.metodoPago;
    const partes = [];
    if (Number(venta.montoEfectivo || 0) > 0) partes.push(`Efectivo ${formatearBs(venta.montoEfectivo)}`);
    if (Number(venta.montoTransferencia || 0) > 0) partes.push(`Transferencia ${formatearBs(venta.montoTransferencia)}`);
    return partes.length ? partes.join(' + ') : 'MIXTO';
}

export function initClientes() {
    const root = document.getElementById('clientesRoot');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    root.innerHTML = `
      <div id="clientesListado">
        <div class="clientes-toolbar">
          <div>
            <div class="section-label">Clientes</div>
            <div class="clientes-subtitle">Compras, crédito, deudas y pagos</div>
          </div>
          <button class="btn btn-primary" id="btnNuevoCliente">+ Nuevo cliente</button>
        </div>
        <div class="clientes-filtros">
          <input id="buscarClientes" placeholder="Buscar por nombre, código, documento o teléfono" autocomplete="off">
          <select id="filtroClientes">
            <option value="TODOS">Todos</option>
            <option value="ACTIVOS">Activos</option>
            <option value="INACTIVOS">Inactivos</option>
            <option value="CON_DEUDA">Con deuda</option>
            <option value="DEUDA_VENCIDA">Deuda vencida</option>
            <option value="AL_DIA">Al día</option>
          </select>
        </div>
        <div class="loader" id="loaderClientes"></div>
        <div id="tablaClientes"></div>
        <div class="clientes-paginacion" id="paginClientes" style="display:none">
          <button class="btn btn-ghost btn-sm" id="clientesAnterior">← Anterior</button>
          <span id="clientesPaginaInfo"></span>
          <button class="btn btn-ghost btn-sm" id="clientesSiguiente">Siguiente →</button>
        </div>
      </div>
      <div id="clientePerfil" class="oculto"></div>
      <div class="modal-overlay" id="clienteFormOverlay" style="display:none">
        <div class="modal-card clientes-modal">
          <div class="clientes-modal-head"><strong id="clienteFormTitulo">Nuevo cliente</strong><button class="btn-icon" id="cerrarClienteForm">✕</button></div>
          <input type="hidden" id="clienteFormId">
          <div class="row-2">
            <div class="field-group"><label class="field-label">Nombre *</label><input id="clienteNombre" maxlength="160"></div>
            <div class="field-group"><label class="field-label">Código</label><input id="clienteCodigo" placeholder="Automático"></div>
          </div>
          <div class="row-2">
            <div class="field-group"><label class="field-label">Documento</label><input id="clienteDocumento"></div>
            <div class="field-group"><label class="field-label">Teléfono</label><input id="clienteTelefono" inputmode="tel"></div>
          </div>
          <div class="row-2">
            <div class="field-group"><label class="field-label">Email</label><input id="clienteEmail" type="email"></div>
            <div class="field-group"><label class="field-label">Tipo</label><select id="clienteTipo"><option value="PARTICULAR">Particular</option><option value="EMPRESA">Empresa</option><option value="INSTITUCION">Institución</option></select></div>
          </div>
          <div class="field-group"><label class="field-label">Dirección</label><input id="clienteDireccion"></div>
          <div class="row-2" id="clienteCamposAdmin">
            <div class="field-group"><label class="field-label">Límite de crédito</label><input id="clienteLimite" type="number" min="0" step="0.01" value="0"></div>
            <div class="field-group"><label class="field-label">Estado</label><select id="clienteEstado"><option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option></select></div>
          </div>
          <div class="field-group"><label class="field-label">Observaciones</label><textarea id="clienteObservaciones" rows="3"></textarea></div>
          <div class="loader" id="loaderClienteForm"></div>
          <div class="clientes-modal-actions"><button class="btn btn-ghost" id="cancelarClienteForm">Cancelar</button><button class="btn btn-primary" id="guardarClienteBtn">Guardar</button></div>
        </div>
      </div>
      <div class="modal-overlay" id="clientePagoOverlay" style="display:none">
        <div class="modal-card clientes-modal clientes-pago-modal">
          <div class="clientes-modal-head"><strong>Registrar pago</strong><button class="btn-icon" id="cerrarClientePago">✕</button></div>
          <input type="hidden" id="clientePagoCuentaId">
          <div class="cliente-pago-saldo">Saldo: <strong id="clientePagoSaldo">Bs 0.00</strong></div>
          <div class="row-2">
            <div class="field-group"><label class="field-label">Monto *</label><input id="clientePagoMonto" type="number" min="0.01" step="0.01"></div>
            <div class="field-group"><label class="field-label">Método</label><select id="clientePagoMetodo"><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option></select></div>
          </div>
          <div class="field-group"><label class="field-label">Observaciones</label><input id="clientePagoObservaciones"></div>
          <div class="loader" id="loaderClientePago"></div>
          <div class="clientes-modal-actions"><button class="btn btn-ghost" id="cancelarClientePago">Cancelar</button><button class="btn btn-primary" id="registrarClientePagoBtn">Confirmar pago</button></div>
        </div>
      </div>`;

    document.getElementById('btnNuevoCliente').addEventListener('click', () => abrirFormCliente());
    document.getElementById('cerrarClienteForm').addEventListener('click', cerrarFormCliente);
    document.getElementById('cancelarClienteForm').addEventListener('click', cerrarFormCliente);
    document.getElementById('guardarClienteBtn').addEventListener('click', guardarCliente);
    document.getElementById('cerrarClientePago').addEventListener('click', cerrarPagoCliente);
    document.getElementById('cancelarClientePago').addEventListener('click', cerrarPagoCliente);
    document.getElementById('registrarClientePagoBtn').addEventListener('click', registrarPagoCliente);
    document.getElementById('clientesAnterior').addEventListener('click', () => cambiarPaginaClientes(-1));
    document.getElementById('clientesSiguiente').addEventListener('click', () => cambiarPaginaClientes(1));
    document.getElementById('filtroClientes').addEventListener('change', () => cargarClientesModulo(1));
    document.getElementById('buscarClientes').addEventListener('input', () => {
        clearTimeout(_timerBusqueda);
        _timerBusqueda = setTimeout(() => cargarClientesModulo(1), 300);
    });
}

export async function cargarClientesModulo(pagina) {
    initClientes();
    if (!store.sessionToken || !document.getElementById('tablaClientes')) return;
    _pagina = pagina || _pagina;
    const loader = document.getElementById('loaderClientes');
    const tabla = document.getElementById('tablaClientes');
    loader.style.display = 'block';
    try {
        const data = await api({
            ACCION: 'LISTAR_CLIENTES_MODULO',
            BUSQUEDA: document.getElementById('buscarClientes').value.trim(),
            FILTRO: document.getElementById('filtroClientes').value,
            PAGINA: _pagina,
            LIMITE: 25,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        _paginas = data.paginas || 1;
        renderClientes(data.datos || []);
        const pag = document.getElementById('paginClientes');
        pag.style.display = _paginas > 1 ? 'flex' : 'none';
        document.getElementById('clientesPaginaInfo').textContent = `Página ${_pagina} de ${_paginas}`;
        document.getElementById('clientesAnterior').disabled = _pagina <= 1;
        document.getElementById('clientesSiguiente').disabled = _pagina >= _paginas;
    } catch (_) {
        tabla.innerHTML = '<div class="empty-state">No se pudo cargar clientes</div>';
    } finally { loader.style.display = 'none'; }
}

function renderClientes(clientes) {
    const tabla = document.getElementById('tablaClientes');
    if (!clientes.length) { tabla.innerHTML = '<div class="empty-state">Sin clientes encontrados</div>'; return; }
    tabla.innerHTML = `<div class="clientes-tabla-wrap"><table class="clientes-tabla"><thead><tr><th>Código</th><th>Cliente</th><th>Contacto</th><th>Compras</th><th>Total comprado</th><th>Deuda</th><th>Estado</th><th></th></tr></thead><tbody>${clientes.map(c => `
      <tr>
        <td><span class="cliente-codigo">${esc(c.codigoCliente)}</span></td>
        <td><strong>${esc(c.nombre)}</strong><small>${esc(c.documento || 'Sin documento')}</small></td>
        <td>${esc(c.telefono || '—')}</td>
        <td>${Number(c.numeroCompras || 0)}</td>
        <td>${formatearBs(c.totalComprado)}</td>
        <td class="${Number(c.deuda) > 0 ? 'cliente-deuda' : 'cliente-al-dia'}">${formatearBs(c.deuda)}</td>
        <td><span class="cliente-estado ${c.estado === 'ACTIVO' ? 'activo' : 'inactivo'}">${esc(c.estado)}</span></td>
        <td><button class="btn btn-ghost btn-sm" data-cliente-id="${esc(c.id)}">Ver</button></td>
      </tr>`).join('')}</tbody></table></div>`;
    tabla.querySelectorAll('[data-cliente-id]').forEach(btn => btn.addEventListener('click', () => abrirPerfilCliente(btn.dataset.clienteId)));
}

export function cambiarPaginaClientes(delta) {
    const siguiente = Math.max(1, Math.min(_paginas, _pagina + delta));
    if (siguiente !== _pagina) cargarClientesModulo(siguiente);
}

export function abrirFormCliente(cliente) {
    _clienteActual = cliente || null;
    const admin = store.sessionRol === 'ADMIN';
    document.getElementById('clienteFormTitulo').textContent = cliente ? 'Editar cliente' : 'Nuevo cliente';
    document.getElementById('clienteFormId').value = cliente?.id || '';
    document.getElementById('clienteNombre').value = cliente?.nombre || '';
    document.getElementById('clienteCodigo').value = cliente?.codigoCliente || '';
    document.getElementById('clienteCodigo').disabled = !!cliente;
    document.getElementById('clienteDocumento').value = cliente?.documento || '';
    document.getElementById('clienteTelefono').value = cliente?.telefono || '';
    document.getElementById('clienteEmail').value = cliente?.email || '';
    document.getElementById('clienteDireccion').value = cliente?.direccion || '';
    document.getElementById('clienteTipo').value = cliente?.tipoCliente || 'PARTICULAR';
    document.getElementById('clienteLimite').value = Number(cliente?.limiteCredito || 0);
    document.getElementById('clienteLimite').disabled = !admin;
    document.getElementById('clienteEstado').value = cliente?.estado || 'ACTIVO';
    document.getElementById('clienteEstado').disabled = !admin;
    document.getElementById('clienteObservaciones').value = cliente?.observaciones || '';
    document.getElementById('clienteFormOverlay').style.display = 'flex';
}

export function cerrarFormCliente() { document.getElementById('clienteFormOverlay').style.display = 'none'; }

export async function guardarCliente() {
    const id = document.getElementById('clienteFormId').value;
    const nombre = document.getElementById('clienteNombre').value.trim();
    if (!nombre) { mostrarMsg('Ingresa el nombre del cliente', 'err'); return; }
    const payload = {
        ACCION: id ? 'ACTUALIZAR_CLIENTE' : 'CREAR_CLIENTE', ID: id || undefined,
        NOMBRE: nombre, CODIGO_CLIENTE: id ? undefined : document.getElementById('clienteCodigo').value.trim(),
        DOCUMENTO: document.getElementById('clienteDocumento').value.trim(), TELEFONO: document.getElementById('clienteTelefono').value.trim(),
        EMAIL: document.getElementById('clienteEmail').value.trim(), DIRECCION: document.getElementById('clienteDireccion').value.trim(),
        TIPO_CLIENTE: document.getElementById('clienteTipo').value, OBSERVACIONES: document.getElementById('clienteObservaciones').value.trim(),
        TOKEN: store.sessionToken
    };
    if (store.sessionRol === 'ADMIN') {
        payload.LIMITE_CREDITO = Number(document.getElementById('clienteLimite').value || 0);
        if (id) payload.ESTADO = document.getElementById('clienteEstado').value;
    }
    const loader = document.getElementById('loaderClienteForm'); loader.style.display = 'block';
    try {
        const data = await api(payload);
        if (!manejarRespuesta(data)) return;
        if (!data.ok) { mostrarMsg('Error: ' + (data.error || 'No se pudo guardar'), 'err'); return; }
        mostrarMsg(id ? 'Cliente actualizado' : 'Cliente creado', 'ok');
        cerrarFormCliente();
        await cargarClientesModulo(id ? _pagina : 1);
        if (id && _perfil) await abrirPerfilCliente(id);
    } catch (_) { mostrarMsg('Error de conexión', 'err'); }
    finally { loader.style.display = 'none'; }
}

export async function abrirPerfilCliente(id) {
    const listado = document.getElementById('clientesListado'), perfil = document.getElementById('clientePerfil');
    listado.classList.add('oculto'); perfil.classList.remove('oculto');
    perfil.innerHTML = '<div class="loader" style="display:block"></div>';
    try {
        const data = await api({ ACCION: 'OBTENER_CLIENTE', ID: id, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data) || !data.ok) { cerrarPerfilCliente(); return; }
        _perfil = data; _clienteActual = data.cliente;
        renderPerfil('HISTORIAL');
    } catch (_) { perfil.innerHTML = '<div class="empty-state">No se pudo cargar el perfil</div>'; }
}

export function cerrarPerfilCliente() {
    document.getElementById('clientePerfil').classList.add('oculto');
    document.getElementById('clientesListado').classList.remove('oculto');
    _perfil = null;
}

function renderPerfil(tab) {
    const c = _perfil.cliente;
    const root = document.getElementById('clientePerfil');
    root.innerHTML = `
      <div class="clientes-perfil-head"><button class="btn btn-ghost btn-sm" id="volverClientes">← Clientes</button><div><h2>${esc(c.nombre)}</h2><span>${esc(c.codigoCliente)} · ${esc(c.tipoCliente)} · ${esc(c.estado)}</span></div><button class="btn btn-ghost btn-sm" id="editarClientePerfil">Editar</button></div>
      <div class="clientes-resumen">
        <div><span>Total comprado</span><strong>${formatearBs(c.totalComprado)}</strong></div><div><span>Compras</span><strong>${Number(c.numeroCompras || 0)}</strong></div>
        <div><span>Deuda actual</span><strong class="cliente-deuda">${formatearBs(c.deuda)}</strong></div><div><span>Deuda vencida</span><strong class="cliente-deuda">${formatearBs(c.deudaVencida)}</strong></div>
        <div><span>Crédito disponible</span><strong>${formatearBs(c.creditoDisponible)}</strong></div>
      </div>
      <div class="sub-tabs clientes-tabs"><button data-tab="HISTORIAL">Historial</button><button data-tab="DEUDAS">Deudas</button><button data-tab="PAGOS">Pagos</button><button data-tab="DATOS">Datos</button></div>
      <div id="clienteTabContenido"></div>`;
    root.querySelector('#volverClientes').addEventListener('click', cerrarPerfilCliente);
    root.querySelector('#editarClientePerfil').addEventListener('click', () => abrirFormCliente(c));
    root.querySelectorAll('[data-tab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
        btn.addEventListener('click', () => renderPerfil(btn.dataset.tab));
    });
    renderPerfilTab(tab);
}

function renderPerfilTab(tab) {
    const cont = document.getElementById('clienteTabContenido'), c = _perfil.cliente;
    if (tab === 'HISTORIAL') {
        cont.innerHTML = tablaSimple(['Fecha','Sucursal','Método','Total','Estado'], _perfil.ventas.map(v => [fecha(v.fecha), esc(v.sucursal), esc(detalleMetodoVenta(v)), formatearBs(v.total), esc(v.estado)]));
    } else if (tab === 'DEUDAS') {
        cont.innerHTML = tablaSimple(['Venta','Emisión','Vencimiento','Monto','Pagado','Devuelto','Saldo','Estado',''], _perfil.deudas.map(d => [esc(String(d.ventaId).slice(0,8)), fecha(d.fechaEmision), fecha(d.fechaVencimiento), formatearBs(d.montoOriginal), formatearBs(d.montoPagado), formatearBs(d.montoAjustado), formatearBs(d.saldo), `<span class="cliente-estado ${d.estado === 'VENCIDA' ? 'vencida' : ''}">${esc(d.estado)}</span>`, Number(d.saldo) > 0 && d.estado !== 'ANULADA' ? `<button class="btn btn-primary btn-sm" data-pagar-cuenta="${esc(d.id)}">Pagar</button>` : '']));
        cont.querySelectorAll('[data-pagar-cuenta]').forEach(btn => btn.addEventListener('click', () => abrirPagoCliente(btn.dataset.pagarCuenta)));
    } else if (tab === 'PAGOS') {
        cont.innerHTML = tablaSimple(['Fecha','Origen','Monto','Método','Usuario','Estado',''], _perfil.pagos.map(p => [fecha(p.fechaPago), esc(p.origen || 'Abono a crédito'), formatearBs(p.monto), esc(p.metodoPago), esc(p.usuario), esc(p.estado), store.sessionRol === 'ADMIN' && p.anulable !== false && p.estado === 'REGISTRADO' ? `<button class="btn btn-ghost btn-sm" data-anular-pago="${esc(p.id)}">Anular</button>` : '']));
        cont.querySelectorAll('[data-anular-pago]').forEach(btn => btn.addEventListener('click', () => anularPagoCliente(btn.dataset.anularPago)));
    } else {
        cont.innerHTML = `<div class="cliente-datos-grid"><div><span>Documento</span><strong>${esc(c.documento || '—')}</strong></div><div><span>Teléfono</span><strong>${esc(c.telefono || '—')}</strong></div><div><span>Email</span><strong>${esc(c.email || '—')}</strong></div><div><span>Dirección</span><strong>${esc(c.direccion || '—')}</strong></div><div><span>Límite</span><strong>${formatearBs(c.limiteCredito)}</strong></div><div><span>Observaciones</span><strong>${esc(c.observaciones || '—')}</strong></div></div>`;
    }
}

function tablaSimple(headers, rows) {
    if (!rows.length) return '<div class="empty-state">Sin registros</div>';
    return `<div class="clientes-tabla-wrap"><table class="clientes-tabla"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function abrirPagoCliente(cuentaId) {
    const deuda = _perfil.deudas.find(d => d.id === cuentaId);
    if (!deuda) return;
    document.getElementById('clientePagoCuentaId').value = cuentaId;
    document.getElementById('clientePagoSaldo').textContent = formatearBs(deuda.saldo);
    document.getElementById('clientePagoMonto').value = '';
    document.getElementById('clientePagoMonto').max = deuda.saldo;
    document.getElementById('clientePagoObservaciones').value = '';
    document.getElementById('clientePagoOverlay').style.display = 'flex';
}

export function cerrarPagoCliente() { document.getElementById('clientePagoOverlay').style.display = 'none'; }

export async function registrarPagoCliente() {
    const cuentaId = document.getElementById('clientePagoCuentaId').value;
    const monto = Number(document.getElementById('clientePagoMonto').value);
    const deuda = _perfil.deudas.find(d => d.id === cuentaId);
    if (!deuda || !Number.isFinite(monto) || monto <= 0 || monto > Number(deuda.saldo)) { mostrarMsg('El monto debe ser mayor a 0 y no superar el saldo', 'err'); return; }
    const loader = document.getElementById('loaderClientePago'); loader.style.display = 'block';
    try {
        const data = await api({ ACCION: 'REGISTRAR_PAGO_CLIENTE', CUENTA_ID: cuentaId, MONTO: monto, METODO_PAGO: document.getElementById('clientePagoMetodo').value, OBSERVACIONES: document.getElementById('clientePagoObservaciones').value.trim(), TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        if (!data.ok) { mostrarMsg('Error: ' + (data.error || 'No se pudo registrar'), 'err'); return; }
        mostrarMsg('Pago registrado · Saldo: ' + formatearBs(data.nuevoSaldo), 'ok');
        cerrarPagoCliente();
        await abrirPerfilCliente(_perfil.cliente.id);
    } catch (_) { mostrarMsg('Error de conexión', 'err'); }
    finally { loader.style.display = 'none'; }
}

export async function anularPagoCliente(pagoId) {
    const motivo = prompt('Motivo de la anulación:');
    if (!motivo?.trim()) return;
    try {
        const data = await api({ ACCION: 'ANULAR_PAGO_CLIENTE', PAGO_ID: pagoId, MOTIVO: motivo.trim(), TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        if (!data.ok) { mostrarMsg('Error: ' + (data.error || 'No se pudo anular'), 'err'); return; }
        mostrarMsg('Pago anulado', 'ok');
        await abrirPerfilCliente(_perfil.cliente.id);
    } catch (_) { mostrarMsg('Error de conexión', 'err'); }
}
