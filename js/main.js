/* ═══════════════════════════════════════════════════════════════
   GRUPO ERUDITOS · Sistema de Inventario
   js/main.js – Punto de entrada unificado (Fase 5)
   ═══════════════════════════════════════════════════════════════ */

// Módulos base
import { BASE_URL_ERUDITOS, DEVOL_LIMITE, TRANSF_LIMITE, CARRITO_CHUNK_SIZE,
         TODOS_MODOS, ORDEN_MODOS }
  from './config.js';
import { store, setSession, setTokens, setToken, setCarrito,
         setModoActual, setDevolPagina, setTransfPagina, setMovPagina,
         setUltimaVenta, setRptCache, setModalImagenData,
         setDevolTransaccionSeleccionada, clearSession, clearCarrito }
  from './store.js';
import { api } from './api.js';
import { initAuth, loginSubmit, mostrarMensajeLogin, cerrarSesion,
         restaurarBloqueoSiActivo, restaurarCarritoGuardado }
  from './auth.js';
import { hoy, horaActual, formatearBs, sonidoCaja, vibrar,
         mostrarMsg, mostrarToast, cerrarToast, toastActivo,
         limitarDecimalesInput }
  from './utils.js';
import { initUI, manejarRespuesta, renderSearchCard,
         abrirModalImagen, cerrarModalImagen, guardarImagenProducto,
         subirImagenProducto,
         confirmarEliminar, abrirModalRol, cerrarModalRol,
         abrirModalPass, cerrarModalPass, confirmarResetPass,
         abrirDetalleProducto, cerrarDetalleProducto }
  from './ui.js';
import { initNavegacion, setModo, aplicarRol, actualizarIndicador,
         setSubModoCaja, setSubModoCuentas, setSubModoDevol,
         setSubModoReportes, setSubModoTransf, setSubModoLaminas,
         setSubModoServicios, initSwipe, initPushContainer }
  from './navegacion.js';
import { initInventario, iniciarIntervalos,
         detenerIntervalos, construirAC, ejecutarBusquedaDetalle as busquedaDetalleInv }
  from './inventario.js';
import { cargarSucursalesEnDropdowns } from './sucursales.js';

// Modos
import { initVenta, buscarProductoVenta, agregarCarrito, cobrar,
         renderCarrito as renderCarritoVenta, eliminarItem,
         toggleClienteVenta, buscarClienteVenta,
         limpiarCarritoDraft, abrirEscanerVenta, cerrarEscanerVenta,
         revisarOrdenEscaner, restaurarReservasCarrito, vaciarCarrito }
  from './modos/venta.js';
import { verificarEstadoCaja, abrirCaja, registrarAporteRetiro,
         abrirDetalleCaja, cerrarDetalleCaja }
  from './modos/caja.js';
import { initArqueo, cargarArqueo, iniciarArqueo, cerrarArqueo,
         listarArqueos, verDetalleArqueo, cerrarDetalleArqueo }
  from './modos/arqueo.js';
import { initCompra, toggleClienteCompra, buscarProductoCompra, registrarCompra, abrirEscanerCompra,
         cargarProveedoresCompra, abrirProveedores, cerrarProveedores, abrirFormularioProveedor, guardarProveedor }
  from './modos/compra.js';
import { initGasto, toggleAcreedorGasto, registrarGasto }
  from './modos/gasto.js';
import { initClientes, cargarClientesModulo }
  from './modos/clientes.js';
import { initCuentasCobrar, listarCuentasCobrar, abrirFormAbonoCobrar,
         cancelarAbonoCobrar, confirmarAbonoCobrar, registrarCuentaCobrar,
         toggleMovimientoCuentaCobrar }
  from './modos/cuentas_cobrar.js';
import { initCuentasPagar, listarCuentasPagar, abrirFormAbonoPagar,
         cancelarAbonoPagar, confirmarAbonoPagar, registrarCuentaPagar }
  from './modos/cuentas_pagar.js';
import { initDevoluciones, limpiarBuscadorDevol, buscarTransaccionDevol,
         seleccionarTransaccionDevol, registrarDevolucion,
         listarDevoluciones, cambiarPaginaDevol, abrirEscanerDevol }
  from './modos/devoluciones.js';
