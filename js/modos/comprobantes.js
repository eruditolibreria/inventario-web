/* === MODO COMPROBANTES: Ticket termico e historial compartido === */

/*
 * Registro, historial e impresion de comprobantes de venta.
 * El historial se guarda en el backend como parte de la misma operación
 * transaccional que crea la venta.
 */

import { store } from '../store.js';
import { api } from '../api.js';
import { COMPROBANTE_ANCHO_DEFAULT } from '../config.js';
import { mostrarMsg } from '../utils.js';
import { manejarRespuesta } from '../ui.js';
import { can } from '../authorization.js';

let _anchoTicket = COMPROBANTE_ANCHO_DEFAULT;
let _paginaComp = 1;
let _terminoComp = "";
let _reqSeq = 0;
let _previewHtml = "";
let _previewComprobante = null;
let _previewJpg = null;
let _previewSeq = 0;

export function getAnchoTicket() { return _anchoTicket; }

export function setAnchoTicket(ancho) {
    if (ancho === "57" || ancho === "80") _anchoTicket = ancho;
}

// Selector de ancho en la UI
export function cambiarAnchoComprobante() {
    const sel = document.getElementById("anchoComprobante");
    if (sel) setAnchoTicket(sel.value);
}

// ── HISTORIAL ────────────────────────────────────────────────
export async function listarComprobantes(pg, termino) {
    if (!store.sessionToken) return;
    if (pg === undefined) pg = _paginaComp;
    if (termino !== undefined) _terminoComp = termino;
    _paginaComp = pg;
    const lista = document.getElementById("listaComprobantes");
    if (!lista) return;
    const loader = document.getElementById("loaderComprobantes");
    const pdiv = document.getElementById("paginComprobantes");
    if (loader) loader.style.display = "block";
    lista.innerHTML = "";
    const seq = ++_reqSeq;
    try {
        const data = await api({
            ACCION: "LISTAR_COMPROBANTES",
            CLIENTE: _terminoComp.trim() || undefined,
            SUCURSAL: document.getElementById("sucursalComprobante")?.value || undefined,
            PAGINA: pg,
            LIMITE: 20,
            TOKEN: store.sessionToken
        });
        if (seq !== _reqSeq) return;
        if (!manejarRespuesta(data)) { if (loader) loader.style.display = "none"; return; }
        if (!data.datos || !data.datos.length) {
            lista.innerHTML = `<div class="empty-state">Sin comprobantes encontrados</div>`;
            if (pdiv) pdiv.style.display = "none";
        } else {
            const vistos = new Set();
            data.datos.forEach(function (c) {
                if (vistos.has(c.numero)) return;
                vistos.add(c.numero);
                const card = document.createElement("div");
                card.className = "caja-card";
                card.style.margin = "0 0 16px 0";
                card.style.display = "flex";
                card.style.alignItems = "center";
                card.style.justifyContent = "space-between";
                card.style.gap = "10px";
                card.innerHTML = `
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:600;color:var(--text);font-size:13px">N° ${c.numero} · ${c.cliente || "—"}</div>
                        <div style="font-size:11px;color:var(--muted);margin-top:2px">${c.fecha} ${c.hora} · ${c.sucursalVisible || c.sucursal} · <b>Bs ${Number(c.total).toFixed(2)}</b></div>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
                        <button class="btn btn-ghost btn-sm" data-accion="reimprimir" data-id="${c.id}">🖨️ Imprimir</button>
                        ${can("ventas.anular") && c.operacionId && c.estado === "ACTIVO" ? `<button class="btn btn-danger btn-sm" data-accion="anular" data-operacion-id="${c.operacionId}" data-numero="${c.numero}">Anular</button>` : ""}
                    </div>
                `;
                card.querySelector('[data-accion="reimprimir"]').addEventListener("click", function () {
                    imprimirComprobanteGuardado(this.dataset.id);
                });
                const anular = card.querySelector('[data-accion="anular"]');
                if (anular) anular.addEventListener("click", function () {
                    anularVentaDesdeComprobante(this.dataset.operacionId, this.dataset.numero);
                });
                lista.appendChild(card);
            });
            if (data.paginas > 1 && pdiv) {
                pdiv.style.display = "flex";
                const info = document.getElementById("paginComprobantes-info");
                if (info) info.textContent = "Pág " + data.pagina + " de " + data.paginas;
                const btns = pdiv.querySelectorAll("button");
                if (btns[0]) btns[0].disabled = pg <= 1;
                if (btns[1]) btns[1].disabled = pg >= data.paginas;
            } else if (pdiv) {
                pdiv.style.display = "none";
            }
        }
    } catch (_) {
        lista.innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>`;
    }
    if (loader) loader.style.display = "none";
}

export function buscarComprobante() {
    const input = document.getElementById("buscarComprobante");
    const termino = input ? input.value.trim() : "";
    _terminoComp = termino;
    _paginaComp = 1;
    listarComprobantes(1, termino);
}

export function cambiarPaginaComp(d) {
    listarComprobantes(_paginaComp + d, _terminoComp);
}

export function cambiarSucursalComprobante() {
    _paginaComp = 1;
    listarComprobantes(1, _terminoComp);
}

export async function anularVentaDesdeComprobante(operacionId, numero) {
    if (!can("ventas.anular") || !operacionId) return;
    const motivo = prompt(`Motivo de anulación del comprobante N° ${numero}:`);
    if (motivo === null) return;
    if (!motivo.trim()) { mostrarMsg("Debes indicar el motivo de anulación", "err"); return; }
    if (!confirm(`¿Anular definitivamente el comprobante N° ${numero}? Se restaurará el stock y se revertirán sus movimientos.`)) return;
    try {
        const data = await api({ ACCION: "ANULAR_VENTA", OPERACION_ID: operacionId, MOTIVO: motivo.trim(), TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        if (!data.ok) { mostrarMsg(data.error || "No se pudo anular la venta", "err"); return; }
        mostrarMsg("Venta anulada correctamente", "ok");
        listarComprobantes(_paginaComp, _terminoComp);
    } catch (_) { mostrarMsg("Error de conexión", "err"); }
}

// Muestra u oculta el historial de comprobantes en VENTAS
export function toggleHistorialComprobantes() {
    const cont = document.getElementById("contenedorHistorialComprobantes");
    if (!cont) return;
    const cerrado = cont.classList.contains("oculto");
    cont.classList.toggle("oculto");
    if (cerrado) listarComprobantes(_paginaComp, _terminoComp);
}

// ── REIMPRIMIR DESDE HISTORIAL ───────────────────────────────
export async function imprimirComprobanteGuardado(id) {
    try {
        const data = await api({ ACCION: "OBTENER_COMPROBANTE", ID: id, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        if (data.ok && data.comprobante) imprimirComprobante(data.comprobante);
    } catch (_) { mostrarMsg("Error de conexión", "err"); }
}

// ── TICKET TERMICO ───────────────────────────────────────────
function _fmtBs(v) {
    return "Bs " + Number(v || 0).toFixed(2);
}

function _escHtml(v) {
    return String(v ?? "").replace(/[&<>\"']/g, function (c) {
        return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
}

function _crearTicketHtml(c) {
    const ancho = _anchoTicket;
    const items = (c.items || []).map(function (i) {
        return { producto: i.producto, cantidad: Number(i.cantidad || 0), precio: Number(i.precio || 0) };
    });
    const total = Number(c.total || 0);
    const subtotal = Number(c.subtotal ?? total);
    const descuento = Number(c.descuento || 0);
    const totalRed = c.totalRedondeado !== undefined && c.totalRedondeado !== null ? Number(c.totalRedondeado) : total;
    const ajuste = Number(c.ajusteRedondeo || 0);
    const cliente = (c.cliente && c.cliente !== "MOSTRADOR") ? c.cliente : "MOSTRADOR";

    let h = '<div class="ticket ' + (ancho === "57" ? "ancho-57" : "ancho-80") + '">';
    h += '<div class="t-head">';
    h += '<img src="/logo.png" alt="" class="t-logo" onerror="this.style.display=\'none\'">';
    h += '<div class="t-nombre">LIBRERIA ERUDITOS</div>';
    h += '<div class="t-sucursal">' + _escHtml(c.sucursalVisible || c.sucursal || "") + '</div>';
    if (c.numero !== undefined && c.numero !== null) h += '<div class="t-num">N° ' + c.numero + '</div>';
    h += '</div>';
    h += '<div class="t-linea"></div>';
    h += '<div class="t-meta">' + _escHtml(c.fecha || "") + ' ' + _escHtml(c.hora || "") + '</div>';
    h += '<div class="t-meta">Cliente: ' + _escHtml(cliente) + '</div>';
    if (c.usuario) h += '<div class="t-meta">Vendedor: ' + _escHtml(c.usuario) + '</div>';
    h += '<div class="t-meta">Pago: ' + _escHtml(c.metodoPago || "") + '</div>';
    h += '<div class="t-linea"></div>';
    h += '<div class="t-items">';
    items.forEach(function (it) {
        h += '<div class="t-item">';
        h += '<div class="t-producto">' + _escHtml(it.producto) + '</div>';
        h += '<div class="t-item-det"><span>' + it.cantidad + ' x ' + _fmtBs(it.precio) + '</span><strong>' + _fmtBs(it.cantidad * it.precio) + '</strong></div>';
        h += '</div>';
    });
    h += '</div>';
    h += '<div class="t-linea"></div>';
    if (descuento > 0) {
        h += '<div class="t-fila"><span>Subtotal</span><span>' + _fmtBs(subtotal) + '</span></div>';
        h += '<div class="t-fila"><span>Descuento</span><span>− ' + _fmtBs(descuento) + '</span></div>';
    }
    if (ajuste !== 0) {
        if (descuento === 0) h += '<div class="t-fila"><span>Subtotal</span><span>' + _fmtBs(total) + '</span></div>';
        h += '<div class="t-fila"><span>Redondeo</span><span>' + (ajuste > 0 ? "+" : "") + _fmtBs(ajuste) + '</span></div>';
        h += '<div class="t-fila t-total"><span>TOTAL</span><span>' + _fmtBs(totalRed) + '</span></div>';
    } else {
        h += '<div class="t-fila t-total"><span>TOTAL</span><span>' + _fmtBs(total) + '</span></div>';
    }
    h += '<div class="t-linea"></div>';
    h += '<div class="t-pie">¡Gracias por su compra!</div>';
    h += '</div>';
    return h;
}

function _crearCotizacionHtml(c) {
    const ancho = _anchoTicket;
    const items = (c.items || []).map(function (i) {
        return { producto: i.producto, cantidad: Number(i.cantidad || 0), precio: Number(i.precio || i.precioUnitario || 0) };
    });
    const subtotal = Number(c.subtotal || 0);
    const descuento = Number(c.descuento ?? c.descuentoMonto ?? 0);
    const total = Number(c.total || subtotal - descuento);
    const cliente = c.cliente || c.clienteNombre || "MOSTRADOR";
    const numero = c.codigo || (c.numero !== undefined && c.numero !== null ? c.numero : "—");

    let h = '<div class="ticket ' + (ancho === "57" ? "ancho-57" : "ancho-80") + '">';
    h += '<div class="t-head">';
    h += '<img src="/logo.png" alt="" class="t-logo" onerror="this.style.display=\'none\'">';
    h += '<div class="t-nombre">LIBRERÍA ERUDITOS</div>';
    h += '<div class="t-sucursal">' + _escHtml(c.sucursalVisible || c.sucursal || "") + '</div>';
    h += '<div class="t-num">COTIZACIÓN N° ' + _escHtml(numero) + '</div>';
    h += '</div><div class="t-linea"></div>';
    h += '<div class="t-meta">Fecha: ' + _escHtml(c.fecha || "") + ' ' + _escHtml(c.hora || "") + '</div>';
    if (c.vigenciaHasta || c.vigencia || c.validaHasta || c.fechaVencimiento) h += '<div class="t-meta">Válida hasta: ' + _escHtml(c.vigenciaHasta || c.vigencia || c.validaHasta || c.fechaVencimiento) + '</div>';
    h += '<div class="t-meta">Cliente: ' + _escHtml(cliente) + '</div>';
    if (c.usuario) h += '<div class="t-meta">Vendedor: ' + _escHtml(c.usuario) + '</div>';
    h += '<div class="t-linea"></div><div class="t-items">';
    items.forEach(function (it) {
        h += '<div class="t-item"><div class="t-producto">' + _escHtml(it.producto) + '</div>';
        h += '<div class="t-item-det"><span>' + it.cantidad + ' x ' + _fmtBs(it.precio) + '</span><strong>' + _fmtBs(it.cantidad * it.precio) + '</strong></div></div>';
    });
    h += '</div><div class="t-linea"></div>';
    if (descuento > 0) {
        h += '<div class="t-fila"><span>Subtotal</span><span>' + _fmtBs(subtotal) + '</span></div>';
        h += '<div class="t-fila"><span>Descuento</span><span>− ' + _fmtBs(descuento) + '</span></div>';
    }
    h += '<div class="t-fila t-total"><span>TOTAL</span><span>' + _fmtBs(total) + '</span></div>';
    if (c.observaciones) h += '<div class="t-linea"></div><div class="t-meta">Nota: ' + _escHtml(c.observaciones) + '</div>';
    h += '<div class="t-linea"></div><div class="t-pie">Este documento no constituye una venta.</div></div>';
    return h;
}

function _esMovil() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function _obtenerCssLocal() {
    let css = "";
    Array.from(document.styleSheets).forEach(function (sheet) {
        try {
            css += Array.from(sheet.cssRules).map(rule => rule.cssText).join("\n");
        } catch (_) {}
    });
    return css;
}

function _blobADataUrl(blob) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function _incrustarImagenes(root) {
    const imagenes = Array.from(root.querySelectorAll("img"));
    await Promise.all(imagenes.map(async function (img) {
        const src = img.getAttribute("src");
        if (!src) return;
        try {
            const response = await fetch(new URL(src, location.href).href);
            if (!response.ok) throw new Error("No se pudo cargar la imagen");
            img.setAttribute("src", await _blobADataUrl(await response.blob()));
        } catch (_) {
            img.remove();
        }
    }));
}

async function _generarJpg(ticket) {
    if (!ticket) throw new Error("Ticket no disponible");
    const rect = ticket.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    if (!width || !height) throw new Error("Ticket sin dimensiones");

    const clone = ticket.cloneNode(true);
    await _incrustarImagenes(clone);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml"><style>' + _obtenerCssLocal() + '</style>' +
        clone.outerHTML + '</div></foreignObject></svg>';
    const image = await new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, width, height);
    return await new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error("No se pudo generar el JPG"));
        }, "image/jpeg", 0.92);
    });
}

function _mostrarVistaPrevia(html, comp) {
    const overlay = document.getElementById("comprobantePreviewOverlay");
    const body = document.getElementById("comprobantePreviewBody");
    const shareBtn = document.getElementById("btnCompartirComprobante");
    if (!overlay || !body) return false;
    _previewSeq += 1;
    const seq = _previewSeq;
    _previewHtml = html;
    _previewComprobante = comp;
    _previewJpg = null;
    body.innerHTML = html;
    overlay.style.display = "flex";
    if (shareBtn) {
        shareBtn.disabled = true;
        shareBtn.textContent = "Preparando JPG...";
    }
    requestAnimationFrame(function () {
        _generarJpg(body.querySelector(".ticket")).then(function (blob) {
            if (seq !== _previewSeq) return;
            _previewJpg = blob;
            if (shareBtn) {
                shareBtn.disabled = false;
                shareBtn.textContent = "Compartir JPG";
            }
        }).catch(function () {
            if (seq !== _previewSeq) return;
            if (shareBtn) {
                shareBtn.disabled = true;
                shareBtn.textContent = "JPG no disponible";
            }
            mostrarMsg("No se pudo generar el comprobante como JPG", "err");
        });
    });
    return true;
}

export function cerrarVistaPreviaComprobante(event) {
    const overlay = document.getElementById("comprobantePreviewOverlay");
    const body = document.getElementById("comprobantePreviewBody");
    if (!overlay) return;
    if (event && event.target !== overlay) return;
    _previewSeq += 1;
    overlay.style.display = "none";
    if (body) body.innerHTML = "";
    _previewHtml = "";
    _previewComprobante = null;
    _previewJpg = null;
}

export function imprimirVistaPreviaComprobante() {
    const pa = document.getElementById("printArea");
    if (!pa || !_previewHtml) return;
    pa.className = "ticket-mode";
    pa.innerHTML = _previewHtml;
    const limpiar = function () {
        pa.innerHTML = "";
        pa.className = "";
    };
    window.addEventListener("afterprint", limpiar, { once: true });
    setTimeout(() => window.print(), 50);
}

export async function compartirVistaPreviaComprobante() {
    const c = _previewComprobante;
    if (!c) return;
    const esCotizacion = c.tipoDocumento === "COTIZACION";
    const codigo = c.codigo || (c.numero !== undefined && c.numero !== null ? "N° " + c.numero : "");
    const titulo = (esCotizacion ? "Cotización " : "Comprobante ") + codigo;
    try {
        if (_previewJpg && typeof File !== "undefined" && navigator.share) {
            const nombre = (esCotizacion ? "cotizacion-" : "comprobante-") + (c.codigo || c.numero || (esCotizacion ? "nueva" : "venta")) + ".jpg";
            const archivo = new File([_previewJpg], nombre, { type: "image/jpeg" });
            const puedeArchivo = !navigator.canShare || navigator.canShare({ files: [archivo] });
            if (puedeArchivo) {
                await navigator.share({ title: titulo, files: [archivo] });
                return;
            }
        }
    } catch (error) {
        if (error && error.name === "AbortError") return;
    }
    mostrarMsg("Este dispositivo no permite compartir el comprobante como JPG", "err");
}

export function imprimirComprobante(comp) {
    const c = comp || store.ultimaVenta;
    if (!c) { mostrarMsg("No hay venta reciente", "err"); return; }
    const pa = document.getElementById('printArea');
    if (!pa) return;
    const ancho = _anchoTicket;

    // Ajustar el tamaño de pagina segun el ancho elegido
    let st = document.getElementById("ticketPageStyle");
    if (!st) {
        st = document.createElement("style");
        st.id = "ticketPageStyle";
        document.head.appendChild(st);
    }
    const pageCss = ancho === "57"
        ? "@page { size: 57mm auto; margin: 2mm; }"
        : "@page { size: 80mm auto; margin: 2mm; }";
    st.textContent = pageCss;
    const html = _crearTicketHtml(c);
    if (_esMovil() && _mostrarVistaPrevia(html, c)) return;
    pa.className = "ticket-mode";
    pa.innerHTML = html;
    setTimeout(function () {
        const limpiar = function () {
            pa.innerHTML = "";
            pa.className = "";
        };
        window.addEventListener("afterprint", limpiar, { once: true });
        window.print();
    }, 200);
}

export async function imprimirCotizacionGuardada(id) {
    try {
        const data = await api({ ACCION: "OBTENER_COTIZACION", ID: id, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) return;
        if (data.ok && data.cotizacion) imprimirCotizacion(data.cotizacion);
    } catch (_) { mostrarMsg("Error de conexión", "err"); }
}

export function imprimirCotizacion(cotizacion) {
    if (!cotizacion) { mostrarMsg("No hay cotización disponible", "err"); return; }
    const pa = document.getElementById("printArea");
    if (!pa) return;
    const c = { ...cotizacion, tipoDocumento: "COTIZACION" };
    let st = document.getElementById("ticketPageStyle");
    if (!st) {
        st = document.createElement("style");
        st.id = "ticketPageStyle";
        document.head.appendChild(st);
    }
    st.textContent = _anchoTicket === "57"
        ? "@page { size: 57mm auto; margin: 2mm; }"
        : "@page { size: 80mm auto; margin: 2mm; }";
    const html = _crearCotizacionHtml(c);
    if (_esMovil() && _mostrarVistaPrevia(html, c)) return;
    pa.className = "ticket-mode";
    pa.innerHTML = html;
    setTimeout(function () {
        const limpiar = function () {
            pa.innerHTML = "";
            pa.className = "";
        };
        window.addEventListener("afterprint", limpiar, { once: true });
        window.print();
    }, 200);
}

// ── INIT ─────────────────────────────────────────────────────
export function initComprobantes() {
    const sel = document.getElementById("anchoComprobante");
    if (sel && !sel.value) sel.value = _anchoTicket;
    listarComprobantes(1, "");
}
