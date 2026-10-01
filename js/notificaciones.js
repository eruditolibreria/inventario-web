import { api } from './api.js';
import { can } from './authorization.js';

let inicializado = false;
let cargando = false;
let recargar = false;
let revision = 0;
const conocidas = new Set();
const llegadas = new Set();
let audio = null;
let avisoTimer = null;
let animacion = null;
let pendientesSinLeer = 0;
const movimientoReducido = matchMedia('(prefers-reduced-motion: reduce)');
let silenciado = false;
try { silenciado = localStorage.getItem('eruditos_avisos_silenciados') === 'true'; } catch (_) {}

function actualizarSonido() {
    const boton = document.getElementById('mobileSoundToggle');
    if (!boton) return;
    boton.hidden = !can('club.ver_canjes');
    boton.textContent = silenciado ? 'Activar sonido' : 'Silenciar avisos';
    boton.setAttribute('aria-pressed', String(silenciado));
}

function prepararSonido() {
    if (silenciado || !can('club.ver_canjes')) return;
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    try {
        if (!audio) audio = new Contexto();
        if (audio.state === 'suspended') void audio.resume().catch(() => {});
    } catch (_) {}
}

function actualizarCampana() {
    const icono = document.querySelector('.club-bell-icon');
    if (!icono || !pendientesSinLeer || document.hidden || !can('club.ver_canjes') || movimientoReducido.matches) {
        animacion?.cancel();
        animacion = null;
        return;
    }
    if (!animacion) animacion = icono.animate([0, -20, 18, -14, 10, -5, 0, 0].map((grados, i) => ({
        transform: `rotate(${grados}deg)`, offset: i === 7 ? 1 : i * .035
    })), { duration: 3000, iterations: Infinity });
}

function avisarLlegada() {
    if (avisoTimer !== null || document.hidden) return;
    avisoTimer = setTimeout(() => {
        avisoTimer = null;
        if (document.hidden || !pendientesSinLeer || !can('club.ver_canjes')) return;
        if (silenciado || !audio || audio.state !== 'running') return;
        try {
            [880, 660].forEach((frecuencia, indice) => {
                const inicio = audio.currentTime + indice * .14;
                const tono = audio.createOscillator(), volumen = audio.createGain();
                tono.frequency.value = frecuencia;
                volumen.gain.setValueAtTime(.045, inicio);
                volumen.gain.exponentialRampToValueAtTime(.0001, inicio + .13);
                tono.connect(volumen);
                volumen.connect(audio.destination);
                tono.onended = () => { tono.disconnect(); volumen.disconnect(); };
                tono.start(inicio);
                tono.stop(inicio + .14);
            });
        } catch (_) {}
    }, 180);
}

const ESTILOS = `.club-notification-center{position:relative;flex:0 0 auto}.club-notification-bell{position:relative;width:42px;height:42px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);color:var(--text);cursor:pointer}.club-notification-bell span{position:absolute;top:-6px;right:-6px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:var(--red);color:#fff;font-size:10px;font-weight:800;line-height:19px}.club-notification-panel{position:absolute;z-index:80;top:calc(100% + 10px);right:0;width:min(390px,calc(100vw - 24px));max-height:480px;overflow:hidden;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:0 20px 55px #0004}.club-notification-head{display:flex;align-items:center;justify-content:space-between;padding:13px 15px;border-bottom:1px solid var(--border)}.club-notification-head button{border:0;background:transparent;color:var(--text);font-size:22px}.club-notification-list{max-height:415px;overflow:auto}.club-notification-item{display:grid;width:100%;gap:4px;padding:13px 15px;border:0;border-bottom:1px solid var(--border);background:var(--surface);color:var(--text);text-align:left}.club-notification-item.unread{background:var(--accent-dim);box-shadow:inset 4px 0 var(--accent)}.club-notification-item strong{display:flex;align-items:center;justify-content:space-between;gap:8px}.club-notification-item.unread strong{font-weight:800}.club-notification-unread{flex:none;font-size:10px;font-style:normal;padding:3px 6px;border:1px solid var(--accent);border-radius:6px;color:var(--accent-text)}.club-notification-read-error{padding:10px 15px;color:var(--red)}.club-notification-item span,.club-notification-item small{color:var(--muted)}.club-notification-item.unread span{color:var(--text)}.club-notification-empty{padding:24px;text-align:center;color:var(--muted)}.club-entrega-dialog{width:min(420px,calc(100% - 28px));border:1px solid var(--border);border-radius:18px;background:var(--surface);color:var(--text)}.club-entrega-dialog::backdrop{background:#0009}.club-entrega-dialog input{width:100%;margin:10px 0;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface2);color:var(--text);font:800 24px var(--mono);letter-spacing:.2em;text-align:center}.club-codigo-error{min-height:38px;color:var(--red);font-size:12px}.club-canje-destacado{outline:2px solid var(--accent)}.club-config-warning{display:block;margin-top:6px;color:var(--orange);font-size:11px;font-weight:700}@media(max-width:700px){.club-notification-panel{position:fixed;top:68px;right:12px;left:12px;width:auto}.club-notification-bell{width:38px;height:38px}}`;

