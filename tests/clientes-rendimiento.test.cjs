const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
    const elementos = new Map();
    const element = id => {
        if (!elementos.has(id)) elementos.set(id, {
            value: '', dataset: {}, innerHTML: '', style: {}, textContent: '', listeners: {},
            classList: { add() {}, remove() {}, toggle() {} },
            addEventListener(event, fn) { this.listeners[event] = fn; },
            querySelector: selector => element(selector), querySelectorAll: () => [],
            insertAdjacentHTML(_, html) { this.innerHTML += html; },
        });
        return elementos.get(id);
    };
    const pending = [];
    const store = { sessionToken: 'token', sessionUser: 'ANA', sessionPermisos: ['clientes.ver', 'clientes.ver_deudas'] };
    const ctx = vm.createContext({
        document: { getElementById: element }, store, AbortController, setTimeout, clearTimeout,
        api: (body, options) => new Promise((resolve, reject) => pending.push({ body, options, resolve, reject })),
        manejarRespuesta: data => data.error !== 'NO_AUTORIZADO', can: () => true,
        mostrarMsg() {}, formatearBs: n => `Bs ${n}`, prompt: () => 'Prueba',
    });
    const source = fs.readFileSync(path.resolve(__dirname, '../js/modos/clientes.js'), 'utf8')
        .replace(/^import .*;\r?$/gm, '').replaceAll('export ', '');
    vm.runInContext(source, ctx);
    ctx.initClientes();
    element('filtroClientes').value = 'TODOS';
    return { ctx, element, pending, store };
}
const tick = () => new Promise(setImmediate);
const lista = (nombre, paginas = 1) => ({ ok: true, datos: [{ id: nombre, nombre }], paginas });
const perfil = (id = 'c1', tab = 'HISTORIAL') => ({ ok: true, cliente: { id, nombre: id }, tab,
    movimientos: { ok: true, datos: [], pagina: 1, hayMas: false } });

test('búsquedas atrasadas no reemplazan datos nuevos ni su paginación', async () => {
    const h = setup();
    h.element('buscarClientes').value = 'Viejo';
    const a = h.ctx.cargarClientesModulo(1);
    h.element('buscarClientes').value = 'Nuevo';
    const b = h.ctx.cargarClientesModulo(2);
    assert.equal(h.pending[0].options.signal.aborted, true);
    h.pending[1].resolve(lista('Nuevo', 3)); await b;
    h.pending[0].resolve(lista('Viejo', 9)); await a;
    assert.match(h.element('tablaClientes').innerHTML, /Nuevo/);
    assert.doesNotMatch(h.element('tablaClientes').innerHTML, /Viejo/);
    assert.equal(h.element('clientesPaginaInfo').textContent, 'Página 2 de 3');
});

test('solicitudes iguales en curso se deduplican', async () => {
    const h = setup();
    const a = h.ctx.cargarClientesModulo(1), b = h.ctx.cargarClientesModulo(1);
    assert.equal(h.pending.length, 1);
    h.pending[0].resolve(lista('Uno')); await Promise.all([a, b]);
});

test('escribir invalida inmediatamente la búsqueda anterior antes del debounce', async () => {
    const h = setup();
    const a = h.ctx.cargarClientesModulo(1);
    h.element('buscarClientes').value = 'Cambio';
    h.element('buscarClientes').listeners.input();
    h.pending[0].resolve(lista('Obsoleto')); await a;
    assert.doesNotMatch(h.element('tablaClientes').innerHTML, /Obsoleto/);
    vm.runInContext('clearTimeout(_timerBusqueda)', h.ctx);
});

test('cambiar usuario descarta una respuesta pendiente', async () => {
    const h = setup();
    const a = h.ctx.cargarClientesModulo(1);
    h.store.sessionUser = 'OTRO';
    h.pending[0].resolve(lista('Privado')); await a;
    assert.doesNotMatch(h.element('tablaClientes').innerHTML, /Privado/);
});

test('el perfil inicial reutiliza historial y carga deudas solo al seleccionarlas', async () => {
    const h = setup();
    const a = h.ctx.abrirPerfilCliente('c1');
    assert.equal(h.pending[0].body.DIFERIDO, true);
    h.pending[0].resolve(perfil()); await a;
    assert.equal(h.pending.length, 1);
    h.ctx.renderPerfil('DEUDAS');
    assert.equal(h.pending[1].body.ACCION, 'OBTENER_CLIENTE_MOVIMIENTOS');
    assert.equal(h.pending[1].body.TAB, 'DEUDAS');
    h.pending[1].resolve({ ok: true, datos: [], pagina: 1, hayMas: false }); await tick();
    h.ctx.renderPerfil('HISTORIAL'); h.ctx.renderPerfil('DEUDAS');
    assert.equal(h.pending.length, 2);
});

