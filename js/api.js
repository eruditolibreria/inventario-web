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

import { BASE_URL_ERUDITOS, BASE_URL_USUARIOS, BASE_URL_LAMINAS, BASE_URL_SERVICIOS, BASE_URL_INVENTARIO, BASE_URL_VENTAS, BASE_URL_CAJA, BASE_URL_REPORTES, BASE_URL_CUENTAS, BASE_URL_DEVOLUCIONES, BASE_URL_COMPROBANTES, BASE_URL_CLIENTES, BASE_URL_PROVEEDORES, BASE_URL_ARQUEO, BASE_URL_AUDITORIA, SUPABASE_ANON_KEY } from './config.js';
import { store, setSession, setTokens } from './store.js';

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
        ACTUALIZAR_SUCURSAL: BASE_URL_USUARIOS,
        CAMBIAR_SUCURSAL_USUARIO: BASE_URL_USUARIOS,
        OBTENER_CONTEXTO_USUARIO: BASE_URL_USUARIOS,
        LISTAR_ROLES_PERMISOS: BASE_URL_USUARIOS,
        CREAR_ROL: BASE_URL_USUARIOS,
        ACTUALIZAR_ROL: BASE_URL_USUARIOS,
        ACTUALIZAR_ROL_PERMISOS: BASE_URL_USUARIOS,
        ACTUALIZAR_PERMISOS_USUARIO: BASE_URL_USUARIOS,
        ACTUALIZAR_ACCESO_USUARIO: BASE_URL_USUARIOS,
        CAMBIAR_ESTADO_SUCURSAL: BASE_URL_USUARIOS,
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
        RESERVAR_STOCK: BASE_URL_INVENTARIO,
        LIBERAR_RESERVAS_CARRITO: BASE_URL_INVENTARIO,
        STOCK_ALERTAS: BASE_URL_INVENTARIO,
        ROTACION_INVENTARIO: BASE_URL_INVENTARIO,
        VALORIZACION_INVENTARIO: BASE_URL_INVENTARIO,
        HISTORIAL_MOVIMIENTOS: BASE_URL_INVENTARIO,
        COMPRA: BASE_URL_VENTAS,
        CARRITO_GUARDAR: BASE_URL_VENTAS,
        VENTA_POS: BASE_URL_VENTAS,
        CREAR_COTIZACION: BASE_URL_VENTAS,
        LISTAR_COTIZACIONES: BASE_URL_VENTAS,
        OBTENER_COTIZACION: BASE_URL_VENTAS,
        CANCELAR_COTIZACION: BASE_URL_VENTAS,
        RECALCULAR_COTIZACION: BASE_URL_VENTAS,
        ANULAR_VENTA: BASE_URL_VENTAS,
        LISTAR_CLIENTES: BASE_URL_VENTAS,
        REGISTRAR_GASTO: BASE_URL_CAJA,
        APERTURA_CAJA: BASE_URL_CAJA,
        CIERRE_CAJA: BASE_URL_CAJA,
        REGISTRAR_APORTE_RETIRO: BASE_URL_CAJA,
        ESTADO_CAJA: BASE_URL_CAJA,
        FLUJO_CAJA_REPORTE: BASE_URL_REPORTES,
        VENTAS_PERIODO: BASE_URL_REPORTES,
        UTILIDAD_BRUTA: BASE_URL_REPORTES,
        PRODUCTOS_MAS_VENDIDOS: BASE_URL_REPORTES,
        PRODUCTOS_MENOS_VENDIDOS: BASE_URL_REPORTES,
        RESUMEN_COMERCIAL: BASE_URL_REPORTES,
        ARQUEOS_REPORTE: BASE_URL_REPORTES,
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
        REGISTRAR_TRANSFERENCIA_LOTE: BASE_URL_DEVOLUCIONES,
        LISTAR_TRANSFERENCIAS: BASE_URL_DEVOLUCIONES,
        REGISTRAR_COMPROBANTE: BASE_URL_COMPROBANTES,
        LISTAR_COMPROBANTES: BASE_URL_COMPROBANTES,
        OBTENER_COMPROBANTE: BASE_URL_COMPROBANTES,
        LISTAR_CLIENTES_MODULO: BASE_URL_CLIENTES,
        BUSCAR_CLIENTES_VENTA: BASE_URL_CLIENTES,
        OBTENER_CLIENTE: BASE_URL_CLIENTES,
        CREAR_CLIENTE: BASE_URL_CLIENTES,
        ACTUALIZAR_CLIENTE: BASE_URL_CLIENTES,
        REGISTRAR_PAGO_CLIENTE: BASE_URL_CLIENTES,
        ANULAR_PAGO_CLIENTE: BASE_URL_CLIENTES,
        INICIAR_ARQUEO: BASE_URL_ARQUEO,
        OBTENER_RESUMEN_ARQUEO: BASE_URL_ARQUEO,
        CERRAR_ARQUEO: BASE_URL_ARQUEO,
        LISTAR_ARQUEOS: BASE_URL_ARQUEO,
        DETALLE_ARQUEO: BASE_URL_ARQUEO,
        LISTAR_AUDITORIA: BASE_URL_AUDITORIA,
        LISTAR_FILTROS_AUDITORIA: BASE_URL_AUDITORIA,
        DETALLE_AUDITORIA: BASE_URL_AUDITORIA,
        LISTAR_PROVEEDORES: BASE_URL_PROVEEDORES,
        OBTENER_PROVEEDOR: BASE_URL_PROVEEDORES,
        CREAR_PROVEEDOR: BASE_URL_PROVEEDORES,
    };
    return RUTAS[accion] || BASE_URL_ERUDITOS;
}

