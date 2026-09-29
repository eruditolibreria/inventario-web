import { HOST, SUPABASE_URL, SUPABASE_ANON_KEY, normalizarUrlPublica } from '../js/config.js';

const AUTH_URL = `${HOST}/club-auth`;
const PUBLIC_URL = `${HOST}/club-public`;
const SESSION_KEY = 'club_eruditos_session';
const CODES_KEY = 'club_eruditos_retiros';
const THEME_KEY = 'club_eruditos_theme';
let session = readJson(SESSION_KEY, null);
let premioSeleccionado = null;
let clubPendiente = false;
let usuarioTimer;
let usuarioRevision = 0;
let canjeParaCancelar = null;
let clubNivel = 1;
let clubGasto365 = 0;
let enlaceReferido = '';
let referidoCopiadoTimer;
let caminoObservador;
const NIVELES = ['Mini erudito','Aprendiz de Erudito','Erudito Iniciado','Erudito Académico','Gran Erudito','Erudito Maestro','Erudito Superior','Archierudito','Erudito ancestral','Erudito Supremo'];
const FILAS_CAMINO = [[0,377],[377,716],[716,1119],[1119,1500],[1500,1921]];
const splashInicio = performance.now();
let splashOculto = false;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[c]);
const fecha = value => value ? new Intl.DateTimeFormat('es-BO', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)) : '—';
const idempotencia = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } }
function saveSession(value) {
  session = value ? { token:value.token, refreshToken:value.refreshToken, expiresAt:value.expiresAt, cliente:value.cliente || null } : null;
  session ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY);
}
function setStatus(id, message, error=false) { const el=$(id); el.textContent=message || ''; el.classList.toggle('error', error); }
function ocultarSplash() {
  if (splashOculto) return;
  splashOculto=true;
  setTimeout(()=>{
    $('clubSplash').classList.add('is-hidden');
    $('clubSplash').setAttribute('aria-hidden','true');
  },Math.max(0,400-(performance.now()-splashInicio)));
}
function aplicarTema(tema, guardar=false) {
  document.documentElement.dataset.theme=tema;
  document.querySelector('meta[name="theme-color"]').content=tema==='dark'?'#171126':'#25164a';
  document.querySelectorAll('.theme-toggle').forEach(b=>{
    b.setAttribute('aria-label',tema==='dark'?'Activar modo claro':'Activar modo oscuro');
    b.title=tema==='dark'?'Activar modo claro':'Activar modo oscuro';
    b.setAttribute('aria-pressed',String(tema==='dark'));
  });
  if (guardar) localStorage.setItem(THEME_KEY,tema);
  document.documentElement.classList.add('theme-ready');
}
document.querySelectorAll('.theme-toggle').forEach(b=>b.addEventListener('click',()=>{
  const tema=document.documentElement.dataset.theme==='dark'?'light':'dark';
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(()=>aplicarTema(tema,true));
  else aplicarTema(tema,true);
}));
aplicarTema(document.documentElement.dataset.theme||'light');
const modoInstalado=matchMedia('(display-mode: standalone)');
const esIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
let solicitudInstalacion=null;
let instalacionConfirmada=false;
let instalacionIntentada=false;
function actualizarBotonesInstalacion() {
  const instalado=instalacionConfirmada||modoInstalado.matches||navigator.standalone===true;
  document.querySelectorAll('.install-button').forEach(boton=>boton.hidden=instalado||(!solicitudInstalacion&&!esIOS&&!instalacionIntentada));
}
window.addEventListener('beforeinstallprompt',evento=>{
  evento.preventDefault();
  solicitudInstalacion=evento;
  actualizarBotonesInstalacion();
});
window.addEventListener('appinstalled',()=>{
  instalacionConfirmada=true;
  solicitudInstalacion=null;
  actualizarBotonesInstalacion();
});
modoInstalado.addEventListener?.('change',actualizarBotonesInstalacion);
document.querySelectorAll('.install-button').forEach(boton=>boton.addEventListener('click',async()=>{
  if(modoInstalado.matches||navigator.standalone===true)return;
  if(solicitudInstalacion){
    const solicitud=solicitudInstalacion;
    solicitudInstalacion=null;
    instalacionIntentada=true;
    actualizarBotonesInstalacion();
    try{await solicitud.prompt();}catch(_){}
  }else{
    $('installInstructions').textContent=esIOS
      ?'En tu iPhone o iPad, abre el menú Compartir del navegador y elige «Añadir a pantalla de inicio». Después toca «Añadir».'
      :'Abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio».';
    $('installDialog').showModal();
  }
}));
$('cerrarInstalacion').addEventListener('click',()=>$('installDialog').close());
actualizarBotonesInstalacion();
function mensajeError(code) {
  return ({ CREDENCIALES_INVALIDAS:'Usuario o contraseña incorrectos.', CODIGO_VINCULACION_INVALIDO:'El código no es válido o ya venció.', CODIGO_ACTIVACION_INVALIDO:'El código de activación no es válido o ya venció.', CODIGO_REFERIDO_INVALIDO:'El código de referido no existe o no está activo.', REFERIDO_SOLO_CLIENTE_NUEVO:'Los referidos son solo para clientes nuevos.', NIVEL_INSUFICIENTE:'Este premio requiere un nivel más alto.', PASSWORD_MINIMO_8_CHARS:'La contraseña debe tener al menos 8 caracteres.', USUARIO_FORMATO:'El usuario debe tener de 6 a 12 letras o números.', USUARIO_OCUPADO:'Ese nombre de usuario ya está en uso.', REGISTRO_DUPLICADO:'Ya existe un registro con esos datos.', CLIENTE_EXISTENTE_REQUIERE_CODIGO:'Tu C.I. ya está registrado. Ingresa el código de un comprobante o solicítalo al personal.', INTENTOS_AGOTADOS:'Demasiados intentos. Espera 15 minutos.', DATOS_REGISTRO_INVALIDOS:'Revisa tus datos personales y el número de celular.', CUENTA_YA_VINCULADA:'Este cliente ya tiene una cuenta de Club.', COMPRA_MINIMA_REQUERIDA:'Primero realiza una compra de Bs 5,00 o más.', CUENTA_PENDIENTE_ACTIVACION:'Activa tu Club con el código de una compra de Bs 5,00 o más.', RECUPERACION_INVALIDA:'El código de recuperación no es válido o ya fue usado.', NO_AUTORIZADO:'Tu sesión terminó. Ingresa nuevamente.', CANJE_NO_CANCELABLE:'Este canje ya está en preparación o fue cerrado; no puede cancelarse desde el portal.', SALDO_INSUFICIENTE:'No tienes puntos suficientes.', PUNTOS_INSUFICIENTES:'No tienes puntos suficientes.', STOCK_INSUFICIENTE:'El premio ya no tiene stock disponible.', STOCK_PREMIO_INSUFICIENTE:'El premio ya no tiene stock disponible.', PRODUCTO_PREMIO_NO_CONFIGURADO:'Este premio necesita ser configurado nuevamente por la librería.', PRODUCTO_PREMIO_NO_ENCONTRADO:'No se encontró el producto del premio en la sucursal elegida.' })[code] || code || 'No se pudo completar la solicitud.';
}

