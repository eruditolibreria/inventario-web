/* === MODO CAJA: Apertura, cierre, estado y movimientos === */

/*
 * Funciones del modulo de caja: verificacion de estado por sucursal,
 * apertura con saldo inicial, cierre con saldo final y diferencia,
 * y registro de aportes/retiros.
 *
 * Dependencias directas (ya modulos):
 *   - ../store.js        (store)
 *   - ../api.js          (api)
 *   - ../utils.js        (mostrarMsg)
 *   - ../ui.js           (manejarRespuesta)
 *
 * Uso:
 *   import { initCaja, verificarEstadoCaja, abrirCaja, cerrarCaja } from './modos/caja.js';
 */

import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg } from '../utils.js';
import { manejarRespuesta } from '../ui.js';


// Verifica el estado de caja en todas las sucursales y actualiza badges
            export async function verificarEstadoCaja() {
                if (!store.sessionToken)
                    return;
                try {
                    const data = await api({
                        ACCION: "ESTADO_CAJA",
                        TOKEN: store.sessionToken
                    });
                    const cb = document.getElementById("cajaBadge")
                      , cs = document.getElementById("cierreCajaId");
                    if (cs) cs.innerHTML = '<option value="">🏪 Seleccionar sucursal</option>';
                    const t = {
                        ERUDITOS: {
                            txt: document.getElementById("cajaTxtEruditos"),
                            det: document.getElementById("cajaDetEruditos"),
                            card: document.getElementById("cajaCardEruditos")
                        },
                        CENTRAL: {
                            txt: document.getElementById("cajaTxtCentral"),
                            det: document.getElementById("cajaDetCentral"),
                            card: document.getElementById("cajaCardCentral")
                        }
                    };
                    Object.values(t).forEach(x => {
                        if (!x.txt || !x.det || !x.card) return;
                        x.txt.className = "caja-estado-err";
                        x.txt.textContent = "🔴 Cerrada";
                        x.det.textContent = "";
                        x.card.style.borderColor = ""
                    }
                    );
                    const ca = data.cajas || [];
                    let hay = false;
                    ca.forEach(c => {
                        const s = (c.sucursal || "").toUpperCase()
                          , x = t[s];
                        if (!x)
                            return;
                        hay = true;
                        x.txt.className = "caja-estado-ok";
                        x.txt.innerHTML = `<span class="caja-live-dot"></span>Abierta`;
                        const saldoStr = c.saldoActual !== undefined ? `Bs ${Number(c.saldoActual).toFixed(2)} (actual)` : `Bs ${Number(c.saldoInicial).toFixed(2)} (inicial)`;
                        x.det.textContent = saldoStr + ' · ' + c.usuarioApertura;
                        x.card.style.borderColor = "var(--accent)";
                        const o = document.createElement("option");
                        o.value = c.cajaId;
                        o.textContent = s + " · " + saldoStr;
                        if (cs) cs.appendChild(o)
                    }
                    );
                    cb.style.display = hay ? "inline-block" : "none";
                    if (ca.length === 1 && cs)
                        cs.value = ca[0].cajaId;
                } catch (e) {}
            }

