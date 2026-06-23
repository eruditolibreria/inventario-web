/* === MODO CUENTAS POR PAGAR: Listado, abonos y registro === */
import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, formatearBs, hoy } from '../utils.js';
import { manejarRespuesta } from '../ui.js';

let _verificarEstadoCaja = null;
export function initCuentasPagar(cb) { if (cb && cb.verificarEstadoCaja) _verificarEstadoCaja = cb.verificarEstadoCaja; }


// Lista las cuentas por pagar activas con saldo pendiente
            export async function listarCuentasPagar() {
                const loader = document.getElementById("loaderPagar")
                  , tabla = document.getElementById("tablaPagar");
                loader.style.display = "block";
                tabla.innerHTML = "";
                try {
                    const data = await api({
                        ACCION: "LISTAR_CUENTAS_PAGAR",
                        SUCURSAL: document.getElementById("filtroPagarSucursal").value,
                        ESTADO: document.getElementById("filtroPagarEstado").value,

                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (!data.datos || data.datos.length === 0) {
                        tabla.innerHTML = `<div class="empty-state">Sin cuentas encontradas</div>`
                    } else {
                        let h = `<table><thead><tr><th class="col-prod">Proveedor</th><th>Total</th><th>Saldo</th><th>Estado</th><th></th></tr></thead><tbody>`;
                        data.datos.forEach(c => {
                            const ok = c.estado === "CANCELADO";
                            h += `<tr><td class="col-prod">${c.proveedor}<br><small style="color:var(--muted)">${c.concepto}</small></td><td>Bs ${Number(c.totalCompra).toFixed(2)}</td><td>Bs ${Number(c.saldo).toFixed(2)}</td><td class="${ok ? "estado-cancelado" : "estado-pendiente"}">${c.estado}</td><td>${!ok ? `<button class="btn-ghost btn-sm" data-accion="abrir-form-abono-pagar" data-id="${c.id}">💳</button>` : ""}</td></tr>`
                        }
                        );
                        tabla.innerHTML = h + "</tbody></table>";
                        // Delegated listener for abono buttons
                        tabla.querySelectorAll('[data-accion="abrir-form-abono-pagar"]').forEach(btn => {
                            btn.addEventListener('click', function() {
                                abrirFormAbonoPagar(this.dataset.id);
                            });
                        });
                    }
                } catch (e) {
                    tabla.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>`
                }
                loader.style.display = "none"
            }

// Abre el modal de abono para una cuenta por pagar
            export function abrirFormAbonoPagar(id) {
                document.getElementById("abonarPagarId").value = id;
                document.getElementById("abonarPagarMonto").value = "";
                document.getElementById("abonarPagarFecha").value = hoy();
                document.getElementById("formAbonarPagar").classList.add("show");
                document.getElementById("formAbonarPagar").scrollIntoView({
                    behavior: "smooth"
                })
            }

// Confirma un abono a cuenta por pagar
            export async function confirmarAbonoPagar() {
                const id = document.getElementById("abonarPagarId").value
                  , mo = Number(document.getElementById("abonarPagarMonto").value)
                  , me = document.getElementById("abonarPagarMetodo").value
                  , fe = document.getElementById("abonarPagarFecha").value;
                if (!id) {
                    mostrarMsg("ID no encontrado", "err");
                    return
                }
                if (isNaN(mo) || mo <= 0) {
                    mostrarMsg("Ingresa un monto válido", "err");
                    return
                }
                const loader = document.getElementById("loaderAbonarPagar");
                loader.style.display = "block";
                try {
                    const data = await api({
                        ACCION: "ABONAR_CUENTA_PAGAR",
                        ID: id,
                        ABONO: mo,
                        METODO_PAGO: me,
                        FECHA_PAGO: fe,

                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (data.ok) {
                        document.getElementById("formAbonarPagar").classList.remove("show");
                        if (_verificarEstadoCaja) _verificarEstadoCaja();
                        await listarCuentasPagar()
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                } catch (e) {
                    mostrarMsg("Error de conexión", "err")
                }
                loader.style.display = "none"
            }

// Registra una nueva cuenta por pagar
            export async function registrarCuentaPagar() {
                const su = document.getElementById("nuevaPagarSucursal").value
                  , pr = document.getElementById("nuevaPagarProveedor").value.trim()
                  , co = document.getElementById("nuevaPagarConcepto").value.trim()
                  , to = Number(document.getElementById("nuevaPagarTotal").value)
                  , ab = Number(document.getElementById("nuevaPagarAbono").value) || 0;
                if (!pr) {
                    mostrarMsg("Ingresa el nombre del proveedor", "err");
                    return
                }
                if (!co) {
                    mostrarMsg("Ingresa el concepto", "err");
                    return
                }
                if (isNaN(to) || to <= 0) {
                    mostrarMsg("Ingresa el total", "err");
                    return
                }
                const loader = document.getElementById("loaderNuevaPagar");
                loader.style.display = "block";
                try {
                    const data = await api({
                        ACCION: "REGISTRAR_CUENTA_PAGAR",
                        SUCURSAL: su,
                        PROVEEDOR: pr,
                        CONCEPTO: co,
                        TOTAL_COMPRA: to,
                        ABONO: ab,

                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (data.ok) {
                        mostrarMsg("📋 Cuenta registrada · Saldo: Bs " + data.saldo, "ok");
                        ["nuevaPagarProveedor", "nuevaPagarConcepto", "nuevaPagarTotal", "nuevaPagarAbono"].forEach(id => document.getElementById(id).value = "");
                        await listarCuentasPagar()
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                } catch (e) {
                    mostrarMsg("Error de conexión", "err")
                }
                loader.style.display = "none"
            }

// ── Init: main.js llamara initCuentasPagar() en fase 5 ──────────────
