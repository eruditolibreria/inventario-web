const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

async function setup({ pending = false, reduced = false, wholeScreen = false } = {}) {
  const events = () => ({
    handlers: {},
    addEventListener(name, handler) { this.handlers[name] = handler; },
  });
  const classes = () => ({
    values: new Set(),
    add(value) { this.values.add(value); },
    remove(value) { this.values.delete(value); },
    toggle(value, enabled) { if (enabled) this.add(value); else this.remove(value); },
  });
  const panels = ['inicio', 'premios', 'movimientos', 'canjes'].map(view => ({
    dataset: { viewPanel: view }, style: {}, offsetHeight: 500, attributes: {},
    get offsetTop() { return Number.parseFloat(this.style.top) || 0; },
    setAttribute(name, value) { this.attributes[name] = value; },
    animate(frames) { this.frames = frames; return { finished: Promise.resolve(), cancel() {} }; },
  }));
  const buttons = panels.map(panel => ({
    ...events(), dataset: { view: panel.dataset.viewPanel }, classList: classes(), attributes: {},
    hidden: pending && ['movimientos', 'canjes'].includes(panel.dataset.viewPanel),
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  }));
  const viewport = { ...events(), clientWidth: 1000, offsetHeight: 500, offsetTop: 250, style: {}, classList: classes(),
    captures: new Set(),
    setPointerCapture(id) { this.captures.add(id); },
    hasPointerCapture(id) { return this.captures.has(id); },
    releasePointerCapture(id) { this.captures.delete(id); },
  };
  global.window = { ...events(), innerWidth:1000, scrollY: 0, scrollTo({ top }) { this.scrollY = top; } };
  global.document = events();
  global.matchMedia = () => ({ matches: reduced });
  const source = fs.readFileSync('club/navigation.js', 'utf8');
  const { createClubNavigation } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const loaded = [];
  let allowed = true;
  const gestureTarget=wholeScreen?document:viewport;
  const navigation = createClubNavigation({ viewport, gestureTarget, buttons, panels, load: view => { loaded.push(view); return Promise.resolve(); }, canSwipe: () => allowed });
  const pointer = (name, x, y = 0, interactive = false) => gestureTarget.handlers[name]({
    isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: y,
    target: { closest: () => interactive ? {} : null }, preventDefault() {},
  });
  const drag = async (dx, end = 'pointerup') => {
    pointer('pointerdown', 500); pointer('pointermove', 500 + dx); pointer(end, 500 + dx);
    await new Promise(resolve => setImmediate(resolve));
  };
  const active = () => panels.find(panel => !panel.hidden).dataset.viewPanel;
  return { navigation, viewport, panels, buttons, loaded, pointer, drag, active, block: () => { allowed = false; } };
}

test('perder la captura implicita de una tarjeta tactil no cancela la captura del contenedor',async()=>{
  const f=await setup();
  f.pointer('pointerdown',500); f.pointer('pointermove',350);
  f.viewport.handlers.lostpointercapture({pointerId:1,target:{}});
  f.pointer('pointermove',100); f.pointer('pointerup',100);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.active(),'premios');
});

test('ocultar la barra de Android cambia la altura pero mantiene el gesto',async()=>{
  const f=await setup();
  f.pointer('pointerdown',500); f.pointer('pointermove',350);
  window.handlers.resize();
  f.pointer('pointermove',100); f.pointer('pointerup',100);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.active(),'premios');
});

test('la barra de scroll cambia el ancho del contenido sin cancelar el gesto',async()=>{
  const f=await setup();
  f.pointer('pointerdown',500); f.pointer('pointermove',350);
  f.viewport.clientWidth=985;window.handlers.resize();
  f.pointer('pointermove',100);f.pointer('pointerup',100);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.active(),'premios');
});

test('el deslizamiento puede empezar en el encabezado o fuera de las tarjetas',async()=>{
  const f=await setup({wholeScreen:true});
  await f.drag(-400);
  assert.equal(f.active(),'premios');
  let prevented=false;
  document.handlers.click({preventDefault(){prevented=true;},stopPropagation(){}});
  assert.equal(prevented,true,'un arrastre sobre un boton del encabezado no ejecuta su clic');
});

test('perder la captura del contenedor si cancela el gesto',async()=>{
  const f=await setup();
  f.pointer('pointerdown',500);f.pointer('pointermove',100);
  f.viewport.handlers.lostpointercapture({pointerId:1,target:f.viewport});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.active(),'inicio');
});

