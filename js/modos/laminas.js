/* === MODO LAMINAS: Busqueda y gestion de laminas === */
import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg } from '../utils.js';
import { manejarRespuesta } from '../ui.js';

let laminaTimer = null;
let _verif = null;
export function initLaminas(cb) {
    if (cb && cb.verificarEstadoCaja) _verif = cb.verificarEstadoCaja;
}

// buscarLaminas

// buscarLaminas
export function buscarLaminas () {
    const t = document.getElementById("laminaInput").value.trim();
    const suc = document.getElementById("laminaFiltroSucursal").value;
    const est = document.getElementById("laminaFiltroEstado").value;
    const l = document.getElementById("listaLaminas");
    clearTimeout(laminaTimer);
    document.getElementById("listaLaminasResultados").innerHTML = "";
    document.getElementById("laminaResultados").innerHTML = "";
    
    // Ejecutar búsqueda si hay título O si hay filtros seleccionados
    if (t.length < 1 && !suc && !est) {
        l.classList.remove("show");
        return
    }
    laminaTimer = setTimeout( () => ejecutarBusquedaLaminas(t), 350);
}

// ejecutarBusquedaLaminas
export async function ejecutarBusquedaLaminas (t) {
    if (!store.sessionToken)
        return;
    const loader = document.getElementById("loaderBuscarLamina")
      , lista = document.getElementById("listaLaminasResultados")
      , suc = document.getElementById("laminaFiltroSucursal").value
      , est = document.getElementById("laminaFiltroEstado").value;
    loader.style.display = "block";
    lista.innerHTML = "";
    try {
        const data = await api({
            ACCION: "BUSCAR_LAMINAS",
            TITULO: t,
            LIMITE: 20,
            SUCURSAL: suc || undefined,
            ESTADO: est || undefined,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return
        }
        const lams = data.datos || [];
        if (lams.length === 0) {
            lista.innerHTML = `<div class="empty-state">Sin láminas encontradas para "<b style="color:var(--text)">${t}</b>"</div>`
        } else {
            lams.forEach(lam => lista.appendChild(renderLaminaCard(lam)))
        }
    } catch (e) {
        lista.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>`
    }
    loader.style.display = "none";
}

// renderLaminaCard
export function renderLaminaCard (lam) {
    const div = document.createElement("div");
    div.className = "lamina-card";
    const esDis = lam.estado === "DISPONIBLE"
      , estadoClass = esDis ? "lam-estado-disponible" : "lam-estado-sinstock"
      , nuevoEstado = esDis ? "SIN STOCK" : "DISPONIBLE"
      , btnLabel = esDis ? "❌ Sin stock" : "✅ Disponible";
    div.innerHTML = `<div style="flex:1;min-width:0"><div class="lam-titulo">${lam.titulo}</div><div class="lam-meta">${lam.categoria || '—'} · ${lam.sucursal || '—'} · ${lam.ubicacion || '—'}</div></div><div class="lam-actions"><span class="${estadoClass}">${lam.estado}</span><button class="btn-icon" data-accion="cambiar-estado" data-lamina-id="${lam.id}" data-nuevo-estado="${nuevoEstado}" title="Cambiar estado">${btnLabel}</button></div>`;
        // Listener delegado en vez de onclick inline
    const btnEstado = div.querySelector('[data-accion="cambiar-estado"]');
    if (btnEstado) {
        btnEstado.addEventListener('click', function() {
            cambiarEstadoLamina(this.dataset.laminaId, this.dataset.nuevoEstado, this);
        });
    }
    return div;
}

// cambiarEstadoLamina
export async function cambiarEstadoLamina (id, nuevoEstado, btn) {
    if (!store.sessionToken) {
        mostrarMsg("Sesión expirada", "err");
        return
    }
    btn.disabled = true;
    try {
        const data = await api({
            ACCION: "ACTUALIZAR_ESTADO_LAMINA",
            ID: id,
            ESTADO: nuevoEstado,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) {
            btn.disabled = false;
            return
        }
        if (data.ok) {
            mostrarMsg(`✅ Lámina marcada como ${nuevoEstado}`, "ok");
            const t = document.getElementById("laminaInput").value.trim();
            if (t)
                ejecutarBusquedaLaminas(t);
        } else {
            mostrarMsg("Error: " + data.error, "err");
            btn.disabled = false
        }
    } catch (e) {
        mostrarMsg("Error de conexión", "err");
        btn.disabled = false
    }
}

// agregarLamina
export async function agregarLamina () {
    if (!store.sessionToken) {
        mostrarMsg("Sesión expirada", "err");
        return
    }
    const titulo = document.getElementById("nuevaLaminaTitulo").value.trim()
      , categoria = document.getElementById("nuevaLaminaCategoria").value.trim()
      , sucursal = document.getElementById("nuevaLaminaSucursal").value
      , ubicacion = document.getElementById("nuevaLaminaUbicacion").value.trim()
      , estado = document.getElementById("nuevaLaminaEstado").value;
    if (!titulo) {
        mostrarMsg("Ingresa el título de la lámina", "err");
        return
    }
    if (!sucursal) {
        mostrarMsg("Selecciona una sucursal", "err");
        return
    }
    const loader = document.getElementById("loaderAgregarLamina");
    loader.style.display = "block";
    try {
        const data = await api({
            ACCION: "AGREGAR_LAMINA",
            TITULO: titulo,
            CATEGORIA: categoria,
            SUCURSAL: sucursal,
            UBICACION: ubicacion,
            ESTADO: estado,
            TOKEN: store.sessionToken
        });
        if (!manejarRespuesta(data)) {
            loader.style.display = "none";
            return
        }
        if (data.ok) {
            mostrarMsg(`🖼️ Lámina "${data.titulo}" agregada correctamente`, "ok");
            document.getElementById("nuevaLaminaTitulo").value = "";
            document.getElementById("nuevaLaminaCategoria").value = "";
            document.getElementById("nuevaLaminaSucursal").value = "";
            document.getElementById("nuevaLaminaUbicacion").value = "";
            document.getElementById("nuevaLaminaEstado").value = "DISPONIBLE";
        } else {
            mostrarMsg("Error: " + data.error, "err")
        }
    } catch (e) {
        mostrarMsg("Error de conexión", "err")
    }
    loader.style.display = "none";
}

// ── Init laminas ──
export function initLaminasMode() {}
