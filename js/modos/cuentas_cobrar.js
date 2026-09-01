/* === CUENTAS DIVERSAS: préstamos, anticipos y otras deudas no comerciales === */
import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, hoy } from '../utils.js';
import { manejarRespuesta } from '../ui.js';

let _verificarEstadoCaja = null;
let _cuentasVisibles = new Map();

export function initCuentasCobrar(cb) {
  if (cb.verificarEstadoCaja) _verificarEstadoCaja = cb.verificarEstadoCaja;
}

const escapar = (valor) => String(valor ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#039;");

const monto = (valor) => `Bs ${Number(valor || 0).toFixed(2)}`;

const mostrarDato = (valor) => escapar(valor || "—");

function asegurarModalDetalleCuenta() {
  if (document.getElementById("cuentaDiversaDetalleOverlay")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-overlay" id="cuentaDiversaDetalleOverlay">
      <div class="modal-card clientes-modal">
        <div class="clientes-modal-head"><strong>Detalle de cuenta diversa</strong><button class="btn-icon" id="cerrarDetalleCuentaDiversa" aria-label="Cerrar">✕</button></div>
        <div id="cuentaDiversaDetalleContenido"></div>
      </div>
    </div>`);
  const overlay = document.getElementById("cuentaDiversaDetalleOverlay");
  overlay.addEventListener("click", (evento) => { if (evento.target === overlay) overlay.classList.remove("show"); });
  document.getElementById("cerrarDetalleCuentaDiversa").addEventListener("click", () => overlay.classList.remove("show"));
}

function abrirDetalleCuentaCobrar(idCuenta) {
  const cuenta = _cuentasVisibles.get(idCuenta);
  if (!cuenta) return;
  asegurarModalDetalleCuenta();
  const origen = cuenta.origen === "PREVIA"
    ? "Deuda histórica; no movió caja al registrarla"
    : cuenta.registrarMovimiento ? "Salida de dinero registrada" : "Sin salida de dinero registrada";
  document.getElementById("cuentaDiversaDetalleContenido").innerHTML = `
    <div class="cliente-perfil-head"><div><h2>${escapar(cuenta.deudor)}</h2><span>${escapar(cuenta.codigo)}</span></div><span class="cliente-estado ${cuenta.estado === "CANCELADO" ? "activo" : "inactivo"}">${escapar(cuenta.estado)}</span></div>
    <div class="cliente-datos-grid">
      <div><span>Teléfono</span><strong>${mostrarDato(cuenta.telefono)}</strong></div>
      <div><span>Documento</span><strong>${mostrarDato(cuenta.documento)}</strong></div>
      <div><span>Tipo</span><strong>${mostrarDato(cuenta.tipo)}</strong></div>
      <div><span>Origen</span><strong>${origen}</strong></div>
      <div><span>Fecha de registro</span><strong>${mostrarDato(cuenta.fecha)}</strong></div>
      <div><span>Vencimiento</span><strong>${mostrarDato(cuenta.fechaVencimiento)}</strong></div>
      <div><span>Monto original</span><strong>${monto(cuenta.totalVenta)}</strong></div>
      <div><span>Saldo actual</span><strong>${monto(cuenta.saldo)}</strong></div>
      <div><span>Abonado</span><strong>${monto(cuenta.abono)}</strong></div>
      <div><span>Método de entrega</span><strong>${mostrarDato(cuenta.metodoEntrega)}</strong></div>
      <div style="grid-column:1/-1"><span>Concepto</span><strong>${mostrarDato(cuenta.concepto)}</strong></div>
      <div style="grid-column:1/-1"><span>Observaciones</span><strong>${mostrarDato(cuenta.observaciones)}</strong></div>
    </div>`;
  document.getElementById("cuentaDiversaDetalleOverlay").classList.add("show");
}

export function toggleMovimientoCuentaCobrar() {
  const origen = document.getElementById("nuevaCobrarOrigen");
  const movimiento = document.getElementById("nuevaCobrarMovimiento");
  const entrega = document.getElementById("nuevaCobrarEntregaWrap");
  if (!origen || !movimiento || !entrega) return;
  const esPrevia = origen.value === "PREVIA";
  if (esPrevia) movimiento.value = "NO";
  movimiento.disabled = esPrevia;
  entrega.classList.toggle("oculto", esPrevia || movimiento.value !== "SI");
}

export async function listarCuentasCobrar() {
  const loader = document.getElementById("loaderCobrar");
  const tabla = document.getElementById("tablaCobrar");
  const formulario = document.getElementById("formNuevaCobrar");
  if (!loader || !tabla) return;
  if (formulario) formulario.classList.toggle("oculto", store.sessionRol !== "ADMIN");
  loader.style.display = "block";
  tabla.innerHTML = "";
  try {
    const data = await api({
      ACCION: "LISTAR_CUENTAS_COBRAR",
      SUCURSAL: document.getElementById("filtroCobrarSucursal").value,
      ESTADO: document.getElementById("filtroCobrarEstado").value,
      TOKEN: store.sessionToken,
    });
    if (!manejarRespuesta(data)) return;
    if (!data.datos?.length) {
      tabla.innerHTML = '<div class="empty-state">Sin cuentas diversas encontradas</div>';
      return;
    }
    _cuentasVisibles = new Map(data.datos.map((cuenta) => [cuenta.id, cuenta]));
    let html = '<table><thead><tr><th class="col-prod">Deudor</th><th>Tipo</th><th>Origen</th><th>Monto</th><th>Saldo</th><th>Estado</th><th></th></tr></thead><tbody>';
    data.datos.forEach((cuenta) => {
      const cancelada = cuenta.estado === "CANCELADO" || cuenta.estado === "ANULADA";
      const detalle = [cuenta.codigo, cuenta.concepto, cuenta.fechaVencimiento ? `Vence: ${cuenta.fechaVencimiento}` : ""].filter(Boolean).map(escapar).join(" · ");
      html += `<tr>
        <td class="col-prod"><button class="cuenta-deudor-btn" data-cuenta-detalle="${escapar(cuenta.id)}"><strong>${escapar(cuenta.deudor)}</strong><small>${detalle}</small></button></td>
        <td>${escapar(cuenta.tipo)}</td><td>${cuenta.origen === "PREVIA" ? "Previa" : "Nueva"}</td>
        <td>${monto(cuenta.totalVenta)}</td><td>${monto(cuenta.saldo)}</td>
        <td class="${cancelada ? "estado-cancelado" : "estado-pendiente"}">${escapar(cuenta.estado)}</td>
        <td>${!cancelada ? `<button class="btn-ghost btn-sm" data-accion="abrir-form-abono" data-id="${escapar(cuenta.id)}">💳 Abonar</button>` : ""}</td>
      </tr>`;
    });
    tabla.innerHTML = html + "</tbody></table>";
    tabla.querySelectorAll('[data-accion="abrir-form-abono"]').forEach((boton) => {
      boton.addEventListener("click", () => abrirFormAbonoCobrar(boton.dataset.id));
    });
    tabla.querySelectorAll("[data-cuenta-detalle]").forEach((boton) => {
      boton.addEventListener("click", () => abrirDetalleCuentaCobrar(boton.dataset.cuentaDetalle));
    });
  } catch (_) {
    tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>';
  } finally {
    loader.style.display = "none";
  }
}

export function abrirFormAbonoCobrar(id) {
  document.getElementById("abonarCobrarId").value = id;
  document.getElementById("abonarCobrarMonto").value = "";
  document.getElementById("abonarCobrarFecha").value = hoy();
  document.getElementById("formAbonarCobrar").classList.add("show");
  document.getElementById("formAbonarCobrar").scrollIntoView({ behavior: "smooth" });
}

export function cancelarAbonoCobrar() {
  document.getElementById("formAbonarCobrar").classList.remove("show");
  document.getElementById("abonarCobrarId").value = "";
  document.getElementById("abonarCobrarMonto").value = "";
}

export async function confirmarAbonoCobrar() {
  const id = document.getElementById("abonarCobrarId").value;
  const abono = Number(document.getElementById("abonarCobrarMonto").value);
  const metodo = document.getElementById("abonarCobrarMetodo").value;
  const fecha = document.getElementById("abonarCobrarFecha").value;
  if (!id) return mostrarMsg("ID no encontrado", "err");
  if (!Number.isFinite(abono) || abono <= 0) return mostrarMsg("Ingresa un monto válido", "err");
  const loader = document.getElementById("loaderAbonarCobrar");
  loader.style.display = "block";
  try {
    const data = await api({ ACCION: "ABONAR_CUENTA_COBRAR", ID: id, ABONO: abono, METODO_PAGO: metodo, FECHA_PAGO: fecha, TOKEN: store.sessionToken });
    if (!manejarRespuesta(data)) return;
    if (!data.ok) return mostrarMsg(`Error: ${data.error || JSON.stringify(data)}`, "err");
    mostrarMsg(`✅ Pago registrado · Saldo: ${monto(data.nuevoSaldo)}`, "ok");
    cancelarAbonoCobrar();
    if (_verificarEstadoCaja) _verificarEstadoCaja();
    await listarCuentasCobrar();
  } catch (_) {
    mostrarMsg("Error de conexión", "err");
  } finally {
    loader.style.display = "none";
  }
}

export async function registrarCuentaCobrar() {
  const campos = {
    sucursal: document.getElementById("nuevaCobrarSucursal").value,
    deudor: document.getElementById("nuevaCobrarDeudor").value.trim(),
    telefono: document.getElementById("nuevaCobrarTelefono").value.trim(),
    documento: document.getElementById("nuevaCobrarDocumento").value.trim(),
    concepto: document.getElementById("nuevaCobrarConcepto").value.trim(),
    tipo: document.getElementById("nuevaCobrarTipo").value,
    origen: document.getElementById("nuevaCobrarOrigen").value,
    monto: Number(document.getElementById("nuevaCobrarTotal").value),
    fechaVencimiento: document.getElementById("nuevaCobrarVencimiento").value || null,
    registrarMovimiento: document.getElementById("nuevaCobrarMovimiento").value === "SI",
    metodoEntrega: document.getElementById("nuevaCobrarMetodo").value,
    observaciones: document.getElementById("nuevaCobrarObservaciones").value.trim(),
  };
  if (!campos.deudor) return mostrarMsg("Ingresa el nombre del deudor", "err");
  if (!campos.concepto) return mostrarMsg("Ingresa el concepto", "err");
  if (!Number.isFinite(campos.monto) || campos.monto <= 0) return mostrarMsg("Ingresa un monto válido", "err");
  if (campos.origen === "PREVIA" && campos.registrarMovimiento) return mostrarMsg("Una deuda previa no debe generar movimiento de caja", "err");
  const loader = document.getElementById("loaderNuevaCobrar");
  loader.style.display = "block";
  try {
    const data = await api({
      ACCION: "REGISTRAR_CUENTA_COBRAR", SUCURSAL: campos.sucursal, DEUDOR: campos.deudor,
      TELEFONO: campos.telefono, DOCUMENTO: campos.documento, CONCEPTO: campos.concepto,
      TIPO: campos.tipo, ORIGEN: campos.origen, MONTO: campos.monto,
      FECHA_VENCIMIENTO: campos.fechaVencimiento, REGISTRAR_MOVIMIENTO: campos.registrarMovimiento,
      METODO_ENTREGA: campos.registrarMovimiento ? campos.metodoEntrega : null,
      OBSERVACIONES: campos.observaciones, TOKEN: store.sessionToken,
    });
    if (!manejarRespuesta(data)) return;
    if (!data.ok) return mostrarMsg(`Error: ${data.error || JSON.stringify(data)}`, "err");
    mostrarMsg(`📋 Cuenta registrada · Saldo: ${monto(data.saldo)}`, "ok");
    ["nuevaCobrarDeudor", "nuevaCobrarTelefono", "nuevaCobrarDocumento", "nuevaCobrarConcepto", "nuevaCobrarTotal", "nuevaCobrarVencimiento", "nuevaCobrarObservaciones"].forEach((id) => { document.getElementById(id).value = ""; });
    document.getElementById("nuevaCobrarOrigen").value = "NUEVA";
    document.getElementById("nuevaCobrarMovimiento").value = "SI";
    toggleMovimientoCuentaCobrar();
    await listarCuentasCobrar();
  } catch (_) {
    mostrarMsg("Error de conexión", "err");
  } finally {
    loader.style.display = "none";
  }
}
