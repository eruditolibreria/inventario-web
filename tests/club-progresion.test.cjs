const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const leer = ruta => fs.readFileSync(ruta, 'utf8');

test('el registro permite un código de referido sin cambiar la bienvenida', () => {
  assert.match(leer('club/index.html'), /id="registroReferido"/);
  assert.match(leer('club/app.js'), /CODIGO_REFERIDO:\$\('registroReferido'\)\.value/);
  assert.match(leer('club/index.html'), /Ganas 5 puntos/);
});

test('el portal muestra diez niveles, reto trimestral y enlace compartible', () => {
  const app = leer('club/app.js');
  const html = leer('club/index.html');
  assert.match(app, /const NIVELES = \[/);
  assert.match(app, /'Erudito Supremo'/);
  assert.match(app, /referidosPremiados/);
  assert.match(html, /id="nivelBarra"/);
  assert.match(html, /id="retoBarra"/);
  assert.match(html, /id="copiarReferido"/);
});

test('el sistema permite verificar referidos y asignar nivel mínimo a premios', () => {
  const club = leer('js/modos/club.js');
  assert.match(club, /CLUB_VERIFICAR_DOCUMENTO/);
  assert.match(club, /CLUB_PROCESAR_BENEFICIOS/);
  assert.match(club, /NIVEL_MINIMO: Number\(\$\('clubPremioNivel'\)\.value\)/);
  assert.match(leer('js/api.js'), /CLUB_LISTAR_REFERIDOS: BASE_URL_CLUB_ADMIN/);
  assert.match(leer('js/modos/clientes.js'), /Nivel Club:/);
});

test('Inicio conserva la ficha de nivel y deja el historial en Puntos', () => {
  const html = leer('club/index.html');
  const app = leer('club/app.js');
  assert.match(html, /id="nivelNombre"/);
  assert.match(html, /id="nivelBarra"/);
  assert.match(html, /id="abrirCamino"[^>]*>Ver camino del Erudito/);
  assert.doesNotMatch(html, /Actividad reciente|id="resumenMovimientos"|Ver los 10 niveles/);
  assert.match(html, /id="movimientosLista"/);
  assert.match(app, /MOVIMIENTOS/);
});

test('el camino muestra las diez estancias y se cierra con botón o Atrás', () => {
  const html = leer('club/index.html');
  const app = leer('club/app.js');
  const css = leer('club/styles.css');
  assert.match(html, /id="caminoDialog"/);
  assert.match(html, /id="cerrarCamino"/);
  assert.match(app, /NIVELES\.map\(\(nombre,i\)=>/);
  assert.match(app, /history\.pushState\(\{clubPath:true\}/);
  assert.match(app, /history\.state\?\.clubPath/);
  assert.match(css, /camino-erudito\.png/);
  const imagen = fs.readFileSync('club/camino-erudito.png');
  assert.equal(imagen.readUInt32BE(16), 793);
  assert.equal(imagen.readUInt32BE(20), 1983);
});

test('el avance del nivel usa el gasto neto y muestra porcentaje, meta y puntos del ascenso', () => {
  const html = leer('club/index.html');
  const app = leer('club/app.js');
  assert.match(html, /id="nivelPorcentaje"/);
  assert.match(html, /id="nivelFaltante"/);
  assert.match(html, /id="caminoHitos"/);
  assert.match(app, /gasto-desde/);
  assert.match(app, /próximo ascenso: \+3 puntos/);
  assert.match(app, /FILAS_CAMINO/);
});

test('el cambio de tema usa iconos y movimiento reducido', () => {
  const html = leer('club/index.html');
  const app = leer('club/app.js');
  const css = leer('club/styles.css');
  assert.match(html, /class="moon-icon"/);
  assert.match(html, /class="sun-icon"/);
  assert.match(app, /startViewTransition/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
