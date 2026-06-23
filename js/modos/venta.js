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

import { CARRITO_KEY, CARRITO_CHUNK_SIZE } from '../config.js';
import { store, setCarrito, clearCarrito, setUltimaVenta } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, mostrarToast, vibrar, sonidoCaja } from '../utils.js';
import { manejarRespuesta } from '../ui.js';
import { construirAC, cargarInventario } from '../inventario.js';

function _guardarCarritoDraft() {
    try {
        localStorage.setItem(CARRITO_KEY, JSON.stringify({
            carrito: store.carrito,
            sucursal: document.getElementById("sucursalVenta")?.value || "",
            ts: Date.now()
        }));
    } catch(e) {}
}

// ── CALLBACKS ─────────────────────────────────────────────────
let _verificarEstadoCaja = null;

export function initVenta(callbacks) {
    if (callbacks.verificarEstadoCaja) _verificarEstadoCaja = callbacks.verificarEstadoCaja;
}

// Muestra/oculta el campo de cliente segun metodo de pago (CREDITO)
            export function toggleClienteVenta() {
                document.getElementById("campoClienteVenta").classList.toggle("oculto", document.getElementById("metodoPagoVenta").value !== "CREDITO")
            }

// Busca productos en inventario para autocompletar en la venta
            export function buscarProductoVenta() {
                const su = document.getElementById("sucursalVenta").value;
                if (!su) {
                    document.getElementById("listaVenta").classList.remove("show");
                    return
                }
                const t = document.getElementById("productoVenta").value.toLowerCase()
                  , l = document.getElementById("listaVenta")
                  , info = document.getElementById("infoProductoVenta");
                info.classList.remove("show");
                if (t.length < 1) {
                    l.classList.remove("show");
                    return
                }
                construirAC(l, store.inventarioGlobal.filter(p => p.producto.toLowerCase().includes(t) && p.sucursal === su), p => {
                    document.getElementById("productoVenta").value = p.producto;
                    info.innerHTML = `Stock disponible: <b>${p.stock}</b> | Precio: <b>Bs ${p.precio}</b>` + (p.stock <= 5 ? `<br><span class="stock-bajo">⚠ Stock bajo</span>` : "");
                    info.classList.add("show")
                }
                )
            }

