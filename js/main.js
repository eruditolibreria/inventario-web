/* ═══════════════════════════════════════════════════════════════
   GRUPO ERUDITOS · Sistema de Inventario
   js/main.js – Punto de entrada unificado (Fase 5)
   ═══════════════════════════════════════════════════════════════ */

// Módulos base
import { baseURL, DEVOL_LIMITE, TRANSF_LIMITE, CARRITO_CHUNK_SIZE,
         CARRITO_KEY, TODOS_MODOS, ORDEN_MODOS, PERMISOS, PERMISOS_DEFAULT }
  from './config.js';
import { store, setSession, setTokens, setToken, setInventario, setCarrito,
         setModoActual, setDevolPagina, setTransfPagina, setMovPagina,
         setUltimaVenta, setRptCache, setModalImagenData,
         setDevolTransaccionSeleccionada, clearSession, clearCarrito }
  from './store.js';
import { api } from './api.js';
import { initAuth, loginSubmit, mostrarMensajeLogin, cerrarSesion }
  from './auth.js';
import { hoy, horaActual, formatearBs, sonidoCaja, vibrar,
         mostrarMsg, mostrarToast, cerrarToast, toastActivo }
  from './utils.js';
import { initUI, manejarRespuesta, renderSearchCard,
         abrirModalImagen, cerrarModalImagen, guardarImagenProducto,
         confirmarEliminar, abrirModalRol, cerrarModalRol,
         abrirModalPass, cerrarModalPass, confirmarResetPass,
         abrirDetalleProducto, cerrarDetalleProducto }
  from './ui.js';
import { initNavegacion, setModo, aplicarRol, actualizarIndicador,
         setSubModoCaja, setSubModoCuentas, setSubModoDevol,
         setSubModoReportes, setSubModoTransf, setSubModoLaminas,
         setSubModoServicios, initSwipe, initPushContainer }
  from './navegacion.js';
import { initInventario, cargarInventario, iniciarIntervalos,
         detenerIntervalos, construirAC, ejecutarBusquedaDetalle as busquedaDetalleInv }
  from './inventario.js';

// Modos
import { initVenta, buscarProductoVenta, agregarCarrito, cobrar,
         renderCarrito as renderCarritoVenta, eliminarItem,
         toggleClienteVenta, limpiarCarritoDraft }
  from './modos/venta.js';
import { verificarEstadoCaja, abrirCaja, cerrarCaja, registrarAporteRetiro,
         abrirDetalleCaja, cerrarDetalleCaja }
  from './modos/caja.js';
import { initCompra, toggleClienteCompra, buscarProductoCompra, registrarCompra }
  from './modos/compra.js';
import { initGasto, toggleAcreedorGasto, registrarGasto }
  from './modos/gasto.js';
import { initCuentasCobrar, listarCuentasCobrar, abrirFormAbonoCobrar,
         confirmarAbonoCobrar, registrarCuentaCobrar }
  from './modos/cuentas_cobrar.js';
import { initCuentasPagar, listarCuentasPagar, abrirFormAbonoPagar,
         confirmarAbonoPagar, registrarCuentaPagar }
  from './modos/cuentas_pagar.js';
import { initDevoluciones, limpiarBuscadorDevol, buscarTransaccionDevol,
         seleccionarTransaccionDevol, registrarDevolucion,
         listarDevoluciones, cambiarPaginaDevol }
  from './modos/devoluciones.js';
import { initLaminas, buscarLaminas, ejecutarBusquedaLaminas,
         renderLaminaCard, cambiarEstadoLamina, agregarLamina,
         initLaminasMode }
  from './modos/laminas.js';
import { initServicios, calcTotalServ, agregarServicio,
         cargarResumenServicios, eliminarServicio }
  from './modos/servicios.js';
import { initTransferencias, buscarProductoTransf, actualizarInfoTransf,
         registrarTransferencia, listarTransferencias, cambiarPaginaTransf }
  from './modos/transferencias.js';
import { initReportes, _formatearBs as frmBs, obtenerFiltrosReporte,
         renderTablaReporte, cargarMasVendidos, cargarMenosVendidos,
         setReporteStock, setReporteFinanciero, cargarStockAlertas,
         cargarRotacionInventario, cargarValorizacionInventario,
         cargarHistorialMovimientos, cambiarPaginaMov,
         cargarVentasPeriodo, cargarUtilidadBruta,
         cargarFlujoCajaReporte, cargarCuentasCobrarReporte,
         imprimirReporte, imprimirReporteAlertas, imprimirReporteRotacion,
         imprimirReporteValorizacion, imprimirReporteMovimientos,
         imprimirReporteVentas, imprimirReporteUtilidad,
         imprimirReporteFlujo, imprimirReporteCobrar,
         imprimirReporteMasVendidos, imprimirReporteMenosVendidos,
         imprimirComprobante }
  from './modos/reportes.js';
