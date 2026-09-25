import { HOST, SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config.js';

const AUTH_URL = `${HOST}/club-auth`;
const PUBLIC_URL = `${HOST}/club-public`;
const SESSION_KEY = 'club_eruditos_session';
const CODES_KEY = 'club_eruditos_retiros';
let session = readJson(SESSION_KEY, null);
let premioSeleccionado = null;

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
function mensajeError(code) {
  return ({ CREDENCIALES_INVALIDAS:'Código o contraseña incorrectos.', CODIGO_VINCULACION_INVALIDO:'El código de vinculación no es válido o ya fue usado.', PASSWORD_MINIMO_8_CHARS:'La contraseña debe tener al menos 8 caracteres.', CUENTA_YA_VINCULADA:'Esta cuenta ya fue activada.', RECUPERACION_INVALIDA:'El código de recuperación no es válido o ya fue usado.', NO_AUTORIZADO:'Tu sesión terminó. Ingresa nuevamente.', SALDO_INSUFICIENTE:'No tienes puntos suficientes.', STOCK_INSUFICIENTE:'El premio ya no tiene stock disponible.' })[code] || code || 'No se pudo completar la solicitud.';
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

function showAuth() { $('authView').hidden=false; $('appView').hidden=true; }
function showApp() { $('authView').hidden=true; $('appView').hidden=false; $('saludo').textContent=`Hola, ${session?.cliente?.nombre || 'Erudito'}`; void cargarInicio(); }

document.querySelectorAll('[data-auth]').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('[data-auth]').forEach(b => b.classList.toggle('active', b===btn));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden=p.dataset.panel!==btn.dataset.auth; });
  setStatus('authStatus','');
}));

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault(); setStatus('authStatus','Ingresando…');
  const data=await post(AUTH_URL,{ACCION:'LOGIN',CODIGO_CLIENTE:$('loginCodigo').value,PASSWORD:$('loginPassword').value});
  if(!data.ok){setStatus('authStatus',mensajeError(data.error),true);return;} saveSession(data); showApp();
});

$('registroForm').addEventListener('submit', async e => {
  e.preventDefault(); setStatus('authStatus','Activando tu cuenta…');
  const data=await post(AUTH_URL,{ACCION:'REGISTRAR',TOKEN_VINCULACION:$('registroToken').value,PASSWORD:$('registroPassword').value});
  if(!data.ok){setStatus('authStatus',mensajeError(data.error),true);return;} saveSession(data); $('recoveryCodes').textContent=(data.codigosRecuperacion||[]).join('\n'); $('recoveryDialog').showModal(); showApp();
});

$('recuperarForm').addEventListener('submit', async e => {
  e.preventDefault(); setStatus('authStatus','Actualizando contraseña…');
  const data=await post(AUTH_URL,{ACCION:'RECUPERAR',CODIGO_CLIENTE:$('recuperarCodigo').value,CODIGO_RECUPERACION:$('recuperarToken').value,PASSWORD:$('recuperarPassword').value});
  if(!data.ok){setStatus('authStatus',mensajeError(data.error),true);return;} saveSession(data); showApp();
});

$('copyRecovery').addEventListener('click',()=>navigator.clipboard?.writeText($('recoveryCodes').textContent));
$('closeRecovery').addEventListener('click',()=>$('recoveryDialog').close());
$('logoutBtn').addEventListener('click',()=>{saveSession(null);showAuth();});

document.querySelectorAll('nav [data-view]').forEach(btn=>btn.addEventListener('click',async()=>{
  document.querySelectorAll('nav [data-view]').forEach(b=>b.classList.toggle('active',b===btn));
  document.querySelectorAll('[data-view-panel]').forEach(p=>{p.hidden=p.dataset.viewPanel!==btn.dataset.view;});
  if(btn.dataset.view==='inicio')await cargarInicio(); if(btn.dataset.view==='premios')await cargarPremios(); if(btn.dataset.view==='movimientos')await cargarMovimientos(); if(btn.dataset.view==='canjes')await cargarCanjes();
}));

function movementItem(m) {
  const delta=Number(m.puntos_disponibles_delta||0)+Number(m.puntos_pendientes_delta||0);
  return `<article class="list-item"><div><strong>${esc(m.descripcion||m.tipo)}</strong><p>${esc(m.tipo)} · ${fecha(m.creado_en)}</p></div><span class="points ${delta<0?'negative':''}">${delta>0?'+':''}${delta}</span></article>`;
}

async function cargarInicio(){
  setStatus('appStatus','Actualizando…'); const data=await clubApi('RESUMEN');
  if(!data.ok){setStatus('appStatus',mensajeError(data.error),true);return;}
  session={...session,cliente:data.cliente}; saveSession(session); $('saludo').textContent=`Hola, ${data.cliente?.nombre||'Erudito'}`;
  $('saldoDisponible').textContent=Number(data.cuenta?.saldo_disponible||0).toLocaleString('es-BO'); $('saldoPendiente').textContent=Number(data.cuenta?.saldo_pendiente||0).toLocaleString('es-BO');
  const vence=data.proximoVencimiento; $('vencimiento').hidden=!vence; if(vence)$('vencimiento').textContent=`${Number(vence.puntos_disponibles).toLocaleString('es-BO')} puntos vencen el ${fecha(vence.vence_en)}.`;
  $('terminosClub').hidden=!data.terminos; $('terminosClubTexto').textContent=data.terminos||'';
  $('resumenMovimientos').innerHTML=(data.movimientos||[]).map(movementItem).join('')||'<div class="list-item">Aún no tienes movimientos.</div>';
  $('notificaciones').innerHTML=(data.notificaciones||[]).map(n=>`<article class="list-item"><div><strong>${esc(n.titulo)}</strong><p>${esc(n.mensaje)}</p></div></article>`).join('')||'<div class="list-item">No hay novedades.</div>'; setStatus('appStatus','');
}