// Agrega un producto al carrito de venta con validaciones de stock
            export function agregarCarrito() {
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
                const p = store.inventarioGlobal.find(x => x.producto === pr && x.sucursal === su);
                if (!p) {
                    mostrarMsg("Producto no encontrado en inventario", "err");
                    return
                }
                if (p.stock < ca) {
                    mostrarMsg("Stock insuficiente (disponible: " + p.stock + ")", "err");
                    return
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
            imagen: p.imagen || ""
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
                try { localStorage.removeItem(CARRITO_KEY); } catch(e) {}
            }

// Renderiza la tabla del carrito, miniaturas y actualiza el total
            export function renderCarrito() {
                const tb = document.getElementById("carritoBody")
                  , minis = document.getElementById("carritoMiniaturas");
                tb.innerHTML = "";
                minis.innerHTML = "";
                let tot = 0;
    const carrito = store.carrito;
    carrito.forEach( (it, i) => {
        tot += it.total;
        tb.innerHTML += `<tr><td class="col-prod">${it.producto}</td><td>${it.cantidad}</td><td>Bs ${it.precio}</td><td>Bs ${it.total.toFixed(2)}</td><td><button class="btn-del" data-accion="eliminar" data-index="${i}">✕</button></td></tr>`;
        if (it.imagen) {
            const mini = document.createElement("div");
            mini.className = "miniatura";
            mini.innerHTML = `<img src="${it.imagen}" alt="${it.producto}"><div class="miniatura-badge">${it.cantidad}</div>`;
            minis.appendChild(mini)
        }
    });
    // Vincular eventos a los botones de eliminar generados dinamicamente
    tb.querySelectorAll('[data-accion="eliminar"]').forEach(btn => {
        btn.addEventListener('click', function() {
            eliminarItem(Number(this.dataset.index));
        });
    });
    _guardarCarritoDraft();
    document.getElementById("totalVenta").textContent = "Bs " + tot.toFixed(2);
    document.getElementById("tituloCarrito").innerHTML = `🛒 Carrito <span style="color:var(--muted)">(${carrito.length})</span>`
            }

// Elimina un item del carrito con animacion swipe y toast de deshacer
                  export function eliminarItem(i) {
                  const carrito = [...store.carrito];
    const itemEliminado = { ...carrito[i] };
    const indexEliminado = i;

    // Animacion swipe
    const filas = document.querySelectorAll("#carritoBody tr");
    if (filas[i]) {
        filas[i].classList.add("swipe-out");
        setTimeout(() => {
            const c = [...store.carrito];
            c.splice(indexEliminado, 1);
            setCarrito(c);
            renderCarrito();
        }, 200);
    } else {
        carrito.splice(i, 1);
        setCarrito(carrito);
        renderCarrito();
    }

    mostrarToast(
        `🗑️ "${itemEliminado.producto}" eliminado`,
        "Deshacer",
        () => {
            const c = [...store.carrito];
            c.splice(indexEliminado, 0, itemEliminado);
            setCarrito(c);
            renderCarrito();
            mostrarMsg("↩ Producto restaurado al carrito", "ok");
        }
    );
                }

// Procesa la venta POS: envia carrito a la API, maneja chunking para carritos grandes
            export async function cobrar() {
                if (!store.sessionToken) {
                    mostrarMsg("Sesión expirada", "err");
                    return
                }
                if (store.carrito.length === 0) {
        mostrarMsg("El carrito esta vacio", "err");
        return
    }
    const sucursal = document.getElementById("sucursalVenta").value
      , usuario = document.getElementById("usuarioVenta").value || store.sessionUser
      , metodoPago = document.getElementById("metodoPagoVenta").value
      , cliente = document.getElementById("clienteVenta").value || "MOSTRADOR";
    if (!sucursal) {
        mostrarMsg("Selecciona una sucursal", "err");
        return
    }
    if (metodoPago === "CREDITO" && !document.getElementById("clienteVenta").value.trim()) {
        mostrarMsg("Ingresa el nombre del cliente para ventas a credito", "err");
        return
    }
    const loader = document.getElementById("loaderVenta")
      , btn = document.getElementById("btnCobrar");
    loader.style.display = "block";
    btn.disabled = true;

    const totalOriginal = store.carrito.reduce(function(s, i) { return s + (i.cantidad * i.precio); }, 0);
    const totalRedondeado = metodoPago === "EFECTIVO" ? Math.round(totalOriginal * 10) / 10 : totalOriginal;
    const ajusteRedondeo = parseFloat((totalRedondeado - totalOriginal).toFixed(2));

    try {
        const items = store.carrito.map(i => ({
            producto: i.producto,
            cantidad: i.cantidad
        }));
                    let carritoParam = {};
                    if (items.length <= CARRITO_CHUNK_SIZE) {
                        carritoParam = {
                            CARRITO: JSON.stringify(items)
                        };
                    } else {
                        let carritoId = null;
                        for (let i = 0; i < items.length; i += CARRITO_CHUNK_SIZE) {
                            const chunk = items.slice(i, i + CARRITO_CHUNK_SIZE);
                            const params = {
                                ACCION: "CARRITO_GUARDAR",
                                ITEMS: JSON.stringify(chunk),
                                TOKEN: store.sessionToken
                            };
                            if (carritoId)
                                params.CARRITO_ID = carritoId;
                            const res = await api(params);
                            if (!res.ok) {
                                mostrarMsg("Error preparando carrito: " + (res.error || "desconocido"), "err");
                                loader.style.display = "none";
                                btn.disabled = false;
                                return
                            }
                            carritoId = res.carritoId;
                        }
                        carritoParam = {
                            CARRITO_ID: carritoId
                        };
                    }
                    const data = await api({
                        ACCION: "VENTA_POS",
                        ...carritoParam,
                        SUCURSAL: sucursal,
                        USUARIO: usuario,
                        METODO_PAGO: metodoPago,
                        CLIENTE: cliente,
                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        btn.disabled = false;
                        return
                    }
                    if (data.ok) {
                        sonidoCaja();
                        vibrar("caja");
                        /* Cache venta para comprobante PDF */
                        const carrito = store.carrito;
                        setUltimaVenta({
                            items: carrito.map(function(i){return {producto:i.producto,cantidad:i.cantidad,precio:i.precio}}),
                            total: totalOriginal,
                            totalRedondeado: totalRedondeado,
                            ajusteRedondeo: ajusteRedondeo,
                            metodoPago: metodoPago,
                            sucursal: sucursal,
                            cliente: cliente,
                            usuario: store.sessionUser,
                            fecha: new Date().toISOString().slice(0,10),
                            hora: new Date().toLocaleTimeString()
                        });
                        document.getElementById('btnComprobante').style.display='inline-block';
                        var msgVenta = metodoPago === "CREDITO" ? "📝 Venta a crédito registrada" : "✅ Venta registrada (" + items.length + " productos)";
                        if (metodoPago === "EFECTIVO" && ajusteRedondeo !== 0) {
                            msgVenta += " · Redondeo: " + (ajusteRedondeo > 0 ? "+" : "") + "Bs " + ajusteRedondeo.toFixed(2);
                        }
                        mostrarMsg(msgVenta, "ok");
                        document.getElementById("mainPanel").classList.add("ok");
                        setTimeout( () => document.getElementById("mainPanel").classList.remove("ok"), 700);
                        clearCarrito();
                            limpiarCarritoDraft();  // llamada directa
                            renderCarrito();
                        document.getElementById("clienteVenta").value = "";
                        cargarInventario();
                        if (_verificarEstadoCaja) _verificarEstadoCaja();
                    } else if (data.error === "STOCK_INSUFICIENTE") {
                        mostrarMsg("⚠ Stock insuficiente: " + data.producto + " (disponible: " + data.disponible + ")", "err")
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                                } catch (e) {
                                    mostrarMsg("Error de conexión", "err")
                                }
                loader.style.display = "none";
                btn.disabled = false;
            }

// ── Init: main.js llamara initVenta() en fase 5 ──────────────