const esc = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fecha = valor => valor ? new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor)) : '—';

function crearCentro() {
    if (!document.getElementById('clubNotificacionesEstilos')) {
        const estilos = document.createElement('style');
        estilos.id = 'clubNotificacionesEstilos';
        estilos.textContent = ESTILOS;
        estilos.textContent += '.club-bell-icon{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transform-origin:50% 15%}';
        document.head.appendChild(estilos);
    }
    const cabecera = document.querySelector('.desktop-header-right, .app-header');
    const usuario = cabecera?.querySelector('.user-badge');
    if (!cabecera || !usuario || document.getElementById('clubNotificacionesCentro')) return;
    const centro = document.createElement('div');
    centro.id = 'clubNotificacionesCentro';
    centro.className = 'club-notification-center';
    centro.innerHTML = `<button id="clubNotificacionesBtn" class="club-notification-bell" type="button" aria-label="Notificaciones de canjes" aria-controls="clubNotificacionesPanel" aria-expanded="false"><svg class="club-bell-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span id="clubNotificacionesBadge" hidden>0</span></button><div id="clubNotificacionesPanel" class="club-notification-panel" hidden><div class="club-notification-head"><strong>Notificaciones de canjes</strong><button id="clubNotificacionesCerrar" type="button" aria-label="Cerrar">×</button></div><div id="clubNotificacionesError" class="club-notification-read-error" role="status" hidden>No se pudo abrir la notificación. Intenta nuevamente.</div><div id="clubNotificacionesLista" class="club-notification-list"><div class="muted">Cargando…</div></div></div>`;
    const accionesMobile = document.getElementById('mobileHeaderActions');
    if (accionesMobile) accionesMobile.appendChild(centro);
    else cabecera.insertBefore(centro, usuario);
}

function cerrar() {
    const panel = document.getElementById('clubNotificacionesPanel');
    const boton = document.getElementById('clubNotificacionesBtn');
    if (panel) panel.hidden = true;
    boton?.setAttribute('aria-expanded', 'false');
}

async function abrirCanje(notificacionId, canjeId) {
    const actual = revision;
    const error = document.getElementById('clubNotificacionesError');
    if (error) error.hidden = true;
    try {
        const respuesta = await api({ ACCION: 'CLUB_MARCAR_NOTIFICACION', ID: notificacionId });
        if (actual !== revision) return;
        if (!respuesta.ok) throw new Error('No se pudo marcar la notificación');
    } catch (_) {
        if (actual === revision && error) error.hidden = false;
        return;
    }
    cerrar();
    await cargarNotificaciones();
    if (actual !== revision) return;
    window.__clubCanjeObjetivo = canjeId;
    window.setModo?.('CLUB', 0);
    setTimeout(() => window.dispatchEvent(new CustomEvent('club:abrir-canje', { detail: { canjeId } })), 0);
}

