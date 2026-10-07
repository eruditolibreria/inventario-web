/* === REALTIME: Suscripcion a cambios de inventario (postgres_changes) === */
/*
 * Fase 2: reemplaza el polling de 30s. Emite un CustomEvent
 * "inventario:cambio" con el payload de Supabase Realtime.
 * Los modulos interesados (admin, venta) escuchan y actualizan
 * solo lo visible. RLS aplica: cada dispositivo solo recibe los
 * cambios de las filas que puede leer.
 */

import { channel, removeChannel } from './db.js';
let _canal = null;
let _notificaciones = null;
let _revision = 0;
let _cerrando = Promise.resolve();

function notificaciones() {
    if (!_notificaciones) _notificaciones = import('./notificaciones.js');
    return _notificaciones;
}

export function stopRealtime() {
    _revision++;
    const anterior = _canal;
    _canal = null;
    if (anterior) {
        _cerrando = _cerrando.then(() => removeChannel(anterior)).catch(error => {
            console.warn('No se pudo retirar el canal Realtime', error);
        });
    }
    return _cerrando;
}

export async function initRealtime() {
    const revision = _revision;
    // Supabase reutiliza los canales por tema: esperar a retirar el anterior.
    await _cerrando;
    if (revision !== _revision || _canal) return;
    const actual = channel('cambios-inventario');
    _canal = actual;
    const vigente = () => _canal === actual && revision === _revision;
    void notificaciones().then(modulo => { if (vigente()) modulo.initNotificaciones(); });
    actual
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, payload => {
            if (!vigente()) return;
            try {
                window.dispatchEvent(new CustomEvent('inventario:cambio', { detail: payload }));
            } catch (_) {}
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'club_notificaciones_internas' }, payload => {
            if (!vigente()) return;
            void notificaciones().then(() => {
                if (vigente()) window.dispatchEvent(new CustomEvent('club:notificacion', { detail: payload }));
            });
        })
        .subscribe(estado => {
            if (estado === 'SUBSCRIBED' && vigente()) {
                void notificaciones().then(modulo => { if (vigente()) modulo.cargarNotificaciones(); });
            }
        });
}

window.addEventListener('eruditos:logout', () => { void stopRealtime(); });
