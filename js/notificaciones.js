import { api } from './api.js';
import { can } from './authorization.js';

let inicializado = false;
let cargando = false;

const ESTILOS = `.club-notification-center{position:relative;flex:0 0 auto}.club-notification-bell{position:relative;width:42px;height:42px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);color:var(--text);cursor:pointer}.club-notification-bell span{position:absolute;top:-6px;right:-6px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:var(--red);color:#fff;font-size:10px;font-weight:800;line-height:19px}.club-notification-panel{position:absolute;z-index:80;top:calc(100% + 10px);right:0;width:min(390px,calc(100vw - 24px));max-height:480px;overflow:hidden;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:0 20px 55px #0004}.club-notification-head{display:flex;align-items:center;justify-content:space-between;padding:13px 15px;border-bottom:1px solid var(--border)}.club-notification-head button{border:0;background:transparent;color:var(--text);font-size:22px}.club-notification-list{max-height:415px;overflow:auto}.club-notification-item{display:grid;width:100%;gap:4px;padding:13px 15px;border:0;border-bottom:1px solid var(--border);background:var(--surface);color:var(--text);text-align:left}.club-notification-item.unread{background:var(--surface2)}.club-notification-item span,.club-notification-item small{color:var(--muted)}.club-notification-empty{padding:24px;text-align:center;color:var(--muted)}.club-entrega-dialog{width:min(420px,calc(100% - 28px));border:1px solid var(--border);border-radius:18px;background:var(--surface);color:var(--text)}.club-entrega-dialog::backdrop{background:#0009}.club-entrega-dialog input{width:100%;margin:10px 0;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);color:var(--text);font:800 24px var(--mono);letter-spacing:.2em;text-align:center}.club-codigo-error{min-height:38px;color:var(--red);font-size:12px}.club-canje-destacado{outline:2px solid var(--accent)}.club-config-warning{display:block;margin-top:6px;color:var(--orange);font-size:11px;font-weight:700}@media(max-width:700px){.club-notification-panel{position:fixed;top:68px;right:12px;left:12px;width:auto}.club-notification-bell{width:38px;height:38px}}`;

const esc = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fecha = valor => valor ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor)) : '—';

function crearCentro() {
    if (!document.getElementById('clubNotificacionesEstilos')) {
        const estilos = document.createElement('style');
        estilos.id = 'clubNotificacionesEstilos';
        estilos.textContent = ESTILOS;
        document.head.appendChild(estilos);
    }
    const cabecera = document.querySelector('.desktop-header-right, .app-header');
    const usuario = cabecera?.querySelector('.user-badge');
    if (!cabecera || !usuario || document.getElementById('clubNotificacionesCentro')) return;
    const centro = document.createElement('div');
    centro.id = 'clubNotificacionesCentro';
    centro.className = 'club-notification-center';
    centro.innerHTML = `<button id="clubNotificacionesBtn" class="club-notification-bell" type="button" aria-label="Notificaciones de canjes" aria-expanded="false"><i class="fa-solid fa-bell"></i><span id="clubNotificacionesBadge" hidden>0</span></button><div id="clubNotificacionesPanel" class="club-notification-panel" hidden><div class="club-notification-head"><strong>Notificaciones de canjes</strong><button id="clubNotificacionesCerrar" type="button" aria-label="Cerrar">×</button></div><div id="clubNotificacionesLista" class="club-notification-list"><div class="muted">Cargando…</div></div></div>`;
    cabecera.insertBefore(centro, usuario);
}

function cerrar() {
    const panel = document.getElementById('clubNotificacionesPanel');
    const boton = document.getElementById('clubNotificacionesBtn');
    if (panel) panel.hidden = true;
    boton?.setAttribute('aria-expanded', 'false');
}

async function abrirCanje(notificacionId, canjeId) {
    await api({ ACCION: 'CLUB_MARCAR_NOTIFICACION', ID: notificacionId });
    cerrar();
    await cargarNotificaciones();
    window.__clubCanjeObjetivo = canjeId;
    window.setModo?.('CLUB', 0);
    setTimeout(() => window.dispatchEvent(new CustomEvent('club:abrir-canje', { detail: { canjeId } })), 0);
}

function render(data) {
    const badge = document.getElementById('clubNotificacionesBadge');
    const lista = document.getElementById('clubNotificacionesLista');
    if (!badge || !lista) return;
    const pendientes = Number(data.pendientes || 0);
    badge.textContent = pendientes > 99 ? '99+' : String(pendientes);
    badge.hidden = pendientes === 0;
    const filas = data.datos || [];
    lista.innerHTML = filas.length ? filas.map(item => `<button type="button" class="club-notification-item${item.leida_en ? '' : ' unread'}" data-notificacion-id="${item.id}" data-canje-id="${item.canje_id}"><strong>${esc(item.titulo)}</strong><span>${esc(item.mensaje)}</span><small>${esc(item.sucursal_nombre || item.sucursal_id)} · ${fecha(item.creado_en)}</small></button>`).join('') : '<div class="club-notification-empty">No tienes notificaciones de canjes.</div>';
    lista.querySelectorAll('[data-notificacion-id]').forEach(item => item.addEventListener('click', () =>
        abrirCanje(Number(item.dataset.notificacionId), Number(item.dataset.canjeId))
    ));
}

export async function cargarNotificaciones() {
    if (cargando || !can('club.ver_canjes')) return;
    cargando = true;
    try {
        const data = await api({ ACCION: 'CLUB_LISTAR_NOTIFICACIONES', LIMITE: 30 });
        if (data.ok) render(data);
    } finally {
        cargando = false;
    }
}

export function initNotificaciones() {
    if (inicializado || !can('club.ver_canjes')) return;
    inicializado = true;
    crearCentro();
    const boton = document.getElementById('clubNotificacionesBtn');
    const panel = document.getElementById('clubNotificacionesPanel');
    boton?.addEventListener('click', event => {
        event.stopPropagation();
        panel.hidden = !panel.hidden;
        boton.setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) void cargarNotificaciones();
    });
    document.getElementById('clubNotificacionesCerrar')?.addEventListener('click', cerrar);
    panel?.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', cerrar);
    window.addEventListener('club:notificacion', () => void cargarNotificaciones());
    void cargarNotificaciones();
}
