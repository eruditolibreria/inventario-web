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
const reportesSinStockCache = new Map();
const reportesSinStockPendientes = new Map();
let moduloPdfLaminas = null;
let cargaModuloPdfLaminas = null;
let versionReporteSinStock = 0;
const LIMITE_LAMINAS = 20;
const ES_MOVIL = /Android|iPhone|iPad|iPod/i;
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
    div.className = "lamina-card lamina-card-interactiva";
    const esDis = lam.estado === "DISPONIBLE"
      , estadoClass = esDis ? "lam-estado-disponible" : "lam-estado-sinstock"
      , nuevoEstado = esDis ? "SIN STOCK" : "DISPONIBLE"
      , btnLabel = esDis ? "❌ Sin stock" : "✅ Disponible"
      , acciones = can("laminas.editar")
        ? `<button class="btn-icon lam-accion" data-accion="editar" title="Editar lámina">✏️ Editar</button><button class="btn-icon lam-accion" data-accion="cambiar-estado" title="Cambiar estado">${btnLabel}</button>`
        : "";
    div.innerHTML = `<div class="lamina-info"><div class="lam-titulo">${escaparHtml(lam.titulo || "Sin título")}</div><div class="lamina-detalles"><div class="lamina-detalle"><span class="lamina-detalle-label">Categoría</span><span class="lamina-detalle-valor">${escaparHtml(lam.categoria || "—")}</span></div><div class="lamina-detalle"><span class="lamina-detalle-label">Ubicación</span><span class="lamina-detalle-valor">${escaparHtml(lam.ubicacion || "—")}</span></div></div></div><div class="lam-actions"><span class="${estadoClass}">${escaparHtml(lam.estado || "—")}</span>${acciones}</div>`;
    div.addEventListener('click', () => abrirDetalleLamina(lam));
    const btnEditar = div.querySelector('[data-accion="editar"]');
    if (btnEditar) btnEditar.addEventListener('click', event => {
        event.stopPropagation();
        abrirEditarLamina(lam);
    });
    const btnEstado = div.querySelector('[data-accion="cambiar-estado"]');
    if (btnEstado) {
        btnEstado.dataset.laminaId = String(lam.id ?? "");
        btnEstado.dataset.nuevoEstado = nuevoEstado;
        btnEstado.addEventListener('click', function(event) {
            event.stopPropagation();
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
            invalidarReporteLaminasSinStock();
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
            invalidarReporteLaminasSinStock();
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
export function initLaminasMode() {
    const selector = document.getElementById("laminaFiltroSucursal");
    if (selector && !selector._reporteLaminasInicializado) {
        selector._reporteLaminasInicializado = true;
        selector.addEventListener("change", () => prepararReporteLaminasSinStock(selector.value));
        if (selector.value) prepararReporteLaminasSinStock(selector.value);
    }
    if (document.getElementById("btnPdfLaminasSinStock")) return;
    const buscar = document.querySelector("#lam-BUSCAR button[onclick='buscarLaminas(true)']");
    if (!buscar) return;
    const boton = document.createElement("button");
    boton.id = "btnPdfLaminasSinStock";
    boton.type = "button";
    boton.className = "btn btn-ghost btn-sm mb-12 no-print";
    boton.innerHTML = '<i class="fa-solid fa-file-pdf"></i> PDF sin stock';
    boton.addEventListener("click", generarReporteLaminasSinStock);
    buscar.insertAdjacentElement("afterend", boton);
}

export function cambiarPaginaLaminas(delta) {
    const paginas = Math.ceil(totalLaminas / LIMITE_LAMINAS);
    const destino = paginaLaminas + Number(delta || 0);
    if (destino < 1 || destino > paginas) return;
    buscarLaminas(true, destino);
}

export async function generarReporteLaminasSinStock() {
    if (!store.sessionToken) {
        mostrarMsg("Sesión expirada", "err");
        return;
    }
    const selector = document.getElementById("laminaFiltroSucursal");
    const sucursal = selector.value;
    if (!sucursal) {
        mostrarMsg("Selecciona una sucursal para generar el PDF", "err");
        return;
    }
    const laminas = reportesSinStockCache.get(sucursal);
    if (!laminas || !moduloPdfLaminas) {
        prepararReporteLaminasSinStock(sucursal);
        mostrarMsg("Preparando el PDF. Intenta nuevamente en un momento", "ok");
        return;
    }
    if (!laminas.length) {
        mostrarMsg("No hay láminas sin stock en esta sucursal", "ok");
        return;
    }
    const sucursalVisible = selector.selectedOptions?.[0]?.textContent || sucursal;
    const fecha = new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz", hour12: false });
    if (ES_MOVIL.test(navigator.userAgent)) {
        compartirPdfLaminasSinStock(laminas, sucursalVisible, fecha);
    } else {
        imprimirReporteLaminasSinStock(laminas, sucursalVisible, fecha);
    }
}

function precargarReporteLaminasSinStock(sucursal) {
    if (!sucursal || !store.sessionToken || reportesSinStockCache.has(sucursal)) return Promise.resolve();
    if (reportesSinStockPendientes.has(sucursal)) return reportesSinStockPendientes.get(sucursal);
    const version = versionReporteSinStock;
    let preparacion;
    preparacion = (async () => {
        try {
            const data = await api({
                ACCION: "LISTAR_LAMINAS_SIN_STOCK",
                SUCURSAL: sucursal,
                TOKEN: store.sessionToken,
            });
            if (manejarRespuesta(data) && data.ok && version === versionReporteSinStock) reportesSinStockCache.set(sucursal, data.datos || []);
        } catch (_) {
            mostrarMsg("No se pudo preparar el PDF", "err");
        } finally {
            if (reportesSinStockPendientes.get(sucursal) === preparacion) reportesSinStockPendientes.delete(sucursal);
        }
    })();
    reportesSinStockPendientes.set(sucursal, preparacion);
    return preparacion;
}

function prepararReporteLaminasSinStock(sucursal) {
    if (!sucursal || !store.sessionToken) return Promise.resolve();
    const boton = document.getElementById("btnPdfLaminasSinStock");
    if (boton) boton.disabled = true;
    return Promise.all([precargarReporteLaminasSinStock(sucursal), precargarModuloPdfLaminas()])
        .catch(() => mostrarMsg("No se pudo preparar el PDF", "err"))
        .finally(() => { if (boton) boton.disabled = false; });
}

function precargarModuloPdfLaminas() {
    if (!cargaModuloPdfLaminas) {
        cargaModuloPdfLaminas = import("./laminas-pdf.js").then((modulo) => {
            moduloPdfLaminas = modulo;
            return modulo;
        }).catch((error) => {
            cargaModuloPdfLaminas = null;
            throw error;
        });
    }
    return cargaModuloPdfLaminas;
}

function invalidarReporteLaminasSinStock() {
    versionReporteSinStock += 1;
    reportesSinStockCache.clear();
    reportesSinStockPendientes.clear();
    const selector = document.getElementById("laminaFiltroSucursal");
    if (selector?.value) prepararReporteLaminasSinStock(selector.value);
}

function imprimirReporteLaminasSinStock(laminas, sucursal, fecha) {
    const area = document.getElementById("printArea");
    if (!area || !moduloPdfLaminas) return;
    area.className = "laminas-print";
    area.innerHTML = moduloPdfLaminas.construirReporteLaminasSinStock(laminas, sucursal, fecha);
    window.addEventListener("afterprint", () => {
        area.innerHTML = "";
        area.className = "";
    }, { once: true });
    setTimeout(() => window.print(), 50);
}

function compartirPdfLaminasSinStock(laminas, sucursal, fecha) {
    if (!moduloPdfLaminas) return;
    const archivoPdf = moduloPdfLaminas.crearArchivoPdfLaminasSinStock(laminas, sucursal, fecha);
    const nombre = `laminas-sin-stock-${normalizarNombreArchivo(sucursal)}.pdf`;
    if (typeof File !== "undefined" && navigator.share) {
        const archivo = new File([archivoPdf], nombre, { type: "application/pdf" });
        if (!navigator.canShare || navigator.canShare({ files: [archivo] })) {
            navigator.share({ title: "Láminas sin stock", files: [archivo] }).catch((error) => {
                if (error?.name !== "AbortError") descargarPdfLaminas(archivoPdf, nombre);
            });
            return;
        }
    }
    descargarPdfLaminas(archivoPdf, nombre);
}

function descargarPdfLaminas(pdf, nombre) {
    const enlace = document.createElement("a");
    const url = URL.createObjectURL(pdf);
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function normalizarNombreArchivo(valor) {
    return String(valor || "sucursal").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase() || "sucursal";
}

export function abrirDetalleLamina(lam) {
    const overlay = document.getElementById("laminaDetalleOverlay");
    const contenido = document.getElementById("laminaDetalleContenido");
    const esDis = lam.estado === "DISPONIBLE";
    const estadoClass = esDis ? "lam-estado-disponible" : "lam-estado-sinstock";
    contenido.innerHTML = `<div class="lamina-detalle-encabezado"><span class="${estadoClass}">${escaparHtml(lam.estado || "—")}</span><h2 class="lamina-detalle-titulo">${escaparHtml(lam.titulo || "Sin título")}</h2></div><div class="lamina-detalle-datos"><div class="lamina-detalle-dato"><span class="lamina-detalle-dato-label">Categoría</span><strong class="lamina-detalle-dato-valor">${escaparHtml(lam.categoria || "—")}</strong></div><div class="lamina-detalle-dato"><span class="lamina-detalle-dato-label">Ubicación</span><strong class="lamina-detalle-dato-valor">${escaparHtml(lam.ubicacion || "—")}</strong></div></div>`;
    overlay.onclick = cerrarDetalleLamina;
    overlay.style.display = "flex";
}

export function cerrarDetalleLamina(e) {
    const overlay = document.getElementById("laminaDetalleOverlay");
    if (e && e.target !== overlay) return;
    overlay.style.display = "none";
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
