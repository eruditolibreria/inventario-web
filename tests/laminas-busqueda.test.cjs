const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function crearElemento() {
    return {
        value: '',
        innerHTML: '',
        textContent: '',
        style: {},
        className: '',
        children: [],
        listeners: {},
        appendChild(hijo) { this.children.push(hijo); },
        insertAdjacentElement(_, hijo) { this.inserted = hijo; },
        addEventListener(tipo, escucha) { this.listeners[tipo] = escucha; },
        querySelector() { return null; },
    };
}

function cargarModuloLaminas(canEditar = false) {
    const elementos = Object.fromEntries([
        'laminaInput', 'laminaFiltroSucursal', 'laminaFiltroEstado',
        'listaLaminasResultados', 'laminaResultados', 'loaderBuscarLamina',
        'laminaPaginacion', 'laminaPaginaInfo', 'laminaPaginaAnterior', 'laminaPaginaSiguiente',
        'laminaBuscarLaminas',
        'laminaEditTitulo', 'laminaEditCategoria', 'laminaEditUbicacion',
        'laminaEditResultado', 'laminaEditOverlay', 'laminaDetalleOverlay', 'laminaDetalleContenido', 'btnGuardarLamina', 'btnPdfLaminasSinStock',
    ].map(id => [id, crearElemento()]));
    const pendientes = [];
    const fuente = fs.readFileSync(path.resolve(__dirname, '../js/modos/laminas.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '')
        .replaceAll('export ', '')
        .concat('\nglobalThis.laminasPrueba = { initLaminasMode, buscarLaminas, renderLaminaCard, abrirEditarLamina, guardarEdicionLamina, cerrarDetalleLamina, generarReporteLaminasSinStock, precargarReporteLaminasSinStock };');
    const contexto = vm.createContext({
        document: {
            getElementById(id) { return elementos[id]; },
            createElement() { return crearElemento(); },
            querySelector(selector) { return selector === "#lam-BUSCAR button[onclick='buscarLaminas(true)']" ? elementos.laminaBuscarLaminas : null; },
        },
        store: { sessionToken: 'token-prueba' },
        api: body => new Promise(resolve => pendientes.push({ body, resolve })),
        manejarRespuesta: () => true,
        mostrarMsg() {},
        can: () => canEditar,
        clearTimeout,
        setTimeout,
        Blob,
        Uint8Array,
    });
    vm.runInContext(fuente, contexto);
    return { elementos, pendientes, ...contexto.laminasPrueba };
}

function cargarModuloPdfLaminas() {
    const fuente = fs.readFileSync(path.resolve(__dirname, '../js/modos/laminas-pdf.js'), 'utf8')
        .replaceAll('export ', '')
        .concat('\nglobalThis.pdfLaminasPrueba = { construirReporteLaminasSinStock, crearArchivoPdfLaminasSinStock };');
    const contexto = vm.createContext({ Blob, Uint8Array });
    vm.runInContext(fuente, contexto);
    return contexto.pdfLaminasPrueba;
}

test('la búsqueda de láminas conserva únicamente la respuesta más reciente', async () => {
    const { elementos, pendientes, buscarLaminas } = cargarModuloLaminas();
    elementos.laminaInput.value = 'Aves';
    buscarLaminas(true);
    elementos.laminaInput.value = 'Paisajes';
    buscarLaminas(true);

    pendientes[1].resolve({ ok: true, datos: [] });
    await new Promise(setImmediate);
    pendientes[0].resolve({ ok: true, datos: [] });
    await new Promise(setImmediate);

    assert.equal(elementos.listaLaminasResultados.children.length, 1);
    assert.equal(elementos.listaLaminasResultados.children[0].textContent, 'No se encontraron láminas para “Paisajes”.');
    assert.equal(elementos.laminaResultados.textContent, 'Sin resultados');
});

test('la búsqueda por filtro no requiere título y limpiar el criterio oculta el indicador', () => {
    const { elementos, pendientes, buscarLaminas } = cargarModuloLaminas();
    elementos.laminaFiltroSucursal.value = 'CENTRAL';
    buscarLaminas(true);

    assert.deepEqual({ ...pendientes[0].body }, {
        ACCION: 'BUSCAR_LAMINAS', TEXTO: '', LIMITE: 20, PAGINA: 1,
        SUCURSAL: 'CENTRAL', ESTADO: undefined, TOKEN: 'token-prueba',
    });

    elementos.laminaFiltroSucursal.value = '';
    buscarLaminas();
    assert.equal(elementos.loaderBuscarLamina.style.display, 'none');
    assert.equal(elementos.laminaResultados.textContent, '');
});

test('la búsqueda general solicita la página indicada y muestra el total', async () => {
    const { elementos, pendientes, buscarLaminas } = cargarModuloLaminas();
    elementos.laminaInput.value = 'Estante A3';
    buscarLaminas(true, 2);

    assert.equal(pendientes[0].body.TEXTO, 'Estante A3');
    assert.equal(pendientes[0].body.PAGINA, 2);
    pendientes[0].resolve({
        ok: true,
        total: 21,
        pagina: 2,
        datos: [{ id: 'LAM-21', titulo: 'Paisaje', categoria: 'Arte', ubicacion: 'Estante A3', sucursal: 'CENTRAL', estado: 'DISPONIBLE' }],
    });
    await new Promise(setImmediate);

    assert.equal(elementos.laminaResultados.textContent, 'Mostrando 21–21 de 21 láminas');
    assert.equal(elementos.laminaPaginaInfo.textContent, 'Página 2 de 2');
    assert.equal(elementos.laminaPaginaSiguiente.disabled, true);
});

test('la tarjeta destaca categoría y ubicación sin mostrar la sucursal', () => {
    const { renderLaminaCard } = cargarModuloLaminas();
    const tarjeta = renderLaminaCard({
        titulo: 'Paisaje', categoria: 'Arte', ubicacion: 'Estante A3', sucursal: 'CENTRAL', estado: 'DISPONIBLE',
    });

    assert.match(tarjeta.innerHTML, /Categoría/);
    assert.match(tarjeta.innerHTML, /Ubicación/);
    assert.match(tarjeta.innerHTML, /Arte/);
    assert.match(tarjeta.innerHTML, /Estante A3/);
    assert.doesNotMatch(tarjeta.innerHTML, /CENTRAL/);
});

test('la tarjeta muestra editar y el cambio de estado con texto completo', () => {
    const { renderLaminaCard } = cargarModuloLaminas(true);
    const tarjeta = renderLaminaCard({ titulo: 'Paisaje', categoria: 'Arte', ubicacion: 'Estante A3', estado: 'DISPONIBLE' });

    assert.match(tarjeta.innerHTML, /Editar/);
    assert.match(tarjeta.innerHTML, /Sin stock/);
});

test('el botón de PDF se agrega junto a la búsqueda de láminas', () => {
    const { elementos, initLaminasMode } = cargarModuloLaminas();
    delete elementos.btnPdfLaminasSinStock;
    initLaminasMode();

    assert.equal(elementos.laminaBuscarLaminas.inserted.id, 'btnPdfLaminasSinStock');
    assert.match(elementos.laminaBuscarLaminas.inserted.innerHTML, /PDF sin stock/);
});

test('la sucursal seleccionada prepara las láminas sin stock para el PDF', async () => {
    const { elementos, pendientes, precargarReporteLaminasSinStock } = cargarModuloLaminas();
    const preparacion = precargarReporteLaminasSinStock('CENTRAL');

    assert.deepEqual({ ...pendientes[0].body }, {
        ACCION: 'LISTAR_LAMINAS_SIN_STOCK', SUCURSAL: 'CENTRAL', TOKEN: 'token-prueba',
    });
    pendientes[0].resolve({ ok: true, datos: [] });
    await preparacion;

    assert.notEqual(elementos.btnPdfLaminasSinStock.disabled, true);
});

test('el PDF agrupa y ordena las láminas por categoría y título', () => {
    const { construirReporteLaminasSinStock } = cargarModuloPdfLaminas();
    const pdf = construirReporteLaminasSinStock([
        { categoria: 'NATURALEZA', titulo: 'Zorro', ubicacion: 'B2' },
        { categoria: 'ARTE', titulo: 'Mural', ubicacion: 'A2' },
        { categoria: 'ARTE', titulo: 'Ábaco', ubicacion: 'A1' },
    ], 'Sucursal Central');

    assert.ok(pdf.indexOf('ARTE') < pdf.indexOf('NATURALEZA'));
    assert.ok(pdf.indexOf('Ábaco') < pdf.indexOf('Mural'));
    assert.match(pdf, /Sucursal Central/);
    assert.match(pdf, /laminas-reporte-lista/);
    assert.match(pdf, /<section class="laminas-reporte">/);
});

test('el archivo móvil es un PDF Carta real con dos columnas', async () => {
    const { crearArchivoPdfLaminasSinStock } = cargarModuloPdfLaminas();
    const archivo = crearArchivoPdfLaminasSinStock([
        ...Array.from({ length: 60 }, (_, indice) => ({ categoria: 'ARTE', titulo: `Mural andino ${indice + 1}`, ubicacion: 'Estante A2' })),
        { categoria: 'NATURALEZA', titulo: 'Zorro', ubicacion: 'Estante B2' },
    ], 'Sucursal Central', '21/9/2026, 10:00');
    const contenido = await archivo.text();

    assert.equal(archivo.type, 'application/pdf');
    assert.match(contenido, /^%PDF-1\.4/);
    assert.match(contenido, /\/MediaBox \[0 0 612 792\]/);
    assert.match(contenido, /318/);
});

test('al tocar una tarjeta se abre su detalle y el fondo lo cierra', () => {
    const { elementos, renderLaminaCard, cerrarDetalleLamina } = cargarModuloLaminas();
    const tarjeta = renderLaminaCard({ titulo: 'Paisaje', categoria: 'Arte', ubicacion: 'Estante A3', estado: 'DISPONIBLE' });

    tarjeta.listeners.click();
    assert.equal(elementos.laminaDetalleOverlay.style.display, 'flex');
    assert.match(elementos.laminaDetalleContenido.innerHTML, /Paisaje/);
    assert.match(elementos.laminaDetalleContenido.innerHTML, /Categoría/);
    assert.match(elementos.laminaDetalleContenido.innerHTML, /Ubicación/);

    cerrarDetalleLamina({ target: elementos.laminaDetalleOverlay });
    assert.equal(elementos.laminaDetalleOverlay.style.display, 'none');
});

test('la edición envía título, categoría y ubicación de la lámina seleccionada', async () => {
    const { elementos, pendientes, abrirEditarLamina, guardarEdicionLamina } = cargarModuloLaminas(true);
    abrirEditarLamina({ id: 'LAM-21', titulo: 'Paisaje', categoria: 'Arte', ubicacion: 'A3', sucursal: 'CENTRAL' });
    elementos.laminaEditTitulo.value = 'Paisaje andino';
    elementos.laminaEditCategoria.value = 'Cultura';
    elementos.laminaEditUbicacion.value = 'Estante B2';

    const guardado = guardarEdicionLamina();
    assert.deepEqual({ ...pendientes[0].body }, {
        ACCION: 'ACTUALIZAR_LAMINA', ID: 'LAM-21', TITULO: 'Paisaje andino',
        CATEGORIA: 'Cultura', UBICACION: 'Estante B2', TOKEN: 'token-prueba',
    });
    pendientes[0].resolve({ ok: true });
    await guardado;

    assert.equal(elementos.laminaEditOverlay.style.display, 'none');
    assert.equal(elementos.btnGuardarLamina.disabled, false);
});
