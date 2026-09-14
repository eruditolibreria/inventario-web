const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../js/importacion-inventario.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source.replaceAll('export ', ''), ctx);

test('reconoce encabezados normalizados y exige los cuatro campos mínimos', () => {
    assert.deepEqual(
        [...ctx.validarEncabezadosImportacion(['Producto', 'Sucursal', 'Stock inicial', 'Precio venta'])],
        []
    );
    assert.deepEqual(
        [...ctx.validarEncabezadosImportacion(['Producto', 'Sucursal'])],
        ['Falta la columna obligatoria: stock_inicial.', 'Falta la columna obligatoria: precio_venta.']
    );
});

test('convierte una fila válida al contrato de la RPC', () => {
    const { items, errores } = ctx.validarFilasImportacion([{
        producto: 'Cuaderno A4', sucursal: 'Central', stock_inicial: '12', precio_venta: '18,50',
        costo_unitario: '10', codigo_barras: '000123', stock_minimo: '3', fecha_entrada: '2026-09-14'
    }]);

    assert.equal(errores.length, 0);
    assert.deepEqual({ ...items[0] }, {
        producto: 'CUADERNO A4', sucursal: 'CENTRAL', stockInicial: 12, precioVenta: 18.5,
        categoria: '', costoUnitario: 10, codigoBarras: '000123', proveedor: '', ubicacion: '',
        stockMinimo: 3, fechaEntrada: '2026-09-14'
    });
});

test('bloquea stock inválido y duplicados de producto o código por sucursal', () => {
    const { errores } = ctx.validarFilasImportacion([
        { producto: 'Lápiz', sucursal: 'Central', stock_inicial: '-1', precio_venta: '2' },
        { producto: 'Regla', sucursal: 'Central', stock_inicial: '2', precio_venta: '4', codigo_barras: '123' },
        { producto: 'Regla', sucursal: 'Central', stock_inicial: '3', precio_venta: '4', codigo_barras: '123' },
    ]);

    assert.equal(errores.length, 2);
    assert.match(errores[0], /stock_inicial/);
    assert.match(errores[1], /producto repetido/);
});
