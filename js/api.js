/* === API: Cliente HTTP con refresh token automatico === */

/*
 * Funcion api() generica para todas las llamadas al backend.
 * Incluye renovacion silenciosa del token antes de cada request
 * si el token esta a menos de 180 segundos de expirar.
 *
 * Dependencias:
 *   - store.js: sessionRefreshToken, sessionExpiresAt, sessionToken
 *   - config.js: BASE_URL_ERUDITOS, BASE_URL_USUARIOS, BASE_URL_LAMINAS, BASE_URL_SERVICIOS
 *
 * Uso:
 *   import { api } from './api.js';
 *   const data = await api({ ACCION: "LISTAR", TOKEN: token });
 *   if (!data.ok) { manejarRespuesta(data); return; }
 */

import { BASE_URL_ERUDITOS, BASE_URL_USUARIOS, BASE_URL_LAMINAS, BASE_URL_SERVICIOS, BASE_URL_INVENTARIO, BASE_URL_VENTAS, BASE_URL_CAJA, BASE_URL_REPORTES, BASE_URL_CUENTAS, BASE_URL_DEVOLUCIONES, BASE_URL_COMPROBANTES } from './config.js';
import { store, setTokens, setToken } from './store.js';

/**
 * Realiza una llamada a la API con refresh automatico de token.
 * Si el token expira en menos de 3 minutos, se renueva silenciosamente.
 * @param {Object} params - Parametros de la llamada (ACCION, TOKEN, etc.)
 * @returns {Promise<Object>} Respuesta JSON del servidor
 */
function resolverBaseUrl(accion) {
    const RUTAS = {
        LOGIN: BASE_URL_USUARIOS,
        REFRESH_TOKEN: BASE_URL_USUARIOS,
        LOGOUT: BASE_URL_USUARIOS,
        LISTAR_USUARIOS_ADMIN: BASE_URL_USUARIOS,
        CREAR_USUARIO: BASE_URL_USUARIOS,
        CAMBIAR_ROL_USUARIO: BASE_URL_USUARIOS,
        CAMBIAR_ESTADO_USUARIO: BASE_URL_USUARIOS,
        CAMBIAR_PASSWORD_USUARIO: BASE_URL_USUARIOS,
        LISTAR_SUCURSALES: BASE_URL_USUARIOS,
        CREAR_SUCURSAL: BASE_URL_USUARIOS,
        CAMBIAR_SUCURSAL_USUARIO: BASE_URL_USUARIOS,
        BUSCAR_LAMINAS: BASE_URL_LAMINAS,
        AGREGAR_LAMINA: BASE_URL_LAMINAS,
        ACTUALIZAR_ESTADO_LAMINA: BASE_URL_LAMINAS,
        REGISTRAR_SERVICIO: BASE_URL_SERVICIOS,
        LISTAR_SERVICIOS: BASE_URL_SERVICIOS,
        ELIMINAR_SERVICIO: BASE_URL_SERVICIOS,
        LISTAR_INVENTARIO: BASE_URL_INVENTARIO,
        LISTAR_INVENTARIO_ADMIN: BASE_URL_INVENTARIO,
        ELIMINAR_PRODUCTO: BASE_URL_INVENTARIO,
        ACTUALIZAR_IMAGEN_PRODUCTO: BASE_URL_INVENTARIO,
        SUBIR_IMAGEN_PRODUCTO: BASE_URL_INVENTARIO,
        BUSCAR_PRODUCTO_DETALLE: BASE_URL_INVENTARIO,
        ACTUALIZAR_PRODUCTO: BASE_URL_INVENTARIO,
        BUSCAR_PRODUCTO_CODIGO: BASE_URL_INVENTARIO,
        STOCK_ALERTAS: BASE_URL_INVENTARIO,
        ROTACION_INVENTARIO: BASE_URL_INVENTARIO,
        VALORIZACION_INVENTARIO: BASE_URL_INVENTARIO,
        HISTORIAL_MOVIMIENTOS: BASE_URL_INVENTARIO,
        COMPRA: BASE_URL_VENTAS,
        CARRITO_GUARDAR: BASE_URL_VENTAS,
        VENTA_POS: BASE_URL_VENTAS,
        LISTAR_CLIENTES: BASE_URL_VENTAS,
        REGISTRAR_GASTO: BASE_URL_CAJA,
        APERTURA_CAJA: BASE_URL_CAJA,
        CIERRE_CAJA: BASE_URL_CAJA,
        REGISTRAR_APORTE_RETIRO: BASE_URL_CAJA,
        ESTADO_CAJA: BASE_URL_CAJA,
        FLUJO_CAJA_REPORTE: BASE_URL_CAJA,
        VENTAS_PERIODO: BASE_URL_REPORTES,
        UTILIDAD_BRUTA: BASE_URL_REPORTES,
        PRODUCTOS_MAS_VENDIDOS: BASE_URL_REPORTES,
        PRODUCTOS_MENOS_VENDIDOS: BASE_URL_REPORTES,
        LISTAR_CUENTAS_COBRAR: BASE_URL_CUENTAS,
        ABONAR_CUENTA_COBRAR: BASE_URL_CUENTAS,
        REGISTRAR_CUENTA_COBRAR: BASE_URL_CUENTAS,
        LISTAR_CUENTAS_PAGAR: BASE_URL_CUENTAS,
        ABONAR_CUENTA_PAGAR: BASE_URL_CUENTAS,
        REGISTRAR_CUENTA_PAGAR: BASE_URL_CUENTAS,
        CUENTAS_COBRAR_REPORTE: BASE_URL_CUENTAS,
        REGISTRAR_DEVOLUCION: BASE_URL_DEVOLUCIONES,
        LISTAR_DEVOLUCIONES: BASE_URL_DEVOLUCIONES,
        REGISTRAR_TRANSFERENCIA: BASE_URL_DEVOLUCIONES,
        LISTAR_TRANSFERENCIAS: BASE_URL_DEVOLUCIONES,
        REGISTRAR_COMPROBANTE: BASE_URL_COMPROBANTES,
        LISTAR_COMPROBANTES: BASE_URL_COMPROBANTES,
        OBTENER_COMPROBANTE: BASE_URL_COMPROBANTES,
    };
    return RUTAS[accion] || BASE_URL_ERUDITOS;
}

async function api(params) {
    const ahora = Math.floor(Date.now() / 1000);
    if (store.sessionRefreshToken && store.sessionExpiresAt && (store.sessionExpiresAt - ahora) < 180) {
        try {
            const r = await fetch(resolverBaseUrl("REFRESH_TOKEN"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ACCION: "REFRESH_TOKEN",
                    REFRESH_TOKEN: store.sessionRefreshToken
                })
            });
            const rd = await r.json();
            if (rd.ok) {
                setToken(rd.token);
                setTokens(rd.refreshToken, rd.expiresAt);
            }
        } catch (_) {}
    }
    const body = Object.fromEntries(Object.entries(params).filter( ([_,v]) => v !== undefined && v !== null && v !== ""));
    const res = await fetch(resolverBaseUrl(params.ACCION), {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

export { api };
