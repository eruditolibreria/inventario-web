/* === MODO VENTA: Busqueda, carrito, cobro y gestion de clientes === */

/*
 * Funciones del modulo de ventas: autocompletado de productos,
 * gestion del carrito (agregar, eliminar, renderizar), cobro POS
 * con chunking para carritos grandes, y toggle de cliente credito.
 *
 * Dependencias directas (ya modulos):
 *   - ../config.js       (CARRITO_KEY, CARRITO_CHUNK_SIZE)
 *   - ../store.js        (store, setCarrito, clearCarrito, setUltimaVenta)
 *   - ../api.js          (api)
 *   - ../utils.js        (mostrarMsg, mostrarToast, vibrar, sonidoCaja)
 *   - ../ui.js           (manejarRespuesta)
 *   - ../inventario.js   (construirAC, cargarInventario)
 *
 * Dependencias inyectadas via initVenta() (modos futuros o navegacion):
 *   - verificarEstadoCaja()
 *
 * Uso:
 *   import { initVenta, buscarProductoVenta, agregarCarrito, cobrar } from './modos/venta.js';
 *   initVenta({ verificarEstadoCaja });
 */

import { CARRITO_KEY, claveCarritoDraft } from '../config.js';
import { store, setCarrito, clearCarrito, setUltimaVenta } from '../store.js';
import { api } from '../api.js';
import { enviarCobroSeguro } from '../cobro.js';
import { mostrarMsg, mostrarToast, vibrar, sonidoCaja, normBusqueda, formatearBs, debounce, hoy, horaActual } from '../utils.js';
import { manejarRespuesta } from '../ui.js';
import { can } from '../authorization.js';
import { construirAC } from '../inventario.js';
import { buscarSugerenciasVenta, buscarProductoPorNombre } from '../db.js';
import { iniciarEscanerCamara, iniciarEscanerContinuo, detenerEscanerCamara, buscarPorCodigo, onInputScanner, CODIGO_REGEX } from '../escaner.js';
import { listarComprobantes } from './comprobantes.js';

function _guardarCarritoDraft() {
    try {
        const clave = claveCarritoDraft(store.sessionUsuarioId);
        if (!clave) return;
        if (!store.carrito.length) {
            localStorage.removeItem(clave);
            return;
        }
        localStorage.setItem(clave, JSON.stringify({
            usuarioId: store.sessionUsuarioId,
            carrito: store.carrito,
            sucursal: document.getElementById("sucursalVenta")?.value || "",
            carritoId: _idCarrito(),
            ts: Date.now()
        }));
    } catch(e) {}
}

// ── CALLBACKS ─────────────────────────────────────────────────
let _verificarEstadoCaja = null;
let _clientesVenta = [];
let _clienteVentaSeleccionado = null;
let _clienteVentaTimer = null;
let _escanerVentaMovilActivo = false;
let _cobroEnCurso = false;
let _carritoId = "";
let _cotizacionesReqSeq = 0;
let _cotizacionDetalleReqSeq = 0;
let _cotizacionEnVenta = null;

// Para administradores la sucursal seleccionada en ventas tiene prioridad.
// En otros roles el selector ya queda bloqueado en la sucursal de la sesion.
function sucursalVentaActual() {
    return document.getElementById("sucursalVenta")?.value || store.sessionSucursal || "";
}

function _calcularDescuentoVenta() {
    const subtotal = store.carrito.reduce((s, item) => s + Number(item.total || 0), 0);
    const tipo = document.getElementById("tipoDescuentoVenta")?.value || "PORCENTAJE";
    const raw = document.getElementById("valorDescuentoVenta")?.value || "";
    if (raw === "") return { subtotal, tipo, valor: 0, monto: 0, valido: true };
    const valor = Number(raw);
    if (!Number.isFinite(valor) || valor < 0) return { subtotal, tipo, valor, monto: 0, valido: false };
    const monto = tipo === "PORCENTAJE" ? subtotal * valor / 100 : valor;
    return { subtotal, tipo, valor, monto: Number(monto.toFixed(2)), valido: tipo !== "PORCENTAJE" || valor <= 100 };
}

function _actualizarResumenVenta() {
    const d = _calcularDescuentoVenta();
    const totalSinRedondeo = Math.max(0, d.subtotal - d.monto);
    const esEfectivo = document.getElementById("metodoPagoVenta")?.value === "EFECTIVO";
    const total = esEfectivo ? Math.round(totalSinRedondeo * 10) / 10 : totalSinRedondeo;
    const ajusteRedondeo = Number((total - totalSinRedondeo).toFixed(2));
    const sub = document.getElementById("subtotalVenta");
    const desc = document.getElementById("descuentoVenta");
    const redondeo = document.getElementById("redondeoVenta");
    const totalEl = document.getElementById("totalVenta");
    if (sub) sub.textContent = "Bs " + d.subtotal.toFixed(2);
    if (desc) desc.textContent = "− Bs " + d.monto.toFixed(2);
    if (redondeo) {
        redondeo.hidden = ajusteRedondeo === 0;
        redondeo.textContent = "Redondeo " + (ajusteRedondeo > 0 ? "+ " : "− ") + "Bs " + Math.abs(ajusteRedondeo).toFixed(2);
    }
    if (totalEl) totalEl.textContent = "Bs " + total.toFixed(2);
    return { ...d, totalSinRedondeo, total, ajusteRedondeo };
}

export function actualizarDescuentoVenta() {
    _actualizarResumenVenta();
    _actualizarVisibilidadEfectivo();
}

function _limpiarDescuentoVenta() {
    const valor = document.getElementById("valorDescuentoVenta");
    const motivo = document.getElementById("motivoDescuentoVenta");
    const tipo = document.getElementById("tipoDescuentoVenta");
    if (valor) valor.value = "";
    if (motivo) motivo.value = "";
    if (tipo) tipo.value = "PORCENTAJE";
}

function _limpiarCotizacionEnVenta() {
    _cotizacionEnVenta = null;
    ["tipoDescuentoVenta", "valorDescuentoVenta", "motivoDescuentoVenta"].forEach(id => {
        const control = document.getElementById(id);
        if (control) control.disabled = false;
    });
}

function _aplicarDescuentoCotizado(cotizacion) {
    const tipo = document.getElementById("tipoDescuentoVenta");
    const valor = document.getElementById("valorDescuentoVenta");
    const motivo = document.getElementById("motivoDescuentoVenta");
    if (tipo) { tipo.value = cotizacion.descuentoTipo || "PORCENTAJE"; tipo.disabled = true; }
    if (valor) { valor.value = Number(cotizacion.descuentoValor || 0) > 0 ? String(cotizacion.descuentoValor) : ""; valor.disabled = true; }
    if (motivo) { motivo.value = cotizacion.descuentoMotivo || ""; motivo.disabled = true; }
}

function _carritoCotizadoBloqueado() {
    if (!_cotizacionEnVenta) return false;
    mostrarMsg("Esta venta usa el precio cotizado. Recalcula la cotización antes de modificar sus productos.", "err");
    return true;
}

function _nuevaClaveIdempotencia() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.floor(Math.random() * 16);
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

function _idCarrito() {
    if (!_carritoId) _carritoId = _nuevaClaveIdempotencia();
    return _carritoId;
}

function _mensajeReserva(error) {
    if (String(error || "").includes("STOCK_RESERVADO_INSUFICIENTE")) {
        return "Stock insuficiente: hay unidades reservadas en otro carrito";
    }
    return "No se pudo actualizar la reserva de stock";
}

let _cambioCarritoEnCurso = false;

async function _ejecutarCambioCarrito(cambio) {
    if (_cambioCarritoEnCurso || _cobroEnCurso) {
        mostrarMsg("Espera a que termine la operación del carrito", "err");
        return false;
    }
    _cambioCarritoEnCurso = true;
    const panel = document.getElementById("carritoBody");
    panel?.setAttribute("aria-busy", "true");
    try {
        return await cambio();
    } finally {
        _cambioCarritoEnCurso = false;
        panel?.removeAttribute("aria-busy");
    }
}

async function _ajustarReserva(item, delta) {
    const data = await api({
        ACCION: "RESERVAR_STOCK",
        CARRITO_ID: _idCarrito(),
        PRODUCTO: item.producto,
        SUCURSAL: item.sucursal,
        DELTA: delta,
        TOKEN: store.sessionToken
    });
    if (!data?.ok) throw new Error(data?.error || "RESERVA_NO_REGISTRADA");
    return data;
}

