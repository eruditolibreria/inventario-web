/* === MODO COMPRA: Busqueda, registro y gestion de proveedores === */

/*
 * Funciones del modulo de compras: autocompletado de productos,
 * registro de compras con calculo de costo unitario, y toggle
 * de proveedor para compras a credito.
 *
 * Dependencias directas (ya modulos):
 *   - ../config.js       (Hoy, horaActual)
 *   - ../store.js        (store)
 *   - ../api.js          (api)
 *   - ../utils.js        (mostrarMsg, hoy)
 *   - ../ui.js           (manejarRespuesta)
 *   - ../inventario.js   (construirAC, cargarInventario)
 *
 * Dependencias inyectadas via initCompra() (modos futuros o navegacion):
 *   - verificarEstadoCaja()
 *
 * Uso:
 *   import { initCompra, buscarProductoCompra, registrarCompra } from './modos/compra.js';
 *   initCompra({ verificarEstadoCaja });
 */

import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, hoy } from '../utils.js';
import { manejarRespuesta } from '../ui.js';
import { construirAC, cargarInventario } from '../inventario.js';

// ── CALLBACKS ─────────────────────────────────────────────────
let _verificarEstadoCaja = null;

export function initCompra(callbacks) {
    if (callbacks.verificarEstadoCaja) _verificarEstadoCaja = callbacks.verificarEstadoCaja;
}


// Muestra/oculta el campo de proveedor segun metodo de pago (CREDITO)
            export function toggleClienteCompra() {
                document.getElementById("campoClienteCompra").classList.toggle("oculto", document.getElementById("metodoPagoCompra").value !== "CREDITO")
            }

// Busca productos en inventario para autocompletar en la compra
            export function buscarProductoCompra() {
                const t = document.getElementById("productoCompra").value.toLowerCase()
                  , s = document.getElementById("sucursalCompra").value
                  , l = document.getElementById("listaCompra")
                  , info = document.getElementById("infoCompra");
                info.classList.remove("show");
                if (t.length < 1) {
                    l.classList.remove("show");
                    return
                }
                construirAC(l, store.inventarioGlobal.filter(p => p.producto.toLowerCase().includes(t) && p.sucursal === s), p => {
                    document.getElementById("productoCompra").value = p.producto;
                    document.getElementById("categoriaCompra").value = p.categoria || "";
                    document.getElementById("precioVentaCompra").value = p.precio;
                    document.getElementById("proveedorCompra").value = p.proveedor || "";
                    document.getElementById("ubicacionCompra").value = p.ubicacion || "";
                    info.textContent = "Stock actual: " + p.stock;
                    info.classList.add("show")
                }
                )
            }

// Registra una compra de mercaderia con validaciones
            export async function registrarCompra() {
                if (!store.sessionToken) {
                    mostrarMsg("Sesión expirada", "err");
                    return
                }
                const mp = document.getElementById("metodoPagoCompra").value
                  , cl = document.getElementById("clienteCompra").value || document.getElementById("proveedorCompra").value;
                if (mp === "CREDITO" && !document.getElementById("proveedorCompra").value.trim()) {
                    mostrarMsg("Ingresa el nombre del proveedor/acreedor para compras a crédito", "err");
                    return
                }
                const loader = document.getElementById("loaderCompra");
                loader.style.display = "block";
                try {
                    const data = await api({
                        ACCION: "COMPRA",
                        PRODUCTO: document.getElementById("productoCompra").value,
                        CATEGORIA: document.getElementById("categoriaCompra").value,
                        COSTO_PAQUETE: document.getElementById("costoCompra").value,
                        CANTIDAD_PAQUETE: document.getElementById("cantidadCompra").value,
                        UNIDADES_PAQUETE: document.getElementById("unidadesCompra").value,
                        PRECIO_VENTA: document.getElementById("precioVentaCompra").value,
                        PROVEEDOR: document.getElementById("proveedorCompra").value,
                        FECHA_ENTRADA: document.getElementById("fechaCompra").value,
                        UBICACION_PRODUCTO: document.getElementById("ubicacionCompra").value,
                        SUCURSAL: document.getElementById("sucursalCompra").value,
                        METODO_PAGO: mp,
                        CLIENTE: cl,
                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (data.ok) {
                        mostrarMsg(mp === "CREDITO" ? "📝 Compra a crédito registrada" : "✅ Compra registrada", "ok");
                        document.querySelectorAll("#seccion-COMPRA input").forEach(i => i.value = "");
                        document.getElementById("categoriaCompra").value = "";
                        document.getElementById("metodoPagoCompra").value = "EFECTIVO";
                        toggleClienteCompra();
                        document.getElementById("fechaCompra").value = hoy();
                        cargarInventario();
                        if (_verificarEstadoCaja) _verificarEstadoCaja();
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                } catch (e) {
                    mostrarMsg("Error de conexión", "err")
                }
                loader.style.display = "none";
            }

// ── Init: main.js llamara initCompra() en fase 5 ──────────────
