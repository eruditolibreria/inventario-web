/* === DB: Cliente directo Supabase (PostgREST + Realtime) === */
/*
 * Antes todo pasaba por edge functions (service key). Desde la Fase 0
 * este cliente es el acceso directo a la BD, sujeto a RLS
 * (auth_rol / auth_sucursal en la base de datos).
 *
 * El token de sesion viene de store.sessionToken (JWT de Supabase Auth).
 * Se sincroniza de forma perezosa antes de cada consulta o suscripcion.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { store } from './store.js';

const _sb = window.supabase;
if (!_sb || !_sb.createClient) throw new Error("supabase-js no esta cargado");

const client = _sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});

let _lastToken = null;

function _ensureAuth() {
    const t = store.sessionToken;
    if (t && t !== _lastToken) {
        client.auth.setSession({ access_token: t, refresh_token: store.sessionRefreshToken || t });
        _lastToken = t;
    }
}

/** Consulta directa a una tabla (RLS aplica automaticamente) */
export function from(table) {
    _ensureAuth();
    return client.from(table);
}

/** Canal Realtime (postgres_changes) */
export function channel(name) {
    _ensureAuth();
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
    _ensureAuth();
    const q = query.replace(/[%_]/g, ch => "\\" + ch);
    const desde = pagina * limite;
    const hasta = desde + limite - 1;
    let qb = client.from("inventario").select(PRODUCTO_COLS, { count: "exact" });
    if (sucursal) qb = qb.eq("sucursal", sucursal);
    if (q) qb = qb.ilike("producto", `%${q}%`);
    const { data, error, count } = await qb.order("producto").range(desde, hasta);
    if (error) throw error;
    return { datos: (data || []).map(_mapProducto), total: count || 0 };
}

/** Busca un producto exacto por nombre (y sucursal opcional) */
export async function buscarProductoPorNombre(producto, sucursal) {
    _ensureAuth();
    let qb = client.from("inventario").select(PRODUCTO_COLS).eq("producto", producto);
    if (sucursal) qb = qb.eq("sucursal", sucursal);
    const { data, error } = await qb.limit(1);
    if (error) throw error;
    return data && data.length ? _mapProducto(data[0]) : null;
}

/** Busca un producto por codigo de barras (case-insensitive) */
export async function buscarProductoPorCodigo(codigo, sucursal) {
    _ensureAuth();
    let qb = client.from("inventario").select(PRODUCTO_COLS).ilike("codigo_barras", codigo);
    if (sucursal) qb = qb.eq("sucursal", sucursal);
    const { data, error } = await qb.limit(1);
    if (error) throw error;
    return data && data.length ? _mapProducto(data[0]) : null;
}

/** Devuelve los datos de la ultima compra registrada del producto (misma sucursal) */
export async function ultimaCompraProducto(producto, sucursal) {
    _ensureAuth();
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

export { client };
