const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=name=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(require('node:path').join(__dirname,'../club',name+'.js'),'utf8')).toString('base64'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const meta=(revision=1)=>({cuentaId:1,privadas:{RESUMEN:revision,MOVIMIENTOS:1,CANJES:1},disponibilidad:1,fechaServidor:'2026-10-08T12:00:00Z',revisarEn:'2026-10-09T12:00:00Z'});
test('50 personas navegan tres minutos sin repetir las 200 lecturas iniciales',async()=>{
 const {createClubReadCache}=await load('cache');let now=0,calls=0;
 const people=Array.from({length:50},(_,id)=>createClubReadCache({getIdentity:()=>id,now:()=>now,request:async()=>{calls++;return {ok:true,datos:[],cache:meta()};}}));
 for(let second=0;second<180;second++){now=second*1000;await Promise.all(people.map(async person=>{for(const action of ['RESUMEN','MOVIMIENTOS','CANJES','PREMIOS'])await person.read(action);}));}
 assert.equal(calls,200);
});
test('una revisión invalida únicamente el recurso cambiado y descarta avisos antiguos',async()=>{
 const {createClubReadCache}=await load('cache');const calls=[];let summary=1;
 const client=createClubReadCache({getIdentity:()=>1,request:async action=>{calls.push(action);return {ok:true,cache:meta(summary)};}});
 await client.read('RESUMEN');await client.read('CANJES');summary=2;
 assert.deepEqual(client.observe({privadas:{RESUMEN:2,CANJES:1}}),['RESUMEN']);await client.read('CANJES');await client.read('RESUMEN');
 client.observe({privadas:{RESUMEN:1}});await client.read('RESUMEN');assert.deepEqual(calls,['RESUMEN','CANJES','RESUMEN']);
});
test('un aviso durante una lectura no permite conservar ni devolver la respuesta anterior',async()=>{
 const {createClubReadCache}=await load('cache');let resolve,calls=0;
 const client=createClubReadCache({getIdentity:()=>1,request:()=>++calls===1?new Promise(r=>resolve=r):Promise.resolve({ok:true,cache:meta(2),saldo:2})});
 client.observe({privadas:{RESUMEN:1}});const request=client.read('RESUMEN');await flush();client.observe({privadas:{RESUMEN:2}});
 resolve({ok:true,cache:meta(1),saldo:1});const result=await request;assert.equal(result.saldo,2);assert.equal(calls,2);assert.equal((await client.read('RESUMEN')).saldo,2);
});
test('salir o cambiar de identidad descarta respuestas privadas tardías',async()=>{
 const {createClubReadCache}=await load('cache');let identity=1,resolve;
 const client=createClubReadCache({getIdentity:()=>identity,request:()=>new Promise(r=>resolve=r)});
 const request=client.read('RESUMEN');await flush();identity=2;client.clear();resolve({ok:true,cache:meta(),saldo:99});
 assert.equal((await request).ok,false);assert.equal(client.peek('RESUMEN'),undefined);
});
test('el plazo de negocio limita la caché aunque el reloj del navegador difiera',async()=>{
 const {createClubReadCache}=await load('cache');let now=0,calls=0;
 const client=createClubReadCache({getIdentity:()=>1,now:()=>now,request:async()=>{calls++;return {ok:true,cache:{...meta(),revisarEn:'2026-10-08T12:00:10Z'}};}});
 await client.read('RESUMEN');now=9999;await client.read('RESUMEN');assert.equal(calls,1);now=10000;await client.read('RESUMEN');assert.equal(calls,2);
});
test('una revisión pública utiliza URL nueva y conserva recursos que no cambiaron',async()=>{
 const {createClubContentClient}=await load('content');const urls=[];
 const client=createClubContentClient({baseUrl:'/api',fetcher:async url=>{urls.push(url);return Response.json({ok:true,datos:[],revision:url.includes('v=2')?2:1});}});
 await client.read('noticias');await client.read('reglas');client.observe({noticias:2,reglas:1});await client.read('noticias');await client.read('reglas');
 assert.deepEqual(urls,['/api/noticias','/api/reglas','/api/noticias?v=2']);
});
test('la edad del CDN no extiende una publicación más allá de su fecha',async()=>{
 const {createClubContentClient}=await load('content');let now=0,calls=0;
 const client=createClubContentClient({baseUrl:'/api',now:()=>now,fetcher:async()=>{calls++;return Response.json({ok:true,datos:[],revision:1,fechaServidor:'2026-10-08T12:00:00Z',siguienteCambio:'2026-10-08T12:00:10Z'},{headers:{Age:'8'}});}});
 await client.read('catalogo');now=1999;await client.read('catalogo');assert.equal(calls,1);now=2000;await client.read('catalogo');assert.equal(calls,2);
});
test('un cambio durante una carga pública sustituye la copia antigua',async()=>{
 const {createClubContentClient}=await load('content');let resolve,calls=0;
 const client=createClubContentClient({baseUrl:'/api',fetcher:async()=>++calls===1?new Promise(r=>resolve=r):Response.json({ok:true,datos:[],revision:2})});
 const read=client.read('noticias');await flush();client.observe({noticias:2});resolve(Response.json({ok:true,datos:[],revision:1}));assert.equal((await read).revision,2);assert.equal(calls,2);
});
test('los avisos usan canales privados y reconectar sincroniza cambios perdidos sin sondeo periódico',async()=>{
 const {createClubUpdates}=await load('changes');let reads=0,changes=0;const channels=[],received=[];
 const client={channel:(topic,config)=>{const c={topic,config,on(_kind,_event,fn){this.message=fn;return this;},subscribe(fn){this.status=fn;return this;}};channels.push(c);return c;},removeChannel:async()=>{}};
 const nativeTimeout=global.setTimeout,nativeClear=global.clearTimeout;const timers=new Map();global.setTimeout=(fn,ms)=>{const key={};timers.set(key,{fn,ms});return key;};global.clearTimeout=key=>timers.delete(key);
 try{
  const updates=createClubUpdates({getSessionId:()=>1,readVersions:async()=>{reads++;return {ok:true,cache:meta(reads)};},onVersions:data=>received.push(data),onChange:()=>changes++,onDeadline:()=>{}});
  await updates.start(client);assert.equal(reads,1);assert.deepEqual(channels.map(c=>c.topic),['club-cuenta:1','club-contenido']);assert.ok(channels.every(c=>c.config.config.private));
  channels.forEach(c=>c.status('SUBSCRIBED'));await flush();assert.equal(reads,2);
  channels[0].message({payload:meta(3)});assert.equal(received.at(-1).privadas.RESUMEN,3);assert.equal(reads,2);assert.ok(changes>=2);
  channels[0].status('CLOSED');channels[0].status('SUBSCRIBED');await flush();assert.equal(reads,3);
  updates.stop();assert.equal(timers.size,0);channels[0].message({payload:meta(9)});assert.notEqual(received.at(-1).privadas.RESUMEN,9);
 }finally{global.setTimeout=nativeTimeout;global.clearTimeout=nativeClear;}
});

test('una lectura fallida inicial recupera los canales al verificar la conexión',async()=>{
 const {createClubUpdates}=await load('changes');let count=0;const topics=[];
 const client={channel:topic=>{topics.push(topic);return {on(){return this;},subscribe(){return this;}};},removeChannel:async()=>{}};
 const updates=createClubUpdates({getSessionId:()=>1,readVersions:async()=>{if(++count===1)throw Error('corte');return {ok:true,cache:meta()};},onVersions:()=>{},onChange:()=>{},onDeadline:()=>{}});
 await updates.start(client);assert.equal(topics.length,0);await updates.sync();assert.equal(topics.length,2);await updates.sync();assert.equal(topics.length,2);updates.stop();
});
