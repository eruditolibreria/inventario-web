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
  assert.match(app, /from '\.\/session\.js'/);
  assert.ok(fs.statSync(path.join(dist,'session.js')).size>0);
  assert.ok(fs.statSync(path.join(dist,'idle.js')).size>0);
  assert.match(app,/from '\.\/js\/back-exit\.js'/);
  assert.ok(fs.statSync(path.join(dist,'js','back-exit.js')).size>0);
  assert.ok(fs.statSync(path.join(dist,'js','vendor','supabase-umd.js')).size>0);
  assert.match(app, /DISPOSITIVO_ID:deviceId/);
  assert.match(css, /url\('\/camino-erudito\.webp'\)/);
  assert.match(css, /url\('\/logo-blanco\.webp'\)/);
  assert.ok(fs.statSync(path.join(dist, 'camino-erudito.webp')).size > 0);
  assert.ok(fs.statSync(path.join(dist, 'logo-blanco.webp')).size > 0);
});

test('el despliegue desde Git conserva los archivos necesarios tras aplicar .vercelignore', () => {
  const listed = spawnSync('git', ['ls-files', '--cached', '--exclude-from=.vercelignore', '--'], {
    cwd: root, encoding: 'utf8',
  });
  const ignored = spawnSync('git', ['ls-files', '--cached', '--ignored', '--exclude-from=.vercelignore', '--'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(ignored.status, 0, ignored.stderr);
  const excluded = new Set(ignored.stdout.trim().split('\n'));
  const fixture = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'club-git-build-'));
  try {
    for (const file of listed.stdout.trim().split('\n').filter(file => file && !excluded.has(file))) {
      const target = path.join(fixture, file);
      fs.mkdirSync(path.dirname(target), {recursive:true});
      fs.copyFileSync(path.join(root, file), target);
    }
    fs.mkdirSync(path.join(fixture, 'club-standalone'), {recursive:true});
    const result = spawnSync(process.execPath, ['build.mjs'], {
      cwd: path.join(fixture, 'club-standalone'), encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.statSync(path.join(fixture, 'club-standalone', 'dist', 'index.html')).size > 0);
    for (const file of ['club-standalone/vercel.json', 'club-standalone/api/club/v1/catalogo.js',
      'club-standalone/api/club/v1/noticias.js', 'club-standalone/api/club/v1/reglas.js', 'server/club-content-proxy.cjs']) {
      assert.ok(fs.statSync(path.join(fixture, file)).size > 0, file);
    }
  } finally {
    fs.rmSync(fixture, {recursive:true, force:true});
  }
});