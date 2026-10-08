// Solo memoria de la sesión; revisiones y fechas limitan la vigencia de cada lectura.
export function createClubReadCache({request,getIdentity,now=Date.now,maxAge=15*60*1000}) {
  const entries=new Map(),pending=new Map(),generations=new Map(),versions=new Map();let epoch=0;
  const key=(action,body)=>action+':'+JSON.stringify(body);
  const revision=(meta,action)=>Number(action==='PREMIOS'?meta?.disponibilidad:meta?.privadas?.[action]);
  function valid(action,body={}) {const entry=entries.get(key(action,body));return !!entry&&now()<entry.expires&&(!versions.has(action)||entry.revision>=versions.get(action));}
  function peek(action,body={}) {return entries.get(key(action,body));}
  function invalidate(actions) {
    for(const action of actions){generations.set(action,(generations.get(action)||0)+1);
      for(const name of entries.keys())if(name.startsWith(action+':'))entries.delete(name);
      for(const name of pending.keys())if(name.startsWith(action+':'))pending.delete(name);
    }
  }
  function observe(meta) {
    const changed=[];const incoming={...meta?.privadas,...(meta?.disponibilidad!=null?{PREMIOS:meta.disponibilidad}:{})};
    for(const [action,value] of Object.entries(incoming)) {
      const next=Number(value);if(!Number.isFinite(next)||next<(versions.get(action)||0))continue;
      const existing=[...entries.values()].some(entry=>entry.action===action&&entry.revision<next);
      if(existing||(versions.has(action)&&next>versions.get(action))){invalidate([action]);changed.push(action);}
      versions.set(action,next);
    }
    return changed;
  }
  function clear(){epoch++;entries.clear();pending.clear();generations.clear();versions.clear();}
  function read(action,body={},options={}) {
    const name=key(action,body);if(!options.force&&valid(action,body))return Promise.resolve(entries.get(name).data);
    if(!options.force&&pending.has(name))return pending.get(name);
    if(options.force)invalidate([action]);
    const identity=getIdentity(),started=now(),ownEpoch=epoch,generation=generations.get(action)||0;
    const job=Promise.resolve().then(()=>request(action,body)).then(async data=>{
      if(identity!==getIdentity()||ownEpoch!==epoch)return {ok:false,error:'SESION_CAMBIADA'};
      const ownRevision=revision(data.cache,action);
      const obsolete=(generations.get(action)||0)!==generation||(versions.has(action)&&Number.isFinite(ownRevision)&&ownRevision<versions.get(action));
      if(obsolete){if(pending.get(name)===job)pending.delete(name);if(!options.retried)return read(action,body,{retried:true});return {ok:false,error:'DATOS_CAMBIARON'};}
      if(data.ok){
        let expires=started+(data.cache?maxAge:(options.ttl??30000));
        if(data.cache?.revisarEn&&data.cache?.fechaServidor){const remaining=Date.parse(data.cache.revisarEn)-Date.parse(data.cache.fechaServidor);if(Number.isFinite(remaining))expires=Math.min(expires,started+Math.max(0,remaining));}
        entries.set(name,{action,data,at:started,expires,revision:Number.isFinite(ownRevision)?ownRevision:0});
        if(Number.isFinite(ownRevision))versions.set(action,Math.max(versions.get(action)||0,ownRevision));
      }
      return data;
    }).finally(()=>{if(pending.get(name)===job)pending.delete(name);});
    pending.set(name,job);return job;
  }
  return {read,peek,valid,observe,invalidate,clear};
}
