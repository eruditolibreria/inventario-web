// Conserva la identidad de un cobro si se pierde la respuesta del servidor.
export async function enviarCobroSeguro(params, usuario, api) {
    const storageKey = "eruditos_cobro_pendiente:" + usuario;
    const { TOKEN, IDEMPOTENCY_KEY, ...datos } = params;
    const huella = JSON.stringify(datos);
    let pendiente;
    try {
        const raw = localStorage.getItem(storageKey);
        pendiente = raw ? JSON.parse(raw) : null;
    } catch (_) {
        throw new Error("No se puede recuperar el cobro pendiente. Revisa el almacenamiento del navegador.");
    }
    if (pendiente?.confirmada) {
        if (pendiente.huella === huella) return pendiente.confirmada;
        pendiente = null;
    }
    if (pendiente && pendiente.huella !== huella) {
        throw new Error("Hay un cobro sin confirmar. Restablece sus productos y forma de pago y pulsa Cobrar para comprobarlo antes de registrar otra venta.");
    }
    const esPrimerIntento = !pendiente;
    if (!pendiente) {
        pendiente = { huella, key: IDEMPOTENCY_KEY };
        // Si no puede persistirse, no se envía una operación que luego no podamos identificar.
        localStorage.setItem(storageKey, JSON.stringify(pendiente));
    }
    const result = await api({ ...params, IDEMPOTENCY_KEY: pendiente.key });
    if (result?.ok === true) {
        try { localStorage.setItem(storageKey, JSON.stringify({ ...pendiente, confirmada: result })); } catch (_) {}
    } else if (esPrimerIntento && result?.ok === false && result.rechazada === true) {
        // Los errores de negocio del endpoint ocurren antes del commit o revierten la RPC.
        // Si falla la limpieza, el siguiente intento conserva la misma identidad.
        try { localStorage.removeItem(storageKey); } catch (_) {}
    }
    return result;
}