export async function restaurarReservasCarrito(carritoId) {
    return _ejecutarCambioCarrito(() => _restaurarReservasCarrito(carritoId));
}

async function _restaurarReservasCarrito(carritoId) {
    if (carritoId) {
        _carritoId = String(carritoId);
        return true;
    }
    _carritoId = _nuevaClaveIdempotencia();
    try {
        for (const item of store.carrito) await _ajustarReserva(item, item.cantidad);
        return true;
    } catch (error) {
        try {
            await api({ ACCION: "LIBERAR_RESERVAS_CARRITO", CARRITO_ID: _carritoId, TOKEN: store.sessionToken });
        } catch (_) {}
        _carritoId = "";
        mostrarMsg(_mensajeReserva(error.message), "err");
        return false;
    }
}

export async function vaciarCarrito() {
    return _ejecutarCambioCarrito(() => _vaciarCarrito());
}

async function _vaciarCarrito() {
    const carritoId = _carritoId;
    if (carritoId && store.sessionToken) {
        try {
            const data = await api({ ACCION: "LIBERAR_RESERVAS_CARRITO", CARRITO_ID: carritoId, TOKEN: store.sessionToken });
            if (!data?.ok) throw new Error(data?.error || "RESERVA_NO_LIBERADA");
        } catch (error) {
            mostrarMsg(_mensajeReserva(error.message), "err");
            return false;
        }
    }
    clearCarrito();
    _carritoId = "";
    const eraCotizacion = Boolean(_cotizacionEnVenta);
    _limpiarCotizacionEnVenta();
    if (eraCotizacion) _limpiarDescuentoVenta();
    limpiarCarritoDraft();
    renderCarrito();
    return true;
}

function _sincronizarSucursalCotizacion() {
    const selector = document.getElementById("sucursalCotizacion");
    const selectorVenta = document.getElementById("sucursalVenta");
    if (!selector || !selectorVenta || !selectorVenta.options.length) return;
    const seleccionada = selector.value;
    const opciones = Array.from(selectorVenta.options).map(opcion => new Option(opcion.textContent || "", opcion.value));
    selector.replaceChildren(...opciones);
    if (selector.options[0]?.value === "") selector.options[0].textContent = "Todas las sucursales";
    if (Array.from(selector.options).some(opcion => opcion.value === seleccionada)) selector.value = seleccionada;
    selector.disabled = selectorVenta.disabled;
}

function _valorDetalleCotizacion(valor, alternativo = "—") {
    const texto = String(valor ?? "").trim();
    return texto || alternativo;
}

function _crearDatoDetalleCotizacion(etiqueta, valor) {
    const dato = document.createElement("div");
    dato.className = "cotizacion-detalle-dato";
    const nombre = document.createElement("span");
    nombre.textContent = etiqueta;
    const contenido = document.createElement("strong");
    contenido.textContent = _valorDetalleCotizacion(valor);
    dato.append(nombre, contenido);
    return dato;
}

function _mostrarDetalleCotizacion(cotizacion, cargando = false, error = "") {
    const titulo = document.getElementById("cotizacionDetalleTitulo");
    const contenido = document.getElementById("cotizacionDetalleContenido");
    if (!titulo || !contenido) return;

    const referencia = _valorDetalleCotizacion(cotizacion?.codigo || cotizacion?.numero, "");
    titulo.textContent = referencia ? `Cotización ${referencia}` : "Detalle de cotización";

    const resumen = document.createElement("div");
    resumen.className = "cotizacion-detalle-resumen";
    resumen.append(
        _crearDatoDetalleCotizacion("Cliente", cotizacion?.cliente || "MOSTRADOR"),
        _crearDatoDetalleCotizacion("Sucursal", cotizacion?.sucursal),
        _crearDatoDetalleCotizacion("Vence", cotizacion?.vigenciaHasta || cotizacion?.vigencia_hasta)
    );

    const subtitulo = document.createElement("div");
    subtitulo.className = "cotizacion-detalle-subtitulo";
    subtitulo.textContent = "Productos cotizados";

    const productos = document.createElement("div");
    productos.className = "cotizacion-detalle-productos";
    if (cargando) {
        const estado = document.createElement("div");
        estado.className = "cotizacion-detalle-estado";
        estado.textContent = "Cargando productos…";
        productos.appendChild(estado);
    } else if (error) {
        const estado = document.createElement("div");
        estado.className = "cotizacion-detalle-estado";
        estado.textContent = error;
        productos.appendChild(estado);
    } else {
        const items = Array.isArray(cotizacion?.items) ? cotizacion.items : [];
        if (!items.length) {
            const estado = document.createElement("div");
            estado.className = "cotizacion-detalle-estado";
            estado.textContent = "Esta cotización no tiene productos.";
            productos.appendChild(estado);
        } else {
            items.forEach(item => {
                const cantidad = Number(item.cantidad || 0);
                const precio = Number(item.precioUnitario ?? item.precio ?? 0);
                const subtotal = Number(item.total ?? cantidad * precio);
                const fila = document.createElement("div");
                fila.className = "cotizacion-detalle-producto";
                const descripcion = document.createElement("div");
                const nombre = document.createElement("strong");
                nombre.textContent = _valorDetalleCotizacion(item.producto || item.nombre || item.nombreProducto, "Producto sin nombre");
                const detalle = document.createElement("small");
                detalle.textContent = `${cantidad} × ${formatearBs(Number.isFinite(precio) ? precio : 0)}`;
                descripcion.append(nombre, detalle);
                const importe = document.createElement("div");
                importe.className = "cotizacion-detalle-producto-total";
                importe.textContent = formatearBs(Number.isFinite(subtotal) ? subtotal : 0);
                fila.append(descripcion, importe);
                productos.appendChild(fila);
            });
        }
    }
    contenido.replaceChildren(resumen, subtitulo, productos);
}

export async function abrirDetalleCotizacion(cotizacion) {
    const overlay = document.getElementById("cotizacionDetalleOverlay");
    if (!overlay || !cotizacion) return;
    const solicitud = ++_cotizacionDetalleReqSeq;
    overlay.style.display = "flex";
    _mostrarDetalleCotizacion(cotizacion, true);
    try {
        const data = await api({ ACCION: "OBTENER_COTIZACION", ID: cotizacion.id, TOKEN: store.sessionToken });
        if (solicitud !== _cotizacionDetalleReqSeq || overlay.style.display === "none") return;
        if (!manejarRespuesta(data) || !data.ok || !data.cotizacion) {
            _mostrarDetalleCotizacion(cotizacion, false, data?.error || "No se pudieron cargar los productos.");
            return;
        }
        _mostrarDetalleCotizacion(data.cotizacion);
    } catch (_) {
        if (solicitud === _cotizacionDetalleReqSeq && overlay.style.display !== "none") {
            _mostrarDetalleCotizacion(cotizacion, false, "No se pudieron cargar los productos.");
        }
    }
}

export function cerrarDetalleCotizacion(event) {
    const overlay = document.getElementById("cotizacionDetalleOverlay");
    if (!overlay || (event && event.target !== overlay)) return;
    _cotizacionDetalleReqSeq++;
    overlay.style.display = "none";
}