import { initLaminas, buscarLaminas, ejecutarBusquedaLaminas,
         renderLaminaCard, cambiarEstadoLamina, agregarLamina,
         initLaminasMode }
  from './modos/laminas.js';
import { initServicios, calcTotalServ, agregarServicio, togglePagoServicio,
         buscarClienteServicio, cargarResumenServicios, eliminarServicio }
  from './modos/servicios.js';
import { initTransferencias, buscarProductoTransf, actualizarInfoTransf,
         registrarTransferencia, listarTransferencias, cambiarPaginaTransf,
         abrirEscanerTransferencia }
  from './modos/transferencias.js';
import { imprimirComprobante, listarComprobantes,
         buscarComprobante, imprimirComprobanteGuardado,
         cambiarAnchoComprobante, cambiarPaginaComp, cambiarSucursalComprobante, toggleHistorialComprobantes,
         cerrarVistaPreviaComprobante, imprimirVistaPreviaComprobante,
         compartirVistaPreviaComprobante, imprimirCotizacion, imprimirCotizacionGuardada }
  from './modos/comprobantes.js';
import { detenerEscanerCamara } from './escaner.js';
import { initRealtime } from './realtime.js';

// Módulos que no deben retrasar la primera pantalla de venta.
let adminModuloPromise = null;
let reportesModuloPromise = null;
let auditoriaModuloPromise = null;
let adminInicializado = false;
let reportesInicializado = false;
let auditoriaInicializada = false;

function precargarAdmin() {
    if (!adminModuloPromise) {
        adminModuloPromise = import('./modos/admin.js').catch(error => {
            adminModuloPromise = null;
            throw error;
        });
    }
    return adminModuloPromise;
}

async function obtenerAdmin() {
    const modulo = await precargarAdmin();
    if (!adminInicializado) {
        modulo.initAdmin({ verificarEstadoCaja });
        modulo.initAdminMode();
        adminInicializado = true;
    }
    return modulo;
}

function ejecutarAdmin(nombre) {
    return async (...args) => (await obtenerAdmin())[nombre](...args);
}

function precargarReportes() {
    if (!reportesModuloPromise) {
        reportesModuloPromise = import('./modos/reportes.js').catch(error => {
            reportesModuloPromise = null;
            throw error;
        });
    }
    return reportesModuloPromise;
}

async function obtenerReportes() {
    const modulo = await precargarReportes();
    if (!reportesInicializado) {
        modulo.initReportes();
        reportesInicializado = true;
    }
    return modulo;
}

function ejecutarReportes(nombre) {
    return async (...args) => (await obtenerReportes())[nombre](...args);
}

function precargarAuditoria() {
    if (!auditoriaModuloPromise) {
        auditoriaModuloPromise = import('./modos/auditoria.js').catch(error => {
            auditoriaModuloPromise = null;
            throw error;
        });
    }
    return auditoriaModuloPromise;
}

async function obtenerAuditoria() {
    const modulo = await precargarAuditoria();
    if (!auditoriaInicializada) {
        modulo.initAuditoria();
        auditoriaInicializada = true;
    }
    return modulo;
}

function ejecutarAuditoria(nombre) {
    return async (...args) => (await obtenerAuditoria())[nombre](...args);
}

function precargarModo(modo) {
    if (modo === "REPORTES") void precargarReportes();
    if (modo === "AUDITORIA") void precargarAuditoria();
    if (modo === "INVENTARIO" || modo === "USUARIOS") void precargarAdmin();
}

// ═══════════════════════════════════════════════════════════════
// RESTAURAR SESIÓN DESDE localStorage
// ═══════════════════════════════════════════════════════════════
const SESSION_KEY = "eruditos_session";

