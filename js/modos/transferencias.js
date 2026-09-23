/* === MODO TRANSFERENCIAS: Movimiento de stock entre sucursales === */
import { store, setTransfPagina } from '../store.js';
import { api } from '../api.js';
import { TRANSF_LIMITE } from '../config.js';
import { mostrarMsg, normBusqueda, debounce, fechaBolivia } from '../utils.js';
import { manejarRespuesta } from '../ui.js';
import { listarProductos, buscarProductoPorNombre, buscarProductoPorCodigo } from '../db.js';
import { iniciarEscanerCamara, detenerEscanerCamara } from '../escaner.js';

let _verificarEstadoCaja = null;
let _productos = [];
let _origenProductos = null;
let _idempotencyKey = null;
let _transferenciaEnCurso = false;

export function initTransferencias(cb) {
    if (cb?.verificarEstadoCaja) _verificarEstadoCaja = cb.verificarEstadoCaja;
    _renderProductos();
}

document.addEventListener("DOMContentLoaded", function() {
    const origen = document.getElementById("transfOrigen");
    const destino = document.getElementById("transfDestino");
    if (origen) {
        origen.addEventListener("change", () => {
            if (_productos.length && origen.value !== _origenProductos) {
                if (!confirm("Cambiar la sucursal de origen vaciará la lista de productos. ¿Deseas continuar?")) {
                    origen.value = _origenProductos || "";
                    return;
                }
                _productos = [];
                _origenProductos = null;
                _idempotencyKey = null;
                _renderProductos();
                mostrarMsg("La lista se vació al cambiar la sucursal de origen", "ok");
            }
            actualizarInfoTransf();
        });
    }
    if (destino) destino.addEventListener("change", () => {
        _idempotencyKey = null;
        actualizarInfoTransf();
    });
    const agregar = document.getElementById("btnAgregarProductoTransf");
    if (agregar) agregar.addEventListener("click", agregarProductoTransferencia);
    ["transfMotivo", "transfNotas"].forEach(id => {
        const campo = document.getElementById(id);
        if (campo) campo.addEventListener("input", _invalidarIntento);
    });
});

function _nombreSucursal(codigo) {
    if (!codigo) return "";
    const ids = ["transfOrigen", "transfDestino", "filtroTransfOrigen", "filtroTransfDestino"];
    for (const id of ids) {
        const opcion = [...(document.getElementById(id)?.options || [])].find(item => item.value === codigo);
        if (opcion) return opcion.textContent.trim();
    }
    return codigo;
}

function _texto(elemento, texto, clase) {
    const nodo = document.createElement(elemento);
    nodo.textContent = texto;
    if (clase) nodo.className = clase;
    return nodo;
}

function _invalidarIntento() {
    if (!_transferenciaEnCurso) _idempotencyKey = null;
}

function _renderProductos() {
    const contenedor = document.getElementById("listaProductosTransf");
    const boton = document.getElementById("btnRegistrarTransferencia");
    if (boton) boton.textContent = _productos.length ? `🔄 Transferir ${_productos.length} producto${_productos.length === 1 ? "" : "s"}` : "🔄 Transferir";
    if (!contenedor) return;
    contenedor.replaceChildren();
    if (!_productos.length) {
        contenedor.appendChild(_texto("div", "Agrega los productos que deseas transferir.", "transf-lista-vacia"));
        return;
    }
    _productos.forEach((item, indice) => {
        const fila = document.createElement("div");
        fila.className = "transf-item";
        const info = document.createElement("div");
        info.className = "transf-item-info";
        info.append(_texto("strong", item.producto), _texto("small", `Stock disponible: ${item.stock}`));
        const cantidad = document.createElement("input");
        cantidad.className = "transf-item-cantidad";
        cantidad.type = "number";
        cantidad.min = "1";
        cantidad.max = String(item.stock);
        cantidad.value = String(item.cantidad);
        cantidad.setAttribute("aria-label", `Cantidad de ${item.producto}`);
        cantidad.addEventListener("change", () => {
            const nuevaCantidad = Number(cantidad.value);
            if (!Number.isFinite(nuevaCantidad) || nuevaCantidad <= 0 || nuevaCantidad > item.stock) {
                cantidad.value = String(item.cantidad);
                mostrarMsg(`Ingresa una cantidad entre 1 y ${item.stock}`, "err");
                return;
            }
            item.cantidad = nuevaCantidad;
            _invalidarIntento();
        });
        const quitar = document.createElement("button");
        quitar.type = "button";
        quitar.className = "btn btn-ghost btn-sm transf-item-quitar";
        quitar.textContent = "Quitar";
        quitar.addEventListener("click", () => {
            _productos.splice(indice, 1);
            if (!_productos.length) _origenProductos = null;
            _invalidarIntento();
            _renderProductos();
        });
        fila.append(info, cantidad, quitar);
        contenedor.appendChild(fila);
    });
}

