# -*- coding: utf-8 -*-
"""
Script para implementar transición de empuje interactiva (velocity-based)
en index.html sin corromper caracteres especiales.
"""

import re
import os

FILE = "index.html"
BACKUP = "index.html.backup_push"

# Crear backup
with open(FILE, "r", encoding="utf-8") as f:
    original = f.read()

with open(BACKUP, "w", encoding="utf-8") as f:
    f.write(original)

print(f"Backup guardado como {BACKUP} ({len(original)} chars)")

content = original

# ──────────────────────────────────────────────────────────────────
# 1. AGREGAR NUEVOS KEYFRAMES CSS
# ──────────────────────────────────────────────────────────────────
# Encontrar el bloque de @keyframes slideInFromLeft y agregar los nuevos después

old_keyframes_block = """            @keyframes slideInFromLeft {
                from { opacity: 0; transform: translateX(-20px); }
                to   { opacity: 1; transform: translateX(0); }
            }"""

new_keyframes_block = """            @keyframes slideInFromLeft {
                from { opacity: 0; transform: translateX(-20px); }
                to   { opacity: 1; transform: translateX(0); }
            }
            /* Push-out animations para transicion entre pestanas */
            @keyframes slideOutToLeft {
                from { opacity: 1; transform: translateX(0); }
                to   { opacity: 0; transform: translateX(-60px); }
            }
            @keyframes slideOutToRight {
                from { opacity: 1; transform: translateX(0); }
                to   { opacity: 0; transform: translateX(60px); }
            }
            /* Seccion con transicion suave para snap-back/completion */
            .seccion.push-transitioning {
                transition: transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.35s ease;
                will-change: transform, opacity;
            }
            .seccion.push-dragging {
                transition: none !important;
                will-change: transform;
                pointer-events: none;
            }"""

if old_keyframes_block in content:
    content = content.replace(old_keyframes_block, new_keyframes_block)
    print("✓ Keyframes CSS agregados")
else:
    print("✗ ERROR: No se encontró el bloque de keyframes slideInFromLeft")

# ──────────────────────────────────────────────────────────────────
# 2. ACTUALIZAR MEDIA QUERY prefers-reduced-motion
# ──────────────────────────────────────────────────────────────────
old_reduced_motion = """            /* Respetar prefers-reduced-motion */
            @media (prefers-reduced-motion: reduce) {
                .mode-tab .tab-icon,
                .nav-indicator,
                .mode-tab,
                .contenido-slider {
                    transition: none !important;
                    animation: none !important;
                }
            }"""

new_reduced_motion = """            /* Respetar prefers-reduced-motion */
            @media (prefers-reduced-motion: reduce) {
                .mode-tab .tab-icon,
                .nav-indicator,
                .mode-tab,
                .contenido-slider,
                .seccion,
                .seccion.push-transitioning,
                .seccion.push-dragging {
                    transition: none !important;
                    animation: none !important;
                }
            }"""

if old_reduced_motion in content:
    content = content.replace(old_reduced_motion, new_reduced_motion)
    print("✓ Media query prefers-reduced-motion actualizada")
else:
    print("✗ ERROR: No se encontró la media query prefers-reduced-motion")

# ──────────────────────────────────────────────────────────────────
# 3. REEMPLAZAR setModo() CON VERSIÓN CON EMPUJE
# ──────────────────────────────────────────────────────────────────
old_setModo = """            function setModo(modo) {
                modoActual = modo;
                /* Mostrar/ocultar secciones con animacion slide */
                TODOS_MODOS.forEach(function(m) {
                    var sec = document.getElementById("seccion-" + m);
                    var act = m === modo;
                    if (act) {
                        sec.classList.remove("oculto");
                        sec.style.animation = "slideInFromRight 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards";
                    } else {
                        sec.classList.add("oculto");
                        sec.style.animation = "";
                    }
                    document.getElementById("tab-" + m).classList.toggle("active", m === modo);
                });
                actualizarIndicador(modo);
                /* Auto-scroll hacia la pestana activa */
                var tabActivo = document.getElementById("tab-" + modo);
                if (tabActivo) {
                    tabActivo.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                }
                /* --- Acciones especificas por modo (original) --- */
                if (modo === "CAJA" && sessionToken)
                    verificarEstadoCaja();
                if (modo === "DEVOLUCIONES")
                    setSubModoDevol("REGISTRAR");
                if (modo === "REPORTES")
                    setSubModoReportes("MAS");
                if (modo === "USUARIOS")
                    cargarUsuarios();
                if (modo === "TRANSFERENCIAS")
                    setSubModoTransf("REGISTRAR");
                if (modo === "LAMINAS")
                    setSubModoLaminas("BUSCAR");
                if (modo === "SERVICIOS") {
                    setSubModoServicios("COPIAS");
                    document.getElementById("srvResumenFecha").value = hoy();
                }
            }"""

