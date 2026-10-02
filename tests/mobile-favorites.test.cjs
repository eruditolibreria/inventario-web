const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../js/mobile-navigation.js'), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/\bexport /g, '');

function setup() {
    const storage = new Map();
    const store = { sessionUsuarioId: 'user-A', sessionUser: 'ADMIN' };
    const context = vm.createContext({ store, localStorage: { getItem: key => storage.get(key) ?? null } });
    vm.runInContext(source, context);
    const run = code => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
    return { storage, store, run };
}

test('sin preferencias usa Venta, Buscar, Clientes y Láminas en ese orden', () => {
    const f = setup();
    assert.deepEqual(f.run('leerFavoritos()'), ['VENTA', 'BUSQUEDA', 'CLIENTES', 'LAMINAS']);
    assert.equal(f.storage.size, 0);
});

test('conserva el orden elegido, sin duplicados, códigos inválidos ni más de cuatro accesos', () => {
    const f = setup();
    f.storage.set(f.run('claveFavoritos()'), JSON.stringify(['CAJA', 'CAJA', null, 'OTRO', 'REPORTES', 'SERVICIOS', 'CLIENTES', 'VENTA']));
    assert.deepEqual(f.run('leerFavoritos()'), ['CAJA', 'REPORTES', 'SERVICIOS', 'CLIENTES']);
});

test('una selección vacía es válida y no se reemplaza por los valores iniciales', () => {
    const f = setup();
    f.storage.set(f.run('claveFavoritos()'), '[]');
    assert.deepEqual(f.run('leerFavoritos()'), []);
});

test('datos corruptos o un almacenamiento inaccesible permiten recuperar la navegación inicial', () => {
    const f = setup();
    const clave = f.run('claveFavoritos()');
    for (const value of ['{', '{}', 'null', '"VENTA"']) {
        f.storage.set(clave, value);
        assert.deepEqual(f.run('leerFavoritos()'), ['VENTA', 'BUSQUEDA', 'CLIENTES', 'LAMINAS']);
    }
    f.run('localStorage.getItem = () => { throw new Error("storage blocked"); }; leerFavoritos()');
    assert.deepEqual(f.run('leerFavoritos()'), ['VENTA', 'BUSQUEDA', 'CLIENTES', 'LAMINAS']);
});

test('los favoritos se aíslan por el identificador del usuario y sobreviven al cambio de cuenta', () => {
    const f = setup();
    const claveA = f.run('claveFavoritos()');
    f.storage.set(claveA, '["CAJA","REPORTES"]');
    f.store.sessionUsuarioId = 'user-B';
    assert.notEqual(f.run('claveFavoritos()'), claveA);
    assert.deepEqual(f.run('leerFavoritos()'), ['VENTA', 'BUSQUEDA', 'CLIENTES', 'LAMINAS']);
    f.store.sessionUsuarioId = 'user-A';
    assert.deepEqual(f.run('leerFavoritos()'), ['CAJA', 'REPORTES']);
    f.store.sessionUser = 'NUEVO_NOMBRE';
    assert.equal(f.run('claveFavoritos()'), claveA);
});

test('las sesiones sin identificador usan el usuario y nunca una clave compartida anónima', () => {
    const f = setup();
    f.store.sessionUsuarioId = null;
    const claveA = f.run('claveFavoritos()');
    f.store.sessionUser = 'VENDEDOR';
    assert.notEqual(f.run('claveFavoritos()'), claveA);
    f.store.sessionUser = null;
    assert.equal(f.run('claveFavoritos()'), null);
});