// Autocompleta productos de la sucursal de origen elegida.
const _transfAcBuscar = debounce(async function(t, lista, origen) {
    try {
        const { datos } = await listarProductos({ query: t, sucursal: origen, limite: 8, contar: false });
        if (document.getElementById("transfOrigen")?.value !== origen) return;
        lista.replaceChildren();
        if (!datos.length) { lista.classList.remove("show"); return; }
        datos.slice(0, 8).forEach(p => {
            const div = document.createElement("div");
            div.className = "ac-item";
            div.append(_texto("strong", p.producto), _texto("small", `Stock disponible: ${p.stock}`));
            div.addEventListener("click", () => {
                document.getElementById("transfProducto").value = p.producto;
                lista.classList.remove("show");
                actualizarInfoTransf();
            });
            lista.appendChild(div);
        });
        lista.classList.add("show");
    } catch (_) {
        lista.classList.remove("show");
    }
}, 300);

export function buscarProductoTransf() {
    const producto = document.getElementById("transfProducto");
    const termino = normBusqueda(producto.value);
    const lista = document.getElementById("listaTransf");
    const origen = document.getElementById("transfOrigen").value;
    document.getElementById("infoTransf").classList.remove("show");
    if (!termino || !origen) { lista.classList.remove("show"); return; }
    _transfAcBuscar(termino, lista, origen);
}

// Escanea un producto usando la sucursal de origen seleccionada.
export async function abrirEscanerTransferencia() {
    const modal = document.getElementById("escanerModal");
    const video = document.getElementById("escanerVideo");
    const estado = document.getElementById("escanerEstado");
    const origenEl = document.getElementById("transfOrigen");
    const origen = origenEl.value;
    if (!origen) {
        mostrarMsg("Selecciona la sucursal de origen antes de escanear", "err");
        origenEl.focus();
        return;
    }
    if (!modal || !video) return;
    modal.style.display = "flex";
    if (estado) estado.textContent = "Apuntando cámara...";
    try {
        const codigo = await iniciarEscanerCamara(video);
        let producto = null;
        try {
            producto = await buscarProductoPorCodigo(String(codigo || "").trim(), origen);
        } catch (_) {
            mostrarMsg("Error de conexión al buscar el producto", "err");
            return;
        }
        if (!producto) {
            mostrarMsg("Producto no encontrado en " + _nombreSucursal(origen) + ": " + codigo, "err");
            return;
        }
        document.getElementById("transfProducto").value = producto.producto || "";
        document.getElementById("listaTransf").classList.remove("show");
        await actualizarInfoTransf();
    } catch (e) {
        if (e.message === "NO_SOPORTADO") mostrarMsg("Escáner no soportado en este navegador", "err");
        else mostrarMsg("Error de cámara", "err");
    } finally {
        detenerEscanerCamara();
        modal.style.display = "none";
    }
}

// Muestra el stock del producto seleccionado antes de agregarlo a la lista.
export async function actualizarInfoTransf() {
    const producto = document.getElementById("transfProducto").value.trim();
    const origen = document.getElementById("transfOrigen").value;
    const destino = document.getElementById("transfDestino").value;
    const info = document.getElementById("infoTransf");
    const ruta = document.getElementById("transfArrowDisplay");
    if (origen && destino && origen !== destino) {
        document.getElementById("transfArrowOrigen").textContent = _nombreSucursal(origen);
        document.getElementById("transfArrowDestino").textContent = _nombreSucursal(destino);
        ruta.style.display = "flex";
    } else {
        ruta.style.display = "none";
    }
    if (!producto || !origen) { info.classList.remove("show"); return; }
    try {
        const inventario = await buscarProductoPorNombre(producto, origen);
        if (document.getElementById("transfProducto").value.trim() !== producto || document.getElementById("transfOrigen").value !== origen) return;
        if (inventario) {
            info.textContent = `Stock en ${_nombreSucursal(origen)}: ${inventario.stock} ud.`;
            if (inventario.stock <= 5) info.append(" ⚠ Stock bajo");
        } else {
            info.textContent = `Sin stock en ${_nombreSucursal(origen)}`;
        }
        info.classList.add("show");
    } catch (_) {
        info.classList.remove("show");
    }
}