async function post(url, body, token) {
  const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token || SUPABASE_ANON_KEY}` }, body:JSON.stringify(body) });
  const data = await res.json().catch(() => ({ ok:false, error:'RESPUESTA_INVALIDA' }));
  if (data.error === 'NO_AUTORIZADO' && token) { saveSession(null); showAuth(); }
  return data;
}

async function refreshIfNeeded() {
  if (!session?.refreshToken || !session.expiresAt || session.expiresAt - Date.now()/1000 > 120) return;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method:'POST', headers:{ apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json' }, body:JSON.stringify({ refresh_token:session.refreshToken }) });
  if (!res.ok) { saveSession(null); return; }
  const data = await res.json();
  saveSession({ ...session, token:data.access_token, refreshToken:data.refresh_token, expiresAt:data.expires_at || Math.floor(Date.now()/1000)+Number(data.expires_in || 3600) });
}

async function clubApi(accion, body={}) { await refreshIfNeeded(); if (!session?.token) return {ok:false,error:'NO_AUTORIZADO'}; return post(PUBLIC_URL, { ACCION:accion, ...body }, session.token); }

function showAuth() {
  cerrarImagen();
  cerrarCamino();
  document.querySelectorAll('form').forEach(form => form.reset());
  document.querySelectorAll('form input').forEach(input => { input.value=''; });
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  clubPendiente=false;
  clubNivel=1;
  clubGasto365=0;
  enlaceReferido='';
  premioSeleccionado=null;
  canjeParaCancelar=null;
  clearTimeout(usuarioTimer);
  usuarioRevision++;
  $('recoveryCodes').textContent='';
  setStatus('usuarioDisponibilidad','');
  $('usuarioDisponibilidad').classList.remove('available');
  setStatus('usernameStatus','');
  setStatus('appStatus','');
  setStatus('canjesStatus','');
  seleccionarPanel('login');
  $('authView').hidden=false; $('appView').hidden=true;
}
function showApp() { $('authView').hidden=true; $('appView').hidden=false; document.querySelector('nav').hidden=true; $('saludo').textContent=`Hola, ${session?.cliente?.nombre || 'Erudito'}`; void cargarInicio().catch(()=>setStatus('appStatus','No se pudo actualizar Club. Intenta recargar la página.',true)).finally(ocultarSplash); if (session?.cliente?.usuario === null) $('usernameDialog').showModal(); }

function seleccionarPanel(nombre) {
  document.querySelectorAll('[data-auth]').forEach(b => b.classList.toggle('active', b.dataset.auth===nombre || nombre==='credenciales' && b.dataset.auth==='registro'));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden=p.dataset.panel!==nombre; });
  setStatus('authStatus','');
}

document.querySelectorAll('[data-auth]').forEach(btn => btn.addEventListener('click', () => {
  seleccionarPanel(btn.dataset.auth);
}));

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); setStatus('authStatus','Ingresando…');
  const data=await post(AUTH_URL,{ACCION:'LOGIN',USUARIO:$('loginUsuario').value,PASSWORD:$('loginPassword').value});
  if(!data.ok){setStatus('authStatus',mensajeError(data.error),true);return;} saveSession(data); showApp();
});

$('registroForm').addEventListener('submit', async e => {
  e.preventDefault(); seleccionarPanel('credenciales'); $('registroUsuario').focus();
});
$('volverDatos').addEventListener('click', () => seleccionarPanel('registro'));

$('registroUsuario').addEventListener('input', () => {
  const input=$('registroUsuario');
  const revision=++usuarioRevision;
  clearTimeout(usuarioTimer);
  $('usuarioDisponibilidad').classList.remove('available');
  if (!input.validity.valid) { setStatus('usuarioDisponibilidad',''); return; }
  const usuario=input.value.trim();
  setStatus('usuarioDisponibilidad','Comprobando…');
  usuarioTimer=setTimeout(async () => {
    try {
      const data=await post(AUTH_URL,{ACCION:'VERIFICAR_USUARIO',USUARIO:usuario});
      if (revision!==usuarioRevision) return;
      setStatus('usuarioDisponibilidad',data.ok ? data.disponible?'Disponible':'No disponible' : 'No se pudo comprobar',!data.ok||!data.disponible);
      $('usuarioDisponibilidad').classList.toggle('available',data.ok&&data.disponible);
    } catch (_) {
      if (revision===usuarioRevision) setStatus('usuarioDisponibilidad','Sin conexión',true);
    }
  }, 350);
});

$('credencialesForm').addEventListener('submit', async e => {
  e.preventDefault(); setStatus('authStatus','Creando tu cuenta…');
  const data=await post(AUTH_URL,{ACCION:'REGISTRAR',NOMBRE:$('registroNombre').value,DOCUMENTO:$('registroDocumento').value,TELEFONO:$('registroTelefono').value,DIRECCION:$('registroDireccion').value,EMAIL:$('registroEmail').value,USUARIO:$('registroUsuario').value,PASSWORD:$('registroPassword').value,TOKEN_VINCULACION:$('registroToken').value,CODIGO_REFERIDO:$('registroReferido').value});
  if(!data.ok){setStatus('authStatus',mensajeError(data.error),true);return;}
  $('recoveryCodes').textContent=(data.codigosRecuperacion||[]).join('\n');
  $('recoveryDialog').showModal();
  if(data.token){saveSession(data);showApp();}
  else {seleccionarPanel('login');setStatus('authStatus','Cuenta creada. Ingresa con tu usuario y contraseña.');}
});

$('recuperarForm').addEventListener('submit', async e => {
  e.preventDefault(); setStatus('authStatus','Actualizando contraseña…');
  const data=await post(AUTH_URL,{ACCION:'RECUPERAR',USUARIO:$('recuperarUsuario').value,CODIGO_RECUPERACION:$('recuperarToken').value,PASSWORD:$('recuperarPassword').value});
  if(!data.ok){setStatus('authStatus',mensajeError(data.error),true);return;} saveSession(data); showApp();
});

$('copyRecovery').addEventListener('click',()=>navigator.clipboard?.writeText($('recoveryCodes').textContent));
$('closeRecovery').addEventListener('click',()=>$('recoveryDialog').close());
$('logoutBtn').addEventListener('click',()=>{saveSession(null);showAuth();});
$('activarCuentaBtn').addEventListener('click', mostrarActivacion);
$('usernameDialog').addEventListener('cancel', e => e.preventDefault());
$('usernameForm').addEventListener('submit', async e => {
  e.preventDefault();
  await refreshIfNeeded();
  const data=await post(AUTH_URL,{ACCION:'ELEGIR_USUARIO',USUARIO:$('legacyUsuario').value},session?.token);
  if(!data.ok){setStatus('usernameStatus',mensajeError(data.error),true);return;}
  saveSession({...session,cliente:{...session.cliente,usuario:data.usuario}});
  $('usernameDialog').close();
});

$('activacionForm').addEventListener('submit', async e => {
  e.preventDefault();setStatus('appStatus','Activando tu Club…');
  await refreshIfNeeded();
  const data=await post(AUTH_URL,{ACCION:'ACTIVAR',TOKEN_VINCULACION:$('activacionToken').value},session?.token);
  if(!data.ok){setStatus('appStatus',mensajeError(data.error),true);return;}
  $('activacionToken').value='';await cargarInicio();setStatus('appStatus','Tu Club está activo. Ya puedes usar tus puntos.');
});

document.querySelectorAll('nav [data-view]').forEach(btn=>btn.addEventListener('click',async()=>{
  document.querySelectorAll('nav [data-view]').forEach(b=>b.classList.toggle('active',b===btn));
  document.querySelectorAll('[data-view-panel]').forEach(p=>{p.hidden=p.dataset.viewPanel!==btn.dataset.view;});
  if(btn.dataset.view==='inicio')await cargarInicio(); if(btn.dataset.view==='premios')await cargarPremios(); if(btn.dataset.view==='movimientos')await cargarMovimientos(); if(btn.dataset.view==='canjes')await cargarCanjes();
}));

function movementItem(m) {
  const delta=Number(m.puntos_disponibles_delta||0)+Number(m.puntos_pendientes_delta||0);
  return `<article class="list-item"><div><strong>${esc(m.descripcion||m.tipo)}</strong><p>${esc(m.tipo)} · ${fecha(m.creado_en)}</p></div><span class="points ${delta<0?'negative':''}">${delta>0?'+':''}${delta}</span></article>`;
}

function beneficioNivel(nivel) {
  return nivel===10?'1 punto extra por cada Bs 25 de futuras compras.':nivel>=7?'1 punto extra por cada Bs 50 de futuras compras.':nivel>=4?'1 punto extra por cada Bs 100 de futuras compras.':'Cada ascenso otorga 3 puntos; desde el nivel 4 también ganarás puntos extra en tus compras.';
}

function renderProgreso(progreso) {
  const nivel=Math.min(10,Math.max(1,Number(progreso?.nivel)||1));
  const gasto=Math.max(0,Number(progreso?.gasto365||0));
  const desde=(nivel-1)*200;
  const hasta=nivel*200;
  const tramo=nivel===10?200:Math.max(0,Math.min(200,gasto-desde));
  const porcentaje=Math.round(tramo/2);
  clubNivel=nivel;
  clubGasto365=gasto;
  $('clubProgreso').hidden=false;
  $('nivelNombre').textContent=`${nivel}. ${NIVELES[nivel-1]}`;
  $('nivelBeneficio').textContent=beneficioNivel(nivel);
  $('nivelTramo').textContent=nivel===10?'Camino completado':`Hacia ${NIVELES[nivel]}`;
  $('nivelPorcentaje').textContent=`${porcentaje}%`;
  $('nivelBarra').setAttribute('aria-valuenow',String(tramo));
  $('nivelBarra').setAttribute('aria-valuetext',nivel===10?'Nivel máximo alcanzado':`Bs ${tramo} de Bs 200 hacia ${NIVELES[nivel]}`);
  requestAnimationFrame(()=>{
    $('nivelBarraRelleno').style.width=`${porcentaje}%`;
    $('nivelBarraPunto').style.left=`${porcentaje}%`;
  });
  $('nivelDesde').textContent=`Bs ${desde.toLocaleString('es-BO')}`;
  $('nivelHasta').textContent=nivel===10?'Nivel máximo':`Bs ${hasta.toLocaleString('es-BO')}`;
  $('nivelAvance').textContent=nivel===10?`Nivel máximo alcanzado · Bs ${gasto.toLocaleString('es-BO')} en 365 días`:`Bs ${tramo.toLocaleString('es-BO')} de Bs 200 en este tramo · Bs ${gasto.toLocaleString('es-BO')} acumulados`;
  $('nivelFaltante').textContent=nivel===10?'Ya recorriste los 10 niveles.':`Faltan Bs ${Math.max(0,hasta-gasto).toLocaleString('es-BO')} para ${NIVELES[nivel]} · próximo ascenso: +3 puntos tras 7 días.`;
  $('nivelGracia').hidden=!progreso?.graciaHasta;
  if(progreso?.graciaHasta)$('nivelGracia').textContent=`Período de gracia hasta ${fecha(progreso.graciaHasta)}.`;
  const codigo=String(progreso?.codigoReferido||'');
  $('referidoCodigo').textContent=codigo||'Código no disponible';
  enlaceReferido=codigo?new URL(`/club/?ref=${encodeURIComponent(codigo)}`,location.origin).href:'';
  $('copiarReferido').disabled=!enlaceReferido;
  $('compartirReferido').disabled=!enlaceReferido;
  $('referidosResumen').textContent=`${Number(progreso?.referidos||0)} invitación(es) · ${Number(progreso?.referidosPremiados||0)} premiada(s)`;
  $('retoBarra').value=Math.min(2,Number(progreso?.retoMeses||0));
  $('retoAvance').textContent=Number(progreso?.retoPuntos||0)>0?'Reto completado: +3 puntos.':`${Number(progreso?.retoMeses||0)} de 2 meses con compra válida.`;
  $('insigniasClub').innerHTML=[progreso?.insigniaPrimerCanje?'<span>🏅 Primer canje</span>':'',progreso?.insigniaAmigoLector?'<span>📚 Amigo lector</span>':''].filter(Boolean).join('');
}

function mostrarNivelCamino(nivel) {
  $('caminoNiveles').querySelectorAll('.path-level').forEach(item=>{
    const seleccionado=Number(item.dataset.nivel)===nivel;
    item.classList.toggle('selected',seleccionado);
    item.querySelector('button').setAttribute('aria-expanded',String(seleccionado));
    item.querySelector('.path-detail').hidden=!seleccionado;
  });
  requestAnimationFrame(actualizarRielCamino);
}

function actualizarRielCamino() {
  if (!$('caminoDialog').open) return;
  const escenario=$('caminoEscenario');
  const origen=escenario.getBoundingClientRect().top;
  const posiciones=[...escenario.querySelectorAll('.path-art')].map(arte=>{
    const rect=arte.getBoundingClientRect();
    return rect.top-origen+rect.height/2;
  });
  if (posiciones.length!==NIVELES.length) return;
  const riel=$('caminoRiel');
  riel.style.top=`${posiciones[0]}px`;
  riel.style.height=`${posiciones.at(-1)-posiciones[0]}px`;
  $('caminoHitos').querySelectorAll('button').forEach((hito,i)=>hito.style.top=`${posiciones[i]}px`);
  const tramos=Math.min(9,Math.max(0,clubGasto365)/200);
  const tramo=Math.min(8,Math.floor(tramos));
  const destino=tramos===9?posiciones[9]:posiciones[tramo]+(posiciones[tramo+1]-posiciones[tramo])*(tramos-tramo);
  $('caminoBarraRelleno').style.height=`${Math.max(0,destino-posiciones[0])}px`;
}

function abrirCamino() {
  if ($('caminoDialog').open) return;
  const avance=Math.min(1800,clubGasto365);
  const porcentaje=Math.round(avance/18);
  $('caminoResumen').textContent=`Nivel ${clubNivel} de 10 · Bs ${clubGasto365.toLocaleString('es-BO')} en 365 días`;
  $('caminoPorcentaje').textContent=`${porcentaje}%`;
  $('caminoBarra').setAttribute('aria-valuenow',String(avance));
  $('caminoBarra').setAttribute('aria-valuetext',`Bs ${avance.toLocaleString('es-BO')} de Bs 1.800 de gasto neto`);
  $('caminoBarraRelleno').style.height='0px';
  $('caminoHitos').innerHTML=NIVELES.map((nombre,i)=>`<button type="button" class="path-milestone ${i+1===clubNivel?'current':i+1<clubNivel?'reached':''}" aria-label="Ver nivel ${i+1}: ${esc(nombre)}" aria-current="${i+1===clubNivel?'step':'false'}" data-nivel="${i+1}">${i+1}</button>`).join('');
  $('caminoSiguiente').textContent=clubNivel===10?'Llegaste a Erudito Supremo.':`Faltan Bs ${Math.max(0,clubNivel*200-clubGasto365).toLocaleString('es-BO')} para ${NIVELES[clubNivel]}. El ascenso otorga 3 puntos tras 7 días.`;
  $('caminoNiveles').innerHTML=NIVELES.map((nombre,i)=>{
    const nivel=i+1;
    const umbral=i*200;
    const estado=nivel===clubNivel?'Tu nivel actual':nivel<clubNivel?'Nivel alcanzado':'Por alcanzar';
    const falta=Math.max(0,umbral-clubGasto365);
    const avance=nivel>clubNivel?`Te faltan Bs ${falta.toLocaleString('es-BO')} de gasto neto para llegar a esta estancia.`:nivel===clubNivel?'Estás en esta estancia del camino.':'Ya pasaste por esta estancia.';
    const fila=Math.floor(i/2);
    const [inicio,fin]=FILAS_CAMINO[fila];
    const altura=fin-inicio;
    const posicionY=(inicio/(1983-altura)*100).toFixed(2);
    const proporcion=(793/2/altura).toFixed(3);
    const beneficio=nivel<=3?'Los puntos extra por compra comienzan en el nivel 4.':beneficioNivel(nivel);
    return `<li class="path-level ${nivel<clubNivel?'reached':nivel===clubNivel?'current':'future'}" data-nivel="${nivel}"><button type="button" aria-expanded="false" aria-controls="detalleNivel${nivel}" aria-label="Ver nivel ${nivel}: ${esc(nombre)}"><span class="path-art" style="--art-x:${i%2*100}%;--art-y:${posicionY}%;--art-ratio:${proporcion}" aria-hidden="true"></span><span class="path-card-copy"><span class="path-status">${estado}</span></span></button><div id="detalleNivel${nivel}" class="path-detail" hidden><p><strong>${nivel}. ${esc(nombre)}</strong> · desde Bs ${umbral.toLocaleString('es-BO')} de gasto neto pagado en 365 días.</p><p>${esc(beneficio)}</p><p>Cada nuevo ascenso da 3 puntos tras 7 días, una vez por nivel.</p><p>${avance}</p></div></li>`;
  }).join('');
  $('caminoNiveles').querySelectorAll('.path-level button').forEach(button=>button.addEventListener('click',()=>mostrarNivelCamino(Number(button.parentElement.dataset.nivel))));
  $('caminoHitos').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>mostrarNivelCamino(Number(button.dataset.nivel))));
  mostrarNivelCamino(clubNivel);
  $('caminoDialog').showModal();
  history.pushState({clubPath:true},'');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    actualizarRielCamino();
    caminoObservador?.disconnect();
    caminoObservador=new ResizeObserver(actualizarRielCamino);
    caminoObservador.observe($('caminoNiveles'));
  }));
  $('caminoNiveles').querySelector('.path-level.current').scrollIntoView({block:'center'});
}

function cerrarCamino() {
  if (!$('caminoDialog').open) return;
  caminoObservador?.disconnect();
  $('caminoDialog').close();
  if (history.state?.clubPath) history.back();
}

$('abrirCamino').addEventListener('click',abrirCamino);
$('cerrarCamino').addEventListener('click',cerrarCamino);
$('caminoDialog').addEventListener('cancel',e=>{e.preventDefault();cerrarCamino();});
window.addEventListener('popstate',()=>{if($('caminoDialog').open){caminoObservador?.disconnect();$('caminoDialog').close();}});
window.addEventListener('resize',actualizarRielCamino);

$('copiarReferido').addEventListener('click',async()=>{
  if(!enlaceReferido)return;
  const boton=$('copiarReferido');
  try{
    await navigator.clipboard.writeText(enlaceReferido);
    clearTimeout(referidoCopiadoTimer);
    boton.classList.remove('copied');
    void boton.offsetWidth;
    boton.classList.add('copied');
    boton.querySelector('.copy-label').textContent='¡Enlace copiado!';
    setStatus('referidoEstado','Enlace copiado.');
    referidoCopiadoTimer=setTimeout(()=>{
      boton.classList.remove('copied');
      boton.querySelector('.copy-label').textContent='Copiar enlace de invitación';
    },2200);
  }catch(_){setStatus('referidoEstado','No se pudo copiar. Comparte el código mostrado.',true);}
});

function mostrarMensajeParaCompartir(mensaje) {
  const campo=$('compartirTexto');
  campo.value=mensaje;
  setStatus('compartirEstado','');
  $('compartirDialog').showModal();
  campo.focus();
  campo.select();
}

$('compartirReferido').addEventListener('click',async()=>{
  if(!enlaceReferido)return;
  const boton=$('compartirReferido');
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    boton.classList.remove('sharing');
    void boton.offsetWidth;
    boton.classList.add('sharing');
  }
  setStatus('referidoEstado','');
  const mensaje=`¡Hola! Te invito a unirte al Club Eruditos 📚✏️. Regístrate con mi enlace y conoce los beneficios para tus compras de libros, material escolar y más: ${enlaceReferido}`;
  if(!navigator.share){mostrarMensajeParaCompartir(mensaje);return;}
  try{await navigator.share({text:mensaje});}
  catch(error){if(error?.name!=='AbortError')mostrarMensajeParaCompartir(mensaje);}
});
$('compartirReferido').addEventListener('animationend',()=>$('compartirReferido').classList.remove('sharing'));
$('cerrarCompartir').addEventListener('click',()=>$('compartirDialog').close());
$('copiarMensaje').addEventListener('click',async()=>{
  const campo=$('compartirTexto');
  try{await navigator.clipboard.writeText(campo.value);setStatus('compartirEstado','Mensaje copiado. Pégalo en la aplicación que prefieras.');}
  catch(_){campo.focus();campo.select();setStatus('compartirEstado','Selecciona y copia el mensaje para compartirlo.',true);}
});

async function cargarInicio(){
  setStatus('appStatus','Actualizando…'); const data=await clubApi('RESUMEN');
  if (!session) return;
  if(!data.ok){setStatus('appStatus',mensajeError(data.error),true);return;}
  session={...session,cliente:data.cliente}; saveSession(session); $('saludo').textContent=`Hola, ${data.cliente?.nombre||'Erudito'}`;
  if(data.cliente?.usuario === null && !$('usernameDialog').open) $('usernameDialog').showModal();
  const pendiente=data.cuenta?.estado==='PENDIENTE_ACTIVACION';
  clubPendiente=pendiente;
  $('puntosBienvenidaReferido').textContent=Number(data.puntosBienvenida||0).toLocaleString('es-BO');
  $('clubProgreso').hidden=pendiente||!data.progreso;
  if(!pendiente&&data.progreso)renderProgreso(data.progreso);
  $('activacionPanel').hidden=!pendiente;
  document.querySelector('nav').classList.toggle('catalog-only',pendiente);
  document.querySelectorAll('nav [data-view="movimientos"],nav [data-view="canjes"]').forEach(b=>{b.hidden=pendiente;});
  document.querySelector('nav').hidden=false;
  $('activarCuentaBtn').hidden=!pendiente;
  document.querySelector('.hero').hidden=pendiente;
  if(pendiente){document.querySelectorAll('nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='inicio'));document.querySelectorAll('[data-view-panel]').forEach(p=>{p.hidden=p.dataset.viewPanel!=='inicio';});}
  $('saldoDisponible').textContent=Number(data.cuenta?.saldo_disponible||0).toLocaleString('es-BO'); $('saldoPendiente').textContent=Number(data.cuenta?.saldo_pendiente||0).toLocaleString('es-BO');
  const vence=data.proximoVencimiento; $('vencimiento').hidden=!vence; if(vence)$('vencimiento').textContent=`${Number(vence.puntos_disponibles).toLocaleString('es-BO')} puntos vencen el ${fecha(vence.vence_en)}.`;
  $('terminosClub').hidden=!data.terminos; $('terminosClubTexto').textContent=data.terminos||'';
  $('notificaciones').innerHTML=(data.notificaciones||[]).map(n=>`<article class="list-item"><div><strong>${esc(n.titulo)}</strong><p>${esc(n.mensaje)}</p></div></article>`).join('')||'<div class="list-item">No hay novedades.</div>'; setStatus('appStatus','');
}

async function cargarPremios(){
  setStatus('appStatus','Cargando premios…'); const data=await clubApi('PREMIOS');
  if(!data.ok){setStatus('appStatus',mensajeError(data.error),true);return;}
  const saldo=Number($('saldoDisponible').textContent.replace(/\D/g,''))||0;
  $('premiosGrid').innerHTML=(data.datos||[]).map(p=>{const imagen=normalizarUrlPublica(p.imagen_url);const stock=Number(p.stock_disponible||0);const sinPuntos=!clubPendiente&&saldo<Number(p.costo_puntos);const nivelMinimo=Number(p.nivel_minimo||1);const sinNivel=!clubPendiente&&clubNivel<nivelMinimo;const foto=imagen?`<button type="button" class="reward-image" data-image="${esc(imagen)}" data-title="${esc(p.nombre)}" aria-label="Ampliar imagen de ${esc(p.nombre)}"><img src="${esc(imagen)}" alt="${esc(p.nombre)}" loading="lazy" onerror="this.parentElement.disabled=true;this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>E</span></button>`:'<div class="reward-image"><span>E</span></div>';return `<article class="reward">${foto}<span class="eyebrow">${esc(p.codigo)}</span><h3>${esc(p.nombre)}</h3><p>${esc(p.descripcion||'Un beneficio para miembros del Club.')}</p><p><strong>Stock disponible: ${stock}</strong></p>${nivelMinimo>1?`<small>Desde ${esc(NIVELES[nivelMinimo-1]||NIVELES[0])}</small>`:''}<div class="price">${Number(p.costo_puntos).toLocaleString('es-BO')} pts</div><button class="primary" data-redeem="${p.id}" ${sinPuntos||sinNivel||stock<=0?'disabled':''}>${stock<=0?'Agotado':sinNivel?'Nivel insuficiente':sinPuntos?'Te faltan puntos':'Canjear'}</button></article>`;}).join('')||'<div class="list-item">Próximamente habrá nuevos premios.</div>';
  $('premiosGrid').querySelectorAll('[data-image]').forEach(btn=>btn.addEventListener('click',()=>abrirImagen(btn.dataset.image,btn.dataset.title)));
  $('premiosGrid').querySelectorAll('[data-redeem]').forEach(btn=>btn.addEventListener('click',()=>clubPendiente?mostrarActivacion():abrirCanje((data.datos||[]).find(p=>p.id===Number(btn.dataset.redeem))))); setStatus('appStatus','');
}

