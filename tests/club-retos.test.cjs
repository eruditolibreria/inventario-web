const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('club/app.js','utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const context=vm.createContext({Intl,Date,esc});
vm.runInContext(app.slice(app.indexOf('function beneficioNivel('),app.indexOf('function renderRetos(')),context);
test('la escala extra empieza en 3 y desciende regularmente hasta Bs 30',()=>{
  for(const nivel of [1,2])assert.match(context.beneficioNivel(nivel),/comienzan en el nivel 3/);
  for(let nivel=3;nivel<=10;nivel++)assert.ok(context.beneficioNivel(nivel).includes(`Bs ${130-nivel*10} `));
});
const reto={codigo:'SEMANAL',nombre:'Erudito constante',etiqueta:'RETO SEMANAL',meta:50,unidad:'Bs',periodicidad:'week',avance:25,inicioPeriodo:'2026-09-28',finPeriodo:'2026-10-04'};
test('el reto muestra avance parcial y las fechas del periodo en Bolivia',()=>{
  const html=context.retoCard(reto);
  assert.match(html,/max="50" value="25"/);
  assert.match(html,/Bs 25 de Bs 50/);
  assert.match(html,/En progreso/);
  assert.match(html,/28/);
  assert.match(html,/semanalmente/);
});
test('se distingue la espera del premio y se conservan los pendientes del periodo anterior',()=>{
  const html=context.retoCard({...reto,avance:75,calificaEn:'2026-10-01T23:30:00Z',liberaEn:'2026-10-03T23:30:00Z',pendientes:[{puntos:1,liberaEn:'2026-10-01T23:30:00Z'}]});
  assert.match(html,/max="50" value="50"/);
  assert.match(html,/data-estado="Pendiente"/);
  assert.match(html,/19:30/);
  assert.match(html,/Periodo anterior: \+1 punto pendiente/);
  assert.doesNotMatch(html,/Ganaste/);
  assert.match(context.retoCard({...reto,puntosOtorgados:1}),/Ganaste 1 punto\./);
});
test('los datos del reto se escapan antes de insertarse en la pantalla',()=>{
  const html=context.retoCard({...reto,nombre:'<img src=x onerror=alert(1)>',unidad:'<script>',avance:NaN});
  assert.doesNotMatch(html,/<img|<script>/);
  assert.match(html,/&lt;img/);
  assert.match(html,/value="0"/);
});
