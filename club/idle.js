export const CLUB_IDLE_MS=10*60*1000;
const ACTIVITY_KEY='club_eruditos_actividad';
export function createClubIdle({getSessionId,onExpired,notifyActivity}) {
  let id=null,timer=null,sendTimer=null,lastSent=0,pending=false;
  const read=()=>{try{return JSON.parse(localStorage.getItem(ACTIVITY_KEY))||{};}catch(_){return {};}};
  function check() {
    if(!id||getSessionId()!==id)return false;
    const state=read();
    const last=state.id===id?Number(state.at):0;
    clearTimeout(timer);
    if(!Number.isFinite(last)||Date.now()-last>=CLUB_IDLE_MS){onExpired();return false;}
    timer=setTimeout(check,Math.max(1,last+CLUB_IDLE_MS-Date.now()));
    return true;
  }
  function activity(event) {
    if(!event.isTrusted||document.hidden||!check())return;
    const state=read();
    if(Date.now()-Number(state.at)<1000)return;
    localStorage.setItem(ACTIVITY_KEY,JSON.stringify({id,at:Date.now()}));
    check();
    if(pending)return;
    if(Date.now()-lastSent<60000){
      if(!sendTimer)sendTimer=setTimeout(()=>{sendTimer=null;send();},60000-(Date.now()-lastSent));
      return;
    }
    send();
  }
  function send() {
    if(pending||!check())return;
    const expected=id;
    lastSent=Date.now();pending=true;
    void Promise.resolve(notifyActivity()).catch(()=>{}).finally(()=>{if(id===expected)pending=false;});
  }
  function stop(){id=null;clearTimeout(timer);clearTimeout(sendTimer);timer=null;sendTimer=null;pending=false;}
  function start(){
    stop();id=getSessionId();if(!id)return;
    const state=read();
    if(state.id!==id)localStorage.setItem(ACTIVITY_KEY,JSON.stringify({id,at:Date.now()}));
    lastSent=0;
    check();
  }
  ['pointerdown','pointermove','keydown','wheel'].forEach(name=>document.addEventListener(name,activity,{capture:true,passive:true}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  window.addEventListener('pageshow',check);
  window.addEventListener('popstate',activity);
  window.addEventListener('storage',event=>{if(event.key===ACTIVITY_KEY)check();});
  return {start,stop,check,elapsed:()=>Math.max(0,Date.now()-Number(read().at||0))};
}
