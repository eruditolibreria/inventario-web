const RESOURCES = new Set(['reglas','noticias','catalogo']);
export function createClubContentClient({baseUrl,fallbackUrl,fetcher=globalThis.fetch,now=Date.now,ttl=3600000}) {
  const cache=new Map(),pending=new Map(),revisions=new Map(),generations=new Map();
  async function get(base,resource) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    const started=now();
    try {
      const response=await fetcher(`${base}/${resource}${revisions.has(resource)?'?v='+revisions.get(resource):''}`,{credentials:'omit',signal:controller.signal});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||!data.datos) {
        const error=new Error(data?.error||'CONTENIDO_NO_DISPONIBLE');
        error.fallback=response.status===404||(!data&&response.ok);
        throw error;
      }
      data.cacheAgeMs=Math.max(0,Number(response.headers?.get?.("age")||0))*1000+Math.max(0,now()-started);
      return data;
    } finally {clearTimeout(timeout);}
  }
  function remember(resource,data) {
    const at=now();let expires=at+ttl;
    if(data.siguienteCambio&&data.fechaServidor){const remaining=Date.parse(data.siguienteCambio)-Date.parse(data.fechaServidor)-Number(data.cacheAgeMs||0);if(Number.isFinite(remaining))expires=Math.min(expires,at+Math.max(0,remaining));}
    cache.set(resource,{data,at,expires});if(Number.isFinite(Number(data.revision)))revisions.set(resource,Math.max(revisions.get(resource)||0,Number(data.revision)));return data;
  }
  function observe(incoming={}) {
    const changed=[];
    for(const resource of RESOURCES){const value=Number(incoming[resource]);if(!Number.isFinite(value)||value<(revisions.get(resource)||0))continue;
      const saved=cache.get(resource);
      if((saved&&Number(saved.data.revision||0)<value)||(revisions.has(resource)&&value>revisions.get(resource))){
        cache.delete(resource);pending.delete(resource);generations.set(resource,(generations.get(resource)||0)+1);changed.push(resource);
      }
      revisions.set(resource,value);
    }
    return changed;
  }
  function read(resource,{force=false,retried=false}={}) {
    if(!RESOURCES.has(resource))return Promise.reject(new Error('RECURSO_INVALIDO'));
    const saved=cache.get(resource);
    if(!force&&saved&&now()<saved.expires)return Promise.resolve(saved.data);
    if(pending.has(resource))return pending.get(resource);
    const generation=generations.get(resource)||0;
    const request=get(baseUrl,resource).catch(error=>{
      if(error.fallback&&fallbackUrl&&fallbackUrl!==baseUrl)return get(fallbackUrl,resource);
      throw error;
    }).then(async data=>{
      if((generations.get(resource)||0)!==generation)return read(resource);
      if(Number(data.revision||0)<(revisions.get(resource)||0)){if(!retried){if(pending.get(resource)===request)pending.delete(resource);return read(resource,{retried:true});}throw new Error('REVISION_NO_DISPONIBLE');}
      return remember(resource,data);
    }).finally(()=>{if(pending.get(resource)===request)pending.delete(resource);});
    pending.set(resource,request);return request;
  }
  return {read,remember,observe};
}

export function mergeClubRewards(catalogue,availability,now=Date.now()) {
  const live=new Map((availability.datos||[]).map(item=>[Number(item.id),item]));
  return {ok:true,cache:availability.cache,datos:(catalogue.datos||[]).filter(item=>
    live.has(Number(item.id))&&(!item.disponible_desde||Date.parse(item.disponible_desde)<=now)&&
    (!item.disponible_hasta||Date.parse(item.disponible_hasta)>now)
  ).map(item=>({...item,...live.get(Number(item.id)),stock_disponible:Number(live.get(Number(item.id)).stock_disponible||0)}))};
}
