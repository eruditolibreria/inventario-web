const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leer = relativo => fs.readFileSync(path.resolve(__dirname, '..', relativo), 'utf8');

test('autocompletado y BUSCAR muestran el nombre visible de la sucursal', () => {
  assert.match(leer('js/inventario.js'), /nombreSucursalVisible\(p\.sucursal\)/);
  const ui = leer('js/ui.js');
  assert.match(ui, /nombreSucursalVisible\(p\.sucursal\)/);
  assert.match(leer('js/sucursales.js'), /nombre_visible \|\| sucursal\?\.nombreVisible/);
});

test('Club guarda el inventario exacto por sucursal', () => {
  const club = leer('js/modos/club.js');
  assert.match(club, /ASIGNACIONES: asignaciones/);
  assert.match(club, /inventarioId: inventario\?\.id/);
  assert.match(club, /sucursal_nombre \|\| nombreSucursalVisible/);
});

test('la entrega usa modal, muestra error amigable y conserva el reintento', () => {
  const club = leer('js/modos/club.js');
  assert.match(club, /clubEntregaDialog/);
  assert.match(club, /El código de retiro es incorrecto/);
  assert.match(club, /input\.select\(\)/);
  assert.doesNotMatch(club, /prompt\('Código de retiro/);
});

test('la campana carga avisos y navega al canje relacionado', () => {
  const modulo = leer('js/notificaciones.js');
  assert.match(modulo, /CLUB_LISTAR_NOTIFICACIONES/);
  assert.match(modulo, /CLUB_MARCAR_NOTIFICACION/);
  assert.match(modulo, /window\.setModo\?\.\('CLUB', 0\)/);
  assert.match(modulo, /window\.__clubCanjeObjetivo = canjeId/);
  assert.match(modulo, /club:abrir-canje/);
  assert.match(leer('js/modos/club.js'), /Number\(window\.__clubCanjeObjetivo\)/);
  assert.match(leer('js/realtime.js'), /club_notificaciones_internas/);
});

test('premios externos permiten cámara o galería y guardan la imagen', () => {
  const club = leer('js/modos/club.js');
  assert.match(club, /clubPremioTomarFoto/);
  assert.match(club, /clubPremioImagenGaleria/);
  assert.match(club, /CLUB_SUBIR_IMAGEN_PREMIO/);
  assert.match(club, /IMAGEN_URL: \$\('clubPremioImagenUrl'\)\.value/);
  assert.match(leer('js/ui.js'), /export function comprimirImagen/);
});

test('el portal muestra imágenes en premios y canjes', () => {
  const portal = leer('club/app.js');
  assert.match(portal, /class="reward-image"/);
  assert.match(portal, /p\.imagen_url/);
  assert.match(portal, /class="list-thumb"/);
  assert.match(portal, /normalizarUrlPublica/);
});

test('las imágenes locales traducen el host interno de Supabase', () => {
  const config = leer('js/config.js');
  assert.match(config, /url\.pathname\.startsWith\("\/storage\/v1\/object\/public\/"\)/);
  assert.match(config, /SUPABASE_URL.*url\.pathname/);
  assert.match(leer('js/db.js'), /normalizarUrlPublica\(value\)/);
});

test('Club permite crear, editar, publicar y ocultar noticias del portal', () => {
  const club = leer('js/modos/club.js');
  assert.match(club, /id="clubNoticiasPanel"/);
  assert.match(club, /CLUB_LISTAR_NOTICIAS/);
  assert.match(club, /CLUB_GUARDAR_NOTICIA/);
  assert.match(club, /PUBLICADA: \$\('clubNoticiaPublicada'\)\.checked/);
  const api = leer('js/api.js');
  assert.match(api, /CLUB_LISTAR_NOTICIAS: BASE_URL_CLUB_ADMIN/);
  assert.match(api, /CLUB_GUARDAR_NOTICIA: BASE_URL_CLUB_ADMIN/);
});

test('todos los premios usan stock limitado y el portal lo muestra', () => {
  const club = leer('js/modos/club.js');
  assert.match(club, /value="EXTERNO">Stock fuera de Inventario/);
  assert.match(club, /id="clubPremioStock"/);
  assert.match(club, /STOCK: stockClub/);
  assert.match(club, /Stock: \$\{Number\(p\.stock_disponible \|\| 0\)\}/);
  const portal = leer('club/app.js');
  assert.match(portal, /Stock disponible: \$\{stock\}/);
  assert.match(portal, /stock<=0\?'Agotado'/);
});

test('los cinco paneles de Club comienzan plegados y se alternan desde su cabecera', () => {
  const club = leer('js/modos/club.js');
  const estilos = leer('css/club.css');
  for (const id of ['clubConfigForm', 'clubPremioForm', 'clubNoticiasPanel', 'clubCatalogoPanel', 'clubCanjesPanel']) {
    assert.match(club, new RegExp(`prepararPanelPlegable\\('${id}'`));
  }
  assert.match(club, /club-panel-contraido/);
  assert.match(club, /hijo\.hidden = !expandir/);
  assert.match(estilos, /\.club-admin-grid\{display:grid;grid-template-columns:1fr;gap:0\}/);
  assert.match(estilos, /\.club-panel\{margin:6px 0\}/);
});

test('el portal conserva dos columnas y muestra la imagen completa en un cuadrado', () => {
  const estilos = leer('club/styles.css');
  const portal = leer('club/index.html');
  assert.match(estilos, /\.rewards\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(portal, /\.reward-image\{[^}]*aspect-ratio:1/);
  assert.match(portal, /\.reward-image img\{[^}]*object-fit:contain/);
});

test('el comprobante impreso y su PDF incluyen el código de creación de cuenta Club', () => {
  const comprobantes = leer('js/modos/comprobantes.js');
  assert.match(comprobantes, /Código para crear tu cuenta:/);
  assert.match(comprobantes, /c\.club\.tokenVinculacion/);
  assert.match(comprobantes, /Válido durante 72 horas/);
});