let _renovacion = null;

export async function renovarSesionSiNecesario() {
    const token = store.sessionToken;
    const refreshToken = store.sessionRefreshToken;
    const ahora = Math.floor(Date.now() / 1000);
    if (!token || !refreshToken || !store.sessionExpiresAt || store.sessionExpiresAt - ahora >= 180) return;
    if (_renovacion?.token === token && _renovacion.refreshToken === refreshToken) return _renovacion.promise;
    const pendiente = { token, refreshToken, promise: null };
    pendiente.promise = (async () => {
        try {
            const r = await fetch(resolverBaseUrl("REFRESH_TOKEN"), {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SUPABASE_ANON_KEY },
                body: JSON.stringify({ ACCION: "REFRESH_TOKEN", REFRESH_TOKEN: refreshToken })
            });
            const rd = await r.json();
            if (r.ok && rd.ok && rd.token && rd.refreshToken &&
                store.sessionToken === token && store.sessionRefreshToken === refreshToken) {
                setSession(rd.token, rd.usuario, rd.rol, rd.sucursal, rd);
                setTokens(rd.refreshToken, rd.expiresAt);
            }
        } catch (_) {
            // Conserva el comportamiento actual ante un fallo transitorio de red.
        } finally {
            if (_renovacion === pendiente) _renovacion = null;
        }
    })();
    _renovacion = pendiente;
    return pendiente.promise;
}

async function api(params) {
    const tokenAntesDeRefrescar = store.sessionToken;
    const usuarioAntes = store.sessionUser;
    const publica = params.ACCION === "LOGIN" || params.ACCION === "REFRESH_TOKEN";
    if (!publica && params.ACCION !== "LOGOUT") {
        await renovarSesionSiNecesario();
        if (tokenAntesDeRefrescar && (!store.sessionToken || store.sessionUser !== usuarioAntes)) {
            return { ok: false, error: "NO_AUTORIZADO" };
        }
    }
    const body = Object.fromEntries(Object.entries(params).filter( ([_,v]) => v !== undefined && v !== null && v !== ""));
    const tokenSolicitud = params.TOKEN && params.TOKEN !== tokenAntesDeRefrescar
        ? params.TOKEN
        : (store.sessionToken || params.TOKEN);
    if (body.TOKEN) body.TOKEN = tokenSolicitud;
    const res = await fetch(resolverBaseUrl(params.ACCION), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${tokenSolicitud || SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

export { api };
