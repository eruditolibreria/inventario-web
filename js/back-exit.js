// Comportamiento compartido por el sistema administrativo y el portal CLUB.
export function setupDoubleBack({closeOverlay,showNotice,hideNotice,onExit,nativeSecondBack=false}) {
  let timer=null,notice=null;
  const push=()=>history.pushState(nativeSecondBack?{clubBackGuard:true}:null,null,location.href);
  const reset=()=>{clearTimeout(timer);timer=null;if(notice)hideNotice(notice);notice=null;};
  window.addEventListener('popstate',event=>{
    if(nativeSecondBack&&!event.state?.clubBackRoot)return;
    event.preventDefault();
    if(closeOverlay()){reset();push();return;}
    if(timer){reset();onExit?.();return;}
    timer=setTimeout(()=>{reset();if(nativeSecondBack&&history.state?.clubBackRoot)push();},1800);
    if(!nativeSecondBack)push();
    notice=showNotice('Presiona atrás nuevamente para salir',1800);
  });
  if(nativeSecondBack){
    const prepare=()=>{reset();if(history.state?.clubBackGuard)return;history.replaceState({clubBackRoot:true},'');push();};
    window.addEventListener('pagehide',reset);
    window.addEventListener('pageshow',prepare);
    prepare();
  }else push();
}
