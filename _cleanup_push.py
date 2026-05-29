# -*- coding: utf-8 -*-
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

with open('index.html', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Eliminar reglas CSS de push-transitioning y push-dragging del bloque de keyframes
# Buscar el bloque que empieza con "/* Push-out animations" y reemplazar
old_block = """            /* Push-out animations para transicion entre pestanas */
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

new_block = """            /* Push-out animations para transicion entre pestanas */
            @keyframes slideOutToLeft {
                from { opacity: 1; transform: translateX(0); }
                to   { opacity: 0; transform: translateX(-60px); }
            }
            @keyframes slideOutToRight {
                from { opacity: 1; transform: translateX(0); }
                to   { opacity: 0; transform: translateX(60px); }
            }"""

if old_block in c:
    c = c.replace(old_block, new_block)
    print('[OK] Clases CSS eliminadas')
else:
    print('[ERROR] No se encontró el bloque CSS completo')

# 2. Quitar seccion.push-transitioning y seccion.push-dragging de la media query
old_rmq = """            /* Respetar prefers-reduced-motion */
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

new_rmq = """            /* Respetar prefers-reduced-motion */
            @media (prefers-reduced-motion: reduce) {
                .mode-tab .tab-icon,
                .nav-indicator,
                .mode-tab,
                .contenido-slider,
                .seccion {
                    transition: none !important;
                    animation: none !important;
                }
            }"""

if old_rmq in c:
    c = c.replace(old_rmq, new_rmq)
    print('[OK] Media query simplificada')
else:
    print('[ERROR] No se encontró la media query')

# 3. En setModo, eliminar referencias a push-transitioning y push-dragging
# Reemplazar todo el setModo nuevo por una versión limpia
old_setModo_start = """            function setModo(modo, direccion, velocidad) {
                /* direccion: 1 = forward (dcha->izq), -1 = backward (izq->dcha), 0 = sin anim */
                /* velocidad: px/ms opcional; si no se pasa, se usa default 0.25 px/ms ~ 300ms */
                var modoAnterior = modoActual;
                if (modoAnterior === modo) {
                    /* Mismo modo: solo asegurar visibilidad sin animacion */
                    var secMisma = document.getElementById("seccion-" + modo);
                    if (secMisma) {
                        secMisma.classList.remove("oculto", "push-transitioning", "push-dragging");
                        secMisma.style.animation = "";
                        secMisma.style.transform = "";
                        secMisma.style.opacity = "";
                    }
                    actualizarIndicador(modo);
                    return;
                }"""

# Buscar el final del setModo (antes de function setSubModoCaja)
idx_start = c.find(old_setModo_start)
if idx_start == -1:
    print('[ERROR] No se encontró el inicio del nuevo setModo')
else:
    idx_end = c.find('function setSubModoCaja(s)', idx_start)
    if idx_end == -1:
        print('[ERROR] No se encontró setSubModoCaja')
    else:
        # Extraer lo que hay entre medias para confirmar
        snippet = c[idx_start:idx_end]
        
        # Construir nueva versión limpia
        clean_setModo = """            function setModo(modo, direccion, velocidad) {
                /* direccion: 1 = forward (dcha->izq), -1 = backward (izq->dcha), 0 = sin anim */
                /* velocidad: px/ms opcional; si no se pasa, se usa default 0.25 px/ms ~ 300ms */
                var modoAnterior = modoActual;
                if (modoAnterior === modo) {
                    /* Mismo modo: solo asegurar visibilidad sin animacion */
                    var secMisma = document.getElementById("seccion-" + modo);
                    if (secMisma) {
                        secMisma.classList.remove("oculto");
                        secMisma.style.animation = "";
                        secMisma.style.transform = "";
                        secMisma.style.opacity = "";
                        secMisma.style.pointerEvents = "";
                    }
                    actualizarIndicador(modo);
                    return;
                }
                
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
                            sec.style.pointerEvents = "";
                        } else {
                            sec.classList.add("oculto");
                            sec.style.animation = "";
                            sec.style.transform = "";
                            sec.style.opacity = "";
                            sec.style.pointerEvents = "";
                        }
                    });
                } else if (direccion === 1) {
                    /* Forward: saliente -> izquierda, entrante <- desde derecha */
                    secEntrante.classList.remove("oculto");
                    secEntrante.style.animation = "slideInFromRight " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";
                    
                    secSaliente.style.animation = "slideOutToLeft " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";
                    
                    /* Al terminar, ocultar la seccion saliente */
                    var onEnd = function() {
                        secSaliente.classList.add("oculto");
                        secSaliente.style.animation = "";
                        secSaliente.style.transform = "";
                        secSaliente.style.opacity = "";
                        secSaliente.style.pointerEvents = "";
                        secSaliente.removeEventListener("animationend", onEnd);
                        secEntrante.style.animation = "";
                        secEntrante.style.transform = "";
                        secEntrante.style.opacity = "";
                        secEntrante.style.pointerEvents = "";
                    };
                    secSaliente.addEventListener("animationend", onEnd, { once: true });
                } else if (direccion === -1) {
                    /* Backward: saliente -> derecha, entrante <- desde izquierda */
                    secEntrante.classList.remove("oculto");
                    secEntrante.style.animation = "slideInFromLeft " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";
                    
                    secSaliente.style.animation = "slideOutToRight " + duracion + "ms cubic-bezier(0.25, 0.8, 0.25, 1) forwards";
                    
                    var onEnd = function() {
                        secSaliente.classList.add("oculto");
                        secSaliente.style.animation = "";
                        secSaliente.style.transform = "";
                        secSaliente.style.opacity = "";
                        secSaliente.style.pointerEvents = "";
                        secSaliente.removeEventListener("animationend", onEnd);
                        secEntrante.style.animation = "";
                        secEntrante.style.transform = "";
                        secEntrante.style.opacity = "";
                        secEntrante.style.pointerEvents = "";
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
        
        c = c[:idx_start] + clean_setModo + c[idx_end:]
        print('[OK] setModo() limpiado - sin clases nuevas')

# 4. Limpiar swipe táctil: eliminar push-dragging y push-transitioning
# Reemplazar todas las ocurrencias de "push-dragging" y "push-transitioning" en el código
# Buscar el bloque del swipe nuevo y reemplazar
old_sw_start = """            /* Swipe tactil interactivo con arrastre en tiempo real */
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
                }"""

idx_sw = c.find(old_sw_start)
if idx_sw == -1:
    print('[ERROR] No se encontró el swipe interactivo')
else:
    # Encontrar el final (buscar siguiente funcion autoejecutable o el cierre del script)
    idx_sw_end = c.find('            /* ATAJOS DE TECLADO', idx_sw)
    if idx_sw_end == -1:
        idx_sw_end = c.find('            // SISTEMA DE TOAST', idx_sw)
    if idx_sw_end == -1:
        print('[ERROR] No se encontró el final del swipe')
    else:
        # Limpiar ocurrencias de push-dragging y push-transitioning en esa sección
        old_swipe_full = c[idx_sw:idx_sw_end]
        new_swipe_full = old_swipe_full
        
        # Reemplazar classList.remove("push-dragging") -> solo limpiar estilos
        new_swipe_full = new_swipe_full.replace('secActual.classList.remove("push-dragging");', 'secActual.style.pointerEvents = "";')
        new_swipe_full = new_swipe_full.replace('secDestino.classList.remove("push-dragging");', 'secDestino.style.pointerEvents = "";')
        
        # Reemplazar classList.add("push-dragging") -> solo inline styles
        new_swipe_full = new_swipe_full.replace('secActual.classList.add("push-dragging");', 'secActual.style.transition = "none"; secActual.style.pointerEvents = "none";')
        new_swipe_full = new_swipe_full.replace('secDestino.classList.add("push-dragging");', 'secDestino.style.transition = "none"; secDestino.style.pointerEvents = "none";')
        
        # Reemplazar classList.remove("push-dragging") para reset (las versiones con estilo)
        new_swipe_full = new_swipe_full.replace('secActual.classList.remove("push-dragging");', 'secActual.style.transition = ""; secActual.style.pointerEvents = "";')
        new_swipe_full = new_swipe_full.replace('secDestino.classList.remove("push-dragging");', 'secDestino.style.transition = ""; secDestino.style.pointerEvents = "";')
        
        # classList.add("push-transitioning") -> quitar
        new_swipe_full = new_swipe_full.replace('secActual.classList.add("push-transitioning");', '')
        new_swipe_full = new_swipe_full.replace('secDestino.classList.add("push-transitioning");', '')
        
        # Limpiar líneas vacías dobles
        while '\n\n\n' in new_swipe_full:
            new_swipe_full = new_swipe_full.replace('\n\n\n', '\n\n')
        
        c = c[:idx_sw] + new_swipe_full + c[idx_sw_end:]
        print('[OK] Swipe táctil limpiado')

# Guardar
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print('[OK] index.html actualizado')
print('Tamaño final:', len(c), 'chars')