function restaurarSesion() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return false;
        const ses = JSON.parse(raw);
        if (!ses.token || !ses.usuario) return false;
        if (ses.expiresAt && Date.now() / 1000 > ses.expiresAt) {
            localStorage.removeItem(SESSION_KEY);
            return false;
        }
        setSession(ses.token, ses.usuario, ses.rol || "VENDEDOR", ses.sucursal || null, ses);
        if (ses.refreshToken && ses.expiresAt) {
            setTokens(ses.refreshToken, ses.expiresAt);
        }
        return true;
    } catch (e) {
        localStorage.removeItem(SESSION_KEY);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// DOBLE TOQUE ATRÁS (popstate)
// ═══════════════════════════════════════════════════════════════
let backPressTimer = null;
let exitToast = null;

function setupBackHandler() {
    window.addEventListener('popstate', function(e) {
        e.preventDefault();
        // Si hay un overlay abierto, cerrarlo en vez de salir
        var overlays = ["productoDetalleOverlay", "inventarioEditOverlay", "cajaDetalleOverlay", "imagenZoomOverlay", "escanerModal"];
        for (var i = 0; i < overlays.length; i++) {
            var ov = document.getElementById(overlays[i]);
            if (ov && ov.style.display === "flex") {
                if (ov.id === "escanerModal" && window.cerrarEscanerVenta) {
                    window.cerrarEscanerVenta();
                } else {
                    ov.style.display = "none";
                }
                history.pushState(null, null, location.href);
                return;
            }
        }
        if (backPressTimer) {
            // Segundo toque: salir
            if (exitToast) cerrarToast(exitToast);
            clearTimeout(backPressTimer);
            backPressTimer = null;
            // Intentar cerrar la app (PWA standalone)
            if (navigator.userAgent.includes('Android')) {
                try { window.history.go(-2); } catch(_) {}
            }
            mostrarMsg("👋 Hasta pronto", "ok");
            return;
        }
        backPressTimer = setTimeout(() => {
            backPressTimer = null;
        }, 1800);
        history.pushState(null, null, location.href);
        exitToast = mostrarToast("Presiona atrás nuevamente para salir", null, null, 1800);
    });

    // Poner un estado inicial para que popstate se dispare
    history.pushState(null, null, location.href);
}

// ═══════════════════════════════════════════════════════════════
// REGISTRO DE SERVICE WORKER
// ═══════════════════════════════════════════════════════════════
function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => {
                reg.update();
                console.log('[SW] Service Worker registrado:', reg.scope);
            })
            .catch(err => {
                console.warn('[SW] Error al registrar Service Worker:', err);
            });
    } catch (e) {
        console.warn('[SW] Service Worker no soportado:', e);
    }
}

