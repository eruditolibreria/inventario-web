const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('club/app.js','utf8');
function setup({ios=false,standalone=false}={}) {
  const handlers={};const media={matches:standalone,addEventListener(name,handler){this.handler=handler;}};
  const buttons=[{},{}].map(()=>({hidden:true,addEventListener(name,handler){this.click=handler;}}));
  const dialog={opened:0,showModal(){this.opened++;},close(){}};
  const instructions={textContent:''};
  const context=vm.createContext({matchMedia:()=>media,navigator:{userAgent:ios?'iPhone':'Android Chrome',platform:'Linux',maxTouchPoints:1},
    window:{addEventListener:(name,handler)=>handlers[name]=handler},
    document:{querySelectorAll:()=>buttons},
    $:id=>id==='installInstructions'?instructions:id==='installDialog'?dialog:{addEventListener(){}},
  });
  vm.runInContext(app.slice(app.indexOf('const modoInstalado='),app.indexOf('function mensajeError(')),context);
  let calls=0;
  const ready=(choice=Promise.resolve({outcome:'accepted'}))=>handlers.beforeinstallprompt({preventDefault(){},prompt(){calls++;return Promise.resolve();},userChoice:choice});
  return {buttons,dialog,media,handlers,instructions,ready,calls:()=>calls};
}
test('en Android el boton aparece listo y abre directamente el aviso nativo en el mismo toque',async()=>{
  const f=setup();assert.ok(f.buttons.every(b=>b.hidden));
  f.ready();assert.ok(f.buttons.every(b=>!b.hidden));
  const result=f.buttons[0].click();assert.equal(f.calls(),1);
  await result;assert.equal(f.dialog.opened,0);assert.ok(f.buttons.every(b=>b.hidden));
});
test('cancelar consume el aviso y un nuevo evento habilita otro intento',async()=>{
  const f=setup();f.ready(Promise.resolve({outcome:'dismissed'}));await f.buttons[0].click();
  assert.ok(f.buttons.every(b=>b.hidden));f.ready();await f.buttons[0].click();assert.equal(f.calls(),2);
});
test('dos toques simultaneos no muestran dos avisos',async()=>{
  const f=setup();let resolve;const choice=new Promise(r=>resolve=r);f.ready(choice);
  const first=f.buttons[0].click();await f.buttons[1].click();assert.equal(f.calls(),1);
  resolve({outcome:'accepted'});await first;
});
test('instalar desde el navegador o abrir como app oculta la invitacion a instalar',()=>{
  const f=setup();f.ready();f.handlers.appinstalled();assert.ok(f.buttons.every(b=>b.hidden));
  const g=setup({standalone:true});g.ready();assert.ok(g.buttons.every(b=>b.hidden));
});
test('iPhone conserva las instrucciones manuales sin interferir con Android',async()=>{
  const f=setup({ios:true});await f.buttons[0].click();assert.equal(f.dialog.opened,1);assert.match(f.instructions.textContent,/Compartir/);
});
