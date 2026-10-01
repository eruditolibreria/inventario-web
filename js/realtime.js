/* === REALTIME: Suscripcion a cambios de inventario (postgres_changes) === */
/*
 * Fase 2: reemplaza el polling de 30s. Emite un CustomEvent
 * "inventario:cambio" con el payload de Supabase Realtime.
 * Los modulos interesados (admin, venta) escuchan y actualizan
 * solo lo visible. RLS aplica: cada dispositivo solo recibe los
 * cambios de las filas que puede leer.
 */

import { channel } from './db.js';
let _canal = null;
let _notificaciones = null;

function notificaciones() {
    if (!_notificaciones) _notificaciones = import('./notificaciones.js');
    return _notificaciones;
}

export function initRealtime() {
    void notificaciones().then(modulo => modulo.initNotificaciones());
    if (_canal) return;
    _canal = channel("cambios-inventario")
        .on("postgres_changes", { event: "*", schema: "public", table: "inventario" }, (payload) => {
            try {
                window.dispatchEvent(new CustomEvent("inventario:cambio", { detail: payload }));
            } catch (_) {}
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "club_notificaciones_internas" }, (payload) => {
            try {
                void notificaciones().then(() => window.dispatchEvent(new CustomEvent("club:notificacion", { detail: payload })));
            } catch (_) {}
        })
        .subscribe(estado => {
            if (estado === 'SUBSCRIBED') void notificaciones().then(modulo => modulo.cargarNotificaciones());
        });
}
