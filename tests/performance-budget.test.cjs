const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const LIMITE_JS_INICIAL = 390 * 1024;
const LIMITE_CSS = 140 * 1024;
const LIMITE_HTML = {
  'desktop.html': 165 * 1024,
  'mobile.html': 155 * 1024,
};

function importsEstaticos(archivo) {
  const fuente = fs.readFileSync(archivo, 'utf8');
  const patron = /^\s*import\s+[\s\S]*?\s+from\s+['"](\.[^'"]+)['"]/gm;
  return [...fuente.matchAll(patron)].map(resultado => resultado[1]);
}

function cargaInicial() {
  const visitados = new Set();
  function visitar(archivo) {
    const absoluto = path.resolve(archivo);
    if (visitados.has(absoluto)) return;
    visitados.add(absoluto);
    importsEstaticos(absoluto).forEach(importacion => visitar(path.resolve(path.dirname(absoluto), importacion)));
  }
  visitar(path.join(ROOT, 'js', 'main.js'));
  return visitados;
}

test('la carga inicial conserva separados los módulos secundarios', () => {
  const archivos = cargaInicial();
  const bytes = [...archivos].reduce((total, archivo) => total + fs.statSync(archivo).size, 0);

  ['js/modos/admin.js', 'js/modos/reportes.js', 'js/modos/auditoria.js', 'js/modos/clientes.js'].forEach(relativo => {
    assert.equal(archivos.has(path.join(ROOT, relativo)), false, `${relativo} no debe ser parte de la carga inicial`);
  });
  assert.ok(bytes <= LIMITE_JS_INICIAL, `La carga inicial suma ${bytes} bytes; el límite es ${LIMITE_JS_INICIAL}`);
});

test('los recursos críticos no superan sus presupuestos de tamaño', () => {
  const cssBytes = fs.readdirSync(path.join(ROOT, 'css'))
    .filter(nombre => nombre.endsWith('.css'))
    .reduce((total, nombre) => total + fs.statSync(path.join(ROOT, 'css', nombre)).size, 0);

  assert.ok(cssBytes <= LIMITE_CSS, `El CSS suma ${cssBytes} bytes; el límite es ${LIMITE_CSS}`);
  Object.entries(LIMITE_HTML).forEach(([archivo, limite]) => {
    const bytes = fs.statSync(path.join(ROOT, archivo)).size;
    assert.ok(bytes <= limite, `${archivo} suma ${bytes} bytes; el límite es ${limite}`);
  });
});