// Abre una caja con saldo inicial para una sucursal
            export async function abrirCaja() {
                if (!store.sessionToken) {
                    mostrarMsg("Sesión expirada", "err");
                    return
                }
                const su = document.getElementById("aperturaSucursal").value
                  , si = Number(document.getElementById("aperturaSaldo").value);
                if (!su) {
                    mostrarMsg("Selecciona una sucursal", "err");
                    return
                }
                if (isNaN(si) || si < 0) {
                    mostrarMsg("Ingresa un saldo inicial válido", "err");
                    return
                }
                const loader = document.getElementById("loaderApertura");
                loader.style.display = "block";
                try {
                    const data = await api({
                        ACCION: "APERTURA_CAJA",
                        SUCURSAL: su,
                        SALDO_INICIAL: si,
                        NOTAS: document.getElementById("aperturaNotas").value,
                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (data.ok) {
                        mostrarMsg("🔓 Caja abierta correctamente · " + data.sucursal, "ok");
                        document.getElementById("aperturaSaldo").value = "";
                        document.getElementById("aperturaNotas").value = "";
                        document.getElementById("aperturaSucursal").value = "";
                        await verificarEstadoCaja()
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                } catch (e) {
                    mostrarMsg("Error de conexión", "err")
                }
                loader.style.display = "none";
            }

// Cierra una caja abierta con saldo final y calcula diferencia
            export async function cerrarCaja() {
                if (!store.sessionToken) {
                    mostrarMsg("Sesión expirada", "err");
                    return
                }
                const id = document.getElementById("cierreCajaId").value
                  , sf = Number(document.getElementById("cierreSaldo").value);
                if (!id) {
                    mostrarMsg("No hay caja abierta para cerrar", "err");
                    return
                }
                if (isNaN(sf) || sf < 0) {
                    mostrarMsg("Ingresa el saldo final contado", "err");
                    return
                }
                if (!confirm("¿Confirmar cierre de caja con saldo final Bs " + sf + "?"))
                    return;
                const loader = document.getElementById("loaderCierre");
                loader.style.display = "block";
                try {
                    const data = await api({
                        ACCION: "CIERRE_CAJA",
                        ID: id,
                        SALDO_FINAL: sf,
                        NOTAS: document.getElementById("cierreNotas").value,
                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (data.ok) {
                        const resumen = document.getElementById("cierreResumen");
                        const sActual = Number(data.saldoActual || 0)
                          , sFinal = Number(data.saldoFinal || sf)
                          , dif = Number(data.diferencia || 0);
                        document.getElementById("cierreValSistema").textContent = `Bs ${sActual.toFixed(2)}`;
                        document.getElementById("cierreValContado").textContent = `Bs ${sFinal.toFixed(2)}`;
                        const difEl = document.getElementById("cierreValDif");
                        difEl.textContent = (dif >= 0 ? "+" : "") + `Bs ${dif.toFixed(2)}`;
                        difEl.className = "val " + (dif === 0 ? "val-neu" : dif > 0 ? "val-pos" : "val-neg");
                        resumen.classList.add("show");
                        mostrarMsg("🔒 Caja cerrada · Diferencia: " + (dif >= 0 ? "+" : "") + `Bs ${dif.toFixed(2)}`, "ok");
                        document.getElementById("cierreSaldo").value = "";
                        document.getElementById("cierreNotas").value = "";
                        await verificarEstadoCaja();
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                } catch (e) {
                    mostrarMsg("Error de conexión", "err")
                }
                loader.style.display = "none";
            }

// Registra un aporte o retiro de efectivo en caja
            export async function registrarAporteRetiro() {
                if (!store.sessionToken) {
                    mostrarMsg("Sesión expirada", "err");
                    return
                }
                const su = document.getElementById("aporteSucursal").value
                  , tp = document.getElementById("aporteTipo").value
                  , co = document.getElementById("aporteConcepto").value.trim()
                  , mo = Number(document.getElementById("aporteMonto").value)
                  , me = document.getElementById("aporteMetodo").value
                  , fe = document.getElementById("aporteFecha").value;
                if (!su) {
                    mostrarMsg("Selecciona una sucursal", "err");
                    return
                }
                if (!co) {
                    mostrarMsg("Ingresa el concepto", "err");
                    return
                }
                if (isNaN(mo) || mo <= 0) {
                    mostrarMsg("Ingresa un monto válido", "err");
                    return
                }
                const loader = document.getElementById("loaderAporte");
                loader.style.display = "block";
                try {
                    const data = await api({
                        ACCION: "REGISTRAR_APORTE_RETIRO",
                        SUCURSAL: su,
                        TIPO: tp,
                        CONCEPTO: co,
                        MONTO: mo,
                        METODO_GASTO: me,
                        FECHA: fe,
                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (data.ok) {
                        mostrarMsg("💼 " + tp + " registrado correctamente", "ok");
                        document.getElementById("aporteConcepto").value = "";
                        document.getElementById("aporteMonto").value = "";
                        document.getElementById("aporteSucursal").value = "";
                        document.getElementById("aporteTipo").value = "APORTE";
                        await verificarEstadoCaja();
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                } catch (e) {
                    mostrarMsg("Error de conexión", "err")
                }
                loader.style.display = "none";
            }

// ── Init: main.js llamara initCaja() en fase 5 ──────────────
