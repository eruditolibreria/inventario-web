/* === DB: Cliente directo Supabase (PostgREST + Realtime) === */
/*
 * Antes todo pasaba por edge functions (service key). Desde la Fase 0
 * este cliente es el acceso directo a la BD, sujeto a RLS
 * (auth_rol / auth_sucursal en la base de datos).
 *
 * El token de sesion viene de store.sessionToken (JWT de Supabase Auth).
 * Cada solicitud espera la renovación compartida y usa el token vigente.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { store } from './store.js';
import { renovarSesionSiNecesario } from './api.js';

const _sb = window.supabase;
if (!_sb || !_sb.createClient) throw new Error("supabase-js no esta cargado");

const client = _sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => {
        const usuario = store.sessionUser;
        await renovarSesionSiNecesario();
        if (store.sessionUser !== usuario) throw new Error("SESION_CAMBIADA");
        return store.sessionToken || null;
    },
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

/** Consulta directa a una tabla (RLS aplica automaticamente) */
export function from(table) {
    return client.from(table);
}

/** Canal Realtime (postgres_changes) */
export function channel(name) {
    return client.channel(name);
}

// ══ PRODUCTOS: consultas paginadas server-side ══

const PRODUCTO_COLS = "id,producto,categoria,precio_unidad,precio_venta,proveedor,ubicacion,sucursal,stock,imagen,codigo_barras,clave";

function _mapProducto(r) {
    return {
        id: r.id,
        producto: r.producto,
        categoria: r.categoria || "",
        precioUnidad: Number(r.precio_unidad || 0),
        precioVenta: Number(r.precio_venta || 0),
        precio: Number(r.precio_venta || 0),
        proveedor: r.proveedor || "",
        ubicacion: r.ubicacion || "",
        sucursal: r.sucursal || "",
        stock: Number(r.stock || 0),
        imagen: r.imagen || "",
        codigoBarras: r.codigo_barras || "",
        clave: r.clave || ""
    };
}

/**
 * Lista productos con paginacion y busqueda en servidor.
 * @returns {Promise<{datos: Array, total: number}>}
 */
export async function listarProductos({ query = "", sucursal = null, pagina = 0, limite = 20 } = {}) {
    const q = query.replace(/[%_]/g, ch => "\\" + ch);
    const desde = pagina * limite;
    const hasta = desde + limite - 1;
    let qb = client.from("inventario_autorizado").select(PRODUCTO_COLS, { count: "exact" });
    if (sucursal) qb = qb.eq("sucursal", sucursal);
    if (q) qb = qb.ilike("producto", `%${q}%`);
    const { data, error, count } = await qb.order("producto").range(desde, hasta);
    if (error) throw error;
    return { datos: (data || []).map(_mapProducto), total: count || 0 };
}

/** Sugerencias POS: sin conteo ni columnas administrativas. */
export async function buscarSugerenciasVenta({ query, sucursal, signal }) {
    const q = query.replace(/[%_]/g, ch => "\\" + ch);
    let qb = client.from("inventario_autorizado")
        .select("id,producto,precio_venta,sucursal,stock,imagen")
        .eq("sucursal", sucursal)
        .ilike("producto", "%" + q + "%")
        .order("producto")
        .limit(8);
    if (signal) qb = qb.abortSignal(signal);
    const { data, error } = await qb;
    if (error) throw error;
    return (data || []).map(_mapProducto);
}

