export function sessionId(token) {
  try {
    const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.session_id||'')?payload.session_id:null;
  } catch (_) { return null; }
}

export function createClubSessionWatcher({createClient,getSession,verify,onTransferred,onClient=()=>{},onStop=()=>{},isUpdatesConnected=()=>true}) {
  let client=null,channel=null,id=null,timer=null,connected=false,checking=null,lastVerified=-Infinity;
  const current=expected=>id===expected&&sessionId(getSession()?.token||'')===expected;
  function markVerified(token) {
    const expected=sessionId(token||'');
    if(expected&&current(expected))lastVerified=performance.now();
  }
  async function check() {
    const expected=id;
    if(!expected||checking===expected||document.hidden||!current(expected))return;
    checking=expected;
    try {
      const data=await verify();
      if(data?.ok&&current(expected))markVerified(getSession()?.token);
      if(current(expected)&&['SESION_TRASLADADA','NO_AUTORIZADO','SESION_INACTIVA'].includes(data?.error))onTransferred(data.error);
    } catch (_) { /* Un corte de conexión conserva la sesión hasta verificarla. */ }
    finally { if(checking===expected)checking=null; }
  }
  function stop() {
    onStop();
    id=null;connected=false;lastVerified=-Infinity;
    clearInterval(timer);timer=null;
    const previous=client,previousChannel=channel;
    client=null;channel=null;
    if(previous)void Promise.resolve(previous.removeChannel(previousChannel)).then(()=>previous.realtime.disconnect()).catch(()=>{});
  }
  async function start() {
    stop();
    id=sessionId(getSession()?.token||'');
    if(!id)return;
    const expected=id;
    timer=setInterval(()=>{if((!connected||!isUpdatesConnected())&&performance.now()-lastVerified>=60000)void check();},60000);
    try {
      const nextClient=createClient();
      client=nextClient;
      await nextClient.realtime.setAuth();
      if(!current(expected)||client!==nextClient)return;
      void Promise.resolve(onClient(nextClient)).catch(()=>{});
      channel=nextClient.channel(`club-sesion:${id}`,{config:{private:true}})
        .on('broadcast',{event:'sesion_trasladada'},message=>{if(current(expected))onTransferred(message?.payload?.error||'SESION_TRASLADADA');})
        .subscribe(status=>{
          if(!current(expected))return;
          connected=status==='SUBSCRIBED';
          if(connected)void check();
        });
    } catch (_) { void check(); }
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
  window.addEventListener('online',()=>{void check();});
  return {start,stop,check,markVerified};
}
