const RESOURCES = new Set(['reglas','noticias','catalogo']);
export function createClubContentClient({baseUrl,fallbackUrl,fetcher=globalThis.fetch,now=Date.now,ttl=30000}) {
  const cache=new Map(),pending=new Map();
  async function get(base,resource) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    try {
      const response=await fetcher(`${base}/${resource}`,{credentials:'omit',signal:controller.signal});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||!data.datos) {
        const error=new Error(data?.error||'CONTENIDO_NO_DISPONIBLE');
        error.fallback=response.status===404||(!data&&response.ok);
        throw error;
      }
      return data;
    } finally {clearTimeout(timeout);}
  }
  function remember(resource,data) {cache.set(resource,{data,at:now()});return data;}
  function read(resource,{force=false}={}) {
    if(!RESOURCES.has(resource))return Promise.reject(new Error('RECURSO_INVALIDO'));
    const saved=cache.get(resource);
    if(!force&&saved&&now()-saved.at<ttl)return Promise.resolve(saved.data);
    if(pending.has(resource))return pending.get(resource);
    const request=get(baseUrl,resource).catch(error=>{
      if(error.fallback&&fallbackUrl&&fallbackUrl!==baseUrl)return get(fallbackUrl,resource);
      throw error;
    }).then(data=>remember(resource,data)).finally(()=>pending.delete(resource));
    pending.set(resource,request);return request;
  }
  return {read,remember};
}

export function mergeClubRewards(catalogue,availability,now=Date.now()) {
  const live=new Map((availability.datos||[]).map(item=>[Number(item.id),item]));
  return {ok:true,datos:(catalogue.datos||[]).filter(item=>
    live.has(Number(item.id))&&(!item.disponible_desde||Date.parse(item.disponible_desde)<=now)&&
    (!item.disponible_hasta||Date.parse(item.disponible_hasta)>now)
  ).map(item=>({...item,...live.get(Number(item.id)),stock_disponible:Number(live.get(Number(item.id)).stock_disponible||0)}))};
}
