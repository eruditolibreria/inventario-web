/* === API: Cliente HTTP con refresh token automatico === */

/*
 * Funcion api() generica para todas las llamadas al backend.
 * Incluye renovacion silenciosa del token antes de cada request
 * si el token esta a menos de 180 segundos de expirar.
 *
 * Dependencias:
 *   - store.js: sessionRefreshToken, sessionExpiresAt, sessionToken
 *   - config.js: baseURL
 *
 * Uso:
 *   import { api } from './api.js';
 *   const data = await api({ ACCION: "LISTAR", TOKEN: token });
 *   if (!data.ok) { manejarRespuesta(data); return; }
 */

import { baseURL } from './config.js';
import { store, setTokens, setToken } from './store.js';

/**
 * Realiza una llamada a la API con refresh automatico de token.
 * Si el token expira en menos de 3 minutos, se renueva silenciosamente.
 * @param {Object} params - Parametros de la llamada (ACCION, TOKEN, etc.)
 * @returns {Promise<Object>} Respuesta JSON del servidor
 */
async function api(params) {
    const ahora = Math.floor(Date.now() / 1000);
    if (store.sessionRefreshToken && store.sessionExpiresAt && (store.sessionExpiresAt - ahora) < 180) {
        try {
            const r = await fetch(baseURL, {
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
    const res = await fetch(baseURL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    return res.json();
}

export { api };
