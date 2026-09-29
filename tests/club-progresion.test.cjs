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