function render(data) {
    const badge = document.getElementById('clubNotificacionesBadge');
    const lista = document.getElementById('clubNotificacionesLista');
    if (!badge || !lista) return;
    const pendientes = Number(data.pendientes || 0);
    pendientesSinLeer = pendientes;
    actualizarCampana();
    badge.textContent = pendientes > 99 ? '99+' : String(pendientes);
    badge.hidden = pendientes === 0;
    document.getElementById('clubNotificacionesBtn')?.setAttribute('aria-label', `Notificaciones de canjes: ${pendientes} sin leer`);
    const filas = data.datos || [];
    const nueva = filas.some(item => !item.leida_en && llegadas.has(String(item.id)) && !conocidas.has(String(item.id)));
    filas.forEach(item => { conocidas.add(String(item.id)); llegadas.delete(String(item.id)); });
    if (nueva) avisarLlegada();
    lista.innerHTML = filas.length ? filas.map(item => `<button type="button" class="club-notification-item${item.leida_en ? '' : ' unread'}" data-notificacion-id="${item.id}" data-canje-id="${item.canje_id}"><strong>${esc(item.titulo)}${item.leida_en ? '' : '<em class="club-notification-unread">Sin leer</em>'}</strong><span>${esc(item.mensaje)}</span><small>${esc(item.sucursal_nombre || item.sucursal_id)} · ${fecha(item.creado_en)}</small></button>`).join('') : '<div class="club-notification-empty">No tienes notificaciones de canjes.</div>';
    lista.querySelectorAll('[data-notificacion-id]').forEach(item => item.addEventListener('click', () =>
        abrirCanje(Number(item.dataset.notificacionId), Number(item.dataset.canjeId))
    ));
}

export async function cargarNotificaciones() {
    if (!can('club.ver_canjes')) return;
    if (cargando) { recargar = true; return; }
    cargando = true;
    const actual = revision;
    try {
        const data = await api({ ACCION: 'CLUB_LISTAR_NOTIFICACIONES', LIMITE: 30 });
        if (actual === revision && data.ok && can('club.ver_canjes')) render(data);
    } catch (_) {
        // Mantener la lista actual si se pierde la conexión.
    } finally {
        if (actual === revision) {
            cargando = false;
            if (recargar) { recargar = false; void cargarNotificaciones(); }
        }
    }
}

export function initNotificaciones() {
    actualizarSonido();
    const centro = document.getElementById('clubNotificacionesCentro');
    if (!can('club.ver_canjes')) { if (centro) centro.hidden = true; pendientesSinLeer = 0; actualizarCampana(); return; }
    if (inicializado) { if (centro) centro.hidden = false; void cargarNotificaciones(); return; }
    inicializado = true;
    crearCentro();
    const boton = document.getElementById('clubNotificacionesBtn');
    const panel = document.getElementById('clubNotificacionesPanel');
    function posicionarPanel() {
        const accionesMobile = document.getElementById('mobileHeaderActions');
        if (accionesMobile) panel.style.setProperty('--mobile-notification-top', Math.max(12, accionesMobile.getBoundingClientRect().bottom + 10) + 'px');
    }
    boton?.addEventListener('click', event => {
        event.stopPropagation();
        panel.hidden = !panel.hidden;
        boton.setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) {
            posicionarPanel();
            void cargarNotificaciones();
        }
    });
    document.getElementById('clubNotificacionesCerrar')?.addEventListener('click', cerrar);
    panel?.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', cerrar);
    window.addEventListener('resize', () => { if (panel && !panel.hidden) posicionarPanel(); });
    window.addEventListener('club:notificacion', event => {
        if (!can('club.ver_canjes')) return;
        const cambio = event.detail;
        if (cambio?.eventType === 'INSERT' && cambio.new?.id != null) llegadas.add(String(cambio.new.id));
        void cargarNotificaciones();
    });
    document.addEventListener('pointerdown', prepararSonido);
    document.addEventListener('keydown', prepararSonido);
    document.addEventListener('visibilitychange', () => {
        actualizarCampana();
        if (!document.hidden) void cargarNotificaciones();
    });
    movimientoReducido.addEventListener?.('change', actualizarCampana);
    document.getElementById('mobileSoundToggle')?.addEventListener('click', () => {
        silenciado = !silenciado;
        try { localStorage.setItem('eruditos_avisos_silenciados', String(silenciado)); } catch (_) {}
        actualizarSonido();
        if (!silenciado) prepararSonido();
    });
    window.addEventListener('focus', () => { if (!document.hidden) void cargarNotificaciones(); });
    window.addEventListener('eruditos:logout', () => {
        revision++;
        cargando = recargar = false;
        conocidas.clear();
        llegadas.clear();
        clearTimeout(avisoTimer);
        avisoTimer = null;
        pendientesSinLeer = 0;
        actualizarCampana();
        cerrar();
        const centro = document.getElementById('clubNotificacionesCentro');
        if (centro) centro.hidden = true;
        const lista = document.getElementById('clubNotificacionesLista');
        if (lista) lista.replaceChildren();
        const badge = document.getElementById('clubNotificacionesBadge');
        if (badge) { badge.hidden = true; badge.textContent = '0'; }
    });
    void cargarNotificaciones();
}
