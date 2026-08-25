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
import { mostrarMsg, mostrarToast, vibrar, sonidoCaja, normBusqueda, formatearBs } from '../utils.js';
import { manejarRespuesta } from '../ui.js';
import { construirAC, cargarInventario } from '../inventario.js';
import { iniciarEscanerCamara, iniciarEscanerContinuo, detenerEscanerCamara, buscarPorCodigo, onInputScanner, CODIGO_REGEX } from '../escaner.js';
import { registrarComprobante, listarComprobantes } from './comprobantes.js';

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
let _clientesVenta = [];
let _escanerVentaMovilActivo = false;

export function initVenta(callbacks) {
    if (callbacks.verificarEstadoCaja) _verificarEstadoCaja = callbacks.verificarEstadoCaja;
    initEscanerVenta();
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
        if (activo && activo !== input && activo.tagName === "INPUT" && ["productoVenta", "cantidadVenta", "clienteVenta"].includes(activo.id)) {
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
    const suc = store.sessionSucursal || document.getElementById("sucursalVenta").value;
    if (!suc) {
        mostrarMsg("Selecciona una sucursal", "err");
        return;
    }
    let prod = buscarPorCodigo(codigo, suc);
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
        agregarPorProducto(prod, suc);
    } else {
        mostrarMsg("Producto no encontrado: " + codigo, "err");
    }
}

// Mantiene visible el campo de cliente para cualquier metodo de pago
            export function toggleClienteVenta() {
                document.getElementById("campoClienteVenta")?.classList.remove("oculto");
            }

