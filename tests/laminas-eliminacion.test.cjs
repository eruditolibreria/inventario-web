const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(setImmediate);
const lamina = { id: 'LAM-1', titulo: 'Paisaje', sucursal: 'DEL_A', estado: 'SIN STOCK' };
function element() {
    return { value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, children: [], listeners: {},
        addEventListener(name, fn) { this.listeners[name] = fn; }, appendChild(child) { this.children.push(child); }, querySelector() { return null; },
        showModal() { this.open = true; }, close() { this.open = false; this.listeners.close?.(); }
    };
}
function setup(permissions = ['laminas.eliminar']) {
    const permitted = new Set(permissions), requests = [], messages = [];
    const elements = Object.fromEntries(['laminaInput','laminaFiltroSucursal','laminaFiltroEstado','listaLaminasResultados','laminaResultados','loaderBuscarLamina','laminaPaginacion','laminaPaginaInfo','laminaPaginaAnterior','laminaPaginaSiguiente','btnPdfLaminasSinStock','laminaEliminarDialog','laminaEliminarCancelar','laminaEliminarConfirmar','laminaEliminarNombre','laminaEliminarSucursal','laminaEliminarResultado'].map(id => [id, element()]));
    const context = vm.createContext({
        document: { getElementById: id => elements[id], createElement: element },
        store: { sessionToken: 'fixture' }, can: permission => permitted.has(permission),
        nombreSucursalVisible: () => 'Sucursal A', manejarRespuesta: () => true,
        mostrarMsg: (...args) => messages.push(args), setTimeout, clearTimeout,
        api: body => new Promise((resolve, reject) => requests.push({ body, resolve, reject }))
    });
    const source = fs.readFileSync(path.join(__dirname, '../js/modos/laminas.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '')
        .replace(/import\(["']\.\/laminas-pdf\.js["']\)/g, 'Promise.resolve({})');
    vm.runInContext(source + '\nglobalThis.moduleTest = { renderLaminaCard, abrirEliminarLamina, confirmarEliminarLamina, buscarLaminas, precargarReporteLaminasSinStock, cache: reportesSinStockCache };', context);
    return { ...context.moduleTest, elements, requests, messages, context, permitted };
}
test('Eliminar requiere su permiso propio y puede mostrarse sin Editar', () => {
    const f = setup();
    const card = f.renderLaminaCard(lamina);
    assert.match(card.innerHTML, /data-accion="eliminar"/);
    assert.doesNotMatch(card.innerHTML, /data-accion="editar"/);
    assert.doesNotMatch(setup(['laminas.editar']).renderLaminaCard(lamina).innerHTML, /data-accion="eliminar"/);
});
test('Cancelar cierra la confirmacion sin solicitudes', async () => {
    const f = setup(); f.abrirEliminarLamina(lamina);
    assert.equal(f.elements.laminaEliminarDialog.open, true);
    assert.equal(f.elements.laminaEliminarNombre.textContent, 'Paisaje');
    assert.equal(f.elements.laminaEliminarSucursal.textContent, 'Sucursal A');
    f.elements.laminaEliminarCancelar.listeners.click();
    await f.confirmarEliminarLamina();
    assert.equal(f.elements.laminaEliminarDialog.open, false);
    assert.equal(f.requests.length, 0);
});
test('bloquea solicitudes repetidas y Escape mientras elimina; un fallo permite reintentar', async () => {
    const f = setup(); f.abrirEliminarLamina(lamina);
    const work = f.confirmarEliminarLamina();
    await f.confirmarEliminarLamina();
    assert.equal(f.requests.length, 1);
    assert.equal(f.elements.laminaEliminarConfirmar.disabled, true);
    let prevented = false;
    f.elements.laminaEliminarDialog.listeners.cancel({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(f.requests[0].body.ACCION, 'ELIMINAR_LAMINA');
    assert.equal(f.requests[0].body.ID, 'LAM-1');
    f.requests[0].reject(new Error('offline')); await work;
    assert.equal(f.elements.laminaEliminarDialog.open, true);
    assert.equal(f.elements.laminaEliminarConfirmar.disabled, false);
    assert.match(f.elements.laminaEliminarResultado.textContent, /conexión/);
    const retry = f.confirmarEliminarLamina();
    f.requests[1].resolve({ ok: false, error: 'LAMINA_NO_ENCONTRADA' }); await retry;
    assert.match(f.elements.laminaEliminarResultado.textContent, /ya no existe/);
});
for (const change of ['permiso','sesion']) test(change + ': no elimina desde una confirmacion desactualizada', async () => {
    const f = setup(); f.abrirEliminarLamina(lamina);
    if (change === 'permiso') f.permitted.clear(); else f.context.store.sessionToken = 'otra-sesion';
    await f.confirmarEliminarLamina();
    assert.equal(f.requests.length, 0);
    assert.match(f.elements.laminaEliminarResultado.textContent, /cambiaron/);
});
test('eliminar la ultima tarjeta de una pagina vuelve a la anterior, conserva filtros e invalida el PDF', async () => {
    const f = setup();
    f.elements.laminaInput.value = 'Paisaje'; f.elements.laminaFiltroSucursal.value = 'DEL_A'; f.elements.laminaFiltroEstado.value = 'SIN STOCK';
    const report = f.precargarReporteLaminasSinStock('DEL_A');
    f.requests[0].resolve({ ok: true, datos: [lamina] }); await report;
    assert.equal(f.cache.get('DEL_A').length, 1);
    const search = f.buscarLaminas(true, 2);
    f.requests[1].resolve({ ok: true, datos: [lamina], total: 21, pagina: 2 }); await search;
    f.abrirEliminarLamina(lamina);
    const work = f.confirmarEliminarLamina();
    f.requests[2].resolve({ ok: true }); await tick();
    assert.equal(f.elements.laminaEliminarDialog.open, false);
    assert.equal(f.cache.has('DEL_A'), false);
    const reportFresh = f.requests[3], page2 = f.requests[4];
    assert.equal(reportFresh.body.ACCION, 'LISTAR_LAMINAS_SIN_STOCK');
    assert.equal(page2.body.PAGINA, 2);
    assert.equal(page2.body.TEXTO, 'Paisaje'); assert.equal(page2.body.SUCURSAL, 'DEL_A'); assert.equal(page2.body.ESTADO, 'SIN STOCK');
    reportFresh.resolve({ ok: true, datos: [] });
    page2.resolve({ ok: true, datos: [], total: 20, pagina: 2 }); await tick();
    const page1 = f.requests[5]; assert.equal(page1.body.PAGINA, 1);
    page1.resolve({ ok: true, datos: [{...lamina,id:'LAM-2'}], total: 20, pagina: 1 }); await work;
    assert.equal(f.cache.get('DEL_A').length, 0);
    assert.equal(f.elements.laminaPaginacion.style.display, 'none');
    assert.equal(f.elements.laminaPaginaAnterior.disabled, true);
    assert.equal(f.elements.laminaEliminarConfirmar.disabled, false);
});
