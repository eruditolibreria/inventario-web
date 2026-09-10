/* === MODO SERVICIOS: Corte, laminado, enmarcado, impresion === */
import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, formatearBs, hoy, horaActual } from '../utils.js';
import { manejarRespuesta } from '../ui.js';

let _verif=null;
let _clientesServicio = [];
let _clienteServicioTimer = null;
export function initServicios(cb){if(cb&&cb.verificarEstadoCaja)_verif=cb.verificarEstadoCaja;}

// calcTotalServ
export function calcTotalServ(idCant, idUnit, idTotal) {
    const c = parseFloat(document.getElementById(idCant).value) || 0,
        u = parseFloat(document.getElementById(idUnit).value) || 0;
    document.getElementById(idTotal).value = (c * u).toFixed(2);
}

export function togglePagoServicio() {
    const metodo = document.getElementById("srvMetodoPago")?.value;
    const campoCredito = document.getElementById("campoCreditoServicio");
    const campoMixto = document.getElementById("campoMixtoServicio");
    campoCredito?.classList.toggle("oculto", metodo !== "CREDITO");
    campoMixto?.classList.toggle("oculto", metodo !== "MIXTO");
    const vencimiento = document.getElementById("srvFechaVencimiento");
    if (metodo === "CREDITO" && vencimiento && !vencimiento.value) {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() + 30);
        vencimiento.value = fecha.toISOString().slice(0, 10);
    }
}

export async function cargarClientesServicio(busqueda = "") {
    if (!store.sessionToken) return;
    try {
        const data = await api({ ACCION: "BUSCAR_CLIENTES_VENTA", BUSQUEDA: busqueda, TOKEN: store.sessionToken });
        if (data.ok) _clientesServicio = data.datos || [];
    } catch (_) {}
}

export function buscarClienteServicio() {
    const input = document.getElementById("srvCliente");
    const lista = document.getElementById("listaClienteServicio");
    const clienteId = document.getElementById("srvClienteId");
    const info = document.getElementById("srvClienteCredito");
    if (!input || !lista || !clienteId || !info) return;
    const texto = input.value.trim();
    clienteId.value = "";
    info.textContent = "";
    lista.innerHTML = "";
    if (!texto) {
        lista.classList.remove("show");
        return;
    }
    clearTimeout(_clienteServicioTimer);
    _clienteServicioTimer = setTimeout(async () => {
        await cargarClientesServicio(texto);
        lista.innerHTML = "";
        _clientesServicio.slice(0, 8).forEach(cliente => {
            const item = document.createElement("div");
            item.className = "ac-item";
            const titulo = document.createElement("strong");
            titulo.textContent = cliente.nombre;
            const detalle = document.createElement("small");
            detalle.textContent = `${cliente.codigoCliente}${cliente.documento ? " · " + cliente.documento : ""}`;
            item.append(titulo, detalle);
            item.addEventListener("click", () => {
                input.value = cliente.nombre;
                clienteId.value = cliente.id;
                info.textContent = cliente.deuda === undefined
                    ? ""
                    : `Deuda: ${formatearBs(cliente.deuda)} · Disponible: ${formatearBs(cliente.creditoDisponible)}`;
                lista.classList.remove("show");
            });
            lista.appendChild(item);
        });
        lista.classList.toggle("show", lista.children.length > 0);
    }, 220);
}