function _crearTarjetaCotizacion(cotizacion) {
    const card = document.createElement("div");
    card.className = "caja-card cotizacion-card";
    card.style.margin = "0 0 16px 0";
    card.tabIndex = 0;
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `Ver detalle de ${cotizacion.codigo || cotizacion.numero || "cotización"}`);
    card.addEventListener("click", function() {
        abrirDetalleCotizacion(cotizacion);
    });
    card.addEventListener("keydown", function(event) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            abrirDetalleCotizacion(cotizacion);
        }
    });

    const detalle = document.createElement("div");
    detalle.className = "cotizacion-card-info";
    const titulo = document.createElement("div");
    titulo.className = "cotizacion-card-titulo";
    titulo.textContent = `${cotizacion.codigo || cotizacion.numero || "—"} · ${cotizacion.cliente || "MOSTRADOR"}`;
    const total = Number(cotizacion.total);
    const info = document.createElement("div");
    info.className = "cotizacion-card-meta";
    info.textContent = [
        cotizacion.fecha || "",
        cotizacion.sucursal || "",
        "Estado: " + (cotizacion.estado || "ABIERTA"),
        "Válida hasta: " + (cotizacion.vigenciaHasta || "—"),
        formatearBs(Number.isFinite(total) ? total : 0)
    ].filter(Boolean).join(" · ");
    detalle.append(titulo, info);

    const acciones = document.createElement("div");
    acciones.className = "cotizacion-card-actions";
    acciones.addEventListener("click", function(event) {
        event.stopPropagation();
    });
    acciones.addEventListener("keydown", function(event) {
        event.stopPropagation();
    });
    if (can("ventas.crear") && cotizacion.estado === "ABIERTA") {
        const vender = document.createElement("button");
        vender.type = "button";
        vender.className = "btn btn-blue btn-sm";
        vender.textContent = "Vender";
        vender.addEventListener("click", function() {
            cargarCotizacionParaVenta(String(cotizacion.id), cotizacion.codigo || cotizacion.numero || "");
        });
        acciones.appendChild(vender);
    }
    if (can("cotizaciones.crear") && cotizacion.estado === "ABIERTA") {
        const recalcular = document.createElement("button");
        recalcular.type = "button";
        recalcular.className = "btn btn-ghost btn-sm";
        recalcular.textContent = "↻ Recalcular";
        recalcular.addEventListener("click", function() {
            recalcularCotizacion(String(cotizacion.id), cotizacion.codigo || cotizacion.numero || "");
        });
        acciones.appendChild(recalcular);
    }
    const imprimir = document.createElement("button");
    imprimir.type = "button";
    imprimir.className = "btn btn-ghost btn-sm";
    imprimir.textContent = "🖨️ Imprimir";
    imprimir.addEventListener("click", function() {
        window.imprimirCotizacionGuardada?.(String(cotizacion.id));
    });
    acciones.appendChild(imprimir);
    if (can("cotizaciones.cancelar") && cotizacion.estado === "ABIERTA") {
        const cancelar = document.createElement("button");
        cancelar.type = "button";
        cancelar.className = "btn btn-danger btn-sm";
        cancelar.textContent = "Cancelar";
        cancelar.addEventListener("click", function() {
            cancelarCotizacion(String(cotizacion.id), cotizacion.codigo || cotizacion.numero || "");
        });
        acciones.appendChild(cancelar);
    }
    card.append(detalle, acciones);
    return card;
}

function _mostrarEstadoCotizaciones(contenedor, mensaje, clase) {
    const estado = document.createElement("div");
    estado.className = clase || "empty-state";
    estado.textContent = mensaje;
    contenedor.replaceChildren(estado);
}

export async function listarCotizaciones() {
    if (!store.sessionToken) return;
    const lista = document.getElementById("listaCotizaciones");
    if (!lista) return;
    const loader = document.getElementById("loaderCotizaciones");
    const sucursal = document.getElementById("sucursalCotizacion")?.value || undefined;
    const estado = document.getElementById("estadoCotizacion")?.value || "ABIERTA";
    const busqueda = document.getElementById("buscarCotizacion")?.value.trim() || undefined;
    const seq = ++_cotizacionesReqSeq;
    if (loader) loader.style.display = "block";
    lista.replaceChildren();
    try {
        const data = await api({
            ACCION: "LISTAR_COTIZACIONES", SUCURSAL: sucursal, ESTADO: estado,
            BUSQUEDA: busqueda, LIMITE: 50, TOKEN: store.sessionToken
        });
        if (seq !== _cotizacionesReqSeq) return;
        if (!manejarRespuesta(data) || !data.ok) {
            _mostrarEstadoCotizaciones(lista, data?.error || "No se pudieron cargar las cotizaciones", "empty-state");
            return;
        }
        const cotizaciones = Array.isArray(data.cotizaciones) ? data.cotizaciones : [];
        if (!cotizaciones.length) {
            _mostrarEstadoCotizaciones(lista, "Sin cotizaciones encontradas");
            return;
        }
        const tarjetas = cotizaciones.map(_crearTarjetaCotizacion);
        lista.replaceChildren(...tarjetas);
    } catch (_) {
        _mostrarEstadoCotizaciones(lista, "Error de conexión", "empty-state");
    } finally {
        if (seq === _cotizacionesReqSeq && loader) loader.style.display = "none";
    }
}

const _buscarCotizacionesDebounced = debounce(function() {
    listarCotizaciones();
}, 250);

export function buscarCotizaciones() {
    _buscarCotizacionesDebounced();
}

export function cambiarSucursalCotizacion() {
    listarCotizaciones();
}

export function cambiarEstadoCotizacion() {
    listarCotizaciones();
}

export function toggleHistorialCotizaciones() {
    const contenedor = document.getElementById("contenedorHistorialCotizaciones");
    if (!contenedor) return;
    const cerrado = contenedor.classList.contains("oculto");
    contenedor.classList.toggle("oculto");
    if (cerrado) {
        _sincronizarSucursalCotizacion();
        listarCotizaciones();
    }
}

