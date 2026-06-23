/* === CONFIGURACION: Constantes, baseURL, permisos, modos === */

export const baseURL = "https://nhysxuqxlkmvrpxdoate.supabase.co/functions/v1/eruditos";

export const DEVOL_LIMITE = 20
  , TRANSF_LIMITE = 20
  , CARRITO_CHUNK_SIZE = 10;
export const CARRITO_KEY = "eruditos_carrito_draft";

export const TODOS_MODOS = ["VENTA", "COMPRA", "GASTO", "CAJA", "CUENTAS", "DEVOLUCIONES", "TRANSFERENCIAS", "REPORTES", "BUSQUEDA", "LAMINAS", "SERVICIOS", "INVENTARIO", "USUARIOS"];
export const ORDEN_MODOS = ["VENTA","COMPRA","GASTO","CAJA","CUENTAS","DEVOLUCIONES","TRANSFERENCIAS","REPORTES","BUSQUEDA","LAMINAS","SERVICIOS","INVENTARIO","USUARIOS"];
export const PERMISOS = {
    ADMIN: {
        tabs: [...TODOS_MODOS],
        inicio: "VENTA"
    },
    VENDEDOR: {
        tabs: ["VENTA", "CUENTAS", "DEVOLUCIONES", "BUSQUEDA", "LAMINAS", "SERVICIOS"],
        inicio: "VENTA"
    },
    ALMACEN: {
        tabs: ["COMPRA", "CUENTAS", "DEVOLUCIONES", "TRANSFERENCIAS", "REPORTES", "BUSQUEDA", "LAMINAS", "SERVICIOS", "INVENTARIO"],
        inicio: "COMPRA"
    },
};
export const PERMISOS_DEFAULT = {
    tabs: ["BUSQUEDA"],
    inicio: "BUSQUEDA"
};
