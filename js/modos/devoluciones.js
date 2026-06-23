/* === MODO DEVOLUCIONES: Busqueda, seleccion y registro de devoluciones === */
import { store, setDevolPagina, setDevolTransaccionSeleccionada } from '../store.js';
import { api } from '../api.js';
import { DEVOL_LIMITE } from '../config.js';
import { mostrarMsg } from '../utils.js';
import { manejarRespuesta } from '../ui.js';
import { cargarInventario } from '../inventario.js';

const SUPABASE_URL = "https://nhysxuqxlkmvrpxdoate.supabase.co";
let _verificarEstadoCaja = null;

export function initDevoluciones(cb) {
    if (cb?.verificarEstadoCaja) _verificarEstadoCaja = cb.verificarEstadoCaja;
}


// Limpia el buscador de transacciones
export function limpiarBuscadorDevol() {
    setDevolTransaccionSeleccionada(null);
    document.getElementById("devolReferenciaId").value = "";
    document.getElementById("resultadosBuscDevol").innerHTML = "";
    document.getElementById("devolProductoSeleccionado").style.display = "none";
    document.getElementById("devolBuscProducto").value = "";
    document.getElementById("devolBuscClienteProv").value = "";
}




// Busca transacciones en Supabase para devolucion
export async function buscarTransaccionDevol() {
    const su = document.getElementById("devolSucursal").value;
    const tp = document.getElementById("devolTipo").value;
    const producto = document.getElementById("devolBuscProducto").value;
    const clienteProv = document.getElementById("devolBuscClienteProv").value;

    if (!su) { mostrarMsg("Selecciona una sucursal primero", "err"); return; }
    if (!producto.trim() && !clienteProv.trim()) { document.getElementById("resultadosBuscDevol").innerHTML = ""; return; }

    const loader = document.getElementById("loaderBuscDevol");
    const resultados = document.getElementById("resultadosBuscDevol");
    loader.style.display = "block";
    resultados.innerHTML = "";

    try {
        const response = await fetch(SUPABASE_URL + "/functions/v1/buscar_transacciones", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tipo: tp,
                sucursal: su,
                producto: producto.trim() || undefined,
                cliente_proveedor: clienteProv.trim() || undefined
            })
        });
        const data = await response.json();
        loader.style.display = "none";
        if (!data.ok) { resultados.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error: ${data.error}</div>`; return; }
        const transacciones = data.datos || [];
        if (transacciones.length === 0) { resultados.innerHTML = `<div class="empty-state">No hay transacciones que coincidan</div>`; return; }
        resultados.innerHTML = "<div style='font-size:11px;color:var(--muted);margin-bottom:8px'>Selecciona una transacción:</div>";
        transacciones.forEach(t => {
            const card = document.createElement("div");
            card.className = "caja-card";
            card.style.margin = "0 0 8px 0";
            card.style.cursor = "pointer";
            card.style.transition = "all 0.15s";
            const fechaDisplay = t.fecha || "—";
            const personaDisplay = tp === "VENTA" ? (t.cliente || "—") : (t.proveedor || "—");
            card.innerHTML = `
                <div style="flex:1">
                    <div style="font-weight:600;color:var(--text);margin-bottom:4px">${t.producto}</div>
                    <div style="font-size:11px;color:var(--muted);line-height:1.4">
                        ${personaDisplay} · ${t.cantidad} ud. · Bs ${t.precio || 0} · ${t.sucursal}
                    </div>
                </div>
                <div style="font-size:10px;color:var(--muted)">${fechaDisplay}</div>
            `;
            card.onmouseenter = () => card.style.borderColor = "var(--accent)";
            card.onmouseleave = () => card.style.borderColor = "var(--border)";
            card.onclick = () => seleccionarTransaccionDevol(t);
            resultados.appendChild(card);
        });
    } catch (e) {
        loader.style.display = "none";
        resultados.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>`;
    }
}

            

// Selecciona una transaccion para devolver items
export function seleccionarTransaccionDevol(transaccion) {
    setDevolTransaccionSeleccionada(transaccion);
    document.getElementById("devolReferenciaId").value = transaccion.id;
    const seleccionadoDiv = document.getElementById("devolProductoSeleccionado");
    const seleccionadoTexto = document.getElementById("devolProductoSeleccionadoTexto");
    const personaDisplay = document.getElementById("devolTipo").value === "VENTA"
        ? (transaccion.cliente || "—")
        : (transaccion.proveedor || "—");
    seleccionadoTexto.innerHTML = `${transaccion.producto} · ${transaccion.cantidad} ud. · Bs ${transaccion.precio} · ${personaDisplay}`;
    seleccionadoDiv.style.display = "block";
    document.getElementById("resultadosBuscDevol").innerHTML = "";
    document.getElementById("devolBuscProducto").value = "";
    document.getElementById("devolBuscClienteProv").value = "";
}


