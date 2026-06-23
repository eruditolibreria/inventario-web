/* === MODO CUENTAS POR COBRAR: Listado, abonos y registro === */
import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, formatearBs, hoy } from '../utils.js';
import { manejarRespuesta } from '../ui.js';

let _verificarEstadoCaja = null;
export function initCuentasCobrar(cb) { if (cb.verificarEstadoCaja) _verificarEstadoCaja = cb.verificarEstadoCaja; }


// Lista las cuentas por cobrar activas con saldo pendiente
            export async function listarCuentasCobrar() {
                const loader = document.getElementById("loaderCobrarRep")
                  , tabla = document.getElementById("tablaCobrarRep");
                loader.style.display = "block";
                tabla.innerHTML = "";
                try {
                    const data = await api({
                        ACCION: "LISTAR_CUENTAS_COBRAR",
                        SUCURSAL: document.getElementById("filtroCobrarSucursal").value,
                        ESTADO: document.getElementById("filtroCobrarEstado").value,
                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (!data.datos || data.datos.length === 0) {
                        tabla.innerHTML = `<div class="empty-state">Sin cuentas encontradas</div>`
                    } else {
                        let h = `<table><thead><tr><th class="col-prod">Cliente</th><th>Total</th><th>Saldo</th><th>Estado</th><th></th></tr></thead><tbody>`;
                        data.datos.forEach(c => {
                            const ok = c.estado === "CANCELADO";
                            h += `<tr><td class="col-prod">${c.cliente}<br><small style="color:var(--muted)">${c.concepto}</small></td><td>Bs ${Number(c.totalVenta).toFixed(2)}</td><td>Bs ${Number(c.saldo).toFixed(2)}</td><td class="${ok ? "estado-cancelado" : "estado-pendiente"}">${c.estado}</td><td>${!ok ? `<button class="btn-ghost btn-sm" data-accion="abrir-form-abono" data-id="${c.id}">💳</button>` : ""}</td></tr>`
                        }
                        );
                        tabla.innerHTML = h + "</tbody></table>";
                        // Delegated listener for abono buttons
                        tabla.querySelectorAll('[data-accion="abrir-form-abono"]').forEach(btn => {
                            btn.addEventListener('click', function() {
                                abrirFormAbonoCobrar(this.dataset.id);
                            });
                        });
                    }
                } catch (e) {
                    tabla.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>`
                }
                loader.style.display = "none"
            }

// Abre el modal de abono para una cuenta por cobrar
            export function abrirFormAbonoCobrar(id) {
                document.getElementById("abonarCobrarId").value = id;
                document.getElementById("abonarCobrarMonto").value = "";
                document.getElementById("abonarCobrarFecha").value = hoy();
                document.getElementById("formAbonarCobrar").classList.add("show");
                document.getElementById("formAbonarCobrar").scrollIntoView({
                    behavior: "smooth"
                })
            }

// Confirma un abono mediante la API
            export async function confirmarAbonoCobrar() {
                const id = document.getElementById("abonarCobrarId").value
                  , mo = Number(document.getElementById("abonarCobrarMonto").value)
                  , me = document.getElementById("abonarCobrarMetodo").value
                  , fe = document.getElementById("abonarCobrarFecha").value;
                if (!id) {
                    mostrarMsg("ID no encontrado", "err");
                    return
                }
                if (isNaN(mo) || mo <= 0) {
                    mostrarMsg("Ingresa un monto válido", "err");
                    return
                }
                const loader = document.getElementById("loaderAbonarCobrar");
                loader.style.display = "block";
                try {
                    const data = await api({
                        ACCION: "ABONAR_CUENTA_COBRAR",
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
                        mostrarMsg("✅ Pago registrado · Saldo: Bs " + data.nuevoSaldo, "ok");
                        document.getElementById("formAbonarCobrar").classList.remove("show");
                        if (_verificarEstadoCaja) _verificarEstadoCaja();
                        await listarCuentasCobrar()
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                } catch (e) {
                    mostrarMsg("Error de conexión", "err")
                }
                loader.style.display = "none"
            }

// Registra una nueva cuenta por cobrar
            export async function registrarCuentaCobrar() {
                const su = document.getElementById("nuevaCobrarSucursal").value
                  , cli = document.getElementById("nuevaCobrarCliente").value.trim()
                  , co = document.getElementById("nuevaCobrarConcepto").value.trim()
                  , to = Number(document.getElementById("nuevaCobrarTotal").value)
                  , ab = Number(document.getElementById("nuevaCobrarAbono").value) || 0;
                if (!cli) {
                    mostrarMsg("Ingresa el nombre del cliente", "err");
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
                const loader = document.getElementById("loaderNuevaCobrar");
                loader.style.display = "block";
                try {
                    const data = await api({
                        ACCION: "REGISTRAR_CUENTA_COBRAR",
                        SUCURSAL: su,
                        CLIENTE: cli,
                        CONCEPTO: co,
                        TOTAL_VENTA: to,
                        ABONO: ab,
                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (data.ok) {
                        mostrarMsg("📋 Cuenta registrada · Saldo: Bs " + data.saldo, "ok");
                        ["nuevaCobrarCliente", "nuevaCobrarConcepto", "nuevaCobrarTotal", "nuevaCobrarAbono"].forEach(id => document.getElementById(id).value = "");
                        await listarCuentasCobrar()
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                } catch (e) {
                    mostrarMsg("Error de conexión", "err")
                }
                loader.style.display = "none"
            }

            // ══ CUENTAS PAGAR ══

// ── Init: main.js llamara initCuentasCobrar() en fase 5 ──────────────
