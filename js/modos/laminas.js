/* === MODO LAMINAS: Busqueda y gestion de laminas === */
import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg } from '../utils.js';
import { manejarRespuesta } from '../ui.js';
import { can } from '../authorization.js';

let laminaTimer = null;
let busquedaLaminasVersion = 0;
let paginaLaminas = 1;
let totalLaminas = 0;
let laminaEditando = null;
const LIMITE_LAMINAS = 20;
let _verif = null;
export function initLaminas(cb) {
    if (cb && cb.verificarEstadoCaja) _verif = cb.verificarEstadoCaja;
}

// buscarLaminas
export function buscarLaminas (inmediata = false, pagina = 1) {
    const t = document.getElementById("laminaInput").value.trim();
    const suc = document.getElementById("laminaFiltroSucursal").value;
    const est = document.getElementById("laminaFiltroEstado").value;
    const lista = document.getElementById("listaLaminasResultados");
    const resumen = document.getElementById("laminaResultados");
    const paginaSolicitada = Math.max(1, Number(pagina) || 1);
    const version = ++busquedaLaminasVersion;
    clearTimeout(laminaTimer);

    // Ejecutar búsqueda si hay título O si hay filtros seleccionados
    if (t.length < 1 && !suc && !est) {
        lista.innerHTML = "";
        resumen.textContent = "";
        totalLaminas = 0;
        actualizarPaginacion();
        document.getElementById("loaderBuscarLamina").style.display = "none";
        return
    }
    const ejecutar = () => ejecutarBusquedaLaminas(t, suc, est, version, paginaSolicitada);
    if (inmediata) ejecutar();
    else laminaTimer = setTimeout(ejecutar, 350);
}

