/* === UTILIDADES: Funciones puras, efectos fisicos y notificaciones UI === */

// Retorna fecha actual en formato YYYY-MM-DD
            export function hoy() {
                return new Date().toISOString().slice(0, 10)
            }

// Retorna hora actual en formato HH:MM (formato Bolivia)
            export function horaActual() {
                return new Date().toLocaleTimeString("es-BO", {
                    hour: "2-digit",
                    minute: "2-digit"
                })
            }

// Formatea un numero como moneda Bs (Bolivianos) con 2 decimales
export function formatearBs(valor) {
    return 'Bs ' + Number(valor || 0).toFixed(2);
}

// Emite un sonido de caja registradora usando Web Audio API
                        export function sonidoCaja() {
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const o1 = ctx.createOscillator()
                      , g1 = ctx.createGain();
                    o1.connect(g1);
                    g1.connect(ctx.destination);
                    o1.frequency.value = 1200;
                    g1.gain.setValueAtTime(0.3, ctx.currentTime);
                    g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                    o1.start(ctx.currentTime);
                    o1.stop(ctx.currentTime + 0.3);
                    const o2 = ctx.createOscillator()
                      , g2 = ctx.createGain();
                    o2.connect(g2);
                    g2.connect(ctx.destination);
                    o2.frequency.value = 800;
                    g2.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
                    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                    o2.start(ctx.currentTime + 0.15);
                    o2.stop(ctx.currentTime + 0.5);
                } catch (e) {}
            }

// Vibra el dispositivo segun el patron indicado (ok, caja, error)
            export function vibrar(tipo) {
                try {
                    if (!navigator.vibrate) return;
                    switch (tipo) {
                        case "ok": navigator.vibrate([30, 50, 30]); break;
                        case "caja": navigator.vibrate([80, 60, 80, 60, 80]); break;
                        case "error": navigator.vibrate([100, 80, 100]); break;
                        default: navigator.vibrate([40]); break;
                    }
                } catch (e) {}
            }

// Muestra un mensaje temporal en #mensajeApp (ok/err)
            export function mostrarMsg(t, tipo) {
                const m = document.getElementById("mensajeApp");
                m.className = "mensaje " + (tipo === "ok" ? "msg-ok" : "msg-err");
                m.textContent = t;
                m.style.display = "block";
                setTimeout( () => m.style.display = "none", 3500)
            }

// Variable de estado para el sistema de toast (una notificacion a la vez)
            export let toastActivo = null;

// Muestra una notificacion toast con barra de progreso y boton opcional Deshacer
            export function mostrarToast(mensaje, accionLabel, accionFn, duracion = 4000) {
              const container = document.getElementById("toastContainer");
            
              // Si ya hay uno activo, lo cerramos antes
              if (toastActivo) cerrarToast(toastActivo);
            
              const toast = document.createElement("div");
              toast.className = "toast";
              toast.style.position = "relative";
              toast.style.overflow = "hidden";
              toast.innerHTML = `
                <span class="toast-msg">${mensaje}</span>
                ${accionFn ? `<button class="toast-undo" id="btnUndoToast">${accionLabel || "Deshacer"}</button>` : ""}
                <div class="toast-progress" id="toastProgress" style="width:100%"></div>
              `;
              container.appendChild(toast);
              toastActivo = toast;
            
              // Barra de progreso animada
              const bar = toast.querySelector("#toastProgress");
              requestAnimationFrame(() => {
                bar.style.transition = `width ${duracion}ms linear`;
                bar.style.width = "0%";
              });
            
              // Botón deshacer
              if (accionFn) {
                toast.querySelector("#btnUndoToast").onclick = () => {
                  accionFn();
                  cerrarToast(toast);
                };
              }
            
              const timer = setTimeout(() => cerrarToast(toast), duracion);
              toast._timer = timer;
              return toast;
            }

// Cierra un toast con animacion de salida
            export function cerrarToast(toast) {
              if (!toast || !toast.parentNode) return;
              clearTimeout(toast._timer);
              toast.classList.add("saliendo");
              setTimeout(() => toast.parentNode && toast.parentNode.removeChild(toast), 320);
              if (toastActivo === toast) toastActivo = null;
            }