/** Lista las categorías únicas visibles en el inventario autorizado. */
export async function listarCategoriasInventario() {
    const categorias = new Map();
    const limite = 1000;
    let desde = 0;

    while (true) {
        const { data, error } = await client
            .from("inventario_autorizado")
            .select("categoria")
            .not("categoria", "is", null)
            .order("categoria")
            .range(desde, desde + limite - 1);
        if (error) throw error;

        const pagina = data || [];
        pagina.forEach(({ categoria }) => {
            const nombre = String(categoria || "").trim();
            if (nombre) categorias.set(nombre.toLocaleUpperCase("es"), nombre);
        });
        if (pagina.length < limite) break;
        desde += pagina.length;
    }

    return Array.from(categorias.values())
        .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

/** Busca un producto exacto por nombre (y sucursal opcional) */
export async function buscarProductoPorNombre(producto, sucursal) {
    let qb = client.from("inventario_autorizado").select(PRODUCTO_COLS).eq("producto", producto);
    if (sucursal) qb = qb.eq("sucursal", sucursal);
    const { data, error } = await qb.limit(1);
    if (error) throw error;
    return data && data.length ? _mapProducto(data[0]) : null;
}

/** Busca un producto por codigo de barras (case-insensitive) */
export async function buscarProductoPorCodigo(codigo, sucursal) {
    let qb = client.from("inventario_autorizado").select(PRODUCTO_COLS).ilike("codigo_barras", codigo);
    if (sucursal) qb = qb.eq("sucursal", sucursal);
    const { data, error } = await qb.limit(1);
    if (error) throw error;
    return data && data.length ? _mapProducto(data[0]) : null;
}

/** Devuelve los datos de la ultima compra registrada del producto (misma sucursal) */
export async function ultimaCompraProducto(producto, sucursal) {
    let qb = client.from("compras")
        .select("costo_paquete,cant_paquete,unid_paquete,proveedor")
        .eq("producto", producto)
        .order("fecha_entrada", { ascending: false })
        .limit(1);
    if (sucursal) qb = qb.eq("sucursal", sucursal);
    const { data, error } = await qb;
    if (error) throw error;
    return data && data.length ? data[0] : null;
}

/** Registra un ajuste de stock mediante la operación transaccional del servidor. */
export async function ajustarInventario({ inventarioId, tipo, cantidad, motivo, observacion, idempotencyKey }) {
    const { data, error } = await client.rpc("ajustar_inventario", {
        p_inventario_id: inventarioId,
        p_tipo: tipo,
        p_cantidad: cantidad,
        p_motivo: motivo,
        p_observacion: observacion || null,
        p_idempotency_key: idempotencyKey || null
    });
    if (error) throw error;
    return data;
}

/** Importa productos nuevos en una única operación transaccional. */
export async function importarInventarioInicial({ items, archivoNombre, idempotencyKey }) {
    const { data, error } = await client.rpc("importar_inventario_inicial", {
        p_items: items,
        p_archivo_nombre: archivoNombre,
        p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return data;
}

/** Consulta el kardex permitido para un producto, más reciente primero. */
export async function listarMovimientosInventario(inventarioId, limite = 30) {
    const { data, error } = await client
        .from("movimientos_inventario_autorizados")
        .select("id,tipo,cantidad,stock_anterior,stock_nuevo,motivo,observacion,usuario,creado_en")
        .eq("inventario_id", inventarioId)
        .order("creado_en", { ascending: false })
        .limit(limite);
    if (error) throw error;
    return data || [];
}

export { client };

/** Reserva con el JWT del usuario; la RPC verifica permisos, sucursal y stock. */
export async function reservarStockVenta({ carritoId, producto, sucursal, delta }) {
    const { data, error } = await client.rpc("reservar_stock_carrito", {
        p_carrito_id: carritoId, p_producto: producto, p_sucursal: sucursal, p_delta: delta
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "RESERVA_NO_REGISTRADA");
    return data;
}

/** Lectura ligera para escaneo; no convierte errores de red en productos inexistentes. */
export async function buscarProductoEscaneoVenta(codigo, sucursal) {
    let qb = client.from("inventario_autorizado")
        .select("id,producto,precio_venta,sucursal,stock,imagen,codigo_barras")
        .eq("sucursal", sucursal);
    // Los códigos numéricos conservan sus ceros iniciales y usan igualdad indexable.
    qb = /^[0-9]+$/.test(codigo) ? qb.eq("codigo_barras", codigo)
        : qb.ilike("codigo_barras", codigo.replace(/[%_]/g, ch => "\\" + ch));
    const { data, error } = await qb.limit(1);
    if (error) throw error;
    return data?.length ? _mapProducto(data[0]) : null;
}