new_setModo = """            function setModo(modo, direccion, velocidad) {
                /* direccion: 1 = forward (dcha->izq), -1 = backward (izq->dcha), 0 = sin anim */
                /* velocidad: px/ms opcional; si no se pasa, se usa default 0.25 px/ms ~ 300ms */
                var modoAnterior = modoActual;
                if (modoAnterior === modo) return;
                
                /* Si el usuario prefiere movimiento reducido, cambio instantaneo */
                var prefiereReducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (prefiereReducido) direccion = 0;
                
                /* Determinar direccion si no se paso */
                if (direccion === undefined || direccion === null) {
                    var idxAnterior = ORDEN_MODOS.indexOf(modoAnterior);
                    var idxNuevo = ORDEN_MODOS.indexOf(modo);
                    if (idxAnterior >= 0 && idxNuevo >= 0) {
                        direccion = idxNuevo > idxAnterior ? 1 : -1;
                    } else {
                        direccion = 1; // default forward
                    }
                }
                
                modoActual = modo;
                var duracion = 300; // ms default
                if (velocidad && velocidad > 0 && direccion !== 0) {
                    /* Ajustar duracion segun velocidad real del gesto */
                    /* velocidad en px/ms, queremos que recorra ~100% del ancho */
                    var anchoPanel = document.querySelector('.panel-body')?.offsetWidth || 360;
                    duracion = Math.round(anchoPanel / velocidad);
                    duracion = Math.max(120, Math.min(500, duracion)); // clamp entre 120ms y 500ms
                }
                
                var secEntrante = document.getElementById("seccion-" + modo);
                var secSaliente = document.getElementById("seccion-" + modoAnterior);
                
                /* Actualizar tabs (activo/inactivo) */
                TODOS_MODOS.forEach(function(m) {
                    document.getElementById("tab-" + m).classList.toggle("active", m === modo);
                });
                actualizarIndicador(modo);
                
                /* Scroll hacia la pestana activa */
                var tabActivo = document.getElementById("tab-" + modo);
                if (tabActivo) {
                    tabActivo.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                }
                
                if (direccion === 0) {
                    /* Sin animacion: cambio instantaneo */
                    TODOS_MODOS.forEach(function(m) {
                        var sec = document.getElementById("seccion-" + m);
                        var act = m === modo;
                        if (act) {
                            sec.classList.remove("oculto");
                            sec.style.animation = "";
                            sec.style.transform = "";
                            sec.style.opacity = "";
                            sec.classList.remove("push-transitioning", "push-dragging");
                        } else {
                            sec.classList.add("oculto");
                            sec.style.animation = "";
                            sec.style.transform = "";
                            sec.style.opacity = "";
                            sec.classList.remove("push-transitioning", "push-dragging");
                        }
                    });
                } else if (direccion === 1) {
                    /* Forward: saliente -> izquierda, entrante <- desde derecha */
                    /* Limpiar estado previo */
                    secEntrante.classList.remove("oculto", "push-dragging");
                    secEntrante.style.transform = "";
                    secEntrante.style.opacity = "";
                    secEntrante.style.animation = "slideInFromRight " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";
                    
                    secSaliente.classList.remove("push-dragging");
                    secSaliente.style.transform = "";
                    secSaliente.style.opacity = "";
                    secSaliente.classList.add("push-transitioning");
                    secSaliente.style.animation = "slideOutToLeft " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";
                    
                    /* Al terminar, ocultar la seccion saliente */
                    var onEnd = function() {
                        secSaliente.classList.add("oculto");
                        secSaliente.classList.remove("push-transitioning");
                        secSaliente.style.animation = "";
                        secSaliente.style.transform = "";
                        secSaliente.style.opacity = "";
                        secSaliente.removeEventListener("animationend", onEnd);
                        secEntrante.style.animation = "";
                        secEntrante.style.transform = "";
                        secEntrante.style.opacity = "";
                    };
                    secSaliente.addEventListener("animationend", onEnd, { once: true });
                } else if (direccion === -1) {
                    /* Backward: saliente -> derecha, entrante <- desde izquierda */
                    secEntrante.classList.remove("oculto", "push-dragging");
                    secEntrante.style.transform = "";
                    secEntrante.style.opacity = "";
                    secEntrante.style.animation = "slideInFromLeft " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";
                    
                    secSaliente.classList.remove("push-dragging");
                    secSaliente.style.transform = "";
                    secSaliente.style.opacity = "";
                    secSaliente.classList.add("push-transitioning");
                    secSaliente.style.animation = "slideOutToRight " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";
                    
                    var onEnd = function() {
                        secSaliente.classList.add("oculto");
                        secSaliente.classList.remove("push-transitioning");
                        secSaliente.style.animation = "";
                        secSaliente.style.transform = "";
                        secSaliente.style.opacity = "";
                        secSaliente.removeEventListener("animationend", onEnd);
                        secEntrante.style.animation = "";
                        secEntrante.style.transform = "";
                        secEntrante.style.opacity = "";
                    };
                    secSaliente.addEventListener("animationend", onEnd, { once: true });
                }
                
                /* --- Acciones especificas por modo (original) --- */
                if (modo === "CAJA" && sessionToken)
                    verificarEstadoCaja();
                if (modo === "DEVOLUCIONES")
                    setSubModoDevol("REGISTRAR");
                if (modo === "REPORTES")
                    setSubModoReportes("MAS");
                if (modo === "USUARIOS")
                    cargarUsuarios();
                if (modo === "TRANSFERENCIAS")
                    setSubModoTransf("REGISTRAR");
                if (modo === "LAMINAS")
                    setSubModoLaminas("BUSCAR");
                if (modo === "SERVICIOS") {
                    setSubModoServicios("COPIAS");
                    document.getElementById("srvResumenFecha").value = hoy();
                }
            }"""

