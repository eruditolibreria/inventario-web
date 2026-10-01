const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/notificaciones.js'), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/\bexport /g, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
const row = (id, read = false) => ({ id, titulo: 'Aviso', mensaje: 'Nuevo canje', leida_en: read ? 'hoy' : null });

function setup({ reduced = false, hidden = false, muted = false } = {}) {
    const windowEvents = {}, documentEvents = {}, timers = new Map();
    let nextTimer = 0, animations = 0, activeAnimations = 0, tones = 0, allowed = true, requests = 0;
    const motion = { matches: reduced, addEventListener(name, handler) { this[name] = handler; } };
    let data = [row(1)], customApi = null;
    const element = () => ({ hidden: false, style: { setProperty() {} }, addEventListener(name, handler) { this[name] = handler; }, setAttribute() {}, replaceChildren() {}, querySelectorAll: () => [] });
    const ids = Object.fromEntries(['clubNotificacionesCentro', 'clubNotificacionesBtn', 'clubNotificacionesPanel', 'clubNotificacionesCerrar', 'clubNotificacionesBadge', 'clubNotificacionesLista', 'clubNotificacionesError', 'mobileSoundToggle'].map(id => [id, element()]));
    ids.clubNotificacionesPanel.hidden = true;
    const icon = { animate(frames, options) {
        assert.equal(options.iterations, Infinity);
        assert.ok(options.duration >= 2500);
        assert.equal(frames.at(-1).transform, 'rotate(0deg)');
        animations++; activeAnimations++;
        return { cancel() { activeAnimations--; } };
    } };
    const storage = new Map([['eruditos_avisos_silenciados', String(muted)]]);
    class Audio {
        state = 'suspended'; currentTime = 0; destination = {};
        resume() { this.state = 'running'; return Promise.resolve(); }
        createOscillator() { return { frequency: {}, connect() {}, disconnect() {}, start() { tones++; }, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    }
    const document = {
        hidden, head: { appendChild() {} }, createElement: element,
        getElementById: id => ids[id] || null,
        querySelector: selector => selector === '.club-bell-icon' ? icon : { querySelector: () => ({}) },
        addEventListener(name, handler) { documentEvents[name] = handler; },
    };
    const context = vm.createContext({
        document, window: { AudioContext: Audio, dispatchEvent() {}, addEventListener(name, handler) { windowEvents[name] = handler; } },
        api: params => {
            requests++;
            if (customApi) return customApi(params);
            if (params.ACCION === 'CLUB_MARCAR_NOTIFICACION') {
                data = data.map(item => item.id === params.ID ? { ...item, leida_en: 'hoy' } : item);
                return Promise.resolve({ ok: true });
            }
            return Promise.resolve({ ok: true, pendientes: data.filter(r => !r.leida_en).length, datos: data });
        },
        can: () => allowed, matchMedia: () => motion,
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        setTimeout: handler => { timers.set(++nextTimer, handler); return nextTimer; }, clearTimeout: id => timers.delete(id),
        Intl, Date, CustomEvent: class {},
    });
    vm.runInContext(source, context);
    const run = code => vm.runInContext(code, context);
    run('initNotificaciones()');
    return {
        ids, document, storage, run,
        setData: rows => { data = rows; }, setApi: fn => { customApi = fn; }, setAllowed: value => { allowed = value; },
        gesture: () => documentEvents.pointerdown(),
        event: (id, type = 'INSERT') => windowEvents['club:notificacion']({ detail: { eventType: type, new: { id } } }),
        logout: () => windowEvents['eruditos:logout'](),
        visibility: hidden => { document.hidden = hidden; documentEvents.visibilitychange(); },
        reduce: value => { motion.matches = value; motion.change(); },
        flush: () => { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); },
        animations: () => animations, activeAnimations: () => activeAnimations, tones: () => tones, requests: () => requests,
    };
}

test('los pendientes iniciales mueven la campana sin sonido y un INSERT nuevo suena', async () => {
    const f = setup(); await tick(); f.flush();
    assert.equal(f.animations(), 1); assert.equal(f.activeAnimations(), 1); assert.equal(f.tones(), 0);
    f.gesture(); f.setData([row(2), row(1)]); f.event(2); await tick(); f.flush();
    assert.equal(f.animations(), 1); assert.equal(f.tones(), 2);
    assert.equal(f.ids.clubNotificacionesBadge.textContent, '2');
});

test('duplicados, lectura, reconexion y eventos sin acceso no repiten alertas', async () => {
    const f = setup(); await tick(); f.gesture();
    f.setData([row(2), row(1)]); f.event(2); await tick(); f.flush();
    f.event(2); f.event(2, 'UPDATE'); await tick();
    await f.run('cargarNotificaciones()');
    f.event(999); await tick(); f.flush();
    assert.equal(f.animations(), 1); assert.equal(f.tones(), 2);
});

test('una rafaga se agrupa y no pierde eventos que llegan durante una consulta', async () => {
    const f = setup(); await tick(); f.gesture();
    let resolve;
    f.setApi(() => new Promise(r => { resolve = r; }));
    f.event(2); f.event(3);
    f.setApi(null); f.setData([row(3), row(2), row(1)]);
    resolve({ ok: true, pendientes: 2, datos: [row(2), row(1)] });
    await tick(); f.flush();
    assert.equal(f.requests(), 3);
    assert.equal(f.ids.clubNotificacionesBadge.textContent, '3');
    assert.equal(f.animations(), 1); assert.equal(f.tones(), 2);
});

test('silenciar conserva el movimiento y recuerda la preferencia', async () => {
    const f = setup(); await tick(); f.gesture();
    f.ids.mobileSoundToggle.click();
    assert.equal(f.storage.get('eruditos_avisos_silenciados'), 'true');
    f.setData([row(2), row(1)]); f.event(2); await tick(); f.flush();
    assert.equal(f.animations(), 1); assert.equal(f.tones(), 0);
    assert.equal(f.ids.mobileSoundToggle.textContent, 'Activar sonido');
});

test('movimiento reducido conserva el sonido; en segundo plano solo actualiza el contador', async () => {
    const f = setup({ reduced: true }); await tick(); f.gesture();
    f.setData([row(2), row(1)]); f.event(2); await tick(); f.flush();
    assert.equal(f.animations(), 0); assert.equal(f.tones(), 2);
    f.document.hidden = true; f.setData([row(3), row(2), row(1)]); f.event(3); await tick(); f.flush();
    assert.equal(f.tones(), 2); assert.equal(f.ids.clubNotificacionesBadge.textContent, '3');
});

test('antes de la primera interaccion el aviso visual funciona sin forzar audio', async () => {
    const f = setup(); await tick();
    f.setData([row(2), row(1)]); f.event(2); await tick(); f.flush();
    assert.equal(f.animations(), 1); assert.equal(f.tones(), 0);
});

test('logout cancela avisos y descarta respuestas de una sesion anterior', async () => {
    const f = setup(); await tick(); f.gesture();
    let resolve;
    f.setApi(() => new Promise(r => { resolve = r; }));
    f.event(2); f.logout(); f.setApi(null); f.setData([row(10)]);
    f.run('initNotificaciones()'); await tick();
    resolve({ ok: true, pendientes: 99, datos: [row(2)] }); await tick(); f.flush();
    assert.equal(f.ids.clubNotificacionesBadge.textContent, '1');
    assert.equal(f.activeAnimations(), 1); assert.equal(f.tones(), 0);
    f.setAllowed(false); f.run('initNotificaciones()');
    assert.equal(f.ids.clubNotificacionesCentro.hidden, true);
});

test('abrir la lista mantiene el movimiento hasta leer todos los mensajes', async () => {
    const f = setup(); await tick();
    f.setData([row(2), row(1)]); await f.run('cargarNotificaciones()');
    f.ids.clubNotificacionesBtn.click({ stopPropagation() {} }); await tick();
    assert.equal(f.ids.clubNotificacionesPanel.hidden, false);
    assert.equal(f.activeAnimations(), 1);
    assert.match(f.ids.clubNotificacionesLista.innerHTML, /Sin leer/);
    await f.run('abrirCanje(2, 20)');
    assert.equal(f.ids.clubNotificacionesBadge.textContent, '1');
    assert.equal(f.activeAnimations(), 1);
    await f.run('abrirCanje(1, 10)');
    assert.equal(f.ids.clubNotificacionesBadge.hidden, true);
    assert.equal(f.activeAnimations(), 0);
    assert.doesNotMatch(f.ids.clubNotificacionesLista.innerHTML, /Sin leer/);
});

test('un fallo al leer conserva el mensaje y el movimiento; la lectura desde otra sesión lo detiene', async () => {
    const f = setup(); await tick();
    f.ids.clubNotificacionesBtn.click({ stopPropagation() {} }); await tick();
    for (const response of [() => Promise.resolve({ ok: false }), () => Promise.reject(new Error('offline'))]) {
        f.setApi(response); await f.run('abrirCanje(1, 10)');
        assert.equal(f.ids.clubNotificacionesPanel.hidden, false);
        assert.equal(f.ids.clubNotificacionesError.hidden, false);
        assert.equal(f.activeAnimations(), 1);
    }
    f.setApi(null); f.setData([row(1, true)]); f.event(1, 'UPDATE'); await tick();
    assert.equal(f.activeAnimations(), 0);
    assert.equal(f.tones(), 0);
});

test('la visibilidad, la preferencia de movimiento y la salida detienen y reanudan el aviso', async () => {
    const f = setup(); await tick();
    f.visibility(true); assert.equal(f.activeAnimations(), 0);
    f.visibility(false); await tick(); assert.equal(f.activeAnimations(), 1);
    f.reduce(true); assert.equal(f.activeAnimations(), 0);
    f.reduce(false); assert.equal(f.activeAnimations(), 1);
    f.logout(); assert.equal(f.activeAnimations(), 0);
    assert.equal(f.tones(), 0);
});

test('una respuesta de lectura posterior al logout no abre un canje', async () => {
    const f = setup(); await tick();
    let resolve;
    f.setApi(() => new Promise(r => { resolve = r; }));
    const reading = f.run('abrirCanje(1, 10)');
    f.logout(); resolve({ ok: true }); await reading;
    assert.equal(f.activeAnimations(), 0);
    assert.equal(f.run('window.__clubCanjeObjetivo'), undefined);
});
