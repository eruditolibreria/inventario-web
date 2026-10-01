const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const standalone = path.join(root, 'club-standalone');
const dist = path.join(standalone, 'dist');

test('el portal independiente incluye el inicio de sesión por dispositivo y sus imágenes', () => {
  const result = spawnSync(process.execPath, [path.join(standalone, 'build.mjs')], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const app = fs.readFileSync(path.join(dist, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(dist, 'styles.css'), 'utf8');
  const navigation = fs.readFileSync(path.join(dist, 'navigation.js'), 'utf8');
  assert.match(app, /from '\.\/navigation\.js'/);
  assert.match(navigation, /export function createClubNavigation/);
  assert.match(app, /DISPOSITIVO_ID:deviceId/);
  assert.match(css, /url\('\/camino-erudito\.webp'\)/);
  assert.match(css, /url\('\/logo-blanco\.webp'\)/);
  assert.ok(fs.statSync(path.join(dist, 'camino-erudito.webp')).size > 0);
  assert.ok(fs.statSync(path.join(dist, 'logo-blanco.webp')).size > 0);
});
