import * as loginConfig from '../js/config.js';
import { HOST, SUPABASE_URL, SUPABASE_ANON_KEY, CLUB_CONTENT_URL, normalizarUrlPublica } from '../js/config.js';
import { createClubNavigation } from './navigation.js';
import { createClubSessionWatcher, sessionId } from './session.js';
import { createClubIdle } from './idle.js';
import { setupDoubleBack } from '../js/back-exit.js';
import { createClubContentClient, mergeClubRewards } from './content.js';
import { createClubReadCache } from './cache.js';
import { createClubUpdates } from './changes.js';

const AUTH_URL = `${HOST}/club-auth`;
const PUBLIC_URL = `${HOST}/club-public`;
const contentClient = createClubContentClient({baseUrl:CLUB_CONTENT_URL,fallbackUrl:`${HOST}/club-content`});
let reglasPublicas=null,noticiasPublicas=[],inicioPrivado=null;
const SESSION_KEY = 'club_eruditos_session';
const DEVICE_KEY = 'club_eruditos_device_id';
const CODES_KEY = 'club_eruditos_retiros';
const THEME_KEY = 'club_eruditos_theme';
const END_REASON_KEY='club_eruditos_cierre';
let session = readJson(SESSION_KEY, null);
let refreshing = null;
const readClient=createClubReadCache({request:(action,body)=>clubApi(action,body),getIdentity:()=>sessionId(session?.token||'')});
const changedResources=new Set();
let changesTimer=null;
let viewEpoch = 0;
const deviceId = (() => {
  const saved = localStorage.getItem(DEVICE_KEY);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved || '')) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, id);
  return id;
})();
let premioSeleccionado = null;
let clubPendiente = false;
let usuarioTimer;
let usuarioRevision = 0;
let canjeParaCancelar = null;
let movimientosPagina = 1;
let canjesPagina = 1;
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
function resetReadCache() { readClient.clear(); changedResources.clear(); clearTimeout(changesTimer); changesTimer=null; viewEpoch++; }
function saveSession(value) {
  if (!value) resetReadCache();
  session = value ? { token:value.token, refreshToken:value.refreshToken, expiresAt:value.expiresAt, cliente:value.cliente || null } : null;
  if(session){
    const serialized=JSON.stringify(session);
    if(localStorage.getItem(SESSION_KEY)!==serialized)localStorage.setItem(SESSION_KEY,serialized);
  }else localStorage.removeItem(SESSION_KEY);
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
let instalacionEnCurso=false;
function actualizarBotonesInstalacion() {
  const instalado=instalacionConfirmada||modoInstalado.matches||navigator.standalone===true;
  document.querySelectorAll('.install-button').forEach(boton=>{
    boton.hidden=instalado||(!solicitudInstalacion&&!esIOS);
    boton.disabled=instalacionEnCurso;
  });
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
  if(instalacionConfirmada||instalacionEnCurso||modoInstalado.matches||navigator.standalone===true)return;
  if(solicitudInstalacion){
    const solicitud=solicitudInstalacion;
    solicitudInstalacion=null;
    instalacionEnCurso=true;
    actualizarBotonesInstalacion();
    try {
      // prompt() se llama dentro del toque, antes de esperar cualquier otra tarea.
      await solicitud.prompt();
      const eleccion=await solicitud.userChoice;
      if(eleccion.outcome==='accepted')instalacionConfirmada=true;
    } catch (_) {
      $('installInstructions').textContent='No se pudo abrir la instalación. En Chrome, abre el menú ⋮ y elige «Instalar aplicación».';
      $('installDialog').showModal();
    } finally {
      instalacionEnCurso=false;
      actualizarBotonesInstalacion();
    }
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
  if(code==='SESION_INACTIVA')return 'Tu sesión se cerró por inactividad, inicia sesión nuevamente';
  return ({ DATOS_CAMBIARON:'La información cambió. Vuelve a abrir esta sección.', CREDENCIALES_INVALIDAS:'Usuario o contraseña incorrectos.', LOGIN_TEMPORALMENTE_NO_DISPONIBLE:'El servicio de ingreso está ocupado. Intenta nuevamente en unos momentos.', INTENTOS_DEMASIADO_FRECUENTES:'Se realizaron demasiados intentos. Espera un momento antes de volver a ingresar.', SESION_TRASLADADA:'Tu sesión se trasladó a otro dispositivo. Ingresa nuevamente si quieres usarla aquí.', DISPOSITIVO_INVALIDO:'No se pudo identificar este dispositivo. Recarga la página.', CODIGO_VINCULACION_INVALIDO:'El código no es válido o ya venció.', CODIGO_ACTIVACION_INVALIDO:'El código de activación no es válido o ya venció.', CODIGO_REFERIDO_INVALIDO:'El código de referido no existe o no está activo.', REFERIDO_SOLO_CLIENTE_NUEVO:'Los referidos son solo para clientes nuevos.', NIVEL_INSUFICIENTE:'Este premio requiere un nivel más alto.', PASSWORD_MINIMO_8_CHARS:'La contraseña debe tener al menos 8 caracteres.', USUARIO_FORMATO:'El usuario debe tener de 6 a 12 letras o números.', USUARIO_OCUPADO:'Ese nombre de usuario ya está en uso.', REGISTRO_DUPLICADO:'Ya existe un registro con esos datos.', CLIENTE_EXISTENTE_REQUIERE_CODIGO:'Tu C.I. ya está registrado. Ingresa el código de un comprobante o solicítalo al personal.', INTENTOS_AGOTADOS:'Demasiados intentos. Espera 15 minutos.', DATOS_REGISTRO_INVALIDOS:'Revisa tus datos personales y el número de celular.', CUENTA_YA_VINCULADA:'Este cliente ya tiene una cuenta de Club.', COMPRA_MINIMA_REQUERIDA:'Primero realiza una compra de Bs 5,00 o más.', CUENTA_PENDIENTE_ACTIVACION:'Activa tu Club con el código de una compra de Bs 5,00 o más.', RECUPERACION_INVALIDA:'El código de recuperación no es válido o ya fue usado.', LOGIN_TEMPORALMENTE_NO_DISPONIBLE:'El acceso no está disponible por el momento. Intenta nuevamente.', NO_AUTORIZADO:'Tu sesión terminó. Ingresa nuevamente.', CANJE_NO_CANCELABLE:'Este canje ya está en preparación o fue cerrado; no puede cancelarse desde el portal.', SALDO_INSUFICIENTE:'No tienes puntos suficientes.', PUNTOS_INSUFICIENTES:'No tienes puntos suficientes.', STOCK_INSUFICIENTE:'El premio ya no tiene stock disponible.', STOCK_PREMIO_INSUFICIENTE:'El premio ya no tiene stock disponible.', PRODUCTO_PREMIO_NO_CONFIGURADO:'Este premio necesita ser configurado nuevamente por la librería.', PRODUCTO_PREMIO_NO_ENCONTRADO:'No se encontró el producto del premio en la sucursal elegida.' })[code] || code || 'No se pudo completar la solicitud.';
}

async function post(url, body, token) {
  const requestEndpoint=url;
  const privateRequest=Boolean(token&&(url===PUBLIC_URL||url===AUTH_URL));
  if (((body.ACCION==='LOGIN'&&url===AUTH_URL)||privateRequest) && typeof loginConfig !== 'undefined' && loginConfig.LOGIN_REGION_ENABLED !== false && /^https:\/\/[^/]+\.supabase\.co\/functions\/v1\//.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'forceFunctionRegion=us-west-2';
  }
  const activity=privateRequest&&requestEndpoint===PUBLIC_URL&&['VERSIONES','RESUMEN','MOVIMIENTOS','CANJES','DISPONIBILIDAD','CATALOGO_ACTUAL'].includes(body.ACCION)&&typeof idle!=='undefined'?idle.claimActivity():null;
  if(activity)body={...body,ACTIVIDAD:true,INACTIVIDAD_MS:activity.INACTIVIDAD_MS};
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  let res,data;
  try {
    res = await fetch(url, { method:'POST', signal:controller.signal, headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token || SUPABASE_ANON_KEY}` }, body:JSON.stringify(body) });
    data = await res.json().catch(() => ({ ok:false, error:'RESPUESTA_INVALIDA' }));
  } finally { clearTimeout(timeout);if(activity)idle.completeActivity(activity.id,Boolean(res?.ok&&data?.ok)); }
  data.httpStatus=res.status;
  if(res.ok&&data.ok&&privateRequest&&(requestEndpoint===PUBLIC_URL||['SESION','ACTIVIDAD'].includes(body.ACCION))) {
    sessionWatcher.markVerified(token);
  }
  if (['NO_AUTORIZADO','SESION_TRASLADADA','SESION_INACTIVA'].includes(data.error) && token && session?.token===token) {
    terminarSesion(data.error);
  }
  return data;
}

async function refreshIfNeeded() {
  if (refreshing) return refreshing;
  if (!session?.refreshToken || !session.expiresAt || session.expiresAt - Date.now()/1000 > 120) return;
  const oldToken=session.refreshToken;
  refreshing=(async()=>{
    const res=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method:'POST', headers:{ apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json' }, body:JSON.stringify({ refresh_token:oldToken }) });
    if(session?.refreshToken!==oldToken)return;
    if (!res.ok) { saveSession(null); showAuth(); setStatus('authStatus',mensajeError('NO_AUTORIZADO'),true); return; }
    const data=await res.json();
    if(session?.refreshToken===oldToken)saveSession({ ...session, token:data.access_token, refreshToken:data.refresh_token, expiresAt:data.expires_at || Math.floor(Date.now()/1000)+Number(data.expires_in || 3600) });
  })();
  try { await refreshing; } finally { refreshing=null; }
}

async function clubApi(accion, body={}) {
  await refreshIfNeeded();
  if (!session?.token) return {ok:false,error:'NO_AUTORIZADO'};
  if(accion==='PREMIOS')return cargarCatalogoDisponible();
  return post(PUBLIC_URL, { ACCION:accion, ...(accion==='RESUMEN'?{SEPARAR_CONTENIDO:true}:{}), ...body }, session.token);
}
async function cargarCatalogoDisponible() {
  try {
    const [publico,disponibilidad]=await Promise.all([contentClient.read('catalogo'),clubApi('DISPONIBILIDAD')]);
    if(!disponibilidad.ok) {
      if(['NO_AUTORIZADO','SESION_TRASLADADA','SESION_INACTIVA'].includes(disponibilidad.error))return disponibilidad;
      throw new Error('DISPONIBILIDAD_NO_DISPONIBLE');
    }
    let catalogo=publico;
    if(Number(publico.revision)!==Number(disponibilidad.revisionCatalogo)) {
      catalogo=await clubApi('CATALOGO_ACTUAL');
      if(!catalogo.ok)return catalogo;
      contentClient.remember('catalogo',catalogo);
    }
    return mergeClubRewards(catalogo,disponibilidad);
  } catch (_) {
    if(!session?.token)return {ok:false,error:'NO_AUTORIZADO'};
    // Compatibilidad durante el despliegue gradual de funciones y rutas.
    return post(PUBLIC_URL,{ACCION:'PREMIOS'},session.token);
  }
}


const readKey = (accion, body={}) => accion+':'+JSON.stringify(body);
function requestRead(accion,body={},ttl=30000){return readClient.read(accion,body,{ttl});}
async function loadRead(accion, body, ttl, render, status) {
  const cached=readClient.peek(accion,body);
  if(cached)render(cached.data);
  if(cached && readClient.valid(accion,body)){setStatus('appStatus','');return cached.data;}
  if(!cached)setStatus('appStatus',status);
  const epoch=viewEpoch;
  try {
    const data=await requestRead(accion,body,ttl);
    if(epoch!==viewEpoch)return data;
    if(data.ok){render(data);setStatus('appStatus','');}
    else if(!cached)setStatus('appStatus',mensajeError(data.error),true);
    return data;
  } catch (_) {
    if(epoch===viewEpoch)setStatus('appStatus',cached?'Sin conexión. Mostrando datos recientes.':'No se pudo cargar. Intenta nuevamente.',true);
    return cached?.data || {ok:false,error:'SIN_CONEXION'};
  }
}
function showAuth() {
  idle.stop();
  sessionWatcher.stop();
  clubUpdates.stop();
  document.body.classList.remove('club-active');
  navigation.reset();
  ['premiosGrid','movimientosLista','canjesLista'].forEach(id=>$(id).replaceChildren());
  document.querySelectorAll('[data-card-loading]').forEach(state=>{state.hidden=false;state.textContent='Cargando…';});
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
  inicioPrivado=null;
  $('notificaciones').replaceChildren();
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
  const reason=readJson(END_REASON_KEY,null);
  setStatus('authStatus',reason?mensajeError(reason):'',Boolean(reason));
}
function showApp() {
  localStorage.removeItem(END_REASON_KEY);
  idle.start();
  if(!session?.token){ocultarSplash();return;}
  sessionWatcher.start();
  document.body.classList.add('club-active');
  navigation.reset();
  $('authView').hidden=true; $('appView').hidden=false;
  document.querySelector('nav').hidden=false;
  $('appView').setAttribute('aria-busy','true');
  renderCabecera(session?.cliente);
  setStatus('appStatus','Cargando tu Club…');
  ocultarSplash();
  inicioPrivado=null;
  $('notificaciones').replaceChildren();
  void cargarPrimeraVista();
  if (session?.cliente?.usuario === null) $('usernameDialog').showModal();
}

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
  const button=e.submitter;
  if(button)button.disabled=true;
  const credentials={ACCION:'LOGIN',USUARIO:$('loginUsuario').value,PASSWORD:$('loginPassword').value,DISPOSITIVO_ID:deviceId};
  try {
    let data=await post(AUTH_URL,credentials);
    if(data.error==='SESION_EN_OTRO_DISPOSITIVO') {
      const confirmado=await new Promise(resolve=>{
        const dialog=$('sessionTransferDialog');
        dialog.addEventListener('close',()=>resolve(dialog.returnValue==='yes'),{once:true});
        dialog.showModal();
      });
      if(!confirmado){$('loginPassword').value='';setStatus('authStatus','Inicio de sesión cancelado.');return;}
      setStatus('authStatus','Trasladando sesión…');
      data=await post(AUTH_URL,{...credentials,FORZAR_SESION:true});
    }
    if(!data.ok){setStatus('authStatus',mensajeError(data.error),true);return;}
    $('loginPassword').value='';
    resetReadCache(); saveSession(data); showApp();
  } catch (_) { setStatus('authStatus','No se pudo iniciar sesión. Comprueba tu conexión.',true); }
  finally { if(button)button.disabled=false; }
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
  const data=await post(AUTH_URL,{ACCION:'REGISTRAR',DISPOSITIVO_ID:deviceId,NOMBRE:$('registroNombre').value,DOCUMENTO:$('registroDocumento').value,TELEFONO:$('registroTelefono').value,DIRECCION:$('registroDireccion').value,EMAIL:$('registroEmail').value,USUARIO:$('registroUsuario').value,PASSWORD:$('registroPassword').value,TOKEN_VINCULACION:$('registroToken').value,CODIGO_REFERIDO:$('registroReferido').value});
  if(!data.ok){setStatus('authStatus',mensajeError(data.error),true);return;}
  $('recoveryCodes').textContent=(data.codigosRecuperacion||[]).join('\n');
  $('recoveryDialog').showModal();
  if(data.token){resetReadCache();saveSession(data);showApp();}
  else {seleccionarPanel('login');setStatus('authStatus','Cuenta creada. Ingresa con tu usuario y contraseña.');}
});

$('recuperarForm').addEventListener('submit', async e => {
  e.preventDefault(); setStatus('authStatus','Actualizando contraseña…');
  const data=await post(AUTH_URL,{ACCION:'RECUPERAR',DISPOSITIVO_ID:deviceId,USUARIO:$('recuperarUsuario').value,CODIGO_RECUPERACION:$('recuperarToken').value,PASSWORD:$('recuperarPassword').value});
  if(!data.ok){setStatus('authStatus',mensajeError(data.error),true);return;} resetReadCache(); saveSession(data); showApp();
});

$('copyRecovery').addEventListener('click',()=>navigator.clipboard?.writeText($('recoveryCodes').textContent));
$('closeRecovery').addEventListener('click',()=>$('recoveryDialog').close());
function terminarSesion(reason=null,notify=false) {
  const token=session?.token;
  if(reason)localStorage.setItem(END_REASON_KEY,JSON.stringify(reason));else localStorage.removeItem(END_REASON_KEY);
  saveSession(null);showAuth();
  if(notify&&token)void fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({ACCION:'SALIR'})}).catch(()=>{});
}
$('logoutBtn').addEventListener('click',()=>{$('logoutDialog').showModal();});
$('logoutCancel').addEventListener('click',()=>{$('logoutDialog').close();});
$('logoutConfirm').addEventListener('click',()=>{
  terminarSesion(null,true);
});
$('activarCuentaBtn').addEventListener('click', mostrarActivacion);
$('usernameDialog').addEventListener('cancel', e => e.preventDefault());
$('usernameForm').addEventListener('submit', async e => {
  e.preventDefault();
  await refreshIfNeeded();
  const data=await post(AUTH_URL,{ACCION:'ELEGIR_USUARIO',USUARIO:$('legacyUsuario').value},session?.token);
  if(!data.ok){setStatus('usernameStatus',mensajeError(data.error),true);return;}
  resetReadCache();
  saveSession({...session,cliente:{...session.cliente,usuario:data.usuario}});
  renderCabecera(session.cliente,clubPendiente?null:clubNivel,clubPendiente);
  $('usernameDialog').close();
});

$('activacionForm').addEventListener('submit', async e => {
  e.preventDefault();setStatus('appStatus','Activando tu Club…');
  await refreshIfNeeded();
  const data=await post(AUTH_URL,{ACCION:'ACTIVAR',TOKEN_VINCULACION:$('activacionToken').value},session?.token);
  if(!data.ok){setStatus('appStatus',mensajeError(data.error),true);return;}
  $('activacionToken').value='';resetReadCache();await cargarInicio();setStatus('appStatus','Tu Club está activo. Ya puedes usar tus puntos.');
});

const navigation=createClubNavigation({
  viewport:$('clubPages'),
  gestureTarget:document,
  buttons:[...document.querySelectorAll('nav [data-view]')],
  panels:[...document.querySelectorAll('[data-view-panel]')],
  load:loadVista,
  canSwipe:()=>Boolean(session?.token&&!$('appView').hidden&&!document.querySelector('dialog[open]')),
});
async function loadVista(view) {
  const epoch=viewEpoch;
  const loaders={inicio:cargarInicio,premios:cargarPremios,movimientos:cargarMovimientos,canjes:cargarCanjes};
  const panel=document.querySelector(`[data-view-panel="${view}"]`);
  const state=panel.querySelector('[data-card-loading]');
  const data=await loaders[view]();
  if(epoch!==viewEpoch)return data;
  if(state){state.hidden=Boolean(data?.ok);if(!data?.ok)state.textContent='No se pudo cargar esta pantalla. Toca su pestaña para reintentar.';}
  return data;
}
function renderCabecera(cliente,nivel=null,pendiente=false) {
  $('saludo').textContent=`Hola, ${cliente?.nombre||'Erudito'}`;
  $('clienteUsuario').textContent=cliente?.usuario?`@${cliente.usuario}`:'';
  $('clienteUsuario').hidden=!cliente?.usuario;
  const label=$('clienteNivel');
  label.hidden=!pendiente&&!nivel;
  label.dataset.level=pendiente?'pending':String(nivel||1);
  label.textContent=pendiente?'Pendiente de activación':NIVELES[(nivel||1)-1];
}

function movementItem(m) {
  const delta=Number(m.puntos_disponibles_delta||0)+Number(m.puntos_pendientes_delta||0);
  return `<article class="list-item"><div><strong>${esc(m.descripcion||m.tipo)}</strong><p>${esc(m.tipo)} · ${fecha(m.creado_en)}</p></div><span class="points ${delta<0?'negative':''}">${delta>0?'+':''}${delta}</span></article>`;
}

function beneficioNivel(nivel) {
  return nivel>=3?`1 punto extra por cada Bs ${130-nivel*10} de futuras compras.`:'Los puntos extra por compra comienzan en el nivel 3.';
}

function retoCard(reto) {
  const avance=Math.max(0,Number(reto.avance)||0);
  const meta=Number(reto.meta);
  const premiado=Number(reto.puntosOtorgados)>0;
  const estado=premiado?'Premiado':reto.calificaEn?'Pendiente':'En progreso';
  const frecuencia=reto.periodicidad==='week'?'semanalmente':'mensualmente';
  const descripcion={
    SEMANAL:'Compra al menos Bs 50 en una semana y gana 1 punto tras 2 días.',
    MENSUAL:'Compra al menos Bs 250 en un mes y gana 5 puntos tras 7 días.',
    MAYORISTA:'Compra al menos 10 unidades de un mismo producto con precio neto por unidad mayor a Bs 5 en una sola compra y gana 5 puntos tras 7 días.',
    AMIGO_FIEL:'Consigue al menos 10 amigos nuevos referidos, activos y verificados en un mes y gana 10 puntos tras 7 días.',
  }[reto.codigo];
  const numero=value=>Number(value).toLocaleString('es-BO',{maximumFractionDigits:2});
  const dia=value=>new Intl.DateTimeFormat('es-BO',{dateStyle:'medium',timeZone:'America/La_Paz'}).format(new Date(`${value}T12:00:00Z`));
  const momento=value=>new Intl.DateTimeFormat('es-BO',{dateStyle:'medium',timeStyle:'short',hourCycle:'h23',timeZone:'America/La_Paz'}).format(new Date(value));
  const progreso=reto.unidad==='Bs'?`Bs ${numero(avance)} de Bs ${numero(meta)}`:`${numero(avance)} de ${numero(meta)} ${reto.unidad}`;
  const premio=premiado?`Ganaste ${reto.puntosOtorgados} punto${Number(reto.puntosOtorgados)===1?'':'s'}.`:reto.liberaEn?`Se libera el ${momento(reto.liberaEn)}.`:'';
  const anteriores=(reto.pendientes||[]).map(p=>`<small>Periodo anterior: +${esc(p.puntos)} punto${Number(p.puntos)===1?' pendiente':'s pendientes'} hasta ${esc(momento(p.liberaEn))}.</small>`).join('');
  return `<article class="club-progress-card challenge-card" data-reto="${esc(reto.codigo)}"><span class="eyebrow">${esc(reto.etiqueta)}</span><h2>${esc(reto.nombre)}</h2><p>${esc(descripcion)}</p><small>Reto disponible ${frecuencia} · una recompensa por periodo.</small>${reto.inicioPeriodo&&reto.finPeriodo?`<small>${dia(reto.inicioPeriodo)} – ${dia(reto.finPeriodo)}</small>`:''}<progress max="${meta}" value="${Math.min(meta,avance)}" aria-label="Avance de ${esc(reto.nombre)}"></progress><div class="challenge-status"><strong>${esc(progreso)}</strong><span data-estado="${estado}">${estado}</span></div>${premio?`<small>${esc(premio)}</small>`:''}${anteriores}</article>`;
}

function renderRetos(retos=[]) {
  const base=[
    {codigo:'SEMANAL',nombre:'Erudito constante',etiqueta:'RETO SEMANAL',meta:50,unidad:'Bs',periodicidad:'week'},
    {codigo:'MENSUAL',nombre:'Erudito diligente',etiqueta:'RETO MENSUAL',meta:250,unidad:'Bs',periodicidad:'month'},
    {codigo:'MAYORISTA',nombre:'Erudito Comedido',etiqueta:'RETO MAYORISTA',meta:10,unidad:'unidades',periodicidad:'week'},
    {codigo:'AMIGO_FIEL',nombre:'Erudito Amiguero',etiqueta:'RETO AMIGO FIEL',meta:10,unidad:'amigos',periodicidad:'month'},
  ];
  $('retosClub').innerHTML=base.map(reto=>retoCard({...reto,...retos.find(r=>r.codigo===reto.codigo),...reglasPublicas?.retos?.find(r=>r.codigo===reto.codigo)})).join('');
}

function renderProgreso(progreso) {
  const nivel=Math.min(10,Math.max(1,Number(progreso?.nivel)||1));
  const gasto=Math.max(0,Number(progreso?.gasto365||0));
  const desde=(nivel-1)*200;
  const hasta=nivel*200;
  const tramo=nivel===10?200:Math.max(0,Math.min(200,gasto-desde));
  const porcentaje=Math.round(tramo/2);
  clubNivel=nivel;
  renderCabecera(session?.cliente,nivel);
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
  $('nivelFaltante').textContent=nivel===10?'Ya recorriste los 10 niveles.':`Faltan Bs ${Math.max(0,hasta-gasto).toLocaleString('es-BO')} para ${NIVELES[nivel]} · próximo ascenso: +${nivel+1} puntos tras 7 días.`;
  $('nivelGracia').hidden=!progreso?.graciaHasta;
  if(progreso?.graciaHasta)$('nivelGracia').textContent=`Período de gracia hasta ${fecha(progreso.graciaHasta)}.`;
  const codigo=String(progreso?.codigoReferido||'');
  $('referidoCodigo').textContent=codigo||'Código no disponible';
  enlaceReferido=codigo?new URL(`/club/?ref=${encodeURIComponent(codigo)}`,location.origin).href:'';
  $('copiarReferido').disabled=!enlaceReferido;
  $('compartirReferido').disabled=!enlaceReferido;
  $('referidosResumen').textContent=`${Number(progreso?.referidos||0)} invitación(es) · ${Number(progreso?.referidosPremiados||0)} premiada(s)`;
  renderRetos(progreso?.retos);
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
  $('caminoSiguiente').textContent=clubNivel===10?'Llegaste a Erudito Supremo.':`Faltan Bs ${Math.max(0,clubNivel*200-clubGasto365).toLocaleString('es-BO')} para ${NIVELES[clubNivel]}. El ascenso otorga ${clubNivel+1} puntos tras 7 días.`;
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
    const beneficio=beneficioNivel(nivel);
    return `<li class="path-level ${nivel<clubNivel?'reached':nivel===clubNivel?'current':'future'}" data-nivel="${nivel}"><button type="button" aria-expanded="false" aria-controls="detalleNivel${nivel}" aria-label="Ver nivel ${nivel}: ${esc(nombre)}"><span class="path-art" style="--art-x:${i%2*100}%;--art-y:${posicionY}%;--art-ratio:${proporcion}" aria-hidden="true"></span><span class="path-card-copy"><span class="path-status">${estado}</span></span></button><div id="detalleNivel${nivel}" class="path-detail" hidden><p><strong>${nivel}. ${esc(nombre)}</strong> · desde Bs ${umbral.toLocaleString('es-BO')} de gasto neto pagado en 365 días.</p><p>${esc(beneficio)}</p><p>${nivel===1?'Comienza tu camino con los puntos de bienvenida.':`Este ascenso da ${nivel} puntos tras 7 días, una vez por nivel.`}</p><p>${avance}</p></div></li>`;
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

async function cargarContenidoInicio(epoch) {
  const results=await Promise.allSettled([contentClient.read('reglas'),contentClient.read('noticias')]);
  if(epoch!==viewEpoch||!session?.token)return;
  if(results[0].status==='fulfilled')reglasPublicas=results[0].value.datos;
  if(results[1].status==='fulfilled')noticiasPublicas=results[1].value.datos;
  renderContenidoInicio();
  if(inicioPrivado?.progreso)renderRetos(inicioPrivado.progreso.retos);
}
function renderContenidoInicio() {
  if(!session?.token)return;
  const terminos=reglasPublicas?.terminos??inicioPrivado?.terminos;
  $('terminosClub').hidden=!terminos; $('terminosClubTexto').textContent=terminos||'';
  $('puntosBienvenidaReferido').textContent=Number(reglasPublicas?.puntosBienvenida??inicioPrivado?.puntosBienvenida??0).toLocaleString('es-BO');
  const personales=inicioPrivado?.notificaciones||[];
  const noticias=noticiasPublicas.map(n=>({...n,tipo:'NOTICIA',creado_en:n.publicada_en||n.creado_en}));
  const novedades=[...noticias,...personales.filter(n=>!noticias.some(item=>n.tipo==='NOTICIA'&&item.id===n.id))]
    .sort((a,b)=>Date.parse(b.creado_en)-Date.parse(a.creado_en)).slice(0,10);
  $('notificaciones').innerHTML=novedades.map(n=>`<article class="list-item"><div><strong>${esc(n.titulo)}</strong><p>${esc(n.mensaje)}</p></div></article>`).join('')||'<div class="list-item">No hay novedades.</div>';
}
async function cargarInicio(){
  void cargarContenidoInicio(viewEpoch);
  return loadRead('RESUMEN',{},30000,renderInicio,'Cargando tu Club…');
}
async function cargarPrimeraVista() {
  const epoch=viewEpoch;
  $('appView').setAttribute('aria-busy','true');
  $('inicioCarga').hidden=false;
  $('inicioCargaTexto').textContent='Cargando tu Club…';
  $('reintentarInicio').hidden=true;
  document.querySelector('.hero').hidden=true;
  $('clubProgreso').hidden=true;
  let data=await cargarInicio();
  if(epoch!==viewEpoch||!session?.token)return;
  if(!data?.ok&&(data?.error==='SIN_CONEXION'||data?.error==='RESPUESTA_INVALIDA'||data?.httpStatus>=500)) {
    $('inicioCargaTexto').textContent='Reintentando la conexión…';
    setStatus('appStatus','');
    await new Promise(resolve=>setTimeout(resolve,600));
    if(epoch!==viewEpoch||!session?.token)return;
    data=await cargarInicio();
  }
  if(epoch!==viewEpoch||!session?.token)return;
  $('appView').setAttribute('aria-busy','false');
  $('inicioCarga').hidden=Boolean(data?.ok);
  $('reintentarInicio').hidden=Boolean(data?.ok);
  if(!data?.ok) $('inicioCargaTexto').textContent='No se pudo cargar tu Club. Toca Reintentar para volver a conectar.';
}
$('reintentarInicio').addEventListener('click',()=>{void cargarPrimeraVista();});
function renderInicio(data){
  if (!session) return;
  $('inicioCarga').hidden=true;
  $('reintentarInicio').hidden=true;
  session={...session,cliente:data.cliente}; saveSession(session);
  if(data.cliente?.usuario === null && !$('usernameDialog').open) $('usernameDialog').showModal();
  const pendiente=data.cuenta?.estado==='PENDIENTE_ACTIVACION';
  const cambioActivacion=clubPendiente!==pendiente;
  clubPendiente=pendiente;
  renderCabecera(data.cliente,pendiente?null:Number(data.progreso?.nivel||1),pendiente);
  inicioPrivado=data;
  $('clubProgreso').hidden=pendiente||!data.progreso;
  if(!pendiente&&data.progreso)renderProgreso(data.progreso);
  $('activacionPanel').hidden=!pendiente;
  document.querySelector('nav').classList.toggle('catalog-only',pendiente);
  document.querySelectorAll('nav [data-view="movimientos"],nav [data-view="canjes"]').forEach(b=>{b.hidden=pendiente;});
  document.querySelector('nav').hidden=false;
  $('activarCuentaBtn').hidden=!pendiente;
  document.querySelector('.hero').hidden=pendiente;
  if(cambioActivacion)navigation.refresh();
  $('saldoDisponible').textContent=Number(data.cuenta?.saldo_disponible||0).toLocaleString('es-BO'); $('saldoPendiente').textContent=Number(data.cuenta?.saldo_pendiente||0).toLocaleString('es-BO');
  const vence=data.proximoVencimiento; $('vencimiento').hidden=!vence; if(vence)$('vencimiento').textContent=`${Number(vence.puntos_disponibles).toLocaleString('es-BO')} puntos vencen el ${fecha(vence.vence_en)}.`;
  renderContenidoInicio();
}

async function cargarPremios(){
  return loadRead('PREMIOS',{},60000,renderPremios,'Cargando premios…');
}
function renderPremios(data){
  const saldo=Number($('saldoDisponible').textContent.replace(/\D/g,''))||0;
  $('premiosGrid').innerHTML=(data.datos||[]).map(p=>{const imagen=normalizarUrlPublica(p.imagen_url);const stock=Number(p.stock_disponible||0);const sinPuntos=!clubPendiente&&saldo<Number(p.costo_puntos);const sinSucursal=!p.club_premios_sucursales?.length;const nivelMinimo=Number(p.nivel_minimo||1);const sinNivel=!clubPendiente&&clubNivel<nivelMinimo;const foto=imagen?`<button type="button" class="reward-image" data-image="${esc(imagen)}" data-title="${esc(p.nombre)}" aria-label="Ampliar imagen de ${esc(p.nombre)}"><img src="${esc(imagen)}" alt="${esc(p.nombre)}" loading="lazy" decoding="async" onerror="this.parentElement.disabled=true;this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>E</span></button>`:'<div class="reward-image"><span>E</span></div>';return `<article class="reward">${foto}<span class="eyebrow">${esc(p.codigo)}</span><h3>${esc(p.nombre)}</h3><p>${esc(p.descripcion||'Un beneficio para miembros del Club.')}</p><p><strong>Stock disponible: ${stock}</strong></p>${nivelMinimo>1?`<small>Desde ${esc(NIVELES[nivelMinimo-1]||NIVELES[0])}</small>`:''}<div class="price">${Number(p.costo_puntos).toLocaleString('es-BO')} pts</div><button class="primary" data-redeem="${p.id}" ${sinPuntos||sinNivel||sinSucursal||stock<=0?'disabled':''}>${stock<=0?'Agotado':sinSucursal?'Sin disponibilidad':sinNivel?'Nivel insuficiente':sinPuntos?'Te faltan puntos':'Canjear'}</button></article>`;}).join('')||'<div class="list-item">Próximamente habrá nuevos premios.</div>';
  $('premiosGrid').querySelectorAll('[data-image]').forEach(btn=>btn.addEventListener('click',()=>abrirImagen(btn.dataset.image,btn.dataset.title)));
  $('premiosGrid').querySelectorAll('[data-redeem]').forEach(btn=>btn.addEventListener('click',()=>clubPendiente?mostrarActivacion():abrirCanje((data.datos||[]).find(p=>p.id===Number(btn.dataset.redeem)))));
  document.querySelector('[data-view-panel="premios"] [data-card-loading]').hidden=true;
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
  navigation.show('inicio',{animate:false});
  setStatus('appStatus','Activa tu cuenta con el código de una compra de Bs 5,00 o más para canjear.');
  $('activacionPanel').scrollIntoView({behavior:'smooth',block:'start'});
  $('activacionToken').focus({preventScroll:true});
}

async function abrirCanje(premio){
  const epoch=viewEpoch;
  try {
    const data=await clubApi('PREMIOS');
    if(epoch!==viewEpoch||!session?.token)return;
    if(!data.ok){setStatus('appStatus',mensajeError(data.error),true);return;}
    renderPremios(data);
    const actual=data.datos.find(item=>item.id===premio.id);
    if(!actual||Number(actual.stock_disponible)<=0||!actual.club_premios_sucursales?.length){setStatus('appStatus','El premio ya no está disponible.',true);return;}
    premioSeleccionado=actual;
    $('redeemTitle').textContent=`Canjear ${actual.nombre}`;
    $('redeemBranch').innerHTML=actual.club_premios_sucursales.map(s=>`<option value="${esc(s.sucursal_id)}">${esc(s.sucursal_nombre||s.sucursal_id)}</option>`).join('');
    $('redeemDialog').showModal();
  } catch (_) {setStatus('appStatus','No se pudo verificar la disponibilidad. Intenta nuevamente.',true);}
}
$('cancelRedeem').addEventListener('click',()=>$('redeemDialog').close());
$('confirmRedeem').addEventListener('click',async()=>{ if(!premioSeleccionado)return; $('confirmRedeem').disabled=true; const data=await clubApi('CREAR_CANJE',{PREMIO_ID:premioSeleccionado.id,SUCURSAL_ID:$('redeemBranch').value,IDEMPOTENCY_KEY:idempotencia()}); $('confirmRedeem').disabled=false; if(!data.ok){setStatus('appStatus',mensajeError(data.error),true);return;} if(data.codigoRetiro){const codes=readJson(CODES_KEY,{});codes[data.canjeId||data.id]=data.codigoRetiro;localStorage.setItem(CODES_KEY,JSON.stringify(codes));} readClient.invalidate(['RESUMEN','MOVIMIENTOS','CANJES','PREMIOS']); $('redeemDialog').close(); setStatus('appStatus','Canje solicitado. Guarda tu código de retiro.'); document.querySelector('nav [data-view="canjes"]').click(); });

async function cargarMovimientos(){
  return loadRead('MOVIMIENTOS',{PAGINA:1,LIMITE:20},30000,data=>renderMovimientos(data,1),'Cargando movimientos…');
}
function renderMovimientos(data,pagina){
  const html=(data.datos||[]).map(movementItem).join('');
  if(pagina===1)$('movimientosLista').innerHTML=html||'<div class="list-item">Sin movimientos.</div>';
  else $('movimientosLista').insertAdjacentHTML('beforeend',html);
  movimientosPagina=pagina;
  document.querySelector('[data-view-panel="movimientos"] [data-card-loading]').hidden=true;
  $('movimientosMas').hidden=pagina>=Number(data.paginas||1);
}
$('movimientosMas').addEventListener('click',async()=>{
  const button=$('movimientosMas');
  button.disabled=true;
  const epoch=viewEpoch;
  try {
    const pagina=movimientosPagina+1;
    const data=await requestRead('MOVIMIENTOS',{PAGINA:pagina,LIMITE:20},30000);
    if(epoch!==viewEpoch)return;
    if(data.ok)renderMovimientos(data,pagina);else setStatus('appStatus',mensajeError(data.error),true);
  } catch (_) { if(epoch===viewEpoch)setStatus('appStatus','No se pudieron cargar más movimientos.',true); }
  finally { button.disabled=false; }
});

async function cargarCanjes(){
  return loadRead('CANJES',{PAGINA:1,LIMITE:20},15000,data=>renderCanjes(data,1),'Cargando canjes…');
}
function renderCanjes(data,pagina){
  const codes=readJson(CODES_KEY,{});
  const html=(data.datos||[]).map(c=>{const p=Array.isArray(c.club_premios)?c.club_premios[0]:c.club_premios||{};const imagen=normalizarUrlPublica(p.imagen_url);const code=codes[c.id];const cancelable=c.estado==='SOLICITADO';return `<article class="list-item"><div class="list-product">${imagen?`<img class="list-thumb" src="${esc(imagen)}" alt="${esc(p.nombre||'Premio')}" loading="lazy" decoding="async">`:''}<div><strong>${esc(p.nombre||'Premio')}</strong><p>${esc(c.estado)} · ${esc(c.sucursal_nombre||c.sucursal_id)} · ${fecha(c.solicitado_en)}</p>${code?`<div class="code">${esc(code)}</div><small>Código de retiro</small>`:''}</div></div><div><span class="points negative">-${Number(c.puntos_total)} pts</span>${cancelable?`<button data-cancel="${c.id}">Cancelar</button>`:''}</div></article>`;}).join('');
  if(pagina===1)$('canjesLista').innerHTML=html||'<div class="list-item">Aún no realizaste canjes.</div>';
  else $('canjesLista').insertAdjacentHTML('beforeend',html);
  canjesPagina=pagina;
  document.querySelector('[data-view-panel="canjes"] [data-card-loading]').hidden=true;
  $('canjesMas').hidden=!data.mas;
}
$('canjesLista').addEventListener('click',e=>{
  const button=e.target.closest('[data-cancel]');
  if(!button)return;
  canjeParaCancelar=Number(button.dataset.cancel);
  setStatus('cancelStatus','');
  $('cancelDialog').showModal();
});
$('canjesMas').addEventListener('click',async()=>{
  const button=$('canjesMas');
  button.disabled=true;
  const epoch=viewEpoch;
  try {
    const pagina=canjesPagina+1;
    const data=await requestRead('CANJES',{PAGINA:pagina,LIMITE:20},15000);
    if(epoch!==viewEpoch)return;
    if(data.ok)renderCanjes(data,pagina);else setStatus('canjesStatus',mensajeError(data.error),true);
  } catch (_) { if(epoch===viewEpoch)setStatus('canjesStatus','No se pudieron cargar más canjes.',true); }
  finally { button.disabled=false; }
});

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
    readClient.invalidate(['RESUMEN','MOVIMIENTOS','CANJES','PREMIOS']);
    await Promise.all([cargarCanjes(),cargarInicio()]);
    setStatus('canjesStatus','Canje cancelado. Tus puntos fueron devueltos.');
    setStatus('appStatus','Canje cancelado. Tus puntos fueron devueltos.');
  } catch (_) {
    setStatus('cancelStatus','No se pudo cancelar el canje. Intenta nuevamente.',true);
  } finally { $('cancelConfirm').disabled=false; }
});

function receiveVersions(meta){
  for(const action of readClient.observe(meta))changedResources.add(action);
  const publicChanges=contentClient.observe(meta?.publicas);
  for(const resource of publicChanges)changedResources.add(resource);
  if(publicChanges.includes('catalogo')){readClient.invalidate(['PREMIOS']);changedResources.add('PREMIOS');}
}
function refreshChanges(){
  if(!session?.token||document.hidden||!changedResources.size||changesTimer)return;
  changesTimer=setTimeout(()=>{
    changesTimer=null;if(!session?.token||document.hidden)return;
    const view=document.querySelector('nav [data-view].active')?.dataset.view||'inicio';
    const action={inicio:'RESUMEN',premios:'PREMIOS',movimientos:'MOVIMIENTOS',canjes:'CANJES'}[view];
    const common=view==='inicio'&&['reglas','noticias'].some(resource=>changedResources.has(resource));
    const points=view==='premios'&&changedResources.has('RESUMEN');
    if(changedResources.has(action)||common||points){
      changedResources.delete(action);
      if(view==='inicio'){changedResources.delete('reglas');changedResources.delete('noticias');}
      if(points)changedResources.delete('RESUMEN');
      const epoch=viewEpoch;
      void (async()=>{if(points)await cargarInicio();if(epoch===viewEpoch&&session?.token)await ({inicio:cargarInicio,premios:cargarPremios,movimientos:cargarMovimientos,canjes:cargarCanjes}[view])();})().catch(()=>{});
    }
  },200+Math.floor(Math.random()*300));
}
const clubUpdates=createClubUpdates({
  getSessionId:()=>sessionId(session?.token||''),readVersions:()=>clubApi('VERSIONES'),
  onVersions:receiveVersions,onChange:refreshChanges,
  onDeadline:()=>{readClient.invalidate(['RESUMEN','MOVIMIENTOS','PREMIOS']);['RESUMEN','MOVIMIENTOS','PREMIOS'].forEach(action=>changedResources.add(action));refreshChanges();},
});

const sessionWatcher=createClubSessionWatcher({
  createClient:()=>globalThis.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
    accessToken:async()=>{await refreshIfNeeded();return session?.token||SUPABASE_ANON_KEY;},
  }),
  getSession:()=>session,
  verify:()=>clubUpdates.sync(),
  onClient:client=>clubUpdates.start(client),
  isUpdatesConnected:()=>clubUpdates.connected(),
  onStop:()=>clubUpdates.stop(),
  onTransferred:reason=>{terminarSesion(reason||'SESION_TRASLADADA');},
});
const idle=createClubIdle({
  getSessionId:()=>sessionId(session?.token||''),
  onExpired:()=>terminarSesion('SESION_INACTIVA',true),
  notifyActivity:async()=>{
    if(!idle.check())return;
    const expected=sessionId(session?.token||'');
    await refreshIfNeeded();
    if(session?.token&&sessionId(session.token)===expected)return post(AUTH_URL,{ACCION:'ACTIVIDAD',INACTIVIDAD_MS:idle.elapsed()},session.token);
  },
});
setupDoubleBack({
  nativeSecondBack:true,
  closeOverlay:()=>{const dialog=document.querySelector('dialog[open]');if(!dialog)return false;dialog.close();return true;},
  showNotice:message=>{$('exitNotice').textContent=message;$('exitNotice').hidden=false;return true;},
  hideNotice:()=>{$('exitNotice').hidden=true;},
});
if('serviceWorker'in navigator)void navigator.serviceWorker.register('/club/sw.js').catch(()=>{});
window.addEventListener('storage',e=>{if(e.key!==SESSION_KEY)return;resetReadCache();session=readJson(SESSION_KEY,null);if(session?.token)showApp();else showAuth();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshChanges();});
if(session?.token)showApp();else {showAuth();ocultarSplash();}
setTimeout(ocultarSplash,7000);
const referidoUrl=new URL(location.href).searchParams.get('ref');
if(!session?.token&&referidoUrl)$('registroReferido').value=referidoUrl.slice(0,13).toUpperCase();
