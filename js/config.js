/* === CONFIGURACION: Constantes, baseURL, permisos, modos === */

const LOCAL = true; // cambiar a true para desarrollo local

export const HOST = LOCAL
  ? "http://127.0.0.1:54321/functions/v1"
  : "https://nhysxuqxlkmvrpxdoate.supabase.co/functions/v1";

export const BASE_URL_ERUDITOS      = `${HOST}/eruditos`;
export const BASE_URL_USUARIOS      = `${HOST}/usuarios`;
export const BASE_URL_LAMINAS       = `${HOST}/laminas`;
export const BASE_URL_SERVICIOS     = `${HOST}/servicios`;
export const BASE_URL_INVENTARIO    = `${HOST}/inventario`;
export const BASE_URL_VENTAS        = `${HOST}/ventas`;
export const BASE_URL_CAJA          = `${HOST}/caja`;
export const BASE_URL_REPORTES      = `${HOST}/reportes`;
export const BASE_URL_CUENTAS       = `${HOST}/cuentas`;
export const BASE_URL_DEVOLUCIONES  = `${HOST}/devoluciones`;
export const BASE_URL_COMPROBANTES  = `${HOST}/comprobantes`;

export const COMPROBANTE_ANCHO_DEFAULT = "57";

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
