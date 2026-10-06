const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'../js',file),'utf8').replace(/^import .*;\r?$/gm,'').replaceAll('export ','').replace('const obtenerSucursalesCache', 'var obtenerSucursalesCache');
function setup(){
 const store={sessionToken:'token',sessionUser:'ANA',sessionUsuarioId:'a',sessionPermisos:['sucursales.ver'],sessionSucursales:[]};
 const pending=[];let now=1000;
 class Clock extends Date{static now(){return now}}
 const ctx=vm.createContext({store,Date:Clock,Event,window:new EventTarget(),document:{querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null},
  can:()=>true,api:body=>new Promise(resolve=>pending.push({body,resolve}))});
 vm.runInContext(read('contexto-catalogos.js'),ctx);vm.runInContext(read('sucursales.js'),ctx);
 const reply=(name,remaining=60000)=>({ok:true,datos:[{id:name,nombre:name,estado:'ACTIVO'}],cache:{restanteMs:remaining}});
 return {ctx,store,pending,reply,set now(value){now=value}};
}
test('browser expiry subtracts transit and never extends an aged Redis entry',async()=>{
 const h=setup(),a=h.ctx.cargarSucursalesEnDropdowns();h.now=3000;h.pending[0].resolve(h.reply('A',5000));await a;
 h.now=5999;await h.ctx.cargarSucursalesEnDropdowns();assert.equal(h.pending.length,1);
 h.now=6001;const b=h.ctx.cargarSucursalesEnDropdowns();assert.equal(h.pending.length,2);h.pending[1].resolve(h.reply('B'));await b;
});
test('missing server expiry cannot turn a fallback into a lasting local entry',async()=>{
 const h=setup(),a=h.ctx.cargarSucursalesEnDropdowns();h.pending[0].resolve({ok:true,datos:[{id:'A',nombre:'A'}]});await a;
 const b=h.ctx.cargarSucursalesEnDropdowns();assert.equal(h.pending.length,2);h.pending[1].resolve(h.reply('A'));await b;
});
test('forced read wins over a pending older reply and transmits bypass',async()=>{
 const h=setup(),a=h.ctx.cargarSucursalesEnDropdowns(),b=h.ctx.cargarSucursalesEnDropdowns(true);
 assert.equal(h.pending[1].body.FORZAR,true);h.pending[1].resolve(h.reply('NEW'));await b;h.pending[0].resolve(h.reply('OLD'));await a;
 assert.equal(h.ctx.obtenerSucursalesCache()[0].nombre,'NEW');
});
test('logout and changing access discard cached rows and late responses',async()=>{
 const h=setup(),a=h.ctx.cargarSucursalesEnDropdowns();h.ctx.invalidarCatalogos();h.pending[0].resolve(h.reply('PRIVATE'));await a;
 assert.equal(h.ctx.obtenerSucursalesCache().length,0);
 const b=h.ctx.cargarSucursalesEnDropdowns();h.pending[1].resolve(h.reply('A'));await b;
 h.store.sessionPermisos=[];assert.equal(h.ctx.obtenerSucursalesCache().length,0);
});
test('same pending request is shared but data is isolated from the next user',async()=>{
 const h=setup(),a=h.ctx.cargarSucursalesEnDropdowns(),b=h.ctx.cargarSucursalesEnDropdowns();assert.equal(h.pending.length,1);
 h.store.sessionUsuarioId='b';h.store.sessionUser='BEA';const c=h.ctx.cargarSucursalesEnDropdowns();
 h.pending[1].resolve(h.reply('BEA'));await c;h.pending[0].resolve(h.reply('ANA'));await Promise.all([a,b]);assert.equal(h.ctx.obtenerSucursalesCache()[0].nombre,'BEA');
});

function selector(){
 const pending=[],nodes=new Map();let scheduled;
 const element=()=>({value:'',textContent:'',children:[],listeners:{},classList:{add(){},remove(){},toggle(){}},
  append(...items){this.children.push(...items)},appendChild(item){this.children.push(item)},addEventListener(name,fn){this.listeners[name]=fn},
  set innerHTML(v){this.children=[]},get innerHTML(){return ''}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const store={sessionToken:'token',sessionUser:'ANA'};
 const ctx=vm.createContext({store,document:{getElementById:get,createElement:element},
  setTimeout:fn=>{scheduled=fn;return 1},clearTimeout(){},api:body=>new Promise(resolve=>pending.push({body,resolve})),mostrarMsg(){},formatearBs:x=>'Bs '+x});
 vm.runInContext(read('contexto-catalogos.js'),ctx);vm.runInContext(read('modos/servicios.js'),ctx);
 return {ctx,store,pending,get,schedule:()=>scheduled()};
}
test('client suggestions wait for fresh credit before accepting a selection',async()=>{
 const h=selector();h.get('srvCliente').value='ANA';h.ctx.buscarClienteServicio();const search=h.schedule();
 assert.equal(h.pending[0].body.ACCION,'BUSCAR_CLIENTES_CATALOGO');h.pending[0].resolve({ok:true,datos:[{id:'c1',nombre:'ANA',codigoCliente:'C1'}]});await search;
 const selected=h.get('listaClienteServicio').children[0].listeners.click();assert.equal(h.pending[1].body.ACCION,'OBTENER_CLIENTE_SELECTOR');
 assert.equal(h.get('srvClienteId').value,'');await h.ctx.agregarServicio('OTROS');assert.equal(h.pending.length,2);h.pending[1].resolve({ok:true,cliente:{id:'c1',nombre:'ANA',deuda:65,creditoDisponible:35}});await selected;
 assert.equal(h.get('srvClienteId').value,'c1');assert.match(h.get('srvClienteCredito').textContent,/65.*35/);
});
test('typing another client rejects a late balance response',async()=>{
 const h=selector();h.get('srvCliente').value='ANA';h.ctx.buscarClienteServicio();const search=h.schedule();
 h.pending[0].resolve({ok:true,datos:[{id:'c1',nombre:'ANA',codigoCliente:'C1'}]});await search;
 const selected=h.get('listaClienteServicio').children[0].listeners.click();h.get('srvCliente').value='BEA';h.ctx.buscarClienteServicio();
 h.pending[1].resolve({ok:true,cliente:{id:'c1',nombre:'ANA',deuda:999,creditoDisponible:1}});await selected;
 assert.equal(h.get('srvClienteId').value,'');assert.equal(h.get('srvCliente').value,'BEA');assert.doesNotMatch(h.get('srvClienteCredito').textContent,/999/);
});