// Carga clientes existentes para el autocompletado de ventas
export async function cargarClientes() {
    if (!store.sessionToken) return;
    try {
        const data = await api({
            ACCION: "LISTAR_CLIENTES",
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
    const texto = input.value.trim().toLowerCase();
    lista.innerHTML = "";
    if (!texto) {
        lista.classList.remove("show");
        return;
    }
    _clientesVenta
        .filter(cliente => normBusqueda(cliente).includes(normBusqueda(texto)))
        .slice(0, 8)
        .forEach(cliente => {
            const item = document.createElement("div");
            item.className = "ac-item";
            item.textContent = cliente;
            item.addEventListener("click", () => {
                input.value = cliente;
                lista.classList.remove("show");
            });
            lista.appendChild(item);
        });
    lista.classList.toggle("show", lista.children.length > 0);
}

// Agrega producto al carrito por objeto producto (usado por escaner)
function agregarPorProducto(prod, sucursal) {
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
            imagen: prod.imagen || ""
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
    const suc = store.sessionSucursal || document.getElementById("sucursalVenta").value;
    if (!suc) {
        if (estado) estado.textContent = "Selecciona una sucursal antes de escanear";
        return;
    }
    if (estado) estado.textContent = "Buscando producto...";
    let prod = buscarPorCodigo(codigo, suc);
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
        agregarPorProducto(prod, suc);
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
        const suc = store.sessionSucursal || document.getElementById("sucursalVenta").value;
        let prod = buscarPorCodigo(codigo, suc);
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
            agregarPorProducto(prod, suc);
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
        const suc = store.sessionSucursal || document.getElementById("sucursalVenta").value;
        if (!valor || !suc) return;
        onInputScanner(valor, suc, async function(prod) {
            if (prod) {
                agregarPorProducto(prod, suc);
            } else if (CODIGO_REGEX.test(valor)) {
                const data = await api({
                    ACCION: "BUSCAR_PRODUCTO_CODIGO",
                    CODIGO: valor,
                    SUCURSAL: suc,
                    TOKEN: store.sessionToken
                });
                if (data.ok && data.producto) {
                    agregarPorProducto(data.producto, suc);
                }
            }
            input.value = "";
        });
    });
}

// Busca productos en inventario para autocompletar en la venta
            export function buscarProductoVenta() {
                const su = document.getElementById("sucursalVenta").value;
                if (!su) {
                    document.getElementById("listaVenta").classList.remove("show");
                    return
                }
                const t = normBusqueda(document.getElementById("productoVenta").value)
                  , l = document.getElementById("listaVenta")
                  , info = document.getElementById("infoProductoVenta");
                info.classList.remove("show");
                if (t.length < 1) {
                    l.classList.remove("show");
                    return
                }
                construirAC(l, store.inventarioGlobal.filter(p => normBusqueda(p.producto).includes(t) && p.sucursal === su), p => {
                    document.getElementById("productoVenta").value = p.producto;
                    info.innerHTML = `Stock disponible: <b>${p.stock}</b> | Precio: <b>${formatearBs(p.precio)}</b>` + (p.stock <= 5 ? `<br><span class="stock-bajo">⚠ Stock bajo</span>` : "");
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
        tot += Number(it.total || 0);
        const precioOK = _precioValido(it);
        const precioCelda = precioOK ? formatearBs(it.precio) : '<span style="color:var(--red);font-weight:700">⚠ sin precio</span>';
        const totalCelda = precioOK ? formatearBs(it.total) : '<span style="color:var(--red);font-weight:700">⚠ sin precio</span>';
        tb.innerHTML += `<tr><td class="col-prod">${it.producto}</td><td><div class="qty-cell"><button class="btn-plus" data-accion="sumar" data-index="${i}" title="Aumentar cantidad">+</button><span>${it.cantidad}</span></div></td><td>${precioCelda}</td><td>${totalCelda}</td><td><button class="btn-del" data-accion="eliminar" data-index="${i}">✕</button></td></tr>`;
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
    document.getElementById("totalVenta").textContent = "Bs " + tot.toFixed(2);
    document.getElementById("tituloCarrito").innerHTML = `🛒 Carrito <span style="color:var(--muted)">(${carrito.length})</span>`;
    renderCarritoEscaner();
    _actualizarVisibilidadEfectivo();
            }

function _actualizarVisibilidadEfectivo() {
    const contEf = document.getElementById("campoEfectivoVenta");
    const contMixto = document.getElementById("campoMixtoVenta");
    const metodo = document.getElementById("metodoPagoVenta");
    const hayItems = !!store.carrito.length;
    const esEfectivo = !!metodo && metodo.value === "EFECTIVO" && hayItems;
    const esMixto = !!metodo && metodo.value === "MIXTO" && hayItems;
    if (contEf) {
        contEf.classList.toggle("oculto", !esEfectivo);
        if (!esEfectivo) {
            const input = document.getElementById("efectivoRecibidoVenta");
            const out = document.getElementById("cambioVenta");
            if (input) input.value = "";
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

// Elimina un item del carrito con animacion swipe y toast de deshacer
                  export function eliminarItem(i) {
                  const carrito = [...store.carrito];
    const item = carrito[i];
    if (item.cantidad > 1) {
        item.cantidad -= 1;
        item.total = item.precio * item.cantidad;
        setCarrito(carrito);
        renderCarrito();
        return;
    }
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

// Aumenta la cantidad de un item del carrito en 1 (con validacion de stock)
            function incrementarCantidad(i) {
                const carrito = [...store.carrito]
                  , item = carrito[i];
                if (!item) return;
                const su = store.sessionSucursal || document.getElementById("sucursalVenta").value
                  , p = store.inventarioGlobal.find(x => x.producto === item.producto && x.sucursal === su)
                  , nueva = item.cantidad + 1;
                if (p && p.stock < nueva) {
                    mostrarMsg("Stock insuficiente (disponible: " + p.stock + ")", "err");
                    return;
                }
                item.cantidad = nueva;
                item.total = item.precio * item.cantidad;
                setCarrito(carrito);
                renderCarrito();
                vibrar("ok");
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
    const sinPrecio = store.carrito.filter(it => !_precioValido(it));
    if (sinPrecio.length > 0) {
        mostrarMsg("⚠ Producto(s) sin precio: " + sinPrecio.map(i => i.producto).join(", "), "err");
        return
    }
    const sucursal = store.sessionSucursal || document.getElementById("sucursalVenta").value
      , metodoPago = document.getElementById("metodoPagoVenta").value
      , cliente = document.getElementById("clienteVenta").value || "MOSTRADOR";
    const mEfMixto = Number((document.getElementById("montoEfectivoMixtoVenta") || {}).value || 0);
    const mTrMixto = Number((document.getElementById("montoTransferenciaMixtoVenta") || {}).value || 0);
    if (!sucursal) {
        mostrarMsg("Selecciona una sucursal", "err");
        return
    }
    if (metodoPago === "CREDITO" && !document.getElementById("clienteVenta").value.trim()) {
        mostrarMsg("Ingresa el nombre del cliente para ventas a credito", "err");
        return
    }
    if (metodoPago === "MIXTO") {
        const totalMixto = store.carrito.reduce(function(s, i) { return s + (i.cantidad * i.precio); }, 0);
        if (!Number.isFinite(mEfMixto) || mEfMixto < 0 || !Number.isFinite(mTrMixto) || mTrMixto < 0) {
            mostrarMsg("Ingresa los montos del pago mixto", "err");
            return
        }
        if (Math.abs(mEfMixto + mTrMixto - totalMixto) > 0.01) {
            mostrarMsg("Los montos deben sumar el total", "err");
            return
        }
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
                    const payload = {
                        ACCION: "VENTA_POS",
                        ...carritoParam,
                        SUCURSAL: sucursal,
                        METODO_PAGO: metodoPago,
                        CLIENTE: cliente,
                        TOKEN: store.sessionToken
                    };
                    if (metodoPago === "MIXTO") {
                        payload.MONTO_EFECTIVO = mEfMixto;
                        payload.MONTO_TRANSFERENCIA = mTrMixto;
                    }
                    const data = await api(payload);
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
                        const ventaResumen = {
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
                        };
                        setUltimaVenta(ventaResumen);
                        const reg = await registrarComprobante(ventaResumen);
                        if (reg && reg.numero !== undefined && reg.numero !== null) {
                            ventaResumen.numero = reg.numero;
                            setUltimaVenta(ventaResumen);
                        }
                        document.getElementById('btnComprobante').style.display='inline-block';
                        var msgVenta = metodoPago === "CREDITO" ? "📝 Venta a crédito registrada" : "✅ Venta registrada (" + items.length + " productos)";
                        if (reg && reg.numero !== undefined && reg.numero !== null) {
                            msgVenta += " · N° " + reg.numero;
                        }
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
                        const ef = document.getElementById("efectivoRecibidoVenta");
                        if (ef) ef.value = "";
                        const cm = document.getElementById("cambioVenta");
                        if (cm) {
                            cm.textContent = "—";
                            cm.classList.remove("cambio-positivo", "cambio-negativo");
                        }
                        const inEfMixto = document.getElementById("montoEfectivoMixtoVenta");
                        const inTrMixto = document.getElementById("montoTransferenciaMixtoVenta");
                        const avisoMixto = document.getElementById("avisoMixtoVenta");
                        if (inEfMixto) inEfMixto.value = "";
                        if (inTrMixto) inTrMixto.value = "";
                        if (avisoMixto) {
                            avisoMixto.textContent = "";
                            avisoMixto.classList.remove("cambio-positivo", "cambio-negativo");
                        }
                        _actualizarVisibilidadEfectivo();
                        cargarInventario();
                        listarComprobantes();
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

if (typeof window !== "undefined") {
    window._actualizarVisibilidadEfectivo = _actualizarVisibilidadEfectivo;
    window.actualizarCambioVenta = actualizarCambioVenta;
    window.actualizarMixtoVenta = actualizarMixtoVenta;
}

// ── Init: main.js llamara initVenta() en fase 5 ──────────────
