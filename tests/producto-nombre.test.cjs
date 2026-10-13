const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/modos/admin.js'), 'utf8');
const editor = source.slice(source.indexOf('var _productoEditando = null;'), source.indexOf('// ══ Ajuste de inventario')).replace(/\bexport /g, '');
function setup({ priceAllowed = true, response = { ok: true } } = {}) {
    const ids = {}, messages = [], requests = [];
    for (const id of ['inventarioEditNombre','inventarioEditProducto','inventarioEditUbicacion','inventarioEditProveedor','inventarioEditPrecioVenta','inventarioEditCodigoBarras','inventarioEditImg','inventarioEditOverlay']) ids[id] = { value: '', style: {}, focus() { this.focused = true; } };
    let reloads = 0;
    const context = vm.createContext({
        document: { getElementById: id => ids[id] }, store: { sessionToken: 'fixture' },
        can: () => priceAllowed, mostrarValorInput: (input, value) => input.value = value,
        obtenerValorInput: input => input.value, mostrarMsg: (...args) => messages.push(args),
        manejarRespuesta: () => true, cargarInventarioAdmin: () => reloads++,
        api: async request => { requests.push(request); return response; }
    });
    vm.runInContext(editor, context);
    context.abrirEditarProducto({ id: 'INV-1', producto: 'NOMBRE ORIGINAL', ubicacion: 'A', proveedor: 'B', precioVenta: 10, codigoBarras: '00123' });
    return { context, ids, requests, messages, reloads: () => reloads };
}
test('abrir la ficha precarga el nombre editable y conservar ID al guardar', async () => {
    const f = setup();
    assert.equal(f.ids.inventarioEditProducto.value, 'NOMBRE ORIGINAL');
    f.ids.inventarioEditProducto.value = '  NOMBRE CORREGIDO  ';
    await f.context.guardarEdicionProducto();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].ID, 'INV-1');
    assert.equal(f.requests[0].PRODUCTO, 'NOMBRE CORREGIDO');
    assert.equal(f.requests[0].NOMBRE_ORIGINAL, 'NOMBRE ORIGINAL');
    assert.equal(f.requests[0].CODIGO_BARRAS, '00123');
    assert.equal(f.ids.inventarioEditOverlay.style.display, 'none');
    assert.equal(f.reloads(), 1);
});
test('nombre vacio conserva la ficha y no llama al servidor', async () => {
    const f = setup();
    f.ids.inventarioEditProducto.value = '   ';
    await f.context.guardarEdicionProducto();
    assert.equal(f.requests.length, 0);
    assert.equal(f.ids.inventarioEditProducto.focused, true);
    assert.equal(f.ids.inventarioEditOverlay.style.display, 'flex');
});
test('sin permiso de precios renombra sin enviar PRECIO_VENTA', async () => {
    const f = setup({ priceAllowed: false });
    f.ids.inventarioEditProducto.value = 'NOMBRE CORREGIDO';
    await f.context.guardarEdicionProducto();
    assert.equal(f.requests[0].PRODUCTO, 'NOMBRE CORREGIDO');
    assert.equal(f.requests[0].PRECIO_VENTA, undefined);
});
for (const error of ['PRODUCTO_NOMBRE_DUPLICADO','PRODUCTO_MODIFICADO_RECARGA']) test(error + ': conserva nombre escrito para resolver el conflicto', async () => {
    const f = setup({ response: { ok: false, error } });
    f.ids.inventarioEditProducto.value = 'NOMBRE CORREGIDO';
    await f.context.guardarEdicionProducto();
    assert.equal(f.ids.inventarioEditProducto.value, 'NOMBRE CORREGIDO');
    assert.equal(f.ids.inventarioEditOverlay.style.display, 'flex');
    assert.equal(f.reloads(), 0);
    assert.ok(!f.messages.at(-1)[0].includes(error));
});