test('una pestaña atrasada no pisa la pestaña seleccionada', async () => {
    const h = setup();
    const a = h.ctx.abrirPerfilCliente('c1'); h.pending[0].resolve(perfil()); await a;
    h.ctx.renderPerfil('DEUDAS');
    h.ctx.renderPerfil('DATOS');
    h.pending[1].resolve({ ok: true, datos: [], pagina: 1 }); await tick();
    assert.match(h.element('clienteTabContenido').innerHTML, /cliente-datos-grid/);
});

test('cerrar el perfil descarta su respuesta pendiente', async () => {
    const h = setup();
    const a = h.ctx.abrirPerfilCliente('c1');
    h.ctx.cerrarPerfilCliente();
    h.pending[0].resolve(perfil()); await a;
    assert.equal(vm.runInContext('_perfil', h.ctx), null);
});

test('paginación del historial solicita y muestra la siguiente página', async () => {
    const h = setup();
    const a = h.ctx.abrirPerfilCliente('c1');
    const p = perfil(); p.movimientos.hayMas = true;
    h.pending[0].resolve(p); await a;
    h.element('#clienteTabSiguiente').listeners.click();
    assert.equal(h.pending[1].body.PAGINA, 2);
    h.pending[1].resolve({ ok: true, datos: [], pagina: 2, hayMas: false }); await tick();
    assert.match(h.element('clienteTabContenido').innerHTML, /Página 2/);
});

test('un error de pestaña permite reintentar sin cachear el fallo', async () => {
    const h = setup();
    const a = h.ctx.abrirPerfilCliente('c1'); h.pending[0].resolve(perfil()); await a;
    h.ctx.renderPerfil('PAGOS'); h.pending[1].resolve({ ok: false, error: 'DB' }); await tick();
    assert.match(h.element('clienteTabContenido').innerHTML, /Reintentar/);
    h.element('#clienteTabReintentar').listeners.click();
    assert.equal(h.pending.length, 3);
    h.pending[2].resolve({ ok: true, datos: [], pagina: 1 }); await tick();
});

test('editar un perfil actualiza el perfil sin esperar un listado oculto', async () => {
    const h = setup();
    const a = h.ctx.abrirPerfilCliente('c1'); h.pending[0].resolve(perfil()); await a;
    h.element('clienteFormId').value = 'c1';
    h.element('clienteNombre').value = 'Editado';
    const saved = h.ctx.guardarCliente();
    h.pending[1].resolve({ ok: true }); await tick();
    assert.equal(h.pending[2].body.ACCION, 'OBTENER_CLIENTE');
    assert.equal(h.pending.some(x => x.body.ACCION === 'LISTAR_CLIENTES_MODULO'), false);
    h.pending[2].resolve(perfil()); await saved;
    h.ctx.cerrarPerfilCliente();
    assert.equal(h.pending[3].body.ACCION, 'LISTAR_CLIENTES_MODULO');
    h.pending[3].resolve(lista('Editado')); await tick();
});

test('pagar renueva saldos y deudas, descarta caché y refresca listado al volver', async () => {
    const h = setup();
    const a = h.ctx.abrirPerfilCliente('c1', 'DEUDAS');
    const p = perfil('c1', 'DEUDAS'); p.movimientos.datos = [{ id: 'd1', saldo: 20 }];
    h.pending[0].resolve(p); await a;
    h.element('clientePagoCuentaId').value = 'd1'; h.element('clientePagoMonto').value = '10';
    const paid = h.ctx.registrarPagoCliente();
    h.pending[1].resolve({ ok: true, nuevoSaldo: 10 }); await tick();
    assert.equal(h.pending[2].body.ACCION, 'OBTENER_CLIENTE');
    assert.equal(h.pending[2].body.TAB, 'DEUDAS');
    h.pending[2].resolve(perfil('c1', 'DEUDAS')); await paid;
    assert.equal(vm.runInContext('_listadoSucio', h.ctx), true);
    h.ctx.cerrarPerfilCliente();
    assert.equal(h.pending[3].body.ACCION, 'LISTAR_CLIENTES_MODULO');
    h.pending[3].resolve(lista('Actualizado')); await tick();
});

test('la caché de pestañas vence a los 15 segundos', async () => {
    const h = setup();
    const a = h.ctx.abrirPerfilCliente('c1'); h.pending[0].resolve(perfil()); await a;
    vm.runInContext("_perfil.tabs['HISTORIAL:1'].cachedAt = Date.now() - 15001", h.ctx);
    h.ctx.renderPerfil('HISTORIAL');
    assert.equal(h.pending[1].body.ACCION, 'OBTENER_CLIENTE_MOVIMIENTOS');
    h.pending[1].resolve({ ok: true, datos: [], pagina: 1 }); await tick();
});

test('la caché del perfil no se reutiliza al cambiar permisos', async () => {
    const h = setup();
    const a = h.ctx.abrirPerfilCliente('c1'); h.pending[0].resolve(perfil()); await a;
    h.store.sessionPermisos = [];
    h.ctx.renderPerfil('DATOS');
    assert.equal(vm.runInContext('_perfil', h.ctx), null);
});