export async function agregarProductoTransferencia() {
    const productoEl = document.getElementById("transfProducto");
    const cantidadEl = document.getElementById("transfCantidad");
    const producto = productoEl.value.trim();
    const origen = document.getElementById("transfOrigen").value;
    const cantidad = Number(cantidadEl.value);
    if (!origen) { mostrarMsg("Selecciona la sucursal de origen", "err"); return; }
    if (!producto) { mostrarMsg("Selecciona un producto", "err"); return; }
    if (!Number.isFinite(cantidad) || cantidad <= 0) { mostrarMsg("Ingresa una cantidad válida", "err"); return; }
    try {
        const inventario = await buscarProductoPorNombre(producto, origen);
        if (!inventario) { mostrarMsg("El producto no existe en la sucursal de origen", "err"); return; }
        const existente = _productos.find(item => item.producto === inventario.producto);
        const nuevaCantidad = cantidad + (existente?.cantidad || 0);
        if (nuevaCantidad > Number(inventario.stock || 0)) {
            mostrarMsg("Stock insuficiente en origen (disponible: " + inventario.stock + ")", "err");
            return;
        }
        if (existente) {
            existente.cantidad = nuevaCantidad;
            existente.stock = Number(inventario.stock || 0);
        } else {
            _productos.push({ producto: inventario.producto, cantidad, stock: Number(inventario.stock || 0) });
            _origenProductos = origen;
        }
        _invalidarIntento();
        productoEl.value = "";
        cantidadEl.value = "";
        document.getElementById("listaTransf").classList.remove("show");
        document.getElementById("infoTransf").classList.remove("show");
        _renderProductos();
    } catch (_) {
        mostrarMsg("Error de conexión al verificar el stock", "err");
    }
}

function _limpiarFormularioTransferencia() {
    _productos = [];
    _origenProductos = null;
    _idempotencyKey = null;
    ["transfProducto", "transfCantidad", "transfMotivo", "transfNotas", "transfOrigen", "transfDestino"].forEach(id => {
        const campo = document.getElementById(id);
        if (campo) campo.value = "";
    });
    document.getElementById("infoTransf").classList.remove("show");
    document.getElementById("transfArrowDisplay").style.display = "none";
    _renderProductos();
}

