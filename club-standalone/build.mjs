import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('.', import.meta.url));
const sourceDir = resolve(projectDir, '..');
const outputDir = resolve(projectDir, 'dist');

if (dirname(outputDir) !== resolve(projectDir) || basename(outputDir) !== 'dist') {
  throw new Error('La carpeta de salida debe estar dentro de club-standalone.');
}

const textFiles = ['index.html', 'app.js', 'navigation.js', 'styles.css', 'manifest.json', 'sw.js'];
const imageFiles = [
  'camino-erudito.webp',
  'logo-blanco.webp',
  'launchericon-192x192.png',
  'launchericon-512x512.png',
  'splash-eruditos.png',
];
const sourceOnlyFiles = ['camino-erudito.png', 'logo-blanco.png'];

const sourceFiles = await readdir(join(sourceDir, 'club'));
const unexpectedFiles = sourceFiles.filter(file => ![...textFiles, ...imageFiles, ...sourceOnlyFiles].includes(file));
if (unexpectedFiles.length) {
  throw new Error(`Revisar archivos nuevos de Club antes de publicar: ${unexpectedFiles.join(', ')}`);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(join(outputDir, 'js'), { recursive: true });

for (const file of textFiles) {
  let content = await readFile(join(sourceDir, 'club', file), 'utf8');
  content = content.replaceAll('/club/', '/');
  if (file === 'app.js') content = content.replace("from '../js/config.js'", "from './js/config.js'");
  if (content.includes('/club/')) throw new Error(`Quedó una ruta de Club sin adaptar en ${file}.`);
  await writeFile(join(outputDir, file), content);
}

for (const file of imageFiles) {
  await copyFile(join(sourceDir, 'club', file), join(outputDir, file));
}

await copyFile(join(sourceDir, 'js', 'config.js'), join(outputDir, 'js', 'config.js'));
console.log('Portal Club independiente listo en club-standalone/dist.');