export async function cancelarCotizacion(id, codigo) {
    if (!can("cotizaciones.cancelar") || !id) return;
    const motivo = prompt(`Motivo de cancelación de la cotización ${codigo}:`);
    if (motivo === null) return;
    if (motivo.trim().length < 3) { mostrarMsg("El motivo debe tener al menos 3 caracteres", "err"); return; }
    if (!confirm(`¿Cancelar definitivamente la cotización ${codigo}?`)) return;
    try {
        const data = await api({ ACCION: "CANCELAR_COTIZACION", ID: id, MOTIVO: motivo.trim(), TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        if (!data.ok) { mostrarMsg(data.error || "No se pudo cancelar la cotización", "err"); return; }
        if (_cotizacionEnVenta?.id === id) await vaciarCarrito();
        mostrarMsg("Cotización cancelada correctamente", "ok");
        listarCotizaciones();
    } catch (_) {
        mostrarMsg("Error de conexión", "err");
    }
}

export async function cargarCotizacionParaVenta(id, codigo, omitirConfirmacion = false) {
    return _ejecutarCambioCarrito(() => _cargarCotizacionParaVenta(id, codigo, omitirConfirmacion));
}

async function _cargarCotizacionParaVenta(id, codigo, omitirConfirmacion = false) {
    if (!can("ventas.crear") || !id) return;
    try {
        const data = await api({ ACCION: "OBTENER_COTIZACION", ID: id, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data) || !data.ok || !data.cotizacion) {
            mostrarMsg(data?.error || "No se pudo obtener la cotización", "err");
            return;
        }
        const cotizacion = data.cotizacion;
        if (cotizacion.estado !== "ABIERTA") { mostrarMsg("La cotización no está disponible para vender", "err"); listarCotizaciones(); return; }
        const items = Array.isArray(cotizacion.items) ? cotizacion.items : [];
        if (!items.length) { mostrarMsg("La cotización no tiene productos", "err"); return; }
        const selectorSucursal = document.getElementById("sucursalVenta");
        if (!selectorSucursal || !Array.from(selectorSucursal.options).some(opcion => opcion.value === cotizacion.sucursal)) {
            mostrarMsg("No tienes la sucursal de la cotización disponible", "err");
            return;
        }
        if (!omitirConfirmacion && !confirm(`Cargar ${codigo || "esta cotización"} para cobrar con sus precios cotizados?`)) return;
        if (!(await _vaciarCarrito())) return;
        selectorSucursal.value = cotizacion.sucursal;
        try {
            for (const item of items) {
                await _ajustarReserva({ producto: item.producto, sucursal: cotizacion.sucursal }, Number(item.cantidad));
            }
        } catch (error) {
            if (_carritoId) {
                try { await api({ ACCION: "LIBERAR_RESERVAS_CARRITO", CARRITO_ID: _carritoId, TOKEN: store.sessionToken }); } catch (_) {}
            }
            _carritoId = "";
            mostrarMsg(_mensajeReserva(error.message), "err");
            return;
        }
        setCarrito(items.map(item => ({
            producto: item.producto,
            precio: Number(item.precioUnitario),
            cantidad: Number(item.cantidad),
            total: Number(item.precioUnitario) * Number(item.cantidad),
            imagen: "",
            sucursal: cotizacion.sucursal
        })));
        _cotizacionEnVenta = { id: cotizacion.id, codigo: cotizacion.codigo || cotizacion.numero || "" };
        const cliente = document.getElementById("clienteVenta");
        const clienteId = document.getElementById("clienteVentaId");
        const clienteCredito = document.getElementById("clienteCreditoVenta");
        if (cliente) cliente.value = cotizacion.cliente || "";
        if (clienteId) clienteId.value = cotizacion.clienteId || "";
        if (clienteCredito) clienteCredito.textContent = "";
        _clienteVentaSeleccionado = cotizacion.clienteId ? { id: cotizacion.clienteId, nombre: cotizacion.cliente } : null;
        _aplicarDescuentoCotizado(cotizacion);
        renderCarrito();
        _actualizarResumenVenta();
        _actualizarVisibilidadEfectivo();
        mostrarMsg(`Cotización ${cotizacion.codigo || cotizacion.numero} cargada: se respetarán sus precios al cobrar`, "ok");
    } catch (_) {
        mostrarMsg("Error de conexión", "err");
    }
}

export async function recalcularCotizacion(id, codigo) {
    if (!can("cotizaciones.crear") || !id) return;
    if (!confirm(`¿Recalcular los precios actuales de ${codigo || "esta cotización"}? Esta acción actualizará el documento.`)) return;
    try {
        const data = await api({ ACCION: "RECALCULAR_COTIZACION", ID: id, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        if (!data.ok || !data.cotizacion) { mostrarMsg(data.error || "No se pudieron recalcular los precios", "err"); listarCotizaciones(); return; }
        mostrarMsg("Precios de cotización recalculados", "ok");
        if (_cotizacionEnVenta?.id === id) await cargarCotizacionParaVenta(id, codigo, true);
        listarCotizaciones();
    } catch (_) {
        mostrarMsg("Error de conexión", "err");
    }
}

export function initVenta(callbacks) {
    if (callbacks.verificarEstadoCaja) _verificarEstadoCaja = callbacks.verificarEstadoCaja;
    initEscanerVenta();
    document.getElementById("sucursalVenta")?.addEventListener("change", buscarProductoVenta);
}

// Escaner USB en desktop: captura keydown global, detecta la rafaga rapida del lector
function initEscanerVenta() {
    const input = document.getElementById("escanerVenta");
    if (!input || !document.body.classList.contains("desktop")) return;
    let buffer = "";
    let ultimaTecla = 0;
    let timer = null;
    const procesar = () => {
        clearTimeout(timer);
        timer = null;
        const codigo = buffer;
        buffer = "";
        if (!CODIGO_REGEX.test(codigo)) return;
        agregarPorCodigoScan(codigo);
        const activo = document.activeElement;
        if (activo && activo !== input && activo.tagName === "INPUT" && ["productoVenta", "cantidadVenta"].includes(activo.id)) {
            activo.value = "";
        }
        input.value = "";
        input.focus();
    };
    document.addEventListener("keydown", function(e) {
        const ahora = Date.now();
        if (e.key === "Enter") {
            if (buffer) {
                e.preventDefault();
                procesar();
            }
            return;
        }
        if (e.key.length === 1) {
            if (ahora - ultimaTecla > 50) buffer = "";
            buffer += e.key;
            ultimaTecla = ahora;
            clearTimeout(timer);
            timer = setTimeout(procesar, 120);
        }
    });
    input.focus();
}

// Busca producto por codigo (local + backend) y lo agrega al carrito
async function agregarPorCodigoScan(codigo) {
    const suc = sucursalVentaActual();
    if (!suc) {
        mostrarMsg("Selecciona una sucursal", "err");
        return;
    }
    let prod = await buscarPorCodigo(codigo, suc);
    if (!prod) {
        try {
            const data = await api({
                ACCION: "BUSCAR_PRODUCTO_CODIGO",
                CODIGO: codigo,
                SUCURSAL: suc,
                TOKEN: store.sessionToken
            });
            if (data.ok && data.producto) prod = data.producto;
        } catch (_) {}
    }
    if (prod) {
        await agregarPorProducto(prod, suc);
    } else {
        mostrarMsg("Producto no encontrado: " + codigo, "err");
    }
}

// Mantiene visible el campo de cliente para cualquier metodo de pago
export function toggleClienteVenta() {
                document.getElementById("campoClienteVenta")?.classList.remove("oculto");
                const esCredito = document.getElementById("metodoPagoVenta")?.value === "CREDITO";
                document.getElementById("campoVencimientoVenta")?.classList.toggle("oculto", !esCredito);
                const fecha = document.getElementById("fechaVencimientoVenta");
                if (esCredito && fecha && !fecha.value) {
                    const d = new Date(); d.setDate(d.getDate() + 30);
                    fecha.value = d.toISOString().slice(0, 10);
                }
            }

// Carga clientes registrados para el selector de ventas
export async function cargarClientes(busqueda = "") {
    if (!store.sessionToken) return;
    try {
        const data = await api({
            ACCION: "BUSCAR_CLIENTES_VENTA",
            BUSQUEDA: busqueda,
            TOKEN: store.sessionToken
        });
        if (data.ok) _clientesVenta = data.datos || [];
    } catch (_) {}
}

// Muestra sugerencias de clientes mientras se escribe
export function buscarClienteVenta() {
    const input = document.getElementById("clienteVenta");
    const lista = document.getElementById("listaClienteVenta");
    if (!input || !lista) return;
    const texto = input.value.trim();
    document.getElementById("clienteVentaId").value = "";
    document.getElementById("clienteCreditoVenta").textContent = "";
    _clienteVentaSeleccionado = null;
    lista.innerHTML = "";
    if (!texto) {
        lista.classList.remove("show");
        return;
    }
    clearTimeout(_clienteVentaTimer);
    _clienteVentaTimer = setTimeout(async () => {
        await cargarClientes(texto);
        lista.innerHTML = "";
        _clientesVenta.slice(0, 8).forEach(cliente => {
            const item = document.createElement("div");
            item.className = "ac-item";
            const titulo = document.createElement("strong");
            titulo.textContent = cliente.nombre;
            const detalle = document.createElement("small");
            detalle.textContent = `${cliente.codigoCliente}${cliente.documento ? " · " + cliente.documento : ""}`;
            item.append(titulo, detalle);
            item.addEventListener("click", () => {
                input.value = cliente.nombre;
                document.getElementById("clienteVentaId").value = cliente.id;
                document.getElementById("clienteCreditoVenta").textContent = `Deuda: ${formatearBs(cliente.deuda)} · Disponible: ${formatearBs(cliente.creditoDisponible)}`;
                _clienteVentaSeleccionado = cliente;
                lista.classList.remove("show");
            });
            lista.appendChild(item);
        });
        lista.classList.toggle("show", lista.children.length > 0);
    }, 220);
}

// Agrega producto al carrito por objeto producto (usado por escaner)
async function agregarPorProducto(prod, sucursal) {
    return _ejecutarCambioCarrito(() => _agregarPorProducto(prod, sucursal));
}

async function _agregarPorProducto(prod, sucursal) {
    if (_carritoCotizadoBloqueado()) return;
    const item = { producto: prod.producto, sucursal };
    try {
        await _ajustarReserva(item, 1);
    } catch (error) {
        mostrarMsg(_mensajeReserva(error.message), "err");
        return;
    }
    const carrito = [...store.carrito];
    const ex = carrito.find(i => i.producto === prod.producto);
    const precio = prod.precio_venta ?? prod.precio ?? prod.precioVenta ?? 0;
    if (ex) {
        ex.cantidad += 1;
        ex.total = ex.precio * ex.cantidad;
    } else {
        carrito.push({
            producto: prod.producto,
            precio: precio,
            cantidad: 1,
            total: precio,
            imagen: prod.imagen || "",
            sucursal: sucursal
        });
    }
    setCarrito(carrito);
    renderCarrito();
    vibrar("ok");
    mostrarMsg("📷 " + prod.producto + " agregado (codigo: " + (prod.codigoBarras || "manual") + ")", "ok");
}

// Un precio es valido si es un numero finito (0 es valido: puede ser bonus)
function _precioValido(item) {
    return Number.isFinite(item.precio);
}

function renderCarritoEscaner() {
    const lista = document.getElementById("scannerCarritoLista");
    const totalEl = document.getElementById("scannerTotalVenta");
    if (!lista || !totalEl) return;
    lista.innerHTML = "";
    let total = 0;
    store.carrito.forEach(function (it) {
        total += Number(it.total || 0);
        const fila = document.createElement("div");
        fila.className = "scanner-carrito-item";
        const precioOK = _precioValido(it);
        const precioTxt = precioOK ? formatearBs(it.precio) : '<span style="color:var(--red);font-weight:700">⚠ sin precio</span>';
        const totalTxt = precioOK ? formatearBs(it.total) : '<span style="color:var(--red);font-weight:700">⚠ sin precio</span>';
        fila.innerHTML = `<div class="scanner-carrito-producto">${it.producto}</div><div class="scanner-carrito-detalle"><span>${it.cantidad} x ${precioTxt}</span><strong>${totalTxt}</strong></div>`;
        lista.appendChild(fila);
    });
    if (!store.carrito.length) {
        lista.innerHTML = '<div class="scanner-carrito-vacio">Aún no hay productos escaneados</div>';
    }
    totalEl.textContent = "Bs " + total.toFixed(2);
}

export function cerrarEscanerVenta() {
    detenerEscanerCamara();
    _escanerVentaMovilActivo = false;
    const modal = document.getElementById("escanerModal");
    if (modal) {
        modal.classList.remove("scanner-mobile-mode");
        modal.style.display = "none";
    }
    renderCarrito();
}

export function revisarOrdenEscaner() {
    cerrarEscanerVenta();
    setTimeout(function () {
        document.getElementById("tituloCarrito")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
}

async function procesarCodigoEscanerVenta(codigo) {
    const estado = document.getElementById("escanerEstado");
    const suc = sucursalVentaActual();
    if (!suc) {
        if (estado) estado.textContent = "Selecciona una sucursal antes de escanear";
        return;
    }
    if (estado) estado.textContent = "Buscando producto...";
    let prod = await buscarPorCodigo(codigo, suc);
    if (!prod) {
        const data = await api({
            ACCION: "BUSCAR_PRODUCTO_CODIGO",
            CODIGO: codigo,
            SUCURSAL: suc,
            TOKEN: store.sessionToken
        });
        if (data.ok && data.producto) prod = data.producto;
    }
    if (prod) {
        await agregarPorProducto(prod, suc);
        if (estado) estado.textContent = "Producto agregado. Listo para el siguiente escaneo";
    } else if (estado) {
        estado.textContent = "Producto no encontrado: " + codigo;
    }
}

async function abrirEscanerVentaMovil() {
    const modal = document.getElementById("escanerModal");
    const video = document.getElementById("escanerVideo");
    const estado = document.getElementById("escanerEstado");
    if (!modal || !video) return;
    _escanerVentaMovilActivo = true;
    modal.classList.add("scanner-mobile-mode");
    modal.style.display = "flex";
    renderCarritoEscaner();
    if (estado) estado.textContent = "Apuntando cámara... Escanea un código";
    try {
        await iniciarEscanerContinuo(video, procesarCodigoEscanerVenta);
    } catch (e) {
        _escanerVentaMovilActivo = false;
        if (e.message === "NO_SOPORTADO") {
            mostrarMsg("Escaner no soportado en este navegador", "err");
        } else {
            mostrarMsg("Error de camara: " + e.message, "err");
        }
        cerrarEscanerVenta();
    }
}

// Escaner via camara
export async function abrirEscanerVenta() {
    if (!document.body.classList.contains("desktop")) {
        return abrirEscanerVentaMovil();
    }
    const modal = document.getElementById("escanerModal");
    const video = document.getElementById("escanerVideo");
    const estado = document.getElementById("escanerEstado");
    modal.style.display = "flex";
    estado.textContent = "Apuntando camara...";
    try {
        const codigo = await iniciarEscanerCamara(video);
        const suc = sucursalVentaActual();
        let prod = await buscarPorCodigo(codigo, suc);
        if (!prod) {
            const data = await api({
                ACCION: "BUSCAR_PRODUCTO_CODIGO",
                CODIGO: codigo,
                SUCURSAL: suc,
                TOKEN: store.sessionToken
            });
            if (data.ok && data.producto) {
                prod = data.producto;
            }
        }
        if (prod) {
            await agregarPorProducto(prod, suc);
        } else {
            mostrarMsg("Producto no encontrado: " + codigo, "err");
        }
    } catch(e) {
        if (e.message === "NO_SOPORTADO") {
            mostrarMsg("Escaner no soportado en este navegador", "err");
        } else {
            mostrarMsg("Error de camara: " + e.message, "err");
        }
    }
    detenerEscanerCamara();
    modal.style.display = "none";
}

// Escucha USB scanner en el input de producto
function initScannerInput() {
    const input = document.getElementById("productoVenta");
    if (!input) return;
    input.addEventListener("input", function() {
        const valor = this.value.trim();
        const suc = sucursalVentaActual();
        if (!valor || !suc) return;
        onInputScanner(valor, suc, async function(prod) {
            if (prod) {
                await agregarPorProducto(prod, suc);
            } else if (CODIGO_REGEX.test(valor)) {
                const data = await api({
                    ACCION: "BUSCAR_PRODUCTO_CODIGO",
                    CODIGO: valor,
                    SUCURSAL: suc,
                    TOKEN: store.sessionToken
                });
                if (data.ok && data.producto) {
                    await agregarPorProducto(data.producto, suc);
                }
            }
            input.value = "";
        });
    });
}

// Busca productos en inventario para autocompletar en la venta
// (paginado server-side con debounce de 300ms; RLS aplica)
let _productoSeleccionadoVenta = null;
let _ventaAcSeq = 0;
let _ventaAcController = null;

const _ventaAcBuscar = debounce(async function(t, su, seq) {
    if (seq !== _ventaAcSeq) return;
    const l = document.getElementById("listaVenta");
    const controller = new AbortController();
    _ventaAcController = controller;
    try {
        const datos = await buscarSugerenciasVenta({ query: t, sucursal: su, signal: controller.signal });
        if (seq !== _ventaAcSeq || controller.signal.aborted ||
            document.getElementById("sucursalVenta").value !== su ||
            normBusqueda(document.getElementById("productoVenta").value) !== t) return;
        construirAC(l, datos, p => {
            if (seq !== _ventaAcSeq || document.getElementById("sucursalVenta").value !== su) return;
            _productoSeleccionadoVenta = p;
            document.getElementById("productoVenta").value = p.producto;
            const info = document.getElementById("infoProductoVenta");
            info.innerHTML = `Stock disponible: <b>${p.stock}</b> | Precio: <b>${formatearBs(p.precio)}</b>` + (p.stock <= 5 ? `<br><span class="stock-bajo">⚠ Stock bajo</span>` : "");
            info.classList.add("show")
        });
    } catch (_) {}
}, 300);

export function buscarProductoVenta() {
    const seq = ++_ventaAcSeq;
    _ventaAcController?.abort();
    _productoSeleccionadoVenta = null;
    const su = document.getElementById("sucursalVenta").value;
    const t = normBusqueda(document.getElementById("productoVenta").value)
      , l = document.getElementById("listaVenta")
      , info = document.getElementById("infoProductoVenta");
    info.classList.remove("show");
    if (!su) {
        l.classList.remove("show");
        return
    }
    if (t.length < 1) {
        l.classList.remove("show");
        return
    }
    l.classList.remove("show");
    _ventaAcBuscar(t, su, seq)
}

// Agrega un producto al carrito de venta con validaciones de stock
export async function agregarCarrito() {
    return _ejecutarCambioCarrito(() => _agregarCarrito());
}

async function _agregarCarrito() {
    if (_carritoCotizadoBloqueado()) return;
    const pr = document.getElementById("productoVenta").value.trim()
      , ca = Number(document.getElementById("cantidadVenta").value)
      , su = document.getElementById("sucursalVenta").value;
    if (!pr || !ca || ca <= 0) {
        mostrarMsg("Completa producto y cantidad", "err");
        return
    }
    if (!su) {
        mostrarMsg("Selecciona una sucursal", "err");
        return
    }
    let p = null;
    if (_productoSeleccionadoVenta && _productoSeleccionadoVenta.producto === pr && _productoSeleccionadoVenta.sucursal === su) {
        p = _productoSeleccionadoVenta;
    } else {
        try { p = await buscarProductoPorNombre(pr, su); } catch (_) {}
    }
    if (!p) {
        mostrarMsg("Producto no encontrado en inventario", "err");
        return
    }
    if (p.stock < ca) {
        mostrarMsg("Stock insuficiente (disponible: " + p.stock + ")", "err");
        return
    }
    try {
        await _ajustarReserva({ producto: pr, sucursal: su }, ca);
    } catch (error) {
        mostrarMsg(_mensajeReserva(error.message), "err");
        return;
    }
    const carrito = [...store.carrito];
    const ex = carrito.find(i => i.producto === pr);
    if (ex) {
        ex.cantidad += ca;
        ex.total = ex.precio * ex.cantidad
    } else {
        carrito.push({
            producto: pr,
            precio: p.precio,
            cantidad: ca,
            total: p.precio * ca,
            imagen: p.imagen || "",
            sucursal: su
        });
    }
    setCarrito(carrito);
    renderCarrito();
    vibrar("ok");
    document.getElementById("productoVenta").value = "";
    document.getElementById("cantidadVenta").value = "";
    document.getElementById("infoProductoVenta").classList.remove("show")
}

// Elimina el borrador del carrito del localStorage
            export function limpiarCarritoDraft() {
                try {
                    const clave = claveCarritoDraft(store.sessionUsuarioId);
                    if (clave) localStorage.removeItem(clave);
                    localStorage.removeItem(CARRITO_KEY);
                } catch(e) {}
            }

// Renderiza la tabla del carrito, miniaturas y actualiza el total
            export function renderCarrito() {
                const tb = document.getElementById("carritoBody")
                  , minis = document.getElementById("carritoMiniaturas");
                const filas = [];
                minis.innerHTML = "";
    const carrito = store.carrito;
    carrito.forEach( (it, i) => {
        const precioOK = _precioValido(it);
        const precioCelda = precioOK ? formatearBs(it.precio) : '<span style="color:var(--red);font-weight:700">⚠ sin precio</span>';
        const totalCelda = precioOK ? formatearBs(it.total) : '<span style="color:var(--red);font-weight:700">⚠ sin precio</span>';
        filas.push(`<tr><td class="col-prod">${it.producto}</td><td><div class="qty-cell"><button class="btn-plus" data-accion="sumar" data-index="${i}" title="Aumentar cantidad">+</button><span>${it.cantidad}</span></div></td><td>${precioCelda}</td><td>${totalCelda}</td><td><button class="btn-del" data-accion="eliminar" data-index="${i}">✕</button></td></tr>`);
        if (it.imagen) {
            const mini = document.createElement("div");
            mini.className = "miniatura";
            mini.style.cursor = "zoom-in";
            mini.innerHTML = `<img src="${it.imagen}" alt="${it.producto}"><div class="miniatura-badge">${it.cantidad}</div>`;
            mini.addEventListener("click", function(e) {
                e.stopPropagation();
                if (window.abrirZoomImagen) window.abrirZoomImagen(it.imagen);
            });
            minis.appendChild(mini)
        }
    });
    tb.innerHTML = filas.join("");
    // Vincular eventos a los botones de eliminar generados dinamicamente
    tb.querySelectorAll('[data-accion="eliminar"]').forEach(btn => {
        btn.addEventListener('click', function() {
            eliminarItem(Number(this.dataset.index));
        });
    });
    // Vincular eventos a los botones de sumar generados dinamicamente
    tb.querySelectorAll('[data-accion="sumar"]').forEach(btn => {
        btn.addEventListener('click', function() {
            incrementarCantidad(Number(this.dataset.index));
        });
    });
    _guardarCarritoDraft();
    _actualizarResumenVenta();
    document.getElementById("tituloCarrito").innerHTML = `🛒 Carrito <span style="color:var(--muted)">(${carrito.length})</span>`;
    renderCarritoEscaner();
    _actualizarVisibilidadEfectivo();
            }

function _actualizarVisibilidadEfectivo() {
    const contEf = document.getElementById("campoEfectivoVenta");
    const contMixto = document.getElementById("campoMixtoVenta");
    const metodo = document.getElementById("metodoPagoVenta");
    _actualizarResumenVenta();
    const hayItems = !!store.carrito.length;
    const esEfectivo = !!metodo && metodo.value === "EFECTIVO" && hayItems;
    const esMixto = !!metodo && metodo.value === "MIXTO" && hayItems;
    if (contEf) {
        contEf.classList.toggle("oculto", !esEfectivo);
        if (!esEfectivo) {
            const input = document.getElementById("efectivoRecibidoVenta");
            const corte = document.getElementById("corteEfectivoVenta");
            const out = document.getElementById("cambioVenta");
            if (input) input.value = "";
            if (corte) corte.value = "";
            if (out) {
                out.textContent = "—";
                out.classList.remove("cambio-positivo", "cambio-negativo");
            }
        } else {
            actualizarCambioVenta();
        }
    }
    if (contMixto) {
        contMixto.classList.toggle("oculto", !esMixto);
        if (!esMixto) {
            const inEf = document.getElementById("montoEfectivoMixtoVenta");
            const inTr = document.getElementById("montoTransferenciaMixtoVenta");
            const aviso = document.getElementById("avisoMixtoVenta");
            if (inEf) inEf.value = "";
            if (inTr) inTr.value = "";
            if (aviso) {
                aviso.textContent = "";
                aviso.classList.remove("cambio-positivo", "cambio-negativo");
            }
        } else {
            actualizarMixtoVenta();
        }
    }
}

export function actualizarMixtoVenta(activo) {
    const inEf = document.getElementById("montoEfectivoMixtoVenta");
    const inTr = document.getElementById("montoTransferenciaMixtoVenta");
    const aviso = document.getElementById("avisoMixtoVenta");
    const contMixto = document.getElementById("campoMixtoVenta");
    if (!inEf || !inTr) return;
    if (contMixto && contMixto.classList.contains("oculto")) return;
    const totalStr = document.getElementById("totalVenta");
    const total = Number(totalStr ? totalStr.textContent.replace("Bs", "").replace(/\s+/g, "") : 0);
    if (activo) {
        if (activo === inTr) {
            const tr = Number(inTr.value);
            if (Number.isFinite(tr) && tr >= 0) {
                const ef = Number((total - tr).toFixed(2));
                inEf.value = ef >= 0 ? ef.toFixed(2) : "";
            }
        } else {
            const ef = Number(inEf.value);
            if (Number.isFinite(ef) && ef >= 0) {
                const tr = Number((total - ef).toFixed(2));
                inTr.value = tr >= 0 ? tr.toFixed(2) : "";
            }
        }
    }
    if (!aviso) return;
    const ef = Number(inEf.value), tr = Number(inTr.value);
    if (Number.isFinite(ef) && Number.isFinite(tr) && inEf.value !== "" && inTr.value !== "") {
        const suma = Number((ef + tr).toFixed(2));
        const dif = Number((suma - total).toFixed(2));
        if (Math.abs(dif) <= 0.01) {
            aviso.textContent = "✅ Cuadra el total";
            aviso.classList.add("cambio-positivo");
            aviso.classList.remove("cambio-negativo");
        } else if (dif > 0) {
            aviso.textContent = "⚠ Excede el total en Bs " + dif.toFixed(2);
            aviso.classList.add("cambio-negativo");
            aviso.classList.remove("cambio-positivo");
        } else {
            aviso.textContent = "⚠ Falta Bs " + Math.abs(dif).toFixed(2);
            aviso.classList.add("cambio-negativo");
            aviso.classList.remove("cambio-positivo");
        }
    } else {
        aviso.textContent = "";
        aviso.classList.remove("cambio-positivo", "cambio-negativo");
    }
}

export function actualizarCambioVenta() {
    const out = document.getElementById("cambioVenta");
    if (!out) return;
    const cont = document.getElementById("campoEfectivoVenta");
    if (cont && cont.classList.contains("oculto")) {
        out.textContent = "—";
        out.classList.remove("cambio-positivo", "cambio-negativo");
        return;
    }
    const totalStr = document.getElementById("totalVenta");
    const input = document.getElementById("efectivoRecibidoVenta");
    const total = Number(totalStr ? totalStr.textContent.replace("Bs", "").replace(/\s+/g, "") : 0);
    const recibido = input ? Number(input.value) : NaN;
    if (!Number.isFinite(recibido) || recibido <= 0 || !Number.isFinite(total)) {
        out.textContent = "—";
        out.classList.remove("cambio-positivo", "cambio-negativo");
        return;
    }
    const cambio = Number((recibido - total).toFixed(2));
    if (cambio >= 0) {
        out.textContent = "Cambio: Bs " + cambio.toFixed(2);
        out.classList.add("cambio-positivo");
        out.classList.remove("cambio-negativo");
    } else {
        out.textContent = "Falta: Bs " + Math.abs(cambio).toFixed(2);
        out.classList.add("cambio-negativo");
        out.classList.remove("cambio-positivo");
    }
}

export function seleccionarCorteEfectivo(selector) {
    const monto = selector?.value;
    const input = document.getElementById("efectivoRecibidoVenta");
    if (!monto || !input) return;
    input.value = monto;
    selector.value = "";
    actualizarCambioVenta();
}

// Elimina un item del carrito con confirmación de reserva y opción de deshacer
                  export async function eliminarItem(i) {
    return _ejecutarCambioCarrito(() => _eliminarItem(i));
}

async function _eliminarItem(i) {
                  if (_carritoCotizadoBloqueado()) return;
                  const carrito = [...store.carrito];
    const item = carrito[i];
    if (!item) return;
    try {
        await _ajustarReserva(item, -1);
    } catch (error) {
        mostrarMsg(_mensajeReserva(error.message), "err");
        return;
    }
    if (item.cantidad > 1) {
        item.cantidad -= 1;
        item.total = item.precio * item.cantidad;
        setCarrito(carrito);
        renderCarrito();
        return;
    }
    const itemEliminado = { ...carrito[i] };
    const indexEliminado = i;

    carrito.splice(i, 1);
    setCarrito(carrito);
    renderCarrito();
    const carritoEliminadoId = _carritoId;
    let deshecho = false;

    mostrarToast(
        `🗑️ "${itemEliminado.producto}" eliminado`,
        "Deshacer",
        () => _ejecutarCambioCarrito(async () => {
            if (deshecho || _carritoCotizadoBloqueado() || _carritoId !== carritoEliminadoId) return;
            try {
                await _ajustarReserva(itemEliminado, 1);
                deshecho = true;
            } catch (error) {
                mostrarMsg(_mensajeReserva(error.message), "err");
                return;
            }
            const c = [...store.carrito];
            const existente = c.find(it => it.producto === itemEliminado.producto && it.sucursal === itemEliminado.sucursal);
            if (existente) {
                existente.cantidad += 1;
                existente.total = existente.precio * existente.cantidad;
            } else {
                c.splice(indexEliminado, 0, itemEliminado);
            }
            setCarrito(c);
            renderCarrito();
            mostrarMsg("↩ Producto restaurado al carrito", "ok");
        })
    );
                }

// Aumenta la cantidad de un item del carrito en 1 (con validacion de stock)
            async function incrementarCantidad(i) {
    return _ejecutarCambioCarrito(() => _incrementarCantidad(i));
}

async function _incrementarCantidad(i) {
                if (_carritoCotizadoBloqueado()) return;
                const carrito = [...store.carrito]
                  , item = carrito[i];
                if (!item) return;
                const nueva = item.cantidad + 1;
                try {
                    await _ajustarReserva(item, 1);
                } catch (error) {
                    mostrarMsg(_mensajeReserva(error.message), "err");
                    return;
                }
                item.cantidad = nueva;
                item.total = item.precio * item.cantidad;
                setCarrito(carrito);
                renderCarrito();
                vibrar("ok");
            }

// Procesa la venta POS. El backend calcula importes y protege reintentos.
export async function cobrar() {
    if (_cobroEnCurso) return;
    if (_cambioCarritoEnCurso) {
        mostrarMsg("Espera a que termine la reserva del carrito", "err");
        return;
    }
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    if (!store.carrito.length) { mostrarMsg("El carrito está vacío", "err"); return; }
    const sinPrecio = store.carrito.filter(it => !_precioValido(it));
    if (sinPrecio.length) { mostrarMsg("⚠ Producto(s) sin precio: " + sinPrecio.map(i => i.producto).join(", "), "err"); return; }
    const sucursales = [...new Set(store.carrito.map(item => String(item.sucursal || "").trim()).filter(Boolean))];
    if (sucursales.length > 1) { mostrarMsg("El carrito contiene productos de distintas sucursales", "err"); return; }

    const sucursal = sucursales[0] || sucursalVentaActual();
    const metodoPago = document.getElementById("metodoPagoVenta").value;
    const clienteId = document.getElementById("clienteVentaId").value || null;
    const cliente = _clienteVentaSeleccionado?.nombre || "MOSTRADOR";
    const fechaVencimiento = document.getElementById("fechaVencimientoVenta")?.value || null;
    const descuento = _actualizarResumenVenta();
    const mEfMixto = Number(document.getElementById("montoEfectivoMixtoVenta")?.value || 0);
    const mTrMixto = Number(document.getElementById("montoTransferenciaMixtoVenta")?.value || 0);
    if (!sucursal) { mostrarMsg("Selecciona una sucursal", "err"); return; }
    if (!descuento.valido || descuento.monto > descuento.subtotal) { mostrarMsg("El descuento no es válido", "err"); return; }
    if (metodoPago === "CREDITO" && !clienteId) { mostrarMsg("Debe seleccionar un cliente para crédito", "err"); return; }
    if (metodoPago === "CREDITO" && !fechaVencimiento) { mostrarMsg("Selecciona la fecha de vencimiento", "err"); return; }
    if (metodoPago === "EFECTIVO") {
        const efectivoRecibido = document.getElementById("efectivoRecibidoVenta")?.value.trim() || "";
        if (efectivoRecibido) {
            const recibido = Number(efectivoRecibido);
            if (!Number.isFinite(recibido) || recibido < descuento.total) { mostrarMsg("Monto recibido insuficiente", "err"); return; }
        }
    }
    if (metodoPago === "MIXTO") {
        if (!Number.isFinite(mEfMixto) || mEfMixto < 0 || !Number.isFinite(mTrMixto) || mTrMixto < 0 || Math.abs(mEfMixto + mTrMixto - descuento.total) > 0.01) {
            mostrarMsg("Los montos mixtos deben sumar el total", "err"); return;
        }
    }

    const loader = document.getElementById("loaderVenta");
    const btn = document.getElementById("btnCobrar");
    const btnCotizar = document.getElementById("btnCotizar");
    const contenidoBoton = btn.innerHTML;
    _cobroEnCurso = true;
    loader.style.display = "block";
    btn.disabled = true;
    if (btnCotizar) btnCotizar.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PROCESANDO...';
    try {
        const items = store.carrito.map(i => ({ producto: i.producto, cantidad: i.cantidad }));
        const key = _nuevaClaveIdempotencia();
        const data = await enviarCobroSeguro({
            ACCION: "VENTA_POS", CARRITO: JSON.stringify(items), SUCURSAL: sucursal,
            METODO_PAGO: metodoPago, CLIENTE_ID: clienteId, FECHA_VENCIMIENTO: fechaVencimiento,
            MONTO_EFECTIVO: metodoPago === "MIXTO" ? mEfMixto : undefined,
            MONTO_TRANSFERENCIA: metodoPago === "MIXTO" ? mTrMixto : undefined,
            DESCUENTO_TIPO: descuento.monto ? descuento.tipo : undefined,
            DESCUENTO_VALOR: descuento.monto ? descuento.valor : undefined,
            DESCUENTO_MOTIVO: document.getElementById("motivoDescuentoVenta")?.value.trim() || undefined,
            IDEMPOTENCY_KEY: key, CARRITO_ID: _idCarrito(),
            COTIZACION_ID: _cotizacionEnVenta?.id, TOKEN: store.sessionToken
        }, store.sessionUser, api);
        if (!manejarRespuesta(data)) return;
        if (!data.ok) { mostrarMsg("Error: " + (data.error || "No se pudo registrar la venta"), "err"); return; }

        sonidoCaja(); vibrar("caja");
        const ventaResumen = {
            items: store.carrito.map(i => ({ producto: i.producto, cantidad: i.cantidad, precio: i.precio })),
            subtotal: Number(data.subtotal ?? descuento.subtotal), descuento: Number(data.descuento ?? descuento.monto),
            total: Number(data.total ?? descuento.total), totalRedondeado: Number(data.totalRedondeado ?? data.total ?? descuento.total),
            ajusteRedondeo: Number(data.ajusteRedondeo ?? descuento.ajusteRedondeo ?? 0),
            metodoPago, sucursal, sucursalVisible: document.getElementById("sucursalVenta")?.selectedOptions[0]?.textContent?.trim() || sucursal,
            cliente, clienteId, operacionId: data.operacionId, numero: data.numeroComprobante,
            usuario: store.sessionUser, fecha: hoy(), hora: horaActual()
        };
        setUltimaVenta(ventaResumen);
        document.getElementById("btnComprobante").style.display = "inline-block";
        const toast = mostrarToast(`✅ VENTA REGISTRADA · Bs ${ventaResumen.total.toFixed(2)}${data.numeroComprobante ? " · N° " + data.numeroComprobante : ""}`, "VER COMPROBANTE", () => window.imprimirComprobante?.(), 6500);
        toast.classList.add("toast-venta-exitosa");
        document.getElementById("mainPanel").classList.add("ok");
        setTimeout(() => document.getElementById("mainPanel").classList.remove("ok"), 700);
        clearCarrito(); _carritoId = ""; limpiarCarritoDraft(); _limpiarCotizacionEnVenta(); _limpiarDescuentoVenta(); renderCarrito();
        document.getElementById("clienteVenta").value = "";
        document.getElementById("clienteVentaId").value = "";
        document.getElementById("clienteCreditoVenta").textContent = "";
        _clienteVentaSeleccionado = null;
        ["efectivoRecibidoVenta", "corteEfectivoVenta", "montoEfectivoMixtoVenta", "montoTransferenciaMixtoVenta"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        const cambio = document.getElementById("cambioVenta"), avisoMixto = document.getElementById("avisoMixtoVenta");
        if (cambio) { cambio.textContent = "—"; cambio.classList.remove("cambio-positivo", "cambio-negativo"); }
        if (avisoMixto) { avisoMixto.textContent = ""; avisoMixto.classList.remove("cambio-positivo", "cambio-negativo"); }
        _actualizarVisibilidadEfectivo();
        listarComprobantes();
        if (_verificarEstadoCaja) _verificarEstadoCaja();
        document.getElementById(document.body.classList.contains("desktop") ? "escanerVenta" : "productoVenta")?.focus();
    } catch (error) {
        mostrarMsg(error.message || "No se recibió confirmación. Pulsa Cobrar de nuevo sin cambiar la venta.", "err");
    } finally {
        loader.style.display = "none";
        btn.disabled = false;
        if (btnCotizar) btnCotizar.disabled = false;
        btn.innerHTML = contenidoBoton;
        _cobroEnCurso = false;
    }
}

// Crea una cotización sin registrar un cobro ni descontar inventario.
export async function cotizar() {
    if (_cobroEnCurso) return;
    if (_cambioCarritoEnCurso) {
        mostrarMsg("Espera a que termine la reserva del carrito", "err");
        return;
    }
    if (_cotizacionEnVenta) { mostrarMsg("Esta cotización ya está lista para cobrar. Recalcula sus precios antes de crear otra.", "err"); return; }
    if (!can("cotizaciones.crear")) { mostrarMsg("No tienes permiso para crear cotizaciones", "err"); return; }
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    if (!store.carrito.length) { mostrarMsg("El carrito está vacío", "err"); return; }
    const sinPrecio = store.carrito.filter(it => !_precioValido(it));
    if (sinPrecio.length) { mostrarMsg("⚠ Producto(s) sin precio: " + sinPrecio.map(i => i.producto).join(", "), "err"); return; }
    const sucursales = [...new Set(store.carrito.map(item => String(item.sucursal || "").trim()).filter(Boolean))];
    if (sucursales.length > 1) { mostrarMsg("El carrito contiene productos de distintas sucursales", "err"); return; }

    const sucursal = sucursales[0] || sucursalVentaActual();
    const clienteInput = document.getElementById("clienteVenta");
    const clienteId = document.getElementById("clienteVentaId")?.value || null;
    const cliente = clienteInput?.value.trim() || undefined;
    const descuento = _calcularDescuentoVenta();
    if (!sucursal) { mostrarMsg("Selecciona una sucursal", "err"); return; }
    if (!descuento.valido || descuento.monto > descuento.subtotal) { mostrarMsg("El descuento no es válido", "err"); return; }

    const loader = document.getElementById("loaderVenta");
    const btn = document.getElementById("btnCotizar");
    const btnCobrar = document.getElementById("btnCobrar");
    const contenidoBoton = btn.innerHTML;
    _cobroEnCurso = true;
    loader.style.display = "block";
    btn.disabled = true;
    if (btnCobrar) btnCobrar.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> COTIZANDO...';
    try {
        const items = store.carrito.map(i => ({ producto: i.producto, cantidad: i.cantidad }));
        const data = await api({
            ACCION: "CREAR_COTIZACION", CARRITO: JSON.stringify(items), SUCURSAL: sucursal,
            CLIENTE_ID: clienteId, CLIENTE: cliente,
            DESCUENTO_TIPO: descuento.monto ? descuento.tipo : undefined,
            DESCUENTO_VALOR: descuento.monto ? descuento.valor : undefined,
            DESCUENTO_MOTIVO: document.getElementById("motivoDescuentoVenta")?.value.trim() || undefined,
            IDEMPOTENCY_KEY: _nuevaClaveIdempotencia(), CARRITO_ID: _idCarrito(), TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        if (!data.ok || !data.cotizacion) { mostrarMsg("Error: " + (data.error || "No se pudo crear la cotización"), "err"); return; }

        // El backend libera la reserva asociada al CARRITO_ID al crear la cotización.
        clearCarrito();
        _carritoId = "";
        limpiarCarritoDraft();
        _limpiarDescuentoVenta();
        renderCarrito();
        if (clienteInput) clienteInput.value = "";
        const clienteIdInput = document.getElementById("clienteVentaId");
        if (clienteIdInput) clienteIdInput.value = "";
        const clienteCredito = document.getElementById("clienteCreditoVenta");
        if (clienteCredito) clienteCredito.textContent = "";
        _clienteVentaSeleccionado = null;

        const cotizacion = data.cotizacion;
        const referencia = cotizacion.codigo || cotizacion.numero;
        const total = Number(cotizacion.total ?? Math.max(0, descuento.subtotal - descuento.monto));
        const toast = mostrarToast(`✅ COTIZACIÓN CREADA · Bs ${total.toFixed(2)}${referencia ? " · " + referencia : ""}`, "VER COTIZACIÓN", () => window.imprimirCotizacion?.(cotizacion), 6500);
        toast.classList.add("toast-venta-exitosa");
        window.imprimirCotizacion?.(cotizacion);
        document.getElementById(document.body.classList.contains("desktop") ? "escanerVenta" : "productoVenta")?.focus();
    } catch (_) {
        mostrarMsg("Error de conexión", "err");
    } finally {
        loader.style.display = "none";
        btn.disabled = false;
        if (btnCobrar) btnCobrar.disabled = false;
        btn.innerHTML = contenidoBoton;
        _cobroEnCurso = false;
    }
}

if (typeof window !== "undefined") {
    window._actualizarVisibilidadEfectivo = _actualizarVisibilidadEfectivo;
    window.actualizarCambioVenta = actualizarCambioVenta;
    window.seleccionarCorteEfectivo = seleccionarCorteEfectivo;
    window.actualizarMixtoVenta = actualizarMixtoVenta;
    window.actualizarDescuentoVenta = actualizarDescuentoVenta;
    window.cotizar = cotizar;
    window.listarCotizaciones = listarCotizaciones;
    window.buscarCotizaciones = buscarCotizaciones;
    window.cambiarSucursalCotizacion = cambiarSucursalCotizacion;
    window.cambiarEstadoCotizacion = cambiarEstadoCotizacion;
    window.toggleHistorialCotizaciones = toggleHistorialCotizaciones;
    window.cancelarCotizacion = cancelarCotizacion;
    window.cargarCotizacionParaVenta = cargarCotizacionParaVenta;
    window.recalcularCotizacion = recalcularCotizacion;
    window.abrirDetalleCotizacion = abrirDetalleCotizacion;
    window.cerrarDetalleCotizacion = cerrarDetalleCotizacion;
}

// Realtime: si cambia el precio de un producto que esta en el carrito, actualiza la fila
window.addEventListener("inventario:cambio", function(ev) {
    try {
        const det = ev.detail || {};
        if (det.eventType !== "UPDATE" || !det.new) return;
        const nuevo = det.new;
        const carrito = store.carrito;
        let cambio = false;
        carrito.forEach(function(it) {
            if (it.producto === nuevo.producto && (it.sucursal || "") === (nuevo.sucursal || "") && Number.isFinite(it.precio) && Number.isFinite(Number(nuevo.precio_venta))) {
                const np = Number(nuevo.precio_venta);
                if (it.precio !== np) {
                    it.precio = np;
                    it.total = np * it.cantidad;
                    cambio = true;
                }
            }
        });
        if (cambio) renderCarrito();
    } catch (_) {}
});

// ── Init: main.js llamara initVenta() en fase 5 ──────────────
