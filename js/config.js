/* === CONFIGURACION: Constantes, baseURL, permisos, modos === */

const LOCAL = true; // usar true solo para desarrollo local

export const HOST = LOCAL
  ? "http://127.0.0.1:54321/functions/v1"
  : "https://nhysxuqxlkmvrpxdoate.supabase.co/functions/v1";

// Cliente directo Supabase (PostgREST + Realtime)
export const SUPABASE_URL = LOCAL
  ? "http://127.0.0.1:54321"
  : "https://nhysxuqxlkmvrpxdoate.supabase.co";
export const SUPABASE_ANON_KEY = LOCAL
  ? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
  : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oeXN4dXF4bGttdnJweGRvYXRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDE0MTAsImV4cCI6MjA4OTc3NzQxMH0.J1zXR6_mYMbamqhYpmvdzbFENaNLbUeTIGZNn0sXW28";

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
export const BASE_URL_CLIENTES      = `${HOST}/clientes`;
export const BASE_URL_ARQUEO        = `${HOST}/arqueo`;

export const COMPROBANTE_ANCHO_DEFAULT = "57";

export const DEVOL_LIMITE = 20
  , TRANSF_LIMITE = 20
  , CARRITO_CHUNK_SIZE = 10;
export const CARRITO_KEY = "eruditos_carrito_draft";

export const TODOS_MODOS = ["VENTA", "CLIENTES", "COMPRA", "GASTO", "CAJA", "ARQUEO", "CUENTAS", "DEVOLUCIONES", "TRANSFERENCIAS", "REPORTES", "BUSQUEDA", "LAMINAS", "SERVICIOS", "INVENTARIO", "USUARIOS"];
export const ORDEN_MODOS = ["VENTA","CLIENTES","COMPRA","GASTO","CAJA","ARQUEO","CUENTAS","DEVOLUCIONES","TRANSFERENCIAS","REPORTES","BUSQUEDA","LAMINAS","SERVICIOS","INVENTARIO","USUARIOS"];
export const PERMISOS = {
    ADMIN: {
        tabs: [...TODOS_MODOS],
        inicio: "VENTA"
    },
    VENDEDOR: {
        tabs: ["VENTA", "CLIENTES", "ARQUEO", "CUENTAS", "DEVOLUCIONES", "BUSQUEDA", "LAMINAS", "SERVICIOS"],
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