function abrirImagen(src, titulo) {
  $('imageFull').src=src;
  $('imageFull').alt=titulo;
  $('imageDialog').showModal();
  history.pushState({clubImageViewer:true},'');
}
function cerrarImagen() {
  if (!$('imageDialog').open) return;
  $('imageDialog').close();
  if (history.state?.clubImageViewer) history.back();
}
$('imageClose').addEventListener('click',cerrarImagen);
$('imageDialog').addEventListener('click',e=>{if(e.target===$('imageDialog')||e.target===$('imageFull')) cerrarImagen();});
$('imageDialog').addEventListener('cancel',e=>{e.preventDefault();cerrarImagen();});
window.addEventListener('popstate',()=>{if($('imageDialog').open)$('imageDialog').close();});

function mostrarActivacion(){
  document.querySelectorAll('nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='inicio'));
  document.querySelectorAll('[data-view-panel]').forEach(p=>{p.hidden=p.dataset.viewPanel!=='inicio';});
  setStatus('appStatus','Activa tu cuenta con el código de una compra de Bs 5,00 o más para canjear.');
  $('activacionPanel').scrollIntoView({behavior:'smooth',block:'start'});
  $('activacionToken').focus({preventScroll:true});
}

function abrirCanje(premio){ premioSeleccionado=premio; $('redeemTitle').textContent=`Canjear ${premio.nombre}`; const sucursales=premio.club_premios_sucursales||[]; $('redeemBranch').innerHTML=sucursales.map(s=>`<option value="${esc(s.sucursal_id)}">${esc(s.sucursal_nombre||s.sucursal_id)}</option>`).join(''); $('redeemDialog').showModal(); }
$('cancelRedeem').addEventListener('click',()=>$('redeemDialog').close());
$('confirmRedeem').addEventListener('click',async()=>{ if(!premioSeleccionado)return; $('confirmRedeem').disabled=true; const data=await clubApi('CREAR_CANJE',{PREMIO_ID:premioSeleccionado.id,SUCURSAL_ID:$('redeemBranch').value,IDEMPOTENCY_KEY:idempotencia()}); $('confirmRedeem').disabled=false; if(!data.ok){setStatus('appStatus',mensajeError(data.error),true);return;} if(data.codigoRetiro){const codes=readJson(CODES_KEY,{});codes[data.canjeId||data.id]=data.codigoRetiro;localStorage.setItem(CODES_KEY,JSON.stringify(codes));} $('redeemDialog').close(); setStatus('appStatus','Canje solicitado. Guarda tu código de retiro.'); document.querySelector('nav [data-view="canjes"]').click(); });

async function cargarMovimientos(){ const data=await clubApi('MOVIMIENTOS',{PAGINA:1,LIMITE:50}); $('movimientosLista').innerHTML=data.ok?(data.datos||[]).map(movementItem).join('')||'<div class="list-item">Sin movimientos.</div>':`<div class="list-item">${esc(mensajeError(data.error))}</div>`; }

async function cargarCanjes(){
  const data=await clubApi('CANJES'); const codes=readJson(CODES_KEY,{});
  $('canjesLista').innerHTML=data.ok?(data.datos||[]).map(c=>{const p=Array.isArray(c.club_premios)?c.club_premios[0]:c.club_premios||{};const imagen=normalizarUrlPublica(p.imagen_url);const code=codes[c.id];const cancelable=c.estado==='SOLICITADO';return `<article class="list-item"><div class="list-product">${imagen?`<img class="list-thumb" src="${esc(imagen)}" alt="${esc(p.nombre||'Premio')}" loading="lazy">`:''}<div><strong>${esc(p.nombre||'Premio')}</strong><p>${esc(c.estado)} · ${esc(c.sucursal_nombre||c.sucursal_id)} · ${fecha(c.solicitado_en)}</p>${code?`<div class="code">${esc(code)}</div><small>Código de retiro</small>`:''}</div></div><div><span class="points negative">-${Number(c.puntos_total)} pts</span>${cancelable?`<button data-cancel="${c.id}">Cancelar</button>`:''}</div></article>`;}).join('')||'<div class="list-item">Aún no realizaste canjes.</div>':`<div class="list-item">${esc(mensajeError(data.error))}</div>`;
  $('canjesLista').querySelectorAll('[data-cancel]').forEach(btn=>btn.addEventListener('click',()=>{
    canjeParaCancelar=Number(btn.dataset.cancel);
    setStatus('cancelStatus','');
    $('cancelDialog').showModal();
  }));
}

$('cancelDismiss').addEventListener('click',()=>$('cancelDialog').close());
$('cancelDialog').addEventListener('close',()=>{canjeParaCancelar=null;});
$('cancelConfirm').addEventListener('click',async()=>{
  if (!canjeParaCancelar) return;
  const canjeId=canjeParaCancelar;
  $('cancelConfirm').disabled=true;
  setStatus('cancelStatus','Cancelando y devolviendo puntos…');
  try {
    const res=await clubApi('CANCELAR_CANJE',{CANJE_ID:canjeId,MOTIVO:'Cancelado por el cliente'});
    if (!res.ok) { setStatus('cancelStatus',mensajeError(res.error),true); return; }
    const codes=readJson(CODES_KEY,{});
    delete codes[canjeId];
    localStorage.setItem(CODES_KEY,JSON.stringify(codes));
    $('cancelDialog').close();
    await Promise.all([cargarCanjes(),cargarInicio()]);
    setStatus('canjesStatus','Canje cancelado. Tus puntos fueron devueltos.');
    setStatus('appStatus','Canje cancelado. Tus puntos fueron devueltos.');
  } catch (_) {
    setStatus('cancelStatus','No se pudo cancelar el canje. Intenta nuevamente.',true);
  } finally { $('cancelConfirm').disabled=false; }
});

if('serviceWorker'in navigator)navigator.serviceWorker.register('/club/sw.js').catch(()=>{});
if(session?.token)showApp();else {showAuth();ocultarSplash();}
setTimeout(ocultarSplash,7000);
const referidoUrl=new URL(location.href).searchParams.get('ref');
if(!session?.token&&referidoUrl)$('registroReferido').value=referidoUrl.slice(0,13).toUpperCase();