// ═══════════════════════════════════════════════════════════════
// RESTAURAR CARRITO DRAFT
// ═══════════════════════════════════════════════════════════════
async function restaurarCarritoDraft(draft) {
    if (draft && draft.carrito && draft.carrito.length) {
        setCarrito(draft.carrito);
        if (draft.sucursal) {
            var sucEl = document.getElementById("sucursalVenta");
            if (sucEl) sucEl.value = draft.sucursal;
        }
        if (!await restaurarReservasCarrito(draft.carritoId)) {
            clearCarrito();
            limpiarCarritoDraft();
            renderCarritoVenta();
            return;
        }
        renderCarritoVenta();
        var carrito = store.carrito;
        mostrarToast(
            "📦 Carrito restaurado (" + carrito.length + " productos)",
            "Limpiar",
            function() { void vaciarCarrito(); }
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// INICIALIZACIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════
async function inicializarApp() {
    // ── 0. Preparar grid de secciones ANTES de cualquier setModo ──
    initPushContainer();

    // ── 0.1 Restaurar bloqueo de login si estaba activo ────────
    restaurarBloqueoSiActivo();

    // ── 1. Restaurar sesión desde localStorage ─────────────────
    const sesionRestaurada = restaurarSesion();

    // ── 2. Exponer funciones globales (para compatibilidad con HTML) ──
    // Durante la transición, ciertas funciones se referencian desde onclick="" que
    // todavía no se han eliminado. Las exponemos en window para compatibilidad.
    window.setModo = setModo;
    window.aplicarRol = aplicarRol;
    window.cerrarSesion = cerrarSesion;
    window.loginSubmit = loginSubmit;
    window.verificarEstadoCaja = verificarEstadoCaja;
    window.cargarUsuarios = ejecutarAdmin("cargarUsuarios");
    window.cargarInventarioAdmin = ejecutarAdmin("cargarInventarioAdmin");
    window.cambiarPaginaInv = ejecutarAdmin("cambiarPaginaInv");
    window.filtrarInventario = ejecutarAdmin("filtrarInventario");
    window.abrirImportacionInventario = ejecutarAdmin("abrirImportacionInventario");
    window.cerrarImportacionInventario = ejecutarAdmin("cerrarImportacionInventario");
    window.leerArchivoImportacionInventario = ejecutarAdmin("leerArchivoImportacionInventario");
    window.confirmarImportacionInventario = ejecutarAdmin("confirmarImportacionInventario");
    window.cargarResumenServicios = cargarResumenServicios;
    window.buscarProductoVenta = buscarProductoVenta;
    window.agregarCarrito = agregarCarrito;
    window.cobrar = cobrar;
    window.eliminarItem = eliminarItem;
    window.renderCarrito = renderCarritoVenta;
    window.toggleClienteVenta = toggleClienteVenta;
    window.buscarClienteVenta = buscarClienteVenta;
    window.limpiarCarritoDraft = limpiarCarritoDraft;
    window.buscarProductoCompra = buscarProductoCompra;
    window.registrarCompra = registrarCompra;
    window.toggleClienteCompra = toggleClienteCompra;
    window.cargarProveedoresCompra = cargarProveedoresCompra;
    window.abrirProveedores = abrirProveedores;
    window.cerrarProveedores = cerrarProveedores;
    window.abrirFormularioProveedor = abrirFormularioProveedor;
    window.guardarProveedor = guardarProveedor;
    window.registrarGasto = registrarGasto;
    window.toggleAcreedorGasto = toggleAcreedorGasto;
    window.abrirCaja = abrirCaja;
    window.registrarAporteRetiro = registrarAporteRetiro;
    window.abrirDetalleCaja = abrirDetalleCaja;
    window.cerrarDetalleCaja = cerrarDetalleCaja;
    window.cargarArqueo = cargarArqueo;
    window.iniciarArqueo = iniciarArqueo;
    window.cerrarArqueo = cerrarArqueo;
    window.listarArqueos = listarArqueos;
    window.verDetalleArqueo = verDetalleArqueo;
    window.cerrarDetalleArqueo = cerrarDetalleArqueo;
    window.cargarAuditoria = ejecutarAuditoria("cargarAuditoria");
    window.cambiarPaginaAuditoria = ejecutarAuditoria("cambiarPaginaAuditoria");
    window.verDetalleAuditoria = ejecutarAuditoria("verDetalleAuditoria");
    window.cerrarDetalleAuditoria = ejecutarAuditoria("cerrarDetalleAuditoria");
    window.listarCuentasCobrar = listarCuentasCobrar;
    window.abrirFormAbonoCobrar = abrirFormAbonoCobrar;
    window.cancelarAbonoCobrar = cancelarAbonoCobrar;
    window.confirmarAbonoCobrar = confirmarAbonoCobrar;
    window.registrarCuentaCobrar = registrarCuentaCobrar;
    window.toggleMovimientoCuentaCobrar = toggleMovimientoCuentaCobrar;
    window.listarCuentasPagar = listarCuentasPagar;
    window.abrirFormAbonoPagar = abrirFormAbonoPagar;
    window.cancelarAbonoPagar = cancelarAbonoPagar;
    window.confirmarAbonoPagar = confirmarAbonoPagar;
    window.registrarCuentaPagar = registrarCuentaPagar;
    window.limpiarBuscadorDevol = limpiarBuscadorDevol;
    window.buscarTransaccionDevol = buscarTransaccionDevol;
    window.seleccionarTransaccionDevol = seleccionarTransaccionDevol;
    window.registrarDevolucion = registrarDevolucion;
    window.listarDevoluciones = listarDevoluciones;
    window.cambiarPaginaDevol = cambiarPaginaDevol;
    window.buscarLaminas = buscarLaminas;
    window.ejecutarBusquedaLaminas = ejecutarBusquedaLaminas;
    window.cambiarEstadoLamina = cambiarEstadoLamina;
    window.agregarLamina = agregarLamina;
    window.calcTotalServ = calcTotalServ;
    window.agregarServicio = agregarServicio;
    window.togglePagoServicio = togglePagoServicio;
    window.buscarClienteServicio = buscarClienteServicio;
    window.eliminarServicio = eliminarServicio;
    window.buscarProductoTransf = buscarProductoTransf;
    window.actualizarInfoTransf = actualizarInfoTransf;
    window.registrarTransferencia = registrarTransferencia;
    window.listarTransferencias = listarTransferencias;
    window.cambiarPaginaTransf = cambiarPaginaTransf;
    window.abrirEscanerTransferencia = abrirEscanerTransferencia;
    window.cargarMasVendidos = ejecutarReportes("cargarMasVendidos");
    window.cargarMenosVendidos = ejecutarReportes("cargarMenosVendidos");
    window.setReporteStock = ejecutarReportes("setReporteStock");
    window.setReporteFinanciero = ejecutarReportes("setReporteFinanciero");
    window.cargarStockAlertas = ejecutarReportes("cargarStockAlertas");
    window.cargarRotacionInventario = ejecutarReportes("cargarRotacionInventario");
    window.cargarValorizacionInventario = ejecutarReportes("cargarValorizacionInventario");
    window.cargarHistorialMovimientos = ejecutarReportes("cargarHistorialMovimientos");
    window.cambiarPaginaMov = ejecutarReportes("cambiarPaginaMov");
    window.cargarVentasPeriodo = ejecutarReportes("cargarVentasPeriodo");
    window.cargarUtilidadBruta = ejecutarReportes("cargarUtilidadBruta");
    window.cargarFlujoCajaReporte = ejecutarReportes("cargarFlujoCajaReporte");
    window.cargarArqueosReporte = ejecutarReportes("cargarArqueosReporte");
    window.cargarCuentasCobrarReporte = ejecutarReportes("cargarCuentasCobrarReporte");
    window.imprimirReporteMasVendidos = ejecutarReportes("imprimirReporteMasVendidos");
    window.imprimirReporteMenosVendidos = ejecutarReportes("imprimirReporteMenosVendidos");
    window.imprimirReporteAlertas = ejecutarReportes("imprimirReporteAlertas");
    window.imprimirReporteRotacion = ejecutarReportes("imprimirReporteRotacion");
    window.imprimirReporteValorizacion = ejecutarReportes("imprimirReporteValorizacion");
    window.imprimirReporteMovimientos = ejecutarReportes("imprimirReporteMovimientos");
    window.imprimirReporteVentas = ejecutarReportes("imprimirReporteVentas");
    window.imprimirReporteUtilidad = ejecutarReportes("imprimirReporteUtilidad");
    window.imprimirReporteFlujo = ejecutarReportes("imprimirReporteFlujo");
    window.imprimirReporteCobrar = ejecutarReportes("imprimirReporteCobrar");
    window.imprimirComprobante = imprimirComprobante;
    window.imprimirCotizacion = imprimirCotizacion;
    window.imprimirCotizacionGuardada = imprimirCotizacionGuardada;
    window.listarComprobantes = listarComprobantes;
    window.buscarComprobante = buscarComprobante;
    window.imprimirComprobanteGuardado = imprimirComprobanteGuardado;
    window.cambiarAnchoComprobante = cambiarAnchoComprobante;
    window.toggleHistorialComprobantes = toggleHistorialComprobantes;
    window.cambiarPaginaComp = cambiarPaginaComp;
    window.cambiarSucursalComprobante = cambiarSucursalComprobante;
    window.cerrarVistaPreviaComprobante = cerrarVistaPreviaComprobante;
    window.imprimirVistaPreviaComprobante = imprimirVistaPreviaComprobante;
    window.compartirVistaPreviaComprobante = compartirVistaPreviaComprobante;
    window.buscarProductoDetalle = ejecutarAdmin("buscarProductoDetalle");
    window.ejecutarBusquedaDetalle = ejecutarAdmin("ejecutarBusquedaDetalle");
    window.crearUsuario = ejecutarAdmin("crearUsuario");
    window.crearSucursal = ejecutarAdmin("crearSucursal");
    window.abrirDetalleSucursal = ejecutarAdmin("abrirDetalleSucursal");
    window.cerrarDetalleSucursal = ejecutarAdmin("cerrarDetalleSucursal");
    window.editarSucursal = ejecutarAdmin("editarSucursal");
    window.guardarSucursal = ejecutarAdmin("guardarSucursal");
    window.abrirEscanerVenta = abrirEscanerVenta;
    window.cerrarEscanerVenta = cerrarEscanerVenta;
    window.revisarOrdenEscaner = revisarOrdenEscaner;
    window.abrirEscanerDevol = abrirEscanerDevol;
    window.abrirEscanerCompra = abrirEscanerCompra;
    window.detenerEscanerCamara = detenerEscanerCamara;
    window.abrirCambiarSucursal = ejecutarAdmin("abrirCambiarSucursal");
    window.cerrarCambiarSucursal = ejecutarAdmin("cerrarCambiarSucursal");
    window.confirmarCambiarSucursal = ejecutarAdmin("confirmarCambiarSucursal");
    window.abrirEscanerInventarioEdit = ejecutarAdmin("abrirEscanerInventarioEdit");
    window.confirmarCambioRol = ejecutarAdmin("confirmarCambioRol");
    window.toggleEstadoUsuario = ejecutarAdmin("toggleEstadoUsuario");
    window.abrirEditarProducto = ejecutarAdmin("abrirEditarProducto");
    window.cerrarEditarProducto = ejecutarAdmin("cerrarEditarProducto");
    window.guardarEdicionProducto = ejecutarAdmin("guardarEdicionProducto");
    window.abrirAjusteInventario = ejecutarAdmin("abrirAjusteInventario");
    window.cerrarAjusteInventario = ejecutarAdmin("cerrarAjusteInventario");
    window.confirmarAjusteInventario = ejecutarAdmin("confirmarAjusteInventario");
    window.abrirHistorialInventario = ejecutarAdmin("abrirHistorialInventario");
    window.cerrarHistorialInventario = ejecutarAdmin("cerrarHistorialInventario");
    window.abrirZoomImagen = ejecutarAdmin("abrirZoomImagen");
    window.cerrarZoomImagen = ejecutarAdmin("cerrarZoomImagen");
    window.confirmarEliminar = confirmarEliminar;
    window.abrirModalImagen = abrirModalImagen;
    window.cerrarModalImagen = cerrarModalImagen;
    window.guardarImagenProducto = guardarImagenProducto;
    window.subirImagenProducto = subirImagenProducto;
    window.abrirModalRol = abrirModalRol;
    window.cerrarModalRol = cerrarModalRol;
    window.abrirModalPass = abrirModalPass;
    window.cerrarModalPass = cerrarModalPass;
    window.confirmarResetPass = confirmarResetPass;
    window.abrirDetalleProducto = abrirDetalleProducto;
    window.cerrarDetalleProducto = cerrarDetalleProducto;
    window.mostrarToast = mostrarToast;
    window.cerrarToast = cerrarToast;
    window.mostrarMsg = mostrarMsg;

    // ── 3. Configurar callbacks entre módulos ──────────────────
    // Inyectar dependencias en auth (callback Hell resuelto)
    initAuth({
        aplicarRol,
        verificarEstadoCaja,
        toggleClienteVenta,
        restaurarCarritoDraft,
        vaciarCarrito,
        limpiarCarritoDraft,
        initRealtime,
    });

    // Inyectar dependencias en navegacion
    initNavegacion({
        verificarEstadoCaja,
        cargarUsuarios: ejecutarAdmin("cargarUsuarios"),
        cargarResumenServicios,
        setReporteStock: ejecutarReportes("setReporteStock"),
        setReporteFinanciero: ejecutarReportes("setReporteFinanciero"),
        cargarClientesModulo,
        listarCuentasCobrar,
        cargarArqueo,
        cargarAuditoria: ejecutarAuditoria("cargarAuditoria"),
        precargarModo,
        prepararCompra: function() {
            toggleClienteCompra();
            cargarProveedoresCompra();
        },
        prepararGasto: toggleAcreedorGasto,
    });

    // Inyectar dependencias en inventario
    initInventario({
        cargarUsuarios: ejecutarAdmin("cargarUsuarios"),
    });

    // Inyectar dependencias en UI
    initUI({
        cargarInventarioAdmin: ejecutarAdmin("cargarInventarioAdmin"),
    });

    // ── 4. Inicializar cada modo ───────────────────────────────
    const verif = verificarEstadoCaja;
    initVenta({ verificarEstadoCaja: verif });
    initCompra({ verificarEstadoCaja: verif });
    initGasto({ verificarEstadoCaja: verif });
    initArqueo({ verificarEstadoCaja: verif });
    initClientes();
    initCuentasCobrar({ verificarEstadoCaja: verif });
    initCuentasPagar({ verificarEstadoCaja: verif });
    initDevoluciones({ verificarEstadoCaja: verif });
    initTransferencias({ verificarEstadoCaja: verif });
    initLaminas({ verificarEstadoCaja: verif });
    initServicios({ verificarEstadoCaja: verif });
    initLaminasMode();

    ["costoCompra", "precioVentaCompra", "inventarioEditPrecioVenta", "devolPrecio", "efectivoRecibidoVenta", "montoEfectivoMixtoVenta", "montoTransferenciaMixtoVenta", "srvMontoEfectivo", "srvMontoTransferencia"]
        .forEach(id => limitarDecimalesInput(document.getElementById(id)));

    const metodoPago = document.getElementById("metodoPagoVenta");
    if (metodoPago && !metodoPago._efectivoBound) {
        metodoPago._efectivoBound = true;
        metodoPago.addEventListener("change", () => {
            if (window._actualizarVisibilidadEfectivo) window._actualizarVisibilidadEfectivo();
            toggleClienteVenta();
        });
    }

    // ── 5. Configurar doble toque atrás ────────────────────────
    setupBackHandler();
    initSwipe();

    // ── 6. Registrar Service Worker ────────────────────────────
    registrarServiceWorker();

    // ── 7. Una sesión persistida nunca es fuente de permisos. Antes de
    // mostrar la aplicación, reconstruir el contexto desde el backend.
    let sesionValidada = false;
    if (sesionRestaurada) {
        try {
            const contexto = await api({
                ACCION: "OBTENER_CONTEXTO_USUARIO",
                TOKEN: store.sessionToken,
            });
            if (contexto.ok) {
                setSession(
                    store.sessionToken,
                    contexto.usuario,
                    (contexto.rol || "").toUpperCase(),
                    contexto.sucursal || null,
                    contexto,
                );
                sesionValidada = true;
            } else {
                clearSession();
            }
        } catch (_) {
            // Ante una validación fallida no se reutilizan permisos en caché.
            clearSession();
        }
    }
    togglePagoServicio();

    if (sesionValidada) {
        const rol = store.sessionRol || "VENDEDOR";
        document.getElementById("badgeUser").textContent = store.sessionUser;
        const pill = document.getElementById("badgeRol");
        pill.textContent = rol;
        pill.className = "rol-pill rol-" + rol;
        document.getElementById("loginScreen").classList.add("oculto");
        document.getElementById("appScreen").classList.remove("oculto");

        // Fechas por defecto
        const fh = hoy();
        ["gastoFecha", "aporteFecha", "abonarCobrarFecha",
         "abonarPagarFecha", "fechaCompra", "repFechaHasta"]
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = fh;
            });
        const desde = document.getElementById("repFechaDesde");
        if (desde) desde.value = fh.slice(0, 7) + "-01";
        const srv = document.getElementById("srvResumenFecha");
        if (srv) srv.value = fh;

        // Aplicar rol y cargar datos iniciales
        aplicarRol(rol);
        toggleClienteVenta();
        verificarEstadoCaja();
        cargarSucursalesEnDropdowns();
        restaurarCarritoGuardado();

        // Intervalo de caja + suscripcion realtime al inventario
        iniciarIntervalos(verificarEstadoCaja);
        initRealtime();
    }

    // ── 8. Iniciar la navegación ──────────────────────────────
    // (aplicarRol ya llama a setModo con el modo inicial)

    console.log('[MAIN] Aplicación inicializada correctamente.');
    console.log('[MAIN] Sesión restaurada y validada:', sesionValidada);
    console.log('[MAIN] Modo actual:', store.modoActual);
}

// ═══════════════════════════════════════════════════════════════
// ARRANQUE
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', inicializarApp);