if old_setModo in content:
    content = content.replace(old_setModo, new_setModo)
    print("✓ setModo() reemplazado con version con empuje")
else:
    print("✗ ERROR: No se encontró setModo()")
    # Debug: buscar qué podría ser diferente
    idx = content.find("function setModo(modo)")
    if idx >= 0:
        print(f"  Encontrado en posición {idx}, mostrando 200 chars:")
        print(f"  {repr(content[idx:idx+200])}")

# ──────────────────────────────────────────────────────────────────
# 4. REEMPLAZAR SWIPE TÁCTIL CON VERSIÓN INTERACTIVA
# ──────────────────────────────────────────────────────────────────
old_swipe = """            /* Swipe tactil para cambiar de pestana */
            (function() {
                var touchStartX = 0, touchStartY = 0;
                var contenidoArea = document.querySelector('.panel-body');
                if (contenidoArea) {
                    contenidoArea.addEventListener('touchstart', function(e) {
                        touchStartX = e.changedTouches[0].screenX;
                        touchStartY = e.changedTouches[0].screenY;
                    }, { passive: true });
                    contenidoArea.addEventListener('touchend', function(e) {
                        var diffX = touchStartX - e.changedTouches[0].screenX;
                        var diffY = touchStartY - e.changedTouches[0].screenY;
                        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                            var idx = ORDEN_MODOS.indexOf(modoActual);
                            if (diffX > 0 && idx < ORDEN_MODOS.length - 1) {
                                var nextTab = document.getElementById('tab-' + ORDEN_MODOS[idx + 1]);
                                if (nextTab && !nextTab.classList.contains('hidden-tab')) {
                                    setModo(ORDEN_MODOS[idx + 1]);
                                }
                            } else if (diffX < -50 && idx > 0) {
                                var prevTab = document.getElementById('tab-' + ORDEN_MODOS[idx - 1]);
                                if (prevTab && !prevTab.classList.contains('hidden-tab')) {
                                    setModo(ORDEN_MODOS[idx - 1]);
                                }
                            }
                        }
                    }, { passive: true });
                }
            })();"""