test('un cambio de ancho cancela el gesto y deja las tarjetas consistentes',async()=>{
  const f=await setup();
  f.pointer('pointerdown',500); f.pointer('pointermove',100);
  f.viewport.clientWidth=500;window.innerWidth=500; window.handlers.resize();
  f.pointer('pointerup',100);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.active(),'inicio');
  assert.equal(f.panels[0].style.transform,'');
});

test('un arrastre muestra el contenido real de la vecina y prepara sus datos', async () => {
  const f = await setup();
  f.pointer('pointerdown', 500); f.pointer('pointermove', 350);
  assert.equal(f.panels[1].hidden, false);
  assert.equal(f.panels[1].inert, true);
  assert.equal(f.panels[0].style.transform, 'translateX(-150px)');
  assert.equal(f.panels[1].style.transform, 'translateX(850px)');
  assert.deepEqual(f.loaded, ['premios']);
  f.pointer('pointercancel', 350);
  await new Promise(resolve => setImmediate(resolve));
});

test('29.9% regresa y 30% completa el cambio', async () => {
  const f = await setup();
  await f.drag(-299);
  assert.equal(f.active(), 'inicio');
  await f.drag(-300);
  assert.equal(f.active(), 'premios');
  assert.equal(f.buttons[1].attributes['aria-current'], 'page');
  assert.equal(f.panels[0].inert, true);
});

test('el ciclo funciona en ambos sentidos y en los cuatro paneles', async () => {
  const f = await setup();
  await f.drag(400); assert.equal(f.active(), 'canjes');
  await f.drag(-400); assert.equal(f.active(), 'inicio');
  for (const view of ['premios', 'movimientos', 'canjes', 'inicio']) {
    await f.drag(-400); assert.equal(f.active(), view);
  }
});

test('el scroll vertical, campos y ventanas abiertas no disparan el swipe', async () => {
  const f = await setup();
  f.pointer('pointerdown', 500); f.pointer('pointermove', 520, 150);
  assert.equal(f.panels[1].hidden, true);
  f.pointer('pointerdown', 500, 0, true); f.pointer('pointermove', 0);
  assert.equal(f.panels[1].hidden, true);
  f.block(); await f.drag(-400);
  assert.equal(f.active(), 'inicio');
});

test('cancelar el gesto regresa sin cambiar de pantalla', async () => {
  const f = await setup();
  await f.drag(-600, 'pointercancel');
  assert.equal(f.active(), 'inicio');
  assert.ok(f.panels.slice(1).every(panel => panel.hidden));
});

test('el clic posterior al arrastre no abre imágenes ni ejecuta un canje', async () => {
  const f = await setup();
  await f.drag(-400);
  let prevented = false;
  let stopped = false;
  f.viewport.handlers.click({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test('el avance de la vecina respeta el scroll dentro de la tarjeta', async () => {
  const f = await setup();
  window.scrollY = 750;
  f.pointer('pointerdown', 500); f.pointer('pointermove', 300);
  assert.equal(f.panels[1].style.top, '500px');
  f.pointer('pointercancel', 300);
  await new Promise(resolve => setImmediate(resolve));
});

test('las cuentas pendientes alternan solo entre Inicio y Premios', async () => {
  const f = await setup({ pending: true });
  await f.drag(400); assert.equal(f.active(), 'premios');
  await f.drag(400); assert.equal(f.active(), 'inicio');
  f.navigation.show('canjes'); assert.equal(f.active(), 'inicio');
});

test('cambiar de dirección durante el gesto revela la otra tarjeta', async () => {
  const f = await setup();
  f.pointer('pointerdown', 500); f.pointer('pointermove', 300); f.pointer('pointermove', 900); f.pointer('pointerup', 900);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.active(), 'canjes');
  assert.equal(f.panels[1].hidden, true);
});

test('las pestañas conservan su scroll y el modo reducido permite navegar', async () => {
  const f = await setup({ reduced: true });
  window.scrollY = 350;
  f.navigation.show('premios');
  assert.equal(f.active(), 'premios');
  assert.equal(window.scrollY, 0);
  window.scrollY = 200;
  f.navigation.show('inicio');
  assert.equal(window.scrollY, 350);
  f.navigation.show('premios');
  assert.equal(window.scrollY, 200);
  f.navigation.reset();
  assert.equal(f.active(), 'inicio');
});
