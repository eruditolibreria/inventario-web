const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('club/content.js','utf8');
const moduleReady=import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('contenido comun se deduplica sin credenciales y vence por TTL',async()=>{
 const {createClubContentClient}=await moduleReady;let calls=0,clock=0;const options=[];
 const client=createClubContentClient({baseUrl:'/api/club/v1',now:()=>clock,ttl:30,
  fetcher:async(url,config)=>{calls++;options.push(config);return Response.json({ok:true,datos:[],revision:1});}});
 await Promise.all([client.read('noticias'),client.read('noticias')]);assert.equal(calls,1);
 assert.equal(options[0].credentials,'omit');assert.equal(options[0].headers,undefined);
 clock=29;await client.read('noticias');assert.equal(calls,1);
 clock=30;await client.read('noticias');assert.equal(calls,2);
});
test('ruta ausente permite origen directo; errores de servidor no duplican consultas',async()=>{
 const {createClubContentClient}=await moduleReady;const urls=[];
 const client=createClubContentClient({baseUrl:'/api/club/v1',fallbackUrl:'http://local/club-content',
  fetcher:async url=>{urls.push(url);return urls.length===1?new Response('html',{status:404}):Response.json({ok:true,datos:[]});}});
 await client.read('catalogo');assert.deepEqual(urls,['/api/club/v1/catalogo','http://local/club-content/catalogo']);
 let calls=0;
 const failed=createClubContentClient({baseUrl:'/api',fallbackUrl:'/origin',fetcher:async()=>{calls++;return new Response('',{status:503});}});
 await assert.rejects(failed.read('noticias'));await assert.rejects(failed.read('noticias'));assert.equal(calls,2);
 await assert.rejects(failed.read('clientes'),/RECURSO_INVALIDO/);assert.equal(calls,2);
});
test('stock y precio vienen de disponibilidad, los agotados siguen publicados y las fechas se respetan',async()=>{
 const {mergeClubRewards}=await moduleReady;const now=Date.parse('2026-10-05T12:00:00Z');
 const catalogo={datos:[{id:1,nombre:'Cuaderno',costo_puntos:1},{id:2},{id:3,disponible_hasta:'2026-10-05T11:00:00Z'}]};
 const live={datos:[{id:1,stock_disponible:0,costo_puntos:3,club_premios_sucursales:[]},{id:3,stock_disponible:1}]};
 const result=mergeClubRewards(catalogo,live,now);
 assert.equal(result.datos.length,1);assert.equal(result.datos[0].nombre,'Cuaderno');
 assert.equal(result.datos[0].stock_disponible,0);assert.equal(result.datos[0].costo_puntos,3);
});
test('revision distinta obtiene catalogo actual por sesion y no habilita premios retirados',async()=>{
 const {mergeClubRewards}=await moduleReady;const calls=[];
 const app=fs.readFileSync('club/app.js','utf8');
 const context=vm.createContext({session:{token:'sesion'},PUBLIC_URL:'local',refreshIfNeeded:async()=>{},mergeClubRewards,
  contentClient:{read:async()=>({ok:true,revision:1,datos:[{id:1,nombre:'Retirado'}]}),remember:()=>{}},
  post:async(url,body)=>{calls.push(body);return body.ACCION==='DISPONIBILIDAD'
   ?{ok:true,revisionCatalogo:2,datos:[{id:2,stock_disponible:1}]}
   :{ok:true,revision:2,datos:[{id:2,nombre:'Nuevo'}]};}});
 vm.runInContext(app.slice(app.indexOf('async function clubApi('),app.indexOf('const readKey')),context);
 const result=await context.clubApi('PREMIOS');assert.equal(result.datos[0].nombre,'Nuevo');
 assert.deepEqual(calls.map(x=>x.ACCION),['DISPONIBILIDAD','CATALOGO_ACTUAL']);
 await context.clubApi('RESUMEN');assert.equal(calls[2].SEPARAR_CONTENIDO,true);
});


test('service worker integrado e independiente no interceptan datos de API',()=>{
 const source=fs.readFileSync('club/sw.js','utf8');
 for(const standalone of [false,true]) {
  const listeners={};
  const context=vm.createContext({URL,self:{location:{origin:'https://club.test'},addEventListener:(name,fn)=>listeners[name]=fn}});
  vm.runInContext(standalone?source.replaceAll('/club/','/'):source,context);
  for(const path of ['/api/club/v1/catalogo','/api/club/v1/noticias','/functions/v1/club-public','/api/cuenta']) {
   let intercepted=false;
   listeners.fetch({request:{url:'https://club.test'+path,method:'GET',mode:'cors'},respondWith:()=>intercepted=true});
   assert.equal(intercepted,false,`${standalone?'standalone':'integrado'}: ${path}`);
  }
 }
});