// ejecutarBusquedaLaminas
export async function ejecutarBusquedaLaminas (t, suc, est, version, pagina) {
    if (!store.sessionToken) {
        document.getElementById("loaderBuscarLamina").style.display = "none";
        return;
    }
    t = t ?? document.getElementById("laminaInput").value.trim();
    suc = suc ?? document.getElementById("laminaFiltroSucursal").value;
    est = est ?? document.getElementById("laminaFiltroEstado").value;
    version = version ?? ++busquedaLaminasVersion;
    pagina = Math.max(1, Number(pagina) || paginaLaminas || 1);
    const loader = document.getElementById("loaderBuscarLamina")
      , lista = document.getElementById("listaLaminasResultados")
      , resumen = document.getElementById("laminaResultados");
    loader.style.display = "block";
    resumen.textContent = "Buscando láminas…";
    try {
        const data = await api({
            ACCION: "BUSCAR_LAMINAS",
            TEXTO: t,
            LIMITE: LIMITE_LAMINAS,
            PAGINA: pagina,
            SUCURSAL: suc || undefined,
            ESTADO: est || undefined,
            TOKEN: store.sessionToken
        });
        if (version !== busquedaLaminasVersion) return;
        if (!manejarRespuesta(data)) {
            resumen.textContent = "";
            return
        }
        if (!data.ok) {
            lista.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">No se pudo completar la búsqueda</div>`;
            resumen.textContent = "No se pudo completar la búsqueda";
            return
        }
        const lams = data.datos || [];
        totalLaminas = Number.isFinite(Number(data.total)) ? Number(data.total) : lams.length;
        paginaLaminas = Number(data.pagina) || pagina;
        lista.innerHTML = "";
        if (lams.length === 0) {
            const vacio = document.createElement("div");
            vacio.className = "empty-state";
            vacio.textContent = t
                ? `No se encontraron láminas para “${t}”.`
                : "No se encontraron láminas con los filtros seleccionados.";
            lista.appendChild(vacio);
            resumen.textContent = "Sin resultados";
        } else {
            lams.forEach(lam => lista.appendChild(renderLaminaCard(lam)));
            const inicio = (paginaLaminas - 1) * LIMITE_LAMINAS + 1;
            const fin = inicio + lams.length - 1;
            resumen.textContent = totalLaminas > lams.length
                ? `Mostrando ${inicio}–${fin} de ${totalLaminas} láminas`
                : `${lams.length} ${lams.length === 1 ? "lámina encontrada" : "láminas encontradas"}`;
        }
        actualizarPaginacion();
    } catch (e) {
        if (version !== busquedaLaminasVersion) return;
        lista.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>`;
        resumen.textContent = "No se pudo completar la búsqueda";
        totalLaminas = 0;
        actualizarPaginacion();
    } finally {
        if (version === busquedaLaminasVersion) loader.style.display = "none";
    }
}

// renderLaminaCard
export function renderLaminaCard (lam) {
    const div = document.createElement("div");
    div.className = "lamina-card";
    const esDis = lam.estado === "DISPONIBLE"
      , estadoClass = esDis ? "lam-estado-disponible" : "lam-estado-sinstock"
      , nuevoEstado = esDis ? "SIN STOCK" : "DISPONIBLE"
      , btnLabel = esDis ? "❌ Sin stock" : "✅ Disponible"
      , acciones = can("laminas.editar")
        ? `<button class="btn-icon" data-accion="editar" title="Editar lámina">✏️</button><button class="btn-icon" data-accion="cambiar-estado" title="Cambiar estado">${btnLabel}</button>`
        : "";
    div.innerHTML = `<div style="flex:1;min-width:0"><div class="lam-titulo">${escaparHtml(lam.titulo || "Sin título")}</div><div class="lam-meta">${escaparHtml(lam.categoria || "—")} · ${escaparHtml(lam.sucursal || "—")} · ${escaparHtml(lam.ubicacion || "—")}</div></div><div class="lam-actions"><span class="${estadoClass}">${escaparHtml(lam.estado || "—")}</span>${acciones}</div>`;
    const btnEditar = div.querySelector('[data-accion="editar"]');
    if (btnEditar) btnEditar.addEventListener('click', () => abrirEditarLamina(lam));
    const btnEstado = div.querySelector('[data-accion="cambiar-estado"]');
    if (btnEstado) {
        btnEstado.dataset.laminaId = String(lam.id ?? "");
        btnEstado.dataset.nuevoEstado = nuevoEstado;
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
            const suc = document.getElementById("laminaFiltroSucursal").value;
            const est = document.getElementById("laminaFiltroEstado").value;
            if (t || suc || est)
                buscarLaminas(true, paginaLaminas);
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

export function cambiarPaginaLaminas(delta) {
    const paginas = Math.ceil(totalLaminas / LIMITE_LAMINAS);
    const destino = paginaLaminas + Number(delta || 0);
    if (destino < 1 || destino > paginas) return;
    buscarLaminas(true, destino);
}

export function abrirEditarLamina(lam) {
    if (!can("laminas.editar")) {
        mostrarMsg("Sin permisos para editar láminas", "err");
        return;
    }
    laminaEditando = lam;
    document.getElementById("laminaEditTitulo").value = lam.titulo || "";
    document.getElementById("laminaEditCategoria").value = lam.categoria || "";
    document.getElementById("laminaEditUbicacion").value = lam.ubicacion || "";
    document.getElementById("laminaEditSucursal").textContent = lam.sucursal || "—";
    document.getElementById("laminaEditResultado").textContent = "";
    document.getElementById("laminaEditOverlay").style.display = "flex";
}

export function cerrarEditarLamina(e) {
    if (e && e.target !== document.getElementById("laminaEditOverlay")) return;
    document.getElementById("laminaEditOverlay").style.display = "none";
    laminaEditando = null;
}

export async function guardarEdicionLamina() {
    if (!laminaEditando || !store.sessionToken) return;
    const titulo = document.getElementById("laminaEditTitulo").value.trim();
    const categoria = document.getElementById("laminaEditCategoria").value.trim();
    const ubicacion = document.getElementById("laminaEditUbicacion").value.trim();
    const resultado = document.getElementById("laminaEditResultado");
    const boton = document.getElementById("btnGuardarLamina");
    if (!titulo) {
        resultado.textContent = "El título es obligatorio";
        return;
    }
    boton.disabled = true;
    resultado.textContent = "";
    try {
        const data = await api({
            ACCION: "ACTUALIZAR_LAMINA",
            ID: laminaEditando.id,
            TITULO: titulo,
            CATEGORIA: categoria,
            UBICACION: ubicacion,
            TOKEN: store.sessionToken,
        });
        if (!manejarRespuesta(data)) return;
        if (!data.ok) {
            resultado.textContent = "No se pudo guardar: " + (data.error || "error desconocido");
            return;
        }
        mostrarMsg(data.sinCambios ? "No hubo cambios en la lámina" : "✅ Lámina actualizada", "ok");
        cerrarEditarLamina();
        buscarLaminas(true, paginaLaminas);
    } catch (e) {
        resultado.textContent = "Error de conexión";
    } finally {
        boton.disabled = false;
    }
}

function actualizarPaginacion() {
    const control = document.getElementById("laminaPaginacion");
    const paginas = Math.ceil(totalLaminas / LIMITE_LAMINAS);
    control.style.display = paginas > 1 ? "flex" : "none";
    document.getElementById("laminaPaginaInfo").textContent = paginas > 1 ? `Página ${paginaLaminas} de ${paginas}` : "";
    document.getElementById("laminaPaginaAnterior").disabled = paginaLaminas <= 1;
    document.getElementById("laminaPaginaSiguiente").disabled = paginaLaminas >= paginas;
}

function escaparHtml(valor) {
    return String(valor)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
