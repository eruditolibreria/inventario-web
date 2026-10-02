const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/back-exit.js','utf8').replace('export ','');
function setup(nativeSecondBack=false) {
  const events={},timers=new Map();let shown=0,hidden=0,exited=0,overlay=false;
  const history={state:null,pushes:0,pushState(state){this.state=state;this.pushes++;},replaceState(state){this.state=state;}};
  const context=vm.createContext({window:{addEventListener:(name,fn)=>events[name]=fn},history,location:{href:'http://local/club/'},
    setTimeout:(fn,ms)=>{const key={};timers.set(key,{fn,ms});return key;},clearTimeout:key=>timers.delete(key)});
  vm.runInContext(source,context);
  context.setupDoubleBack({nativeSecondBack,closeOverlay:()=>{if(!overlay)return false;overlay=false;return true;},
    showNotice:(text,ms)=>{assert.equal(text,'Presiona atrás nuevamente para salir');assert.equal(ms,1800);shown++;return true;},hideNotice:()=>hidden++,onExit:()=>exited++});
  const back=state=>{history.state=state;events.popstate({state,preventDefault(){}});};
  return {history,timers,events,back,setOverlay:()=>overlay=true,shown:()=>shown,hidden:()=>hidden,exited:()=>exited};
}
test('el sistema administrativo conserva aviso y salida en el segundo toque',()=>{
  const f=setup();f.back(null);assert.equal(f.shown(),1);f.back(null);assert.equal(f.exited(),1);assert.equal(f.hidden(),1);
});
test('atras cierra overlays sin armar la salida administrativa',()=>{
  const f=setup();f.setOverlay();f.back(null);assert.equal(f.shown(),0);f.back(null);assert.equal(f.shown(),1);assert.equal(f.exited(),0);
});
test('CLUB muestra el aviso y deja la raiz libre para el segundo Atras nativo',()=>{
  const f=setup(true);const pushes=f.history.pushes;f.back({clubBackRoot:true});assert.equal(f.shown(),1);assert.equal(f.history.pushes,pushes);assert.equal(f.history.state.clubBackRoot,true);
});
test('al vencer los 1800 ms se vuelve a proteger la salida del portal',()=>{
  const f=setup(true);f.back({clubBackRoot:true});const timer=[...f.timers.values()][0];timer.fn();assert.equal(f.history.state.clubBackGuard,true);assert.equal(f.hidden(),1);
});
test('volver de una imagen o del Camino no muestra el aviso de salir',()=>{
  const f=setup(true);f.back({clubBackGuard:true});assert.equal(f.shown(),0);assert.equal(f.timers.size,0);
});
test('atras cierra un dialogo de CLUB y restaura la proteccion sin aviso',()=>{
  const f=setup(true);f.setOverlay();f.back({clubBackRoot:true});assert.equal(f.shown(),0);assert.equal(f.history.state.clubBackGuard,true);
});
test('volver desde otra pagina no acumula entradas nuevas si ya existe el guardia',()=>{
  const f=setup(true);const pushes=f.history.pushes;f.events.pageshow();assert.equal(f.history.pushes,pushes);
});