import { initAdmin, buscarProductoDetalle, ejecutarBusquedaDetalle,
         cargarInventarioAdmin, cargarUsuarios,
         crearUsuario, confirmarCambioRol, toggleEstadoUsuario,
         initAdminMode, abrirEditarProducto, cerrarEditarProducto,
         guardarEdicionProducto, abrirZoomImagen, cerrarZoomImagen }
  from './modos/admin.js';

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
        setSession(ses.token, ses.usuario, ses.rol || "VENDEDOR");
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
        var overlays = ["productoDetalleOverlay", "inventarioEditOverlay", "cajaDetalleOverlay", "imagenZoomOverlay"];
        for (var i = 0; i < overlays.length; i++) {
            var ov = document.getElementById(overlays[i]);
            if (ov && ov.style.display === "flex") {
                ov.style.display = "none";
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
function restaurarCarritoDraft(draft) {
    if (draft && draft.carrito && draft.carrito.length) {
        setCarrito(draft.carrito);
        if (draft.sucursal) {
            var sucEl = document.getElementById("sucursalVenta");
            if (sucEl) sucEl.value = draft.sucursal;
        }
        renderCarritoVenta();
        var carrito = store.carrito;
        mostrarToast(
            "📦 Carrito restaurado (" + carrito.length + " productos)",
            "Limpiar",
            function() { clearCarrito(); limpiarCarritoDraft(); renderCarritoVenta(); }
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// INICIALIZACIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════
function inicializarApp() {
    // ── 0. Preparar grid de secciones ANTES de cualquier setModo ──
    initPushContainer();

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
    window.cargarInventario = cargarInventario;
    window.cargarUsuarios = cargarUsuarios;
    window.cargarInventarioAdmin = cargarInventarioAdmin;
    window.cargarResumenServicios = cargarResumenServicios;
    window.buscarProductoVenta = buscarProductoVenta;
    window.agregarCarrito = agregarCarrito;
    window.cobrar = cobrar;
    window.eliminarItem = eliminarItem;
    window.renderCarrito = renderCarritoVenta;
    window.toggleClienteVenta = toggleClienteVenta;
    window.limpiarCarritoDraft = limpiarCarritoDraft;
    window.buscarProductoCompra = buscarProductoCompra;
    window.registrarCompra = registrarCompra;
    window.toggleClienteCompra = toggleClienteCompra;
    window.registrarGasto = registrarGasto;
    window.toggleAcreedorGasto = toggleAcreedorGasto;
    window.abrirCaja = abrirCaja;
    window.cerrarCaja = cerrarCaja;
    window.registrarAporteRetiro = registrarAporteRetiro;
    window.abrirDetalleCaja = abrirDetalleCaja;
    window.cerrarDetalleCaja = cerrarDetalleCaja;
    window.listarCuentasCobrar = listarCuentasCobrar;
    window.abrirFormAbonoCobrar = abrirFormAbonoCobrar;
    window.confirmarAbonoCobrar = confirmarAbonoCobrar;
    window.registrarCuentaCobrar = registrarCuentaCobrar;
    window.listarCuentasPagar = listarCuentasPagar;
    window.abrirFormAbonoPagar = abrirFormAbonoPagar;
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
    window.eliminarServicio = eliminarServicio;
    window.buscarProductoTransf = buscarProductoTransf;
    window.actualizarInfoTransf = actualizarInfoTransf;
    window.registrarTransferencia = registrarTransferencia;
    window.listarTransferencias = listarTransferencias;
    window.cambiarPaginaTransf = cambiarPaginaTransf;
    window.cargarMasVendidos = cargarMasVendidos;
    window.cargarMenosVendidos = cargarMenosVendidos;
    window.setReporteStock = setReporteStock;
    window.setReporteFinanciero = setReporteFinanciero;
    window.cargarStockAlertas = cargarStockAlertas;
    window.cargarRotacionInventario = cargarRotacionInventario;
    window.cargarValorizacionInventario = cargarValorizacionInventario;
    window.cargarHistorialMovimientos = cargarHistorialMovimientos;
    window.cambiarPaginaMov = cambiarPaginaMov;
    window.cargarVentasPeriodo = cargarVentasPeriodo;
    window.cargarUtilidadBruta = cargarUtilidadBruta;
    window.cargarFlujoCajaReporte = cargarFlujoCajaReporte;
    window.cargarCuentasCobrarReporte = cargarCuentasCobrarReporte;
    window.imprimirReporteMasVendidos = imprimirReporteMasVendidos;
    window.imprimirReporteMenosVendidos = imprimirReporteMenosVendidos;
    window.imprimirReporteAlertas = imprimirReporteAlertas;
    window.imprimirReporteRotacion = imprimirReporteRotacion;
    window.imprimirReporteValorizacion = imprimirReporteValorizacion;
    window.imprimirReporteMovimientos = imprimirReporteMovimientos;
    window.imprimirReporteVentas = imprimirReporteVentas;
    window.imprimirReporteUtilidad = imprimirReporteUtilidad;
    window.imprimirReporteFlujo = imprimirReporteFlujo;
    window.imprimirReporteCobrar = imprimirReporteCobrar;
    window.imprimirComprobante = imprimirComprobante;
    window.buscarProductoDetalle = buscarProductoDetalle;
    window.ejecutarBusquedaDetalle = ejecutarBusquedaDetalle;
    window.crearUsuario = crearUsuario;
    window.confirmarCambioRol = confirmarCambioRol;
    window.toggleEstadoUsuario = toggleEstadoUsuario;
    window.abrirEditarProducto = abrirEditarProducto;
    window.cerrarEditarProducto = cerrarEditarProducto;
    window.guardarEdicionProducto = guardarEdicionProducto;
    window.abrirZoomImagen = abrirZoomImagen;
    window.cerrarZoomImagen = cerrarZoomImagen;
    window.confirmarEliminar = confirmarEliminar;
    window.abrirModalImagen = abrirModalImagen;
    window.cerrarModalImagen = cerrarModalImagen;
    window.guardarImagenProducto = guardarImagenProducto;
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
        cargarInventario,
        verificarEstadoCaja,
        toggleClienteVenta,
        toggleClienteCompra,
        toggleAcreedorGasto,
        restaurarCarritoDraft,
    });

    // Inyectar dependencias en navegacion
    initNavegacion({
        verificarEstadoCaja,
        cargarUsuarios,
        cargarResumenServicios,
        setReporteStock,
        setReporteFinanciero,
    });

    // Inyectar dependencias en inventario
    initInventario({
        cargarUsuarios,
    });

    // Inyectar dependencias en UI
    initUI({
        cargarInventarioAdmin,
    });

    // ── 4. Inicializar cada modo ───────────────────────────────
    const verif = verificarEstadoCaja;
    initVenta({ verificarEstadoCaja: verif });
    initCompra({ verificarEstadoCaja: verif });
    initGasto({ verificarEstadoCaja: verif });
    initCuentasCobrar({ verificarEstadoCaja: verif });
    initCuentasPagar({ verificarEstadoCaja: verif });
    initDevoluciones({ verificarEstadoCaja: verif });
    initTransferencias({ verificarEstadoCaja: verif });
    initAdmin({ verificarEstadoCaja: verif });
    initLaminas({ verificarEstadoCaja: verif });
    initServicios({ verificarEstadoCaja: verif });
    initReportes();
    initAdminMode();
    initLaminasMode();

    // ── 5. Configurar doble toque atrás ────────────────────────
    setupBackHandler();
    initSwipe();

    // ── 6. Registrar Service Worker ────────────────────────────
    registrarServiceWorker();

    // ── 7. Si hay sesión restaurada, mostrar UI inmediatamente ─
    if (sesionRestaurada) {
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
        cargarInventario();
        verificarEstadoCaja();

        // Activar intervalos de refresco
        iniciarIntervalos(verificarEstadoCaja);
    }

    // ── 8. Iniciar la navegación ──────────────────────────────
    // (aplicarRol ya llama a setModo con el modo inicial)

    console.log('[MAIN] Aplicación inicializada correctamente.');
    console.log('[MAIN] Sesión restaurada:', sesionRestaurada);
    console.log('[MAIN] Modo actual:', store.modoActual);
}

// ═══════════════════════════════════════════════════════════════
// ARRANQUE
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', inicializarApp);
