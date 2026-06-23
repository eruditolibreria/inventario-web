/* === MODO GASTO: Registro de gastos operativos === */
import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, hoy } from '../utils.js';
import { manejarRespuesta } from '../ui.js';

let _verificarEstadoCaja = null;
export function initGasto(cb) { if (cb.verificarEstadoCaja) _verificarEstadoCaja = cb.verificarEstadoCaja; }


// Muestra/oculta el campo de acreedor segun metodo de pago (CREDITO)
            export function toggleAcreedorGasto() {
                document.getElementById("campoAcreedorGasto").classList.toggle("oculto", document.getElementById("metodoPagoGasto").value !== "CREDITO")
            }

// Registra un gasto operativo con validaciones
            export async function registrarGasto() {
                if (!store.sessionToken) {
                    mostrarMsg("Sesión expirada", "err");
                    return
                }
                const co = document.getElementById("gastoConcepto").value.trim()
                  , cat = document.getElementById("gastoCategoria").value
                  , imp = document.getElementById("gastoImporte").value
                  , su = document.getElementById("sucursalGasto").value
                  , mp = document.getElementById("metodoPagoGasto").value
                  , pe = document.getElementById("gastoPersona").value.trim()
                  , ac = document.getElementById("gastoAcreedor").value.trim();
                if (!co) {
                    mostrarMsg("Ingresa el concepto del gasto", "err");
                    return
                }
                if (!cat) {
                    mostrarMsg("Selecciona una categoría", "err");
                    return
                }
                if (!su) {
                    mostrarMsg("Selecciona una sucursal", "err");
                    return
                }
                if (!imp || Number(imp) <= 0) {
                    mostrarMsg("Ingresa un importe válido", "err");
                    return
                }
                if (mp === "CREDITO" && !pe && !ac) {
                    mostrarMsg("Ingresa el responsable o acreedor", "err");
                    return
                }
                const loader = document.getElementById("loaderGasto");
                loader.style.display = "block";
                try {
                    const data = await api({
                        ACCION: "REGISTRAR_GASTO",
                        CONCEPTO: co,
                        CATEGORIA: cat,
                        IMPORTE: Number(imp),
                        PERSONA: ac || pe,
                        FECHA: document.getElementById("gastoFecha").value,
                        NOTAS: document.getElementById("gastoNotas").value.trim(),
                        SUCURSAL: su,
                        METODO_PAGO: mp,
                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (data.ok) {
                        mostrarMsg(mp === "CREDITO" ? "📝 Gasto a crédito registrado" : "💸 Gasto registrado correctamente", "ok");
                        ["gastoConcepto", "gastoImporte", "gastoPersona", "gastoNotas", "gastoAcreedor"].forEach(id => {
                            const el = document.getElementById(id);
                            if (el)
                                el.value = ""
                        }
                        );
                        document.getElementById("gastoCategoria").value = "";
                        document.getElementById("sucursalGasto").value = "";
                        document.getElementById("metodoPagoGasto").value = "EFECTIVO";
                        toggleAcreedorGasto();
                        document.getElementById("gastoFecha").value = hoy();
                        if (_verificarEstadoCaja) _verificarEstadoCaja();
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                } catch (e) {
                    mostrarMsg("Error de conexión", "err")
                }
                loader.style.display = "none";
            }

// ── Init: main.js llamara initGasto() en fase 5 ──────────────
