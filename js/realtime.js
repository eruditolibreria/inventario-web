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

export function initRealtime() {
    if (_canal) return;
    _canal = channel("cambios-inventario")
        .on("postgres_changes", { event: "*", schema: "public", table: "inventario" }, (payload) => {
            try {
                window.dispatchEvent(new CustomEvent("inventario:cambio", { detail: payload }));
            } catch (_) {}
        })
        .subscribe();
}