// agregarServicio
export async function agregarServicio(tipo) {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return }
    const sucursal = document.getElementById("srvSucursal").value;
    if (!sucursal) { mostrarMsg("Selecciona una sucursal primero", "err"); return }
    const metodoPago = document.getElementById("srvMetodoPago").value;
    if (!metodoPago) { mostrarMsg("Selecciona el método de pago", "err"); return }
    const clienteId = document.getElementById("srvClienteId")?.value || "";
    const fechaVencimiento = document.getElementById("srvFechaVencimiento")?.value || "";
    if (metodoPago === "CREDITO" && !clienteId) { mostrarMsg("Selecciona un cliente para registrar el crédito", "err"); return }
    if (metodoPago === "CREDITO" && !fechaVencimiento) { mostrarMsg("Selecciona el vencimiento del crédito", "err"); return }
    const hora = horaActual();
    let params = {}, loaderEl, camposLimpiar = [];
    if (tipo === "COPIAS") {
        const hojas = parseInt(document.getElementById("srvCopiasHojas").value);
        const valUnit = parseFloat(document.getElementById("srvCopiasValUnit").value);
        if (!hojas || hojas <= 0 || !valUnit || valUnit <= 0) { mostrarMsg("Completa cantidad y valor unitario", "err"); return }
        params = { SUB_TIPO: document.getElementById("srvCopiasTipo").value, COLOR: document.getElementById("srvCopiasColor").value, PRESENTACION: document.getElementById("srvCopiasPresent").value, PAPEL: document.getElementById("srvCopiasPapel").value, CANTIDAD: hojas, VAL_UNITARIO: valUnit, TOTAL: parseFloat(document.getElementById("srvCopiasTotal").value) || 0, OBSERVACIONES: document.getElementById("srvCopiasObs").value.trim() };
        loaderEl = "loaderSrvCopias"; camposLimpiar = ["srvCopiasHojas", "srvCopiasValUnit", "srvCopiasTotal", "srvCopiasObs"];
    } else if (tipo === "ANILLADOS") {
        const cant = parseInt(document.getElementById("srvAnilladoCant").value);
        const valUnit = parseFloat(document.getElementById("srvAnilladoValUnit").value);
        if (!cant || cant <= 0 || !valUnit || valUnit <= 0) { mostrarMsg("Completa cantidad y valor unitario", "err"); return }
        params = { SUB_TIPO: document.getElementById("srvAnilladoTipo").value, CANTIDAD: cant, VAL_UNITARIO: valUnit, TOTAL: parseFloat(document.getElementById("srvAnilladoTotal").value) || 0, OBSERVACIONES: document.getElementById("srvAnilladoObs").value.trim() };
        loaderEl = "loaderSrvAnillados"; camposLimpiar = ["srvAnilladoCant", "srvAnilladoValUnit", "srvAnilladoTotal", "srvAnilladoObs"];
    } else if (tipo === "PLASTIFICADOS") {
        const cant = parseInt(document.getElementById("srvPlastCant").value);
        const valUnit = parseFloat(document.getElementById("srvPlastValUnit").value);
        if (!cant || cant <= 0 || !valUnit || valUnit <= 0) { mostrarMsg("Completa cantidad y valor unitario", "err"); return }
        params = { SUB_TIPO: document.getElementById("srvPlastTamano").value, CANTIDAD: cant, VAL_UNITARIO: valUnit, TOTAL: parseFloat(document.getElementById("srvPlastTotal").value) || 0, OBSERVACIONES: document.getElementById("srvPlastObs").value.trim() };
        loaderEl = "loaderSrvPlast"; camposLimpiar = ["srvPlastCant", "srvPlastValUnit", "srvPlastTotal", "srvPlastObs"];
    } else if (tipo === "OTROS") {
        const desc = document.getElementById("srvOtrosDesc").value.trim();
        const cant = parseInt(document.getElementById("srvOtrosCant").value);
        const valUnit = parseFloat(document.getElementById("srvOtrosValUnit").value);
        if (!desc) { mostrarMsg("Ingresa la descripción del servicio", "err"); return }
        if (!cant || cant <= 0 || !valUnit || valUnit <= 0) { mostrarMsg("Completa cantidad y valor unitario", "err"); return }
        params = { SUB_TIPO: desc, CANTIDAD: cant, VAL_UNITARIO: valUnit, TOTAL: parseFloat(document.getElementById("srvOtrosTotal").value) || 0, OBSERVACIONES: document.getElementById("srvOtrosObs").value.trim() };
        loaderEl = "loaderSrvOtros"; camposLimpiar = ["srvOtrosDesc", "srvOtrosCant", "srvOtrosValUnit", "srvOtrosTotal", "srvOtrosObs"];
    }
    const totalFinal = Number(params.TOTAL) > 0
        ? Number(params.TOTAL)
        : Number((Number(params.CANTIDAD) * Number(params.VAL_UNITARIO)).toFixed(2));
    params.TOTAL = totalFinal;
    const montoEfectivo = Number(document.getElementById("srvMontoEfectivo")?.value || 0);
    const montoTransferencia = Number(document.getElementById("srvMontoTransferencia")?.value || 0);
    if (metodoPago === "MIXTO") {
        if (!Number.isFinite(montoEfectivo) || !Number.isFinite(montoTransferencia) || montoEfectivo < 0 || montoTransferencia < 0 || Math.abs(montoEfectivo + montoTransferencia - totalFinal) > 0.01) {
            mostrarMsg("Los montos de efectivo y transferencia deben sumar el total", "err");
            return;
        }
    }
    const loader = document.getElementById(loaderEl);
    loader.style.display = "block";
    try {
        const data = await api({
            ACCION: "REGISTRAR_SERVICIO", TIPO: tipo, SUCURSAL: sucursal, METODO_PAGO: metodoPago,
            CLIENTE_ID: clienteId || undefined, FECHA_VENCIMIENTO: fechaVencimiento || undefined,
            MONTO_EFECTIVO: metodoPago === "MIXTO" ? montoEfectivo : undefined,
            MONTO_TRANSFERENCIA: metodoPago === "MIXTO" ? montoTransferencia : undefined,
            HORA: hora, FECHA: hoy(), ...params, TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return }
        if (data.ok) {
            mostrarMsg(`✅ Registro agregado · Bs ${data.total.toFixed(2)}`, "ok");
            camposLimpiar.forEach(id => document.getElementById(id).value = "");
            ["srvCliente", "srvClienteId", "srvFechaVencimiento", "srvMontoEfectivo", "srvMontoTransferencia"].forEach(id => {
                const campo = document.getElementById(id);
                if (campo) campo.value = "";
            });
            const infoCliente = document.getElementById("srvClienteCredito");
            if (infoCliente) infoCliente.textContent = "";
            if (_verif) _verif();
        } else { mostrarMsg("Error: " + data.error, "err") }
    } catch (e) { mostrarMsg("Error de conexión", "err") }
    loader.style.display = "none";
}