// Procesa la devolucion seleccionada
            export async function registrarDevolucion() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return }
    const su = document.getElementById("devolSucursal").value,
        tp = document.getElementById("devolTipo").value,
        ref = document.getElementById("devolReferenciaId").value.trim(),
        ca = Number(document.getElementById("devolCantidad").value),
        pc = Number(document.getElementById("devolPrecio").value),
        mo = document.getElementById("devolMotivo").value,
        cp = document.getElementById("devolClienteProveedor").value.trim(),
        no = document.getElementById("devolNotas").value.trim();
    if (!su) { mostrarMsg("Selecciona una sucursal", "err"); return }
    if (!ref) { mostrarMsg("Selecciona una transacción primero", "err"); return }
    if (isNaN(ca) || ca <= 0) { mostrarMsg("Ingresa una cantidad válida", "err"); return }
    if (isNaN(pc) || pc <= 0) { mostrarMsg("Ingresa un precio unitario válido", "err"); return }
    const tx = store.devolTransaccionSeleccionada;
    const productoNombre = tx?.producto || "—";
    if (!confirm(`¿Confirmar devolución de ${ca} ud. de "${productoNombre}" por Bs ${(ca * pc).toFixed(2)}?`)) return;
    const loader = document.getElementById("loaderDevol");
    loader.style.display = "block";
    try {
        const data = await api({
            ACCION: "REGISTRAR_DEVOLUCION",
            SUCURSAL: su,
            TIPO_DEVOLUCION: tp,
            REFERENCIA_ID: ref,
            PRODUCTO: tx?.producto || "",
            CANTIDAD: ca,
            PRECIO_UNITARIO: pc,
            MOTIVO: mo,
            CLIENTE_PROVEEDOR: cp,
            NOTAS: no,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return }
        if (data.ok) {
            mostrarMsg("↩ Devolución registrada · Total: Bs " + data.total, "ok");
            ["devolReferenciaId", "devolCantidad", "devolPrecio", "devolClienteProveedor", "devolNotas"].forEach(id => document.getElementById(id).value = "");
            document.getElementById("devolBuscProducto").value = "";
            document.getElementById("devolBuscClienteProv").value = "";
            document.getElementById("resultadosBuscDevol").innerHTML = "";
            document.getElementById("devolProductoSeleccionado").style.display = "none";
            setDevolTransaccionSeleccionada(null);
            document.getElementById("devolSucursal").value = "";
            document.getElementById("devolTipo").value = "VENTA";
            document.getElementById("devolMotivo").value = "PRODUCTO_DEFECTUOSO";
            if (_verificarEstadoCaja) _verificarEstadoCaja();
        } else if (data.error === "REFERENCIA_NO_ENCONTRADA") {
            mostrarMsg("⚠ " + data.motivo, "err")
        } else { mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err") }
    } catch (e) { mostrarMsg("Error de conexión", "err") }
    loader.style.display = "none";
}

// Lista las devoluciones registradas con paginacion
            export async function listarDevoluciones(pg) {
    if (!store.sessionToken) return;
    if (pg === undefined) pg = 1;
    setDevolPagina(pg);
    const loader = document.getElementById("loaderListarDevol"),
        tabla = document.getElementById("tablaDevol"),
        pdiv = document.getElementById("paginDevol");
    loader.style.display = "block";
    tabla.innerHTML = "";
    try {
        const data = await api({
            ACCION: "LISTAR_DEVOLUCIONES",
            SUCURSAL: document.getElementById("filtroDevSucursal").value,
            TIPO_DEVOLUCION: document.getElementById("filtroDevTipo").value,
            PAGINA: pg,
            LIMITE: DEVOL_LIMITE,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return }
        if (!data.datos || data.datos.length === 0) {
            tabla.innerHTML = `<div class="empty-state">Sin devoluciones encontradas</div>`;
            pdiv.style.display = "none";
        } else {
            let h = `<table><thead><tr><th class="col-prod">Producto</th><th>Fecha / Suc</th><th>Tipo</th><th>Cant · Total</th><th>Motivo</th></tr></thead><tbody>`;
            data.datos.forEach(d => {
                const ev = d.tipoDevolucion === "VENTA",
                    fc = String(d.fecha).slice(0, 10),
                    mc = d.motivo.replace(/_/g, " ");
                h += `<tr><td class="col-prod">${d.producto}</td><td style="font-size:11px;color:var(--muted)">${fc}<br>${d.sucursal}</td><td class="${ev ? "tipo-venta" : "tipo-compra"}">${ev ? "↩ VENTA" : "↪ COMPRA"}</td><td style="font-family:var(--mono);font-size:11px">${d.cantidad} ud.<br>Bs ${Number(d.total).toFixed(2)}</td><td style="font-size:10px;color:var(--muted)">${mc}</td></tr>`;
            });
            tabla.innerHTML = h + `</tbody></table>`;
            if (data.paginas > 1) {
                pdiv.style.display = "flex";
                document.getElementById("paginDevol-info").textContent = "Pág " + data.pagina + " de " + data.paginas + " (" + data.total + " total)";
                pdiv.querySelector("button:first-child").disabled = (pg <= 1);
                pdiv.querySelector("button:last-child").disabled = (pg >= data.paginas);
            } else { pdiv.style.display = "none"; }
        }
    } catch (e) {
        tabla.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>`;
    }
    loader.style.display = "none";
}

// Cambia de pagina en el listado de devoluciones
export function cambiarPaginaDevol(d) {
    listarDevoluciones(store.devolPaginaActual + d);
}
