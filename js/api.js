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

import { BASE_URL_ERUDITOS, BASE_URL_USUARIOS, BASE_URL_LAMINAS, BASE_URL_SERVICIOS } from './config.js';
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
        BUSCAR_LAMINAS: BASE_URL_LAMINAS,
        AGREGAR_LAMINA: BASE_URL_LAMINAS,
        ACTUALIZAR_ESTADO_LAMINA: BASE_URL_LAMINAS,
        REGISTRAR_SERVICIO: BASE_URL_SERVICIOS,
        LISTAR_SERVICIOS: BASE_URL_SERVICIOS,
        ELIMINAR_SERVICIO: BASE_URL_SERVICIOS,
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