// cargarResumenServicios
export async function cargarResumenServicios() {
    if (!store.sessionToken) return;
    const fecha = document.getElementById("srvResumenFecha").value || hoy();
    const sucursal = document.getElementById("srvResumenSucursal").value;
    document.getElementById("srvFechaHoy").textContent = fecha;
    const loader = document.getElementById("loaderSrvResumen");
    loader.style.display = "block";
    try {
        const data = await api({ ACCION: "LISTAR_SERVICIOS", FECHA: fecha, SUCURSAL: sucursal || undefined, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return }
        const t = data.totales || {};
        const fila = (label, val, bold = false) => `<div class="srv-resumen-fila"><span>${label}</span><span class="srv-val">${val}</span></div>`;
        const totalHojas = (t.copiasBN || 0) + (t.copiasColor || 0) + (t.impBN || 0) + (t.impColor || 0) + (t.plastificadas || 0);
        document.getElementById("srvResumenHojas").innerHTML = fila("Copias B&N", (t.copiasBN || 0) + " hojas") + fila("Copias Color", (t.copiasColor || 0) + " hojas") + fila("Impresiones B&N", (t.impBN || 0) + " hojas") + fila("Impresiones Color", (t.impColor || 0) + " hojas") + fila("Plastificadas", (t.plastificadas || 0) + " hojas") + fila("TOTAL HOJAS", totalHojas + " hojas", true);
        document.getElementById("srvResumenOtros").innerHTML = fila("Anillados", (t.anillados || 0) + " unidades") + fila("Otros servicios", (t.otrosServ || 0) + " servicios");
        document.getElementById("srvResumenIngresos").innerHTML = fila("Copias/Impresiones", "Bs " + (t.ingrCopias || 0).toFixed(2)) + fila("Anillados", "Bs " + (t.ingrAnillados || 0).toFixed(2)) + fila("Plastificados", "Bs " + (t.ingrPlast || 0).toFixed(2)) + fila("Otros Servicios", "Bs " + (t.ingrOtros || 0).toFixed(2)) + fila("TOTAL INGRESOS", "Bs " + (t.totalGeneral || 0).toFixed(2), true);
        const registros = data.registros || [];
        if (registros.length === 0) { document.getElementById("srvTablaRegistros").innerHTML = `<div class="empty-state">Sin registros para esta fecha</div>`; loader.style.display = "none"; return }
        let h = `<table><thead><tr><th>Hora</th><th class="col-prod">Servicio</th><th>Detalle</th><th>Pago</th><th>Cant.</th><th>Total</th><th></th></tr></thead><tbody>`;
        registros.forEach(r => {
            const detalle = r.tipo === "COPIAS" ? `${r.subTipo === "COPIA" ? "Copia" : "Imp."} ${r.color === "BN" ? "B&N" : "Color"} ${r.presentacion === "SIMPLE" ? "Simple" : "Doble"} · ${r.papel}` : r.subTipo;
            const pago = r.metodoPago === "MIXTO"
                ? `MIXTO · Ef. ${formatearBs(r.montoEfectivo)} · Tr. ${formatearBs(r.montoTransferencia)}`
                : (r.metodoPago || "Sin dato");
            h += `<tr class="srv-tabla-row"><td style="color:var(--muted)">${r.hora}</td><td class="col-prod">${r.tipo}</td><td style="color:var(--muted);font-size:10px">${detalle}${r.observaciones ? '<br>' + r.observaciones : ''}</td><td style="font-size:10px">${pago}</td><td style="font-family:var(--mono)">${r.cantidad}</td><td style="font-family:var(--mono);color:var(--accent-text)">Bs ${Number(r.total).toFixed(2)}</td><td><button class="btn-del" onclick="eliminarServicio('${r.id}')">✕</button></td></tr>`;
        });
        document.getElementById("srvTablaRegistros").innerHTML = h + "</tbody></table>";
    } catch (e) { mostrarMsg("Error de conexión", "err") }
    loader.style.display = "none";
}


// eliminarServicio
export async function eliminarServicio(id) {
    if (!confirm("¿Anular este registro?")) return;
    try {
        const data = await api({ ACCION: "ELIMINAR_SERVICIO", ID: id, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        if (data.ok) { mostrarMsg(data.eliminado ? "🗑️ Registro eliminado" : "↩️ Registro anulado", "ok"); cargarResumenServicios(); }
        else { mostrarMsg("Error: " + data.error, "err") }
    } catch (e) { mostrarMsg("Error de conexión", "err") }
}
