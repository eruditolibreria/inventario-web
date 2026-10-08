// Reutiliza el cliente WebSocket de la sesión y sincroniza revisiones al reconectar.
export function createClubUpdates({getSessionId,readVersions,onVersions,onChange,onDeadline}) {
  let client=null,channels=[],id=null,epoch=0,checking=null,timer=null;const statuses=new Map();
  const current=(expected,ownEpoch)=>id===expected&&epoch===ownEpoch&&getSessionId()===expected;
  function receive(meta){onVersions(meta);schedule(meta);}
  function schedule(meta) {
    if(!meta?.revisarEn||!meta.fechaServidor)return;
    clearTimeout(timer);
    const remaining=Date.parse(meta.revisarEn)-Date.parse(meta.fechaServidor);
    if(Number.isFinite(remaining))timer=setTimeout(()=>{timer=null;if(id===getSessionId())onDeadline();},Math.min(2147483647,Math.max(1000,remaining)));
  }
  function sync() {
    if(checking)return checking;
    const expected=getSessionId(),ownEpoch=epoch;
    const job=Promise.resolve().then(readVersions).then(data=>{
      if(getSessionId()===expected&&ownEpoch===epoch&&data?.ok&&data.cache){receive(data.cache);if(client&&current(expected,ownEpoch)&&channels.length===0)attach(data.cache,client,expected,ownEpoch);}
      return data;
    }).finally(()=>{if(checking===job)checking=null;});checking=job;return job;
  }
  function stop(){epoch++;id=null;clearTimeout(timer);timer=null;checking=null;statuses.clear();
    const previous=client;const old=channels;client=null;channels=[];
    if(previous)for(const channel of old)void Promise.resolve(previous.removeChannel(channel)).catch(()=>{});
  }
  async function start(nextClient) {
    stop();client=nextClient;id=getSessionId();const expected=id,ownEpoch=epoch;if(!id)return;
    const data=await sync().catch(()=>null);if(!current(expected,ownEpoch)||!data?.cache?.cuentaId)return;
  }
  function attach(meta,nextClient,expected,ownEpoch) {
    if(!meta.cuentaId)return;
    for(const topic of ['club-cuenta:'+meta.cuentaId,'club-contenido']) {
      statuses.set(topic,false);
      const channel=nextClient.channel(topic,{config:{private:true}}).on('broadcast',{event:'cambio'},message=>{
        if(!current(expected,ownEpoch))return;
        receive(message.payload);onChange();
      });channels.push(channel);
      channel.subscribe(status=>{
        if(!current(expected,ownEpoch))return;
        statuses.set(topic,status==='SUBSCRIBED');
        if(status==='SUBSCRIBED'&&statuses.size===2&&[...statuses.values()].every(Boolean))void sync().then(()=>{if(current(expected,ownEpoch))onChange();}).catch(()=>{});
      });
    }
  }
  return {start,stop,sync,connected:()=>statuses.size===2&&[...statuses.values()].every(Boolean)};
}
