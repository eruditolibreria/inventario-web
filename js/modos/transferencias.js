/* === MODO TRANSFERENCIAS: Movimiento de stock entre sucursales === */
import { store, setTransfPagina } from '../store.js';
import { api } from '../api.js';
import { TRANSF_LIMITE } from '../config.js';
import { mostrarMsg } from '../utils.js';
import { manejarRespuesta } from '../ui.js';
import { construirAC, cargarInventario } from '../inventario.js';

let _verificarEstadoCaja = null;
export function initTransferencias(cb) { if (cb?.verificarEstadoCaja) _verificarEstadoCaja = cb.verificarEstadoCaja; }

document.addEventListener("DOMContentLoaded", function() {
    ["transfOrigen", "transfDestino"].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener("change", actualizarInfoTransf);
    });
});


// Autocompleta producto origen para transferencia
export function buscarProductoTransf() {
    const t = document.getElementById("transfProducto").value.toLowerCase(),
        l = document.getElementById("listaTransf"),
        info = document.getElementById("infoTransf");
    info.classList.remove("show");
    if (t.length < 1) { l.classList.remove("show"); return }
    const unicos = [];
    const vistos = new Set();
    store.inventarioGlobal.filter(p => p.producto.toLowerCase().includes(t)).forEach(p => {
        if (!vistos.has(p.producto)) { vistos.add(p.producto); unicos.push(p) }
    });
    l.innerHTML = "";
    if (unicos.length === 0) { l.classList.remove("show"); return }
    unicos.slice(0, 8).forEach(p => {
        const div = document.createElement("div");
        div.className = "ac-item";
        div.innerHTML = `<strong>${p.producto}</strong><small>Stock en ${p.sucursal}: ${p.stock}</small>`;
        div.onclick = () => { document.getElementById("transfProducto").value = p.producto; l.classList.remove("show"); actualizarInfoTransf() };
        l.appendChild(div)
    });
    l.classList.add("show");
}

// Muestra info del producto seleccionado para transferir
export function actualizarInfoTransf() {
    const prod = document.getElementById("transfProducto").value.trim(),
        origen = document.getElementById("transfOrigen").value,
        destino = document.getElementById("transfDestino").value,
        info = document.getElementById("infoTransf"),
        arrowDiv = document.getElementById("transfArrowDisplay");
    if (origen && destino && origen !== destino) {
        document.getElementById("transfArrowOrigen").textContent = origen;
        document.getElementById("transfArrowDestino").textContent = destino;
        arrowDiv.style.display = "flex"
    } else { arrowDiv.style.display = "none" }
    if (prod && origen) {
        const inv = store.inventarioGlobal.find(p => p.producto === prod && p.sucursal === origen);
        if (inv) {
            info.innerHTML = `Stock en <b>${origen}</b>: <b>${inv.stock}</b> ud.` + (inv.stock <= 5 ? ` <span class="stock-bajo">⚠ Stock bajo</span>` : "");
            info.classList.add("show")
        } else { info.innerHTML = `Sin stock en <b>${origen}</b>`; info.classList.add("show") }
    } else { info.classList.remove("show") }
}

