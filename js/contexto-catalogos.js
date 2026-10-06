import { store } from './store.js';
let revision = 0;
export function contextoCatalogos(incluirInvalidaciones = true) {
    return JSON.stringify([incluirInvalidaciones ? revision : 0, store.sessionUsuarioId || store.sessionUser || store.sessionToken, !!store.sessionToken,
        store.sessionSucursal, store.sessionAccesoGlobalSucursales,
        store.sessionSucursales || [], [...(store.sessionPermisos || [])].sort()]);
}
export function invalidarCatalogos() {
    revision++;
    globalThis.window?.dispatchEvent(new Event('eruditos:catalogos-invalidados'));
}
// No data persists across a logout, even when the same person signs in again.
globalThis.window?.addEventListener('eruditos:logout', invalidarCatalogos);
export function vigenciaCatalogo(data, inicio, maximo = 60000) {
    const restante = Number(data?.cache?.restanteMs);
    // Account for the entire network trip; receiving an old Redis entry cannot renew its age.
    return inicio + (Number.isFinite(restante) && restante >= 0 ? Math.min(restante, maximo) : 0);
}