new_swipe = """            /* Swipe tactil interactivo con arrastre en tiempo real */
            (function() {
                var touchStartX = 0, touchStartY = 0;
                var touchStartTime = 0;
                var dragging = false;
                var dragModoDestino = null;
                var dragDireccion = 0;
                var secActual = null;
                var secDestino = null;
                var startX = 0;
                
                function resetDrag() {
                    if (secActual) {
                        secActual.classList.remove("push-dragging");
                        secActual.style.transform = "";
                        secActual.style.opacity = "";
                    }
                    if (secDestino) {
                        secDestino.classList.remove("push-dragging");
                        secDestino.style.transform = "";
                        secDestino.style.opacity = "";
                        secDestino.classList.add("oculto");
                    }
                    dragging = false;
                    dragModoDestino = null;
                    dragDireccion = 0;
                    secActual = null;
                    secDestino = null;
                }
                
                var contenidoArea = document.querySelector('.panel-body');
                if (contenidoArea) {
                    contenidoArea.addEventListener('touchstart', function(e) {
                        if (dragging) resetDrag();
                        touchStartX = e.changedTouches[0].screenX;
                        touchStartY = e.changedTouches[0].screenY;
                        touchStartTime = Date.now();
                        startX = touchStartX;
                        dragModoDestino = null;
                        dragDireccion = 0;
                    }, { passive: true });
                    
                    contenidoArea.addEventListener('touchmove', function(e) {
                        if (dragging || dragDireccion !== 0) {
                            /* Ya estamos en drag activo */
                            var currentX = e.changedTouches[0].screenX;
                            var deltaX = currentX - startX;
                            var anchoPanel = contenidoArea.offsetWidth || 360;
                            
                            if (secActual) {
                                var progress = Math.min(1, Math.max(0, Math.abs(deltaX) / anchoPanel));
                                if (dragDireccion === 1) {
                                    /* Forward: mover actual a izq, destino desde derecha */
                                    secActual.style.transform = "translateX(" + (-deltaX) + "px)";
                                    secActual.style.opacity = Math.max(0, 1 - progress).toString();
                                    if (secDestino) {
                                        secDestino.style.transform = "translateX(" + (anchoPanel - deltaX) + "px)";
                                        secDestino.style.opacity = progress.toString();
                                    }
                                } else if (dragDireccion === -1) {
                                    /* Backward: mover actual a der, destino desde izq */
                                    secActual.style.transform = "translateX(" + (-deltaX) + "px)";
                                    secActual.style.opacity = Math.max(0, 1 - progress).toString();
                                    if (secDestino) {
                                        secDestino.style.transform = "translateX(" + (-anchoPanel - deltaX) + "px)";
                                        secDestino.style.opacity = progress.toString();
                                    }
                                }
                            }
                            return;
                        }
                        
                        var currentX = e.changedTouches[0].screenX;
                        var currentY = e.changedTouches[0].screenY;
                        var diffX = currentX - touchStartX;
                        var diffY = currentY - touchStartY;
                        
                        /* Solo iniciar drag si es mas horizontal que vertical y > 10px */
                        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
                            var idx = ORDEN_MODOS.indexOf(modoActual);
                            if (diffX < 0 && idx < ORDEN_MODOS.length - 1) {
                                /* Swipe hacia izquierda = forward */
                                var nextTab = document.getElementById('tab-' + ORDEN_MODOS[idx + 1]);
                                if (nextTab && !nextTab.classList.contains('hidden-tab')) {
                                    dragDireccion = 1;
                                    dragModoDestino = ORDEN_MODOS[idx + 1];
                                }
                            } else if (diffX > 0 && idx > 0) {
                                /* Swipe hacia derecha = backward */
                                var prevTab = document.getElementById('tab-' + ORDEN_MODOS[idx - 1]);
                                if (prevTab && !prevTab.classList.contains('hidden-tab')) {
                                    dragDireccion = -1;
                                    dragModoDestino = ORDEN_MODOS[idx - 1];
                                }
                            }
                            
                            if (dragDireccion !== 0) {
                                dragging = true;
                                secActual = document.getElementById("seccion-" + modoActual);
                                secDestino = document.getElementById("seccion-" + dragModoDestino);
                                
                                if (secActual) {
                                    secActual.classList.add("push-dragging");
                                    secActual.style.transform = "";
                                    secActual.style.opacity = "1";
                                }
                                if (secDestino) {
                                    secDestino.classList.remove("oculto");
                                    secDestino.classList.add("push-dragging");
                                    secDestino.style.transform = "";
                                    secDestino.style.opacity = "0";
                                }
                                startX = touchStartX;
                                /* Actualizar tabs visualmente */
                                document.getElementById("tab-" + dragModoDestino)?.classList.add("active");
                                document.getElementById("tab-" + modoActual)?.classList.remove("active");
                                actualizarIndicador(dragModoDestino);
                            }
                        }
                    }, { passive: true });
                    
                    contenidoArea.addEventListener('touchend', function(e) {
                        if (!dragging) {
                            /* Comportamiento original para taps rapidos */
                            var diffX = touchStartX - e.changedTouches[0].screenX;
                            var diffY = touchStartY - e.changedTouches[0].screenY;
                            var elapsed = Date.now() - touchStartTime;
                            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                                var idx = ORDEN_MODOS.indexOf(modoActual);
                                var velocidad = Math.abs(diffX) / Math.max(elapsed, 1);
                                if (diffX > 0 && idx < ORDEN_MODOS.length - 1) {
                                    var nextTab = document.getElementById('tab-' + ORDEN_MODOS[idx + 1]);
                                    if (nextTab && !nextTab.classList.contains('hidden-tab')) {
                                        setModo(ORDEN_MODOS[idx + 1], 1, velocidad);
                                    }
                                } else if (diffX < -50 && idx > 0) {
                                    var prevTab = document.getElementById('tab-' + ORDEN_MODOS[idx - 1]);
                                    if (prevTab && !prevTab.classList.contains('hidden-tab')) {
                                        setModo(ORDEN_MODOS[idx - 1], -1, velocidad);
                                    }
                                }
                            }
                            return;
                        }
                        
                        /* Finalizar drag */
                        var endX = e.changedTouches[0].screenX;
                        var totalDiff = endX - startX;
                        var anchoPanel = contenidoArea.offsetWidth || 360;
                        var elapsed = Date.now() - touchStartTime;
                        var velocidad = Math.abs(totalDiff) / Math.max(elapsed, 1);
                        
                        /* Umbral: completar si se movio > 30% del ancho o velocidad > 0.5 px/ms */
                        var progress = Math.abs(totalDiff) / anchoPanel;
                        
                        if (progress > 0.3 || velocidad > 0.5) {
                            /* Completar transicion */
                            if (secActual) {
                                secActual.classList.remove("push-dragging");
                                secActual.style.transform = "";
                                secActual.style.opacity = "";
                                secActual.classList.add("push-transitioning");
                            }
                            if (secDestino) {
                                secDestino.classList.remove("push-dragging");
                                secDestino.style.transform = "";
                                secDestino.style.opacity = "";
                                secDestino.classList.add("push-transitioning");
                            }
                            
                            /* Usar setModo para completar la transicion con la velocidad medida */
                            var dir = dragDireccion;
                            var dest = dragModoDestino;
                            
                            /* Limpiar estado antes de delegar */
                            resetDrag();
                            
                            if (dest) {
                                setModo(dest, dir, velocidad);
                            }
                        } else {
                            /* Snap-back: revertir al modo original */
                            if (secActual) {
                                secActual.classList.add("push-transitioning");
                                secActual.style.transform = "translateX(0)";
                                secActual.style.opacity = "1";
                            }
                            if (secDestino) {
                                secDestino.classList.add("push-transitioning");
                                if (dragDireccion === 1) {
                                    secDestino.style.transform = "translateX(100%)";
                                } else {
                                    secDestino.style.transform = "translateX(-100%)";
                                }
                                secDestino.style.opacity = "0";
                            }
                            
                            /* Restaurar tabs */
                            document.getElementById("tab-" + dragModoDestino)?.classList.remove("active");
                            document.getElementById("tab-" + modoActual)?.classList.add("active");
                            actualizarIndicador(modoActual);
                            
                            var snapDuration = Math.max(120, Math.min(300, Math.round(anchoPanel * (1 - progress) / Math.max(velocidad, 0.1))));
                            secActual.style.transition = "transform " + snapDuration + "ms cubic-bezier(0.25, 0.8, 0.25, 1), opacity " + snapDuration + "ms ease";
                            if (secDestino) {
                                secDestino.style.transition = "transform " + snapDuration + "ms cubic-bezier(0.25, 0.8, 0.25, 1), opacity " + snapDuration + "ms ease";
                            }
                            
                            var onSnapEnd = function() {
                                resetDrag();
                            };
                            secActual.addEventListener("transitionend", onSnapEnd, { once: true });
                        }
                    }, { passive: true });
                    
                    /* Cancelar drag si el dedo sale del area */
                    contenidoArea.addEventListener('touchcancel', function(e) {
                        if (dragging) {
                            resetDrag();
                            /* Restaurar tabs */
                            document.getElementById("tab-" + dragModoDestino)?.classList.remove("active");
                            document.getElementById("tab-" + modoActual)?.classList.add("active");
                            actualizarIndicador(modoActual);
                        }
                    }, { passive: true });
                }
            })();"""

