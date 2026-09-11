const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../js/auth.js'), 'utf8');
const callbacks = source.slice(source.indexOf('// ── CALLBACKS'), source.indexOf('// ══ LOGIN ══'));

function draftHarness(usuarioId, initial = {}) {
    const values = new Map(Object.entries(initial));
    let restaurado = null;
    const ctx = vm.createContext({
        CARRITO_KEY: 'eruditos_carrito_draft',
        claveCarritoDraft: id => id ? `eruditos_carrito_draft:${encodeURIComponent(id)}` : null,
        store: { sessionUsuarioId: usuarioId },
        localStorage: {
            getItem: key => values.has(key) ? values.get(key) : null,
            removeItem: key => values.delete(key),
        },
        Date,
    });
    vm.runInContext(callbacks.replaceAll('export ', ''), ctx);
    ctx.initAuth({ restaurarCarritoDraft: draft => { restaurado = draft; } });
    return { ctx, values, restaurado: () => restaurado };
}

test('un usuario no restaura ni elimina el borrador aislado de otro usuario', () => {
    const adminKey = 'eruditos_carrito_draft:admin-id';
    const legacyKey = 'eruditos_carrito_draft';
    const draftAdmin = JSON.stringify({ usuarioId: 'admin-id', carrito: [{ producto: 'LAPIZ' }], ts: Date.now() });
    const h = draftHarness('vendedor-id', { [adminKey]: draftAdmin, [legacyKey]: draftAdmin });

    h.ctx.restaurarCarritoGuardado();

    assert.equal(h.restaurado(), null);
    assert.equal(h.values.get(adminKey), draftAdmin);
    assert.equal(h.values.has(legacyKey), false);
});

test('solo se restaura un borrador vigente cuyo propietario coincide con la sesión', () => {
    const ownKey = 'eruditos_carrito_draft:vendedor-id';
    const draft = { usuarioId: 'vendedor-id', carrito: [{ producto: 'CUADERNO' }], ts: Date.now() };
    const h = draftHarness('vendedor-id', { [ownKey]: JSON.stringify(draft) });

    h.ctx.restaurarCarritoGuardado();

    assert.equal(h.restaurado().carrito[0].producto, 'CUADERNO');
});

test('el cierre de sesión libera el carrito antes de descartar el borrador y la sesión', async () => {
    const events = [];
    const elements = {
        loginUser: { value: '' },
        loginPass: { value: '' },
        appScreen: { classList: { add() {}, remove() {} } },
        loginScreen: { classList: { add() {}, remove() {} } },
        cajaBadge: { style: {} },
    };
    const ctx = vm.createContext({
        CARRITO_KEY: 'eruditos_carrito_draft',
        claveCarritoDraft: id => id ? `eruditos_carrito_draft:${encodeURIComponent(id)}` : null,
        store: { sessionToken: 'token', sessionUsuarioId: 'admin-id', carrito: [{ producto: 'LAPIZ' }] },
        localStorage: { removeItem: () => events.push('modo') },
        document: {
            getElementById: id => elements[id] || null,
        },
        confirm: () => true,
        api: async () => { events.push('logout'); return { ok: true }; },
        clearSession: () => events.push('sesion'),
        clearCarrito: () => events.push('carrito'),
        cargarSucursalesEnDropdowns() {},
        Date,
    });
    vm.runInContext(source.slice(source.indexOf('// ── CALLBACKS')).replaceAll('export ', ''), ctx);
    ctx.initAuth({
        vaciarCarrito: async () => { events.push('liberar'); return true; },
        limpiarCarritoDraft: () => events.push('borrador'),
    });

    await ctx.cerrarSesion();

    assert.deepEqual(events.slice(0, 4), ['liberar', 'logout', 'borrador', 'sesion']);
});
