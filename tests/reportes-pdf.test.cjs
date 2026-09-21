const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function cargarGenerador() {
    const fuente = fs.readFileSync(path.resolve(__dirname, '../js/modos/reportes-pdf.js'), 'utf8')
        .replaceAll('export ', '')
        .concat('\nglobalThis.pdfReportesPrueba = { construirReporteParaImprimir, crearArchivoPdfReporte };');
    const contexto = vm.createContext({ Blob, Uint8Array });
    vm.runInContext(fuente, contexto);
    return contexto.pdfReportesPrueba;
}

function reporteVentas(datos = []) {
    return {
        titulo: 'Ventas por Período',
        fecha: '21/9/2026, 10:00',
        usuario: 'Ana',
        resumen: { operaciones: 12, lineas_legacy: 18, total_bs: 320.5 },
        columnas: [
            { etiqueta: 'Período', campo: '_periodo' },
            { etiqueta: 'Sucursal', campo: 'sucursal' },
            { etiqueta: 'Tipo', campo: 'tipo' },
            { etiqueta: 'Método', campo: 'metodo_pago' },
            { etiqueta: 'Operaciones', campo: 'operaciones', formato: 'numero' },
            { etiqueta: 'Líneas históricas', campo: 'lineas_legacy', formato: 'numero' },
            { etiqueta: 'Unidades', campo: 'unidades', formato: 'numero' },
            { etiqueta: 'Total Bs', campo: 'total_bs', formato: 'moneda' },
        ],
        datos,
    };
}

test('el formato de REPORTES usa Carta horizontal y campos técnicos correctos', () => {
    const { construirReporteParaImprimir } = cargarGenerador();
    const html = construirReporteParaImprimir(reporteVentas([{
        mes: 'SEPTIEMBRE', anio: 2026, sucursal: 'CENTRAL', tipo: 'PRODUCTO', metodo_pago: 'EFECTIVO',
        operaciones: 12, lineas_legacy: 18, unidades: 24, total_bs: 320.5,
    }]));

    assert.match(html, /@page\{size:letter landscape/);
    assert.match(html, /SEPTIEMBRE 2026/);
    assert.match(html, /18/);
    assert.match(html, /Bs 320\.50/);
});

test('el PDF móvil de REPORTES es Carta horizontal y pagina tablas extensas', async () => {
    const { crearArchivoPdfReporte } = cargarGenerador();
    const datos = Array.from({ length: 80 }, (_, indice) => ({
        mes: 'SEPTIEMBRE', anio: 2026, sucursal: 'CENTRAL', tipo: 'PRODUCTO', metodo_pago: 'EFECTIVO',
        operaciones: indice + 1, lineas_legacy: indice + 2, unidades: indice + 3, total_bs: 100 + indice,
    }));
    const archivo = crearArchivoPdfReporte(reporteVentas(datos));
    const contenido = await archivo.text();

    assert.equal(archivo.type, 'application/pdf');
    assert.match(contenido, /^%PDF-1\.4/);
    assert.match(contenido, /\/MediaBox \[0 0 792 612\]/);
    assert.match(contenido, /\/Count [2-9]/);
});

test('REPORTES imprime sin pestañas y comparte el archivo PDF nativo', () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, '../js/modos/reportes.js'), 'utf8');

    assert.doesNotMatch(fuente, /window\.open/);
    assert.match(fuente, /navigator\.share/);
    assert.match(fuente, /afterprint/);
});
