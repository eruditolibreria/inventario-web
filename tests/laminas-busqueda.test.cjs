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
        appendChild(hijo) { this.children.push(hijo); },
        addEventListener() {},
        querySelector() { return null; },
    };
}

function cargarModuloLaminas(canEditar = false) {
    const elementos = Object.fromEntries([
        'laminaInput', 'laminaFiltroSucursal', 'laminaFiltroEstado',
        'listaLaminasResultados', 'laminaResultados', 'loaderBuscarLamina',
        'laminaPaginacion', 'laminaPaginaInfo', 'laminaPaginaAnterior', 'laminaPaginaSiguiente',
        'laminaEditTitulo', 'laminaEditCategoria', 'laminaEditUbicacion', 'laminaEditSucursal',
        'laminaEditResultado', 'laminaEditOverlay', 'btnGuardarLamina',
    ].map(id => [id, crearElemento()]));
    const pendientes = [];
    const fuente = fs.readFileSync(path.resolve(__dirname, '../js/modos/laminas.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '')
        .replaceAll('export ', '')
        .concat('\nglobalThis.laminasPrueba = { buscarLaminas, abrirEditarLamina, guardarEdicionLamina };');
    const contexto = vm.createContext({
        document: {
            getElementById(id) { return elementos[id]; },
            createElement() { return crearElemento(); },
        },
        store: { sessionToken: 'token-prueba' },
        api: body => new Promise(resolve => pendientes.push({ body, resolve })),
        manejarRespuesta: () => true,
        mostrarMsg() {},
        can: () => canEditar,
        clearTimeout,
        setTimeout,
    });
    vm.runInContext(fuente, contexto);
    return { elementos, pendientes, ...contexto.laminasPrueba };
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