// Ejecuta una transferencia atómica de todos los productos agregados.
export async function registrarTransferencia() {
    if (_transferenciaEnCurso) return;
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    const origen = document.getElementById("transfOrigen").value;
    const destino = document.getElementById("transfDestino").value;
    const motivo = document.getElementById("transfMotivo").value.trim();
    const notas = document.getElementById("transfNotas").value.trim();
    if (!_productos.length) { mostrarMsg("Agrega al menos un producto", "err"); return; }
    if (!origen) { mostrarMsg("Selecciona la sucursal de origen", "err"); return; }
    if (!destino) { mostrarMsg("Selecciona la sucursal de destino", "err"); return; }
    if (origen === destino) { mostrarMsg("Origen y destino no pueden ser la misma sucursal", "err"); return; }
    const resumen = _productos.map(item => `• ${item.producto}: ${item.cantidad} ud.`).join("\n");
    if (!confirm(`¿Transferir ${_productos.length} producto${_productos.length === 1 ? "" : "s"} de ${_nombreSucursal(origen)} a ${_nombreSucursal(destino)}?\n\n${resumen}`)) return;
    _transferenciaEnCurso = true;
    _idempotencyKey ||= crypto.randomUUID();
    const loader = document.getElementById("loaderTransf");
    const boton = document.getElementById("btnRegistrarTransferencia");
    loader.style.display = "block";
    if (boton) boton.disabled = true;
    try {
        const data = await api({
            ACCION: "REGISTRAR_TRANSFERENCIA_LOTE",
            PRODUCTOS: JSON.stringify(_productos.map(item => ({ producto: item.producto, cantidad: item.cantidad }))),
            SUCURSAL_ORIGEN: origen,
            SUCURSAL_DESTINO: destino,
            MOTIVO: motivo,
            NOTAS: notas,
            IDEMPOTENCY_KEY: _idempotencyKey,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        if (data.ok) {
            const cantidadProductos = Number(data.productos || _productos.length);
            mostrarMsg(`🔄 Transferencia completada · ${cantidadProductos} producto${cantidadProductos === 1 ? "" : "s"} de ${_nombreSucursal(origen)} a ${_nombreSucursal(destino)}`, "ok");
            _limpiarFormularioTransferencia();
            if (_verificarEstadoCaja) _verificarEstadoCaja();
        } else if (String(data.error || "").includes("STOCK_INSUFICIENTE")) {
            mostrarMsg("⚠ Stock insuficiente en la sucursal de origen", "err");
        } else if (String(data.error || "").includes("PRODUCTO_NO_ENCONTRADO_EN_ORIGEN")) {
            mostrarMsg("⚠ Uno de los productos no existe en la sucursal de origen", "err");
        } else {
            mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err");
        }
    } catch (_) {
        mostrarMsg("Error de conexión", "err");
    } finally {
        _transferenciaEnCurso = false;
        loader.style.display = "none";
        if (boton) boton.disabled = false;
    }
}

// Lista transferencias recientes con paginación.
export async function listarTransferencias(pg) {
    if (!store.sessionToken) return;
    if (pg === undefined) pg = 1;
    setTransfPagina(pg);
    const loader = document.getElementById("loaderListarTransf");
    const tabla = document.getElementById("tablaTransf");
    const paginacion = document.getElementById("paginTransf");
    loader.style.display = "block";
    tabla.replaceChildren();
    try {
        const data = await api({
            ACCION: "LISTAR_TRANSFERENCIAS",
            SUCURSAL_ORIGEN: document.getElementById("filtroTransfOrigen").value,
            SUCURSAL_DESTINO: document.getElementById("filtroTransfDestino").value,
            PAGINA: pg,
            LIMITE: TRANSF_LIMITE,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) return;
        if (!data.datos?.length) {
            tabla.appendChild(_texto("div", "Sin transferencias encontradas", "empty-state"));
            paginacion.style.display = "none";
            return;
        }
        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const encabezado = document.createElement("tr");
        ["Producto", "Ruta", "Cant", "Fecha"].forEach((titulo, indice) => encabezado.appendChild(_texto("th", titulo, indice === 0 ? "col-prod" : "")));
        thead.appendChild(encabezado);
        const tbody = document.createElement("tbody");
        data.datos.forEach(t => {
            const fila = document.createElement("tr");
            const producto = document.createElement("td");
            producto.className = "col-prod";
            producto.appendChild(_texto("span", t.producto));
            if (t.motivo) producto.appendChild(_texto("small", t.motivo));
            const ruta = document.createElement("td");
            ruta.style.cssText = "font-size:11px";
            ruta.append(_texto("span", _nombreSucursal(t.sucursalOrigen)), document.createElement("br"), _texto("span", "↓"), document.createElement("br"), _texto("span", _nombreSucursal(t.sucursalDestino)));
            const cantidad = _texto("td", String(t.cantidad));
            cantidad.style.fontFamily = "var(--mono)";
            const fecha = document.createElement("td");
            fecha.style.cssText = "font-size:11px;color:var(--muted)";
            fecha.append(_texto("span", fechaBolivia(t.fecha)), document.createElement("br"), _texto("span", t.usuario));
            fila.append(producto, ruta, cantidad, fecha);
            tbody.appendChild(fila);
        });
        table.append(thead, tbody);
        tabla.appendChild(table);
        if (data.paginas > 1) {
            paginacion.style.display = "flex";
            document.getElementById("paginTransf-info").textContent = "Pág " + data.pagina + " de " + data.paginas + " (" + data.total + " total)";
            paginacion.querySelector("button:first-child").disabled = pg <= 1;
            paginacion.querySelector("button:last-child").disabled = pg >= data.paginas;
        } else {
            paginacion.style.display = "none";
        }
    } catch (_) {
        tabla.appendChild(_texto("div", "Error de conexión", "empty-state"));
    } finally {
        loader.style.display = "none";
    }
}

export function cambiarPaginaTransf(d) {
    listarTransferencias(store.transfPaginaActual + d);
}
