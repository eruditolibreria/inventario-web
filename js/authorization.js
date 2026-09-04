import { store } from './store.js';

export const PERMISOS_POR_MODO = Object.freeze({
    VENTA: ['ventas.ver', 'ventas.crear'],
    CLIENTES: ['clientes.ver'],
    COMPRA: ['compras.ver', 'compras.crear'],
    GASTO: ['gastos.ver', 'gastos.crear'],
    CAJA: ['caja.ver', 'caja.abrir', 'caja.ingresar', 'caja.retirar'],
    ARQUEO: ['arqueo.ver', 'arqueo.crear', 'arqueo.cerrar'],
    CUENTAS: ['cuentas_cobrar.ver', 'cuentas_pagar.ver'],
    DEVOLUCIONES: ['devoluciones.ver', 'devoluciones.crear'],
    TRANSFERENCIAS: ['transferencias.ver', 'transferencias.crear'],
    REPORTES: ['reportes.ver', 'reportes.ver_utilidad'],
    BUSQUEDA: ['ventas.ver', 'compras.ver', 'productos.ver'],
    LAMINAS: ['laminas.ver', 'laminas.crear', 'laminas.editar'],
    SERVICIOS: ['servicios.ver', 'servicios.crear'],
    INVENTARIO: ['inventario.ver'],
    USUARIOS: ['usuarios.ver', 'roles.ver', 'sucursales.ver'],
});

export function tienePermiso(permisos, permiso) {
    return new Set((permisos || []).map(p => String(p).toLowerCase()))
        .has(String(permiso || '').toLowerCase());
}

export function can(permiso) {
    return tienePermiso(store.sessionPermisos, permiso);
}

export function canAny(...permisos) {
    return permisos.flat().some(can);
}

export function modosAutorizados() {
    return Object.keys(PERMISOS_POR_MODO).filter(modo => canAny(PERMISOS_POR_MODO[modo]));
}

export function puedeUsarSucursal(sucursal) {
    if (store.sessionAccesoGlobalSucursales) return true;
    const valor = String(sucursal || '').toUpperCase();
    return store.sessionSucursales.some(item => item.id === String(sucursal) || item.nombre === valor);
}