async function cargarPremios(){
  setStatus('appStatus','Cargando premios…'); const data=await clubApi('PREMIOS');
  if(!data.ok){setStatus('appStatus',mensajeError(data.error),true);return;}
  const saldo=Number($('saldoDisponible').textContent.replace(/\D/g,''))||0;
  $('premiosGrid').innerHTML=(data.datos||[]).map(p=>`<article class="reward"><span class="eyebrow">${esc(p.codigo)}</span><h3>${esc(p.nombre)}</h3><p>${esc(p.descripcion||'Un beneficio para miembros del Club.')}</p><div class="price">${Number(p.costo_puntos).toLocaleString('es-BO')} pts</div><button class="primary" data-redeem="${p.id}" ${saldo<Number(p.costo_puntos)?'disabled':''}>${saldo<Number(p.costo_puntos)?'Te faltan puntos':'Canjear'}</button></article>`).join('')||'<div class="list-item">Próximamente habrá nuevos premios.</div>';
  $('premiosGrid').querySelectorAll('[data-redeem]').forEach(btn=>btn.addEventListener('click',()=>abrirCanje((data.datos||[]).find(p=>p.id===Number(btn.dataset.redeem))))); setStatus('appStatus','');
}

function abrirCanje(premio){ premioSeleccionado=premio; $('redeemTitle').textContent=`Canjear ${premio.nombre}`; const sucursales=premio.club_premios_sucursales||[]; $('redeemBranch').innerHTML=sucursales.map(s=>`<option value="${esc(s.sucursal_id)}">${esc(s.sucursal_id)}</option>`).join(''); $('redeemDialog').showModal(); }
$('cancelRedeem').addEventListener('click',()=>$('redeemDialog').close());
$('confirmRedeem').addEventListener('click',async()=>{ if(!premioSeleccionado)return; $('confirmRedeem').disabled=true; const data=await clubApi('CREAR_CANJE',{PREMIO_ID:premioSeleccionado.id,SUCURSAL_ID:$('redeemBranch').value,IDEMPOTENCY_KEY:idempotencia()}); $('confirmRedeem').disabled=false; if(!data.ok){setStatus('appStatus',mensajeError(data.error),true);return;} if(data.codigoRetiro){const codes=readJson(CODES_KEY,{});codes[data.canjeId||data.id]=data.codigoRetiro;localStorage.setItem(CODES_KEY,JSON.stringify(codes));} $('redeemDialog').close(); setStatus('appStatus','Canje solicitado. Guarda tu código de retiro.'); document.querySelector('nav [data-view="canjes"]').click(); });

async function cargarMovimientos(){ const data=await clubApi('MOVIMIENTOS',{PAGINA:1,LIMITE:50}); $('movimientosLista').innerHTML=data.ok?(data.datos||[]).map(movementItem).join('')||'<div class="list-item">Sin movimientos.</div>':`<div class="list-item">${esc(mensajeError(data.error))}</div>`; }

async function cargarCanjes(){
  const data=await clubApi('CANJES'); const codes=readJson(CODES_KEY,{});
  $('canjesLista').innerHTML=data.ok?(data.datos||[]).map(c=>{const p=Array.isArray(c.club_premios)?c.club_premios[0]:c.club_premios||{};const code=codes[c.id];const cancelable=c.estado==='SOLICITADO';return `<article class="list-item"><div><strong>${esc(p.nombre||'Premio')}</strong><p>${esc(c.estado)} · ${fecha(c.solicitado_en)}</p>${code?`<div class="code">${esc(code)}</div><small>Código de retiro</small>`:''}</div><div><span class="points negative">-${Number(c.puntos_total)} pts</span>${cancelable?`<button data-cancel="${c.id}">Cancelar</button>`:''}</div></article>`;}).join('')||'<div class="list-item">Aún no realizaste canjes.</div>':`<div class="list-item">${esc(mensajeError(data.error))}</div>`;
  $('canjesLista').querySelectorAll('[data-cancel]').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('¿Cancelar este canje y devolver los puntos?'))return;const res=await clubApi('CANCELAR_CANJE',{CANJE_ID:Number(btn.dataset.cancel),MOTIVO:'Cancelado por el cliente'});setStatus('appStatus',res.ok?'Canje cancelado.':mensajeError(res.error),!res.ok);if(res.ok)await cargarCanjes();}));
}

if('serviceWorker'in navigator)navigator.serviceWorker.register('/club/sw.js').catch(()=>{});
if(session?.token)showApp();else showAuth();
