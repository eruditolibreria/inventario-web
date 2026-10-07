const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/realtime.js'), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/\bexport /g, '')
    .replace("import('./notificaciones.js')", 'Promise.resolve(notifications)');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
    const channels = [], handlers = {}, events = [];
    let init = 0, loads = 0, finishRemoval;
    const context = vm.createContext({
        Promise, console,
        notifications: { initNotificaciones() { init++; }, cargarNotificaciones() { loads++; } },
        channel(name) {
            const item = { name, removed: false, listeners: {},
                on(type, options, handler) { this.listeners[options.table] = handler; return this; },
                subscribe(handler) { this.status = handler; return this; },
            };
            assert.ok(!channels.some(c => !c.removed), 'solo un canal por tema');
            channels.push(item); return item;
        },
        removeChannel(item) { return new Promise(resolve => { finishRemoval = () => { item.removed = true; resolve('ok'); }; }); },
        window: { addEventListener(name, handler) { handlers[name] = handler; }, dispatchEvent(event) { events.push(event); } },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    });
    vm.runInContext(source, context);
    return { channels, events, run: code => vm.runInContext(code, context), logout: () => handlers['eruditos:logout'](),
        finish: () => finishRemoval(), init: () => init, loads: () => loads };
}

test('inicios simultaneos crean un solo canal y siguen llegando los cambios', async () => {
    const f = setup(); await Promise.all([f.run('initRealtime()'), f.run('initRealtime()')]); await tick();
    assert.equal(f.channels.length, 1); assert.equal(f.init(), 1);
    const c = f.channels[0]; c.status('SUBSCRIBED'); c.listeners.inventario({ id: 1 });
    c.listeners.club_notificaciones_internas({ id: 2 }); await tick();
    assert.equal(f.loads(), 1);
    assert.deepEqual(f.events.map(e => e.type), ['inventario:cambio', 'club:notificacion']);
});

test('cerrar sesion retira el canal e ignora avisos y reconexiones antiguos', async () => {
    const f = setup(); await f.run('initRealtime()'); await tick(); const c = f.channels[0];
    f.logout(); c.status('SUBSCRIBED'); c.listeners.inventario({}); c.listeners.club_notificaciones_internas({});
    await tick(); assert.equal(f.loads(), 0); assert.equal(f.events.length, 0);
    f.finish(); await f.run('stopRealtime()'); assert.equal(c.removed, true);
});

test('un ingreso inmediato espera a retirar el tema anterior y puede reconectar', async () => {
    const f = setup(); await f.run('initRealtime()'); f.logout();
    const pending = f.run('initRealtime()'); await tick(); assert.equal(f.channels.length, 1);
    f.finish(); await pending; await tick(); assert.equal(f.channels.length, 2);
    f.channels[0].status('SUBSCRIBED'); f.channels[1].status('SUBSCRIBED'); await tick();
    assert.equal(f.loads(), 1);
});

test('cerrar sesion durante un inicio pendiente impide suscribir una sesion cerrada', async () => {
    const f = setup(); await f.run('initRealtime()'); f.logout();
    const pending = f.run('initRealtime()'); f.logout(); await tick();
    f.finish(); await pending; assert.equal(f.channels.length, 1);
    await f.run('initRealtime()'); assert.equal(f.channels.length, 2);
});

test('un aviso pendiente al salir no se entrega a la siguiente sesion', async () => {
    const f = setup(); await f.run('initRealtime()'); await tick();
    f.channels[0].listeners.club_notificaciones_internas({}); f.logout(); await tick();
    assert.equal(f.events.length, 0); f.finish(); await f.run('initRealtime()');
    f.channels[1].listeners.club_notificaciones_internas({}); await tick(); assert.equal(f.events.length, 1);
});
