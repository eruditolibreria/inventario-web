const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('club/session.js','utf8').replace('export function','function');
const first='c9000000-0000-0000-0000-000000000001';
const second='c9000000-0000-0000-0000-000000000002';
const token=id=>`header.${Buffer.from(JSON.stringify({session_id:id})).toString('base64url')}.signature`;
function setup() {
  let session={token:token(first)},closed=0,checks=0,result={ok:true};
  const clients=[],timers=new Map(),events={};
  const document={hidden:false,addEventListener:(name,fn)=>events[name]=fn};
  const context=vm.createContext({atob,document,window:{addEventListener:(name,fn)=>events[name]=fn},
    setInterval:(fn,ms)=>{const key={};timers.set(key,{fn,ms});return key;},clearInterval:key=>timers.delete(key)});
  vm.runInContext(source,context);
  const watcher=context.createClubSessionWatcher({
    createClient:()=>{
      const record={removed:0,disconnected:0,authed:false};
      const channel={on(type,options,fn){record.event=fn;record.type=type;record.eventName=options.event;return this;},subscribe(fn){record.status=fn;return this;}};
      const client={realtime:{setAuth:async()=>{record.authed=true;},disconnect:()=>{record.disconnected++;}},
        removeChannel:async()=>{record.removed++;},channel:(topic,options)=>{assert.equal(record.authed,true);record.topic=topic;record.private=options.config.private;return channel;}};
      clients.push(record);return client;
    },
    getSession:()=>session,
    verify:async()=>{checks++;if(result instanceof Error)throw result;return typeof result==='function'?result():result;},
    onTransferred:()=>{closed++;session=null;watcher.stop();},
  });
  return {watcher,clients,timers,events,document,setSession:id=>session={token:token(id)},setResult:value=>result=value,closed:()=>closed,checks:()=>checks};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('el aviso privado cierra la pantalla anterior sin esperar consultas ni tocarla',async()=>{
  const f=setup();await f.watcher.start();const c=f.clients[0];
  assert.equal(c.topic,`club-sesion:${first}`);assert.equal(c.private,true);assert.equal(c.eventName,'sesion_trasladada');
  c.event();await flush();assert.equal(f.closed(),1);assert.equal(f.checks(),0);assert.equal(c.removed,1);assert.equal(c.disconnected,1);assert.equal(f.timers.size,0);
});
test('al reconectar se verifica si el traslado ocurrio mientras estaba sin conexion',async()=>{
  const f=setup();await f.watcher.start();f.setResult({ok:false,error:'SESION_TRASLADADA'});
  f.clients[0].status('SUBSCRIBED');await flush();assert.equal(f.closed(),1);
});
test('fallos de red conservan la sesion y hay respaldo cuando falla tiempo real',async()=>{
  const f=setup();await f.watcher.start();f.setResult(new Error('offline'));
  const interval=[...f.timers.values()][0];assert.equal(interval.ms,15000);interval.fn();await flush();assert.equal(f.closed(),0);
  f.setResult({ok:false,error:'NO_AUTORIZADO'});f.events.online();await flush();assert.equal(f.closed(),1);
});
test('el canal conectado no consulta periodicamente y volver a la pantalla si verifica',async()=>{
  const f=setup();await f.watcher.start();f.clients[0].status('SUBSCRIBED');await flush();
  const count=f.checks();[...f.timers.values()][0].fn();await flush();assert.equal(f.checks(),count);
  f.document.hidden=true;f.events.visibilitychange();await flush();assert.equal(f.checks(),count);
  f.document.hidden=false;f.events.visibilitychange();await flush();assert.equal(f.checks(),count+1);
});
test('un aviso atrasado de la sesion anterior no cierra el ingreso nuevo',async()=>{
  const f=setup();await f.watcher.start();const previous=f.clients[0];f.setSession(second);await f.watcher.start();
  previous.event();previous.status('SUBSCRIBED');await flush();assert.equal(f.closed(),0);assert.equal(f.checks(),0);
  f.clients[1].event();assert.equal(f.closed(),1);
});
test('renovar el token de la misma sesion conserva el aviso de cierre',async()=>{
  const f=setup();await f.watcher.start();f.setSession(first);f.clients[0].event();assert.equal(f.closed(),1);
});
test('una verificacion antigua no invalida una cuenta que inicio despues',async()=>{
  const f=setup();await f.watcher.start();let resolve;
  f.setResult(()=>new Promise(r=>resolve=r));const pending=f.watcher.check();
  f.setSession(second);await f.watcher.start();resolve({ok:false,error:'SESION_TRASLADADA'});await pending;
  assert.equal(f.closed(),0);
});
