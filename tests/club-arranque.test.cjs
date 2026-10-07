const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('club/app.js','utf8');
function setup(respuestas) {
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',attributes:{},handlers:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.handlers[k]=v;}});return nodes.get(id);};
  const timers=new Map();let id=0,calls=0,renders=0,prefetch=0;
  const context=vm.createContext({
    $,document:{querySelector:()=>node('hero')},AbortController,
    setTimeout:(cb,ms)=>{const key=++id;if(ms===600)setImmediate(cb);else timers.set(key,{cb,ms});return key;},
    clearTimeout:key=>timers.delete(key),
    fetch:async()=>{calls++;const result=respuestas.shift();if(result instanceof Error)throw result;if(typeof result==='function')return result();return{status:result.status||200,json:async()=>result};},
    session:{token:'local-test'},refreshing:null,viewEpoch:0,readCache:new Map(),readPending:new Map(),
    SUPABASE_ANON_KEY:'anon-test',PUBLIC_URL:'http://local/club-public',
    mensajeError:code=>code,setStatus:(target,message)=>node(target).textContent=message,
    renderInicio:data=>{renders++;node('hero').hidden=false;node('clubProgreso').hidden=false;node('saldoDisponible').textContent=String(data.saldo);},
    prefetchTabs:()=>prefetch++,cargarContenidoInicio:async()=>{},
    saveSession:value=>{context.session=value;context.viewEpoch++;},showAuth:()=>{node('appView').hidden=true;},
    terminarSesion:()=>{context.saveSession(null);context.showAuth();},
  });
  function $(id){return node(id);}
  vm.runInContext(app.slice(app.indexOf('async function post('),app.indexOf('function showAuth(')),context);
  vm.runInContext(app.slice(app.indexOf('async function cargarInicio('),app.indexOf('function renderInicio(')),context);
  return {context,node,timers,calls:()=>calls,renders:()=>renders,prefetch:()=>prefetch};
}
test('la primera carga recupera un corte de conexion sin dejar un saldo falso de cero',async()=>{
  const f=setup([new Error('conexion'),{ok:true,saldo:8}]);
  const loading=f.context.cargarPrimeraVista();
  assert.equal(f.node('hero').hidden,true);
  await loading;
  assert.equal(f.calls(),2);assert.equal(f.renders(),1);assert.equal(f.prefetch(),0);
  assert.equal(f.node('saldoDisponible').textContent,'8');assert.equal(f.node('inicioCarga').hidden,true);
  assert.equal(f.node('appView').attributes['aria-busy'],'false');
});
test('un arranque temporalmente fallido del servidor se reintenta una sola vez',async()=>{
  const f=setup([{ok:false,status:503,error:'TEMPORAL'},{ok:true,saldo:5}]);
  await f.context.cargarPrimeraVista();assert.equal(f.calls(),2);assert.equal(f.renders(),1);
});
test('tras dos fallos se ofrece Reintentar y se puede recuperar sin recargar',async()=>{
  const f=setup([new Error('offline'),new Error('offline'),{ok:true,saldo:5}]);
  await f.context.cargarPrimeraVista();
  assert.equal(f.calls(),2);assert.equal(f.node('reintentarInicio').hidden,false);
  assert.equal(f.node('hero').hidden,true);assert.match(f.node('inicioCargaTexto').textContent,/Reintentar/);
  f.node('reintentarInicio').handlers.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls(),3);assert.equal(f.node('inicioCarga').hidden,true);assert.equal(f.renders(),1);
});
test('los errores de permisos o sesion no provocan reintentos automaticos',async()=>{
  const f=setup([{ok:false,status:403,error:'PERMISO_DENEGADO'}]);
  await f.context.cargarPrimeraVista();assert.equal(f.calls(),1);assert.equal(f.node('reintentarInicio').hidden,false);
  const g=setup([{ok:false,status:401,error:'NO_AUTORIZADO'}]);
  await g.context.cargarPrimeraVista();assert.equal(g.calls(),1);assert.equal(g.context.session,null);
});
test('una respuesta de otra sesion se descarta y no altera la cuenta nueva',async()=>{
  const f=setup([()=>{f.context.viewEpoch++;return{status:200,json:async()=>({ok:true,saldo:99})};}]);
  await f.context.cargarPrimeraVista();assert.equal(f.renders(),0);assert.equal(f.prefetch(),0);
});
test('las peticiones tienen limite de tiempo y limpian el temporizador',async()=>{
  const f=setup([]);
  f.context.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout'))));
  const result=f.context.post('http://local',{});
  const timer=[...f.timers.values()][0];assert.equal(timer.ms,30000);timer.cb();
  await assert.rejects(result,/timeout/);assert.equal(f.timers.size,0);
});