// Ejecuta la transferencia entre sucursales
export async function registrarTransferencia() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return }
    const prod = document.getElementById("transfProducto").value.trim(),
        origen = document.getElementById("transfOrigen").value,
        destino = document.getElementById("transfDestino").value,
        cantidad = Number(document.getElementById("transfCantidad").value),
        motivo = document.getElementById("transfMotivo").value.trim(),
        notas = document.getElementById("transfNotas").value.trim();
    if (!prod) { mostrarMsg("Selecciona un producto", "err"); return }
    if (!origen) { mostrarMsg("Selecciona la sucursal de origen", "err"); return }
    if (!destino) { mostrarMsg("Selecciona la sucursal de destino", "err"); return }
    if (origen === destino) { mostrarMsg("Origen y destino no pueden ser la misma sucursal", "err"); return }
    if (isNaN(cantidad) || cantidad <= 0) { mostrarMsg("Ingresa una cantidad válida", "err"); return }
    if (!confirm(`¿Transferir ${cantidad} ud. de "${prod}" de ${origen} → ${destino}?`)) return;
    const loader = document.getElementById("loaderTransf"); loader.style.display = "block";
    try {
        const data = await api({ ACCION: "REGISTRAR_TRANSFERENCIA", PRODUCTO: prod, SUCURSAL_ORIGEN: origen, SUCURSAL_DESTINO: destino, CANTIDAD: cantidad, MOTIVO: motivo, NOTAS: notas, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return }
        if (data.ok) {
            mostrarMsg(`🔄 Transferencia completada · ${data.cantidad} ud. de ${data.origen} → ${data.destino}`, "ok");
            document.getElementById("transfProducto").value = "";
            document.getElementById("transfCantidad").value = "";
            document.getElementById("transfMotivo").value = "";
            document.getElementById("transfNotas").value = "";
            document.getElementById("transfOrigen").value = "";
            document.getElementById("transfDestino").value = "";
            document.getElementById("infoTransf").classList.remove("show");
            document.getElementById("transfArrowDisplay").style.display = "none";
            cargarInventario();
            if (_verificarEstadoCaja) _verificarEstadoCaja();
        } else if (data.error === "STOCK_INSUFICIENTE") {
            mostrarMsg("⚠ Stock insuficiente en origen (disponible: " + data.disponible + ")", "err")
        } else if (data.error === "PRODUCTO_NO_ENCONTRADO_EN_ORIGEN") {
            mostrarMsg("⚠ El producto no existe en la sucursal de origen", "err")
        } else { mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err") }
    } catch (e) { mostrarMsg("Error de conexión", "err") }
    loader.style.display = "none";
}

// Lista transferencias recientes con paginacion
export async function listarTransferencias(pg) {
    if (!store.sessionToken) return;
    if (pg === undefined) pg = 1;
    setTransfPagina(pg);
    const loader = document.getElementById("loaderListarTransf"),
        tabla = document.getElementById("tablaTransf"),
        pdiv = document.getElementById("paginTransf");
    loader.style.display = "block";
    tabla.innerHTML = "";
    try {
        const data = await api({ ACCION: "LISTAR_TRANSFERENCIAS", SUCURSAL_ORIGEN: document.getElementById("filtroTransfOrigen").value, SUCURSAL_DESTINO: document.getElementById("filtroTransfDestino").value, PAGINA: pg, LIMITE: TRANSF_LIMITE, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return }
        if (!data.datos || data.datos.length === 0) { tabla.innerHTML = `<div class="empty-state">Sin transferencias encontradas</div>`; pdiv.style.display = "none" }
        else {
            let h = `<table><thead><tr><th class="col-prod">Producto</th><th>Ruta</th><th>Cant</th><th>Fecha</th></tr></thead><tbody>`;
            data.datos.forEach(t => {
                const fc = String(t.fecha).slice(0, 10);
                h += `<tr><td class="col-prod">${t.producto}${t.motivo ? `<br><small style="color:var(--muted)">${t.motivo}</small>` : ""}</td><td style="font-size:11px;font-family:var(--mono)">${t.sucursalOrigen}<br><span style="color:var(--teal)">↓</span><br>${t.sucursalDestino}</td><td style="font-family:var(--mono)">${t.cantidad}</td><td style="font-size:11px;color:var(--muted)">${fc}<br>${t.usuario}</td></tr>`
            });
            tabla.innerHTML = h + `</tbody></table>`;
            if (data.paginas > 1) {
                pdiv.style.display = "flex";
                document.getElementById("paginTransf-info").textContent = "Pág " + data.pagina + " de " + data.paginas + " (" + data.total + " total)";
                pdiv.querySelector("button:first-child").disabled = (pg <= 1);
                pdiv.querySelector("button:last-child").disabled = (pg >= data.paginas)
            } else { pdiv.style.display = "none" }
        }
    } catch (e) { tabla.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>` }
    loader.style.display = "none";
}

// Cambia de pagina en el listado de transferencias
export function cambiarPaginaTransf(d) { listarTransferencias(store.transfPaginaActual + d) }