if old_swipe in content:
    content = content.replace(old_swipe, new_swipe)
    print("✓ Swipe táctil reemplazado con versión interactiva")
else:
    print("✗ ERROR: No se encontró el bloque de swipe táctil")
    # Debug
    idx = content.find("Swipe tactil para cambiar de pestana")
    if idx >= 0:
        print(f"  Encontrado en posición {idx}")
        print(f"  Contenido: {repr(content[idx:idx+120])}")

# ──────────────────────────────────────────────────────────────────
# 5. GUARDAR RESULTADO
# ──────────────────────────────────────────────────────────────────
with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print(f"\n✓ Archivo guardado: {FILE} ({len(content)} chars)")
print(f"  Diferencia: {len(content) - len(original):+d} chars")

# ──────────────────────────────────────────────────────────────────
# 6. VERIFICACIONES BÁSICAS
# ──────────────────────────────────────────────────────────────────
checks = [
    ("slideOutToLeft", "CSS slideOutToLeft"),
    ("slideOutToRight", "CSS slideOutToRight"),
    ("push-transitioning", "CSS push-transitioning"),
    ("push-dragging", "CSS push-dragging"),
    ("function setModo(modo, direccion, velocidad)", "setModo con nuevos params"),
    ("dragModoDestino", "Swipe interactivo"),
    ("touchmove", "Listener touchmove"),
    ("prefers-reduced-motion: reduce", "Media query accesibilidad"),
    ("TODOS_MODOS", "Constante TODOS_MODOS intacta"),
    ("ORDEN_MODOS", "Constante ORDEN_MODOS intacta"),
    ("function setSubModoCaja(s)", "Sub-tabs intactos"),
    ("function setSubModoCuentas(s)", "Sub-tabs cuentas intactos"),
    ("function setSubModoDevol(s)", "Sub-tabs devol intactos"),
    ("function buscarProductoDetalle()", "Busqueda intacta"),
    ("function ejecutarBusquedaDetalle(t)", "Busqueda detalle intacta"),
    ("function renderSearchCard(p)", "Render search card intacto"),
]

all_ok = True
for pattern, desc in checks:
    if pattern in content:
        print(f"  ✓ {desc}")
    else:
        print(f"  ✗ FALTA: {desc}")
        all_ok = False

if all_ok:
    print("\n✅ Todas las verificaciones pasaron.")
else:
    print("\n⚠️  Algunas verificaciones fallaron. Revisar manualmente.")
    print(f"   Backup disponible en: {BACKUP}")