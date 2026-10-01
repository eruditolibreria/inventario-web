const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/pwa-shell.js'), 'utf8');

function setup({ android = true, ios = false, standalone = false, fallback = true } = {}) {
    const handlers = {};
    const media = { matches: standalone, addEventListener(_, handler) { this.change = handler; } };
    const buttons = [0, 1].map(() => ({
        hidden: true,
        dataset: fallback ? { installFallback: 'android' } : {},
        addEventListener(_, handler) { this.click = handler; },
    }));
    const dialog = { opened: 0, showModal() { this.opened++; }, close() {} };
    const instructions = { textContent: '' };
    const context = vm.createContext({
        performance: { now: () => 0 }, setTimeout() {}, matchMedia: () => media,
        navigator: { userAgent: ios ? 'iPhone' : android ? 'Android Chrome' : 'Chrome Windows', platform: '', maxTouchPoints: 0 },
        window: { addEventListener(name, handler) { handlers[name] = handler; } },
        document: {
            querySelectorAll: () => buttons,
            getElementById: id => id === 'pwaInstallDialog' ? dialog : id === 'pwaInstallInstructions' ? instructions : { addEventListener() {} },
            addEventListener(name, handler) { if (name === 'DOMContentLoaded') handler(); },
        },
    });
    vm.runInContext(source, context);
    let prompts = 0;
    function ready({ choice = Promise.resolve({ outcome: 'dismissed' }), fail = false } = {}) {
        handlers.beforeinstallprompt({
            preventDefault() {}, userChoice: choice,
            prompt() { prompts++; return fail ? Promise.reject(new Error('Unavailable')) : Promise.resolve(); },
        });
    }
    return { buttons, dialog, instructions, handlers, media, ready, prompts: () => prompts };
}

test('Android ofrece instrucciones aun sin evento de instalacion', async () => {
    const f = setup();
    assert.ok(f.buttons.every(button => !button.hidden));
    await f.buttons[0].click();
    assert.equal(f.dialog.opened, 1);
    assert.match(f.instructions.textContent, /Instalar aplicación/);
    assert.equal(f.prompts(), 0);
});

test('el toque llama directamente al aviso nativo y bloquea toques simultaneos', async () => {
    const f = setup();
    let resolve;
    f.ready({ choice: new Promise(r => { resolve = r; }) });
    const first = f.buttons[0].click();
    assert.equal(f.prompts(), 1);
    assert.ok(f.buttons.every(button => button.disabled));
    await f.buttons[1].click();
    assert.equal(f.prompts(), 1);
    assert.equal(f.dialog.opened, 0);
    resolve({ outcome: 'dismissed' });
    await first;
    assert.ok(f.buttons.every(button => !button.disabled && !button.hidden));
});

test('cancelar conserva instrucciones y un nuevo evento permite reintentar', async () => {
    const f = setup();
    f.ready();
    await f.buttons[0].click();
    await f.buttons[0].click();
    assert.equal(f.prompts(), 1);
    assert.equal(f.dialog.opened, 1);
    f.ready();
    await f.buttons[0].click();
    assert.equal(f.prompts(), 2);
});

test('un error del aviso nativo muestra instrucciones y libera los botones', async () => {
    const f = setup();
    f.ready({ fail: true });
    await f.buttons[0].click();
    assert.equal(f.dialog.opened, 1);
    assert.ok(f.buttons.every(button => !button.disabled));
});

test('instalacion confirmada y modo standalone ocultan ambos botones', async () => {
    const f = setup();
    f.ready({ choice: Promise.resolve({ outcome: 'accepted' }) });
    await f.buttons[0].click();
    f.handlers.appinstalled();
    assert.ok(f.buttons.every(button => button.hidden));
    const g = setup({ standalone: true });
    g.ready();
    assert.ok(g.buttons.every(button => button.hidden));
    await g.buttons[0].click();
    assert.equal(g.prompts(), 0);
    const h = setup();
    h.media.matches = true;
    h.media.change();
    assert.ok(h.buttons.every(button => button.hidden));
});

test('desktop conserva la visibilidad previa e iOS conserva sus instrucciones', async () => {
    const desktop = setup({ android: false, fallback: false });
    assert.ok(desktop.buttons.every(button => button.hidden));
    desktop.ready();
    assert.ok(desktop.buttons.every(button => !button.hidden));
    const ios = setup({ ios: true });
    await ios.buttons[0].click();
    assert.match(ios.instructions.textContent, /Compartir/);
});
