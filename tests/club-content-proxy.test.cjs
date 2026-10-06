const test = require('node:test');
const assert = require('node:assert/strict');
const createHandler = require('../server/club-content-proxy.cjs');
async function run({method='GET',url='/api/club/v1/reglas',headers={}}={}, origin, resource='reglas') {
  const calls=[];
  const previous=global.fetch;
  global.fetch=async (...args)=>{calls.push(args); if(origin instanceof Error) throw origin; return origin;};
  const res={headers:{}, setHeader(k,v){this.headers[k.toLowerCase()]=v;}, end(body){this.body=body;}};
  try {await createHandler(resource)({method,url,headers},res);} finally {global.fetch=previous;}
  return {res,calls};
}
function origin(body={ok:true,datos:{},revision:1},status=200) {
  return new Response(JSON.stringify(body), {status,headers:{
    'content-type':'application/json','cache-control':'public, max-age=0, must-revalidate',
    'vercel-cdn-cache-control':'public, s-maxage=900, stale-while-revalidate=60',
    'etag':'W/"abc"','set-cookie':'infra=example; HttpOnly',
    'vercel-cache-tag':'club-reglas','x-internal-test':'secret',
  }});
}
test('contenido público conserva TTL/etiqueta pero excluye cookies y credenciales',async()=>{
  const {res,calls}=await run({headers:{authorization:'Bearer private',cookie:'session=private'}},origin());
  assert.equal(res.statusCode,200);
  assert.equal(res.headers['vercel-cdn-cache-control'],'public, s-maxage=900, stale-while-revalidate=60');
  assert.equal(res.headers['vercel-cache-tag'],'club-reglas');
  assert.equal(res.headers['set-cookie'],undefined);
  assert.equal(res.headers['x-internal-test'],undefined);
  assert.deepEqual(calls[0][1].headers,{Accept:'application/json'});
  assert.equal(calls[0][0],'https://nhysxuqxlkmvrpxdoate.supabase.co/functions/v1/club-content/reglas');
});
test('no hay proxy arbitrario, consultas ni métodos de escritura',async()=>{
  for(const input of [{url:'/api/club/v1/reglas?cuenta=1'},{method:'POST'}]) {
    const {res,calls}=await run(input,origin());
    assert.ok([404,405].includes(res.statusCode));
    assert.equal(res.headers['cache-control'],'no-store');
    assert.equal(calls.length,0);
  }
});
test('errores de origen no se cachean ni exponen detalles',async()=>{
  for(const response of [origin({ok:false,error:'private'}),origin({},500),new Error('private'),new Response('invalid')]) {
    const {res}=await run({},response);
    assert.equal(res.statusCode,503);
    assert.equal(res.headers['cache-control'],'no-store');
    assert.equal(res.headers['vercel-cdn-cache-control'],undefined);
    assert.equal(res.headers['set-cookie'],undefined);
    assert.deepEqual(JSON.parse(res.body),{ok:false,error:'CONTENIDO_NO_DISPONIBLE'});
  }
});
test('HEAD y ETag condicional débil/fuerte no devuelven cuerpo',async()=>{
  for(const headers of [{'if-none-match':'"abc"'},{'if-none-match':'W/"abc"'},{'if-none-match':'*'}]) {
    const {res}=await run({headers},origin());
    assert.equal(res.statusCode,304);
    assert.equal(res.body,undefined);
  }
  const {res}=await run({method:'HEAD'},origin());
  assert.equal(res.statusCode,200);
  assert.equal(res.body,undefined);
});
test('los dos proyectos exponen exclusivamente tres recursos públicos',async()=>{
  assert.throws(()=>createHandler('cuentas'),/RECURSO_INVALIDO/);
  const previous=global.fetch;
  try {
    for(const folder of ['api/club/v1','club-standalone/api/club/v1']) {
      for(const resource of ['reglas','noticias','catalogo']) {
        let called;
        global.fetch=async url=>{called=url;return origin();};
        const route=require('../'+folder+'/'+resource+'.js');
        const res={setHeader(){},end(){}};
        await route({method:'GET',url:'/api/club/v1/'+resource,headers:{}},res);
        assert.equal(res.statusCode,200);
        assert.ok(called.endsWith('/'+resource));
      }
    }
  } finally {global.fetch=previous;}
});

test('solo catálogo usa la región de PostgreSQL y descarta la región del visitante',async()=>{
  for (const resource of ['reglas','noticias','catalogo']) {
    const {res,calls}=await run({url:'/api/club/v1/'+resource,headers:{'x-region':'sa-east-1',authorization:'Bearer private',cookie:'session=private'}},origin(),resource);
    assert.equal(res.statusCode,200);
    assert.deepEqual(calls[0][1].headers,resource === 'catalogo' ? {Accept:'application/json','x-region':'us-west-2'} : {Accept:'application/json'});
  }
});
