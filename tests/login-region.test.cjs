const fs=require('fs');const vm=require('vm');const path=require('path');const test=require('node:test');const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
function staff(flag=true,endpoint='https://test.supabase.co/functions/v1/usuarios',expired=false){
 const requests=[];const store={sessionToken:'token',sessionRefreshToken:'refresh',sessionExpiresAt:expired?1:9999999999,sessionUser:'ANA'};
 const ctx=vm.createContext({loginConfig:{LOGIN_REGION_ENABLED:flag},SUPABASE_ANON_KEY:'anon',store,resolverBaseUrl:()=>endpoint,contextoCatalogos:()=>'',invalidarCatalogos(){},setSession(){},setTokens(){},fetch:async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return{ok:true,json:async()=>({ok:true})};}});
 const source=fs.readFileSync(path.join(root,'js/api.js'),'utf8');vm.runInContext(source.slice(source.indexOf('let _renovacion')).replaceAll('export ','').replace('{ api };',''),ctx);return{ctx,requests};
}
test('login y refresh del personal usan Oregon; escrituras conservan su ruta',async()=>{
 const h=staff();for(const action of ['LOGIN','REFRESH_TOKEN','VENTA_POS','LOGOUT'])await h.ctx.api({ACCION:action});
 assert.ok(h.requests.slice(0,2).every(r=>r.url.endsWith('?forceFunctionRegion=us-west-2')));assert.ok(h.requests.slice(2).every(r=>!r.url.includes('?')));assert.equal(h.requests.length,4);
});
test('la renovación silenciosa también usa Oregon sin repetir LOGIN',async()=>{const h=staff(true,undefined,true);await h.ctx.api({ACCION:'VENTA_POS'});assert.equal(h.requests.length,2);assert.equal(h.requests[0].body.ACCION,'REFRESH_TOKEN');assert.ok(h.requests[0].url.includes('forceFunctionRegion=us-west-2'));assert.ok(!h.requests[1].url.includes('?'));});
test('la bandera permite revertir y no altera desarrollo local',async()=>{for(const [flag,url] of [[false,'https://test.supabase.co/functions/v1/usuarios'],[true,'http://127.0.0.1:54321/functions/v1/usuarios']]){const h=staff(flag,url);await h.ctx.api({ACCION:'LOGIN'});assert.equal(h.requests[0].url,url);}});
function club(flag=true,url='https://test.supabase.co/functions/v1/club-auth'){
 const requests=[];const ctx=vm.createContext({loginConfig:{LOGIN_REGION_ENABLED:flag},AUTH_URL:url,PUBLIC_URL:url.replace('club-auth','club-public'),sessionWatcher:{markVerified(){}},SUPABASE_ANON_KEY:'anon',AbortController,setTimeout,clearTimeout,session:null,terminarSesion(){},fetch:async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return{status:200,ok:true,json:async()=>({ok:true})};}});const s=fs.readFileSync(path.join(root,'club/app.js'),'utf8');vm.runInContext(s.slice(s.indexOf('async function post('),s.indexOf('async function refreshIfNeeded(')),ctx);return{ctx,requests,url};
}
test('Club dirige ingreso y peticiones privadas a Oregon, con reversión y entorno local',async()=>{const h=club();await h.ctx.post(h.url,{ACCION:'LOGIN'});await h.ctx.post(h.url,{ACCION:'REGISTRAR'});await h.ctx.post('https://test.supabase.co/functions/v1/club-public',{ACCION:'LOGIN'});assert.ok(h.requests[0].url.includes('forceFunctionRegion=us-west-2'));assert.ok(h.requests.slice(1).every(r=>!r.url.includes('?')));for(const fixture of [club(false),club(true,'http://127.0.0.1:54321/functions/v1/club-auth')]){await fixture.ctx.post(fixture.url,{ACCION:'LOGIN'});assert.equal(fixture.requests[0].url,fixture.url);}});
test('una respuesta perdida de LOGIN no provoca reintento automático',async()=>{const h=club();let calls=0;h.ctx.fetch=async()=>{calls++;throw new Error('offline');};await assert.rejects(h.ctx.post(h.url,{ACCION:'LOGIN'}),/offline/);assert.equal(calls,1);});

test('Club dirige sesión y datos privados a la base y registra la autorización aun con región explícita',async()=>{
 const h=club();let checked=0;h.ctx.sessionWatcher.markVerified=()=>checked++;
 await h.ctx.post(h.url,{ACCION:'SESION'},'signed');
 await h.ctx.post(h.url,{ACCION:'ACTIVIDAD'},'signed');
 await h.ctx.post(h.ctx.PUBLIC_URL,{ACCION:'CANJES'},'signed');
 assert.ok(h.requests.every(r=>r.url.endsWith('?forceFunctionRegion=us-west-2')));assert.equal(checked,3);
 for(const f of [club(false),club(true,'http://127.0.0.1:54321/functions/v1/club-auth')]){
   await f.ctx.post(f.ctx.PUBLIC_URL,{ACCION:'CANJES'},'signed');assert.equal(f.requests[0].url,f.ctx.PUBLIC_URL);
 }
});