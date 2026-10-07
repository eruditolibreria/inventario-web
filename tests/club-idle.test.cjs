const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('club/idle.js','utf8').replaceAll('export ','');
function setup(storage=new Map()) {
  let now=1000000,id='session-1',ended=0,sent=0;
  const timers=new Map(),events={};
  const document={hidden:false,addEventListener:(name,fn)=>events[name]=fn};
  const context=vm.createContext({Date:{now:()=>now},document,window:{addEventListener:(name,fn)=>events[name]=fn},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    setTimeout:(fn,delay)=>{const key={};timers.set(key,{fn,at:now+delay});return key;},clearTimeout:key=>timers.delete(key)});
  vm.runInContext(source,context);
  const idle=context.createClubIdle({getSessionId:()=>id,onExpired:()=>{ended++;idle.stop();},notifyActivity:async()=>{sent++;}});
  const advance=ms=>{now+=ms;for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.fn();}};
  return {idle,events,document,storage,advance,ended:()=>ended,sent:()=>sent,setId:value=>id=value};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('cierra exactamente a los diez minutos sin avisos previos',()=>{
  const f=setup();f.idle.start();f.advance(599999);assert.equal(f.ended(),0);f.advance(1);assert.equal(f.ended(),1);
});
test('actividad real extiende el limite y las consultas o eventos sinteticos no lo hacen',async()=>{
  const f=setup();f.idle.start();f.advance(300000);f.events.pointerdown({isTrusted:false});assert.equal(f.sent(),0);
  f.events.pointerdown({isTrusted:true});await flush();assert.equal(f.sent(),1);f.advance(599999);assert.equal(f.ended(),0);f.advance(1);assert.equal(f.ended(),1);
});
test('recargar o renovar la misma sesion no reinicia el reloj',()=>{
  const f=setup();f.idle.start();f.advance(590000);f.idle.start();f.advance(10000);assert.equal(f.ended(),1);
});
test('Atras tambien registra actividad real sin reiniciar el plazo por cambios sinteticos',async()=>{
  const f=setup();f.idle.start();f.advance(300000);f.events.popstate({isTrusted:false});assert.equal(f.sent(),0);
  f.events.popstate({isTrusted:true});await flush();f.advance(300000);assert.equal(f.ended(),0);assert.equal(f.sent(),1);
});
test('volver de una suspension comprueba el tiempo real y un toque tardio no revive la sesion',()=>{
  const f=setup();f.idle.start();f.document.hidden=true;f.advance(600000);f.document.hidden=false;f.events.pointerdown({isTrusted:true});assert.equal(f.ended(),1);assert.equal(f.sent(),0);
});
test('la actividad compartida entre pestanas extiende ambas',async()=>{
  const f=setup(),g=setup(f.storage);f.idle.start();g.idle.start();f.advance(300000);g.advance(300000);
  f.events.keydown({isTrusted:true});await flush();g.events.storage({key:'club_eruditos_actividad'});
  g.advance(599999);assert.equal(g.ended(),0);g.advance(1);assert.equal(g.ended(),1);
});
test('los avisos al backend se agrupan y conservan la edad de la ultima actividad',async()=>{
  const f=setup();f.idle.start();f.advance(1000);f.events.pointerdown({isTrusted:true});await flush();
  f.advance(1000);f.events.pointermove({isTrusted:true});await flush();assert.equal(f.sent(),1);
  f.advance(58999);await flush();assert.equal(f.sent(),1);f.advance(1);await flush();assert.equal(f.sent(),2);assert.equal(f.idle.elapsed(),59000);
});
test('una nueva sesion inicia su propio plazo y al salir se detienen los temporizadores',()=>{
  const f=setup();f.idle.start();f.advance(590000);f.setId('session-2');f.idle.start();f.advance(10000);assert.equal(f.ended(),0);f.idle.stop();f.advance(600000);assert.equal(f.ended(),0);
});

test('cincuenta usuarios activos agrupan tres minutos en tres avisos por persona',async()=>{
  const people=Array.from({length:50},()=>setup());people.forEach(f=>f.idle.start());
  for(let second=0;second<180;second++){
    people.forEach(f=>{f.advance(1000);f.events.pointermove({isTrusted:true});});await flush();
  }
  assert.equal(people.reduce((n,f)=>n+f.sent(),0),150);
  people.forEach(f=>f.advance(60000));await flush();
  people.forEach(f=>{assert.equal(f.sent(),4);assert.equal(f.idle.elapsed(),60000);assert.equal(f.ended(),0);});
});