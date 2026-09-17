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
import { obtenerSucursalesCache, nombreSucursal } from '../sucursales.js';

let _anchoTicket = COMPROBANTE_ANCHO_DEFAULT;
let _paginaComp = 1;
let _terminoComp = "";
let _reqSeq = 0;
let _previewHtml = "";
let _previewComprobante = null;
let _previewPdf = null;
let _previewSeq = 0;

export function getAnchoTicket() { return _anchoTicket; }

function _nombreSucursalVisible(c) {
    if (c.sucursalVisible) return c.sucursalVisible;
    const sucursal = obtenerSucursalesCache().find(function (item) {
        return String(item.nombre) === String(c.sucursal) || String(item.id) === String(c.sucursal);
    });
    return sucursal ? nombreSucursal(sucursal) : (c.sucursal || "");
}

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

function _dividirLineaPdf(valor, limite) {
    const palabras = String(valor ?? "").trim().split(/\s+/).filter(Boolean);
    if (!palabras.length) return [""];
    const lineas = [];
    let linea = "";
    palabras.forEach(function (palabra) {
        while (palabra.length > limite) {
            if (linea) {
                lineas.push(linea);
                linea = "";
            }
            lineas.push(palabra.slice(0, limite));
            palabra = palabra.slice(limite);
        }
        const candidata = linea ? linea + " " + palabra : palabra;
        if (candidata.length > limite) {
            lineas.push(linea);
            linea = palabra;
        } else {
            linea = candidata;
        }
    });
    if (linea) lineas.push(linea);
    return lineas;
}

function _escaparTextoPdf(valor) {
    return Array.from(String(valor ?? "")).map(function (caracter) {
        if (caracter === "\\" || caracter === "(" || caracter === ")") return "\\" + caracter;
        if (caracter === "−" || caracter === "–" || caracter === "—") return "-";
        const codigo = caracter.codePointAt(0);
        return codigo >= 32 && codigo <= 255 ? caracter : "?";
    }).join("");
}

function _aBytesPdf(valor) {
    const bytes = new Uint8Array(valor.length);
    for (let indice = 0; indice < valor.length; indice += 1) bytes[indice] = valor.charCodeAt(indice) & 0xff;
    return bytes;
}

function _lineasDocumentoPdf(c) {
    const esCotizacion = c.tipoDocumento === "COTIZACION";
    const items = (c.items || []).map(function (item) {
        return {
            producto: item.producto || "Producto",
            cantidad: Number(item.cantidad || 0),
            precio: Number(item.precio ?? item.precioUnitario ?? 0),
        };
    });
    const totalVenta = Number(c.total || 0);
    const subtotal = esCotizacion ? Number(c.subtotal || 0) : Number(c.subtotal ?? totalVenta);
    const descuento = Number(c.descuento ?? c.descuentoMonto ?? 0);
    const total = esCotizacion ? Number(c.total || subtotal - descuento) : totalVenta;
    const totalRedondeado = c.totalRedondeado !== undefined && c.totalRedondeado !== null
        ? Number(c.totalRedondeado) : total;
    const ajuste = Number(c.ajusteRedondeo || 0);
    const codigo = c.codigo || (c.numero !== undefined && c.numero !== null ? c.numero : "");
    const cliente = esCotizacion ? (c.cliente || c.clienteNombre || "MOSTRADOR")
        : (c.cliente && c.cliente !== "MOSTRADOR" ? c.cliente : "MOSTRADOR");
    const lineas = [
        "LIBRERÍA ERUDITOS",
        c.sucursalVisible || c.sucursal || "",
        esCotizacion ? "COTIZACIÓN N° " + codigo : (codigo ? "COMPROBANTE N° " + codigo : "COMPROBANTE DE VENTA"),
        "--------------------------------",
        (esCotizacion ? "Fecha: " : "") + [c.fecha, c.hora].filter(Boolean).join(" "),
        esCotizacion && (c.vigenciaHasta || c.vigencia || c.validaHasta || c.fechaVencimiento)
            ? "Válida hasta: " + (c.vigenciaHasta || c.vigencia || c.validaHasta || c.fechaVencimiento) : "",
        "Cliente: " + cliente,
        c.usuario ? "Vendedor: " + c.usuario : "",
        !esCotizacion && c.metodoPago ? "Pago: " + c.metodoPago : "",
        "--------------------------------",
    ].filter(Boolean);

    items.forEach(function (item) {
        lineas.push(item.producto);
        lineas.push(item.cantidad + " x " + _fmtBs(item.precio) + " = " + _fmtBs(item.cantidad * item.precio));
    });

    lineas.push("--------------------------------");
    if (descuento > 0) {
        lineas.push("Subtotal: " + _fmtBs(subtotal));
        lineas.push("Descuento: - " + _fmtBs(descuento));
    }
    if (!esCotizacion && ajuste !== 0) {
        if (descuento === 0) lineas.push("Subtotal: " + _fmtBs(total));
        lineas.push("Redondeo: " + (ajuste > 0 ? "+" : "") + _fmtBs(ajuste));
        lineas.push("TOTAL: " + _fmtBs(totalRedondeado));
    } else {
        lineas.push("TOTAL: " + _fmtBs(total));
    }
    if (esCotizacion && c.observaciones) {
        lineas.push("--------------------------------");
        lineas.push("Nota: " + c.observaciones);
    }
    lineas.push("--------------------------------");
    lineas.push(esCotizacion ? "Este documento no constituye una venta." : "¡Gracias por su compra!");
    return lineas;
}

function _generarPdf(c) {
    const anchoPagina = _anchoTicket === "57" ? 162 : 227;
    const margen = 8;
    const tamanoFuente = 8;
    const altoLinea = 11;
    const limiteCaracteres = _anchoTicket === "57" ? 30 : 43;
    const lineas = [];
    _lineasDocumentoPdf(c).forEach(function (linea) {
        _dividirLineaPdf(linea, limiteCaracteres).forEach(function (fragmento) {
            lineas.push(fragmento);
        });
    });
    const altoPagina = Math.max(120, margen * 2 + tamanoFuente + Math.max(0, lineas.length - 1) * altoLinea);
    const instrucciones = [
        "BT",
        "/F1 " + tamanoFuente + " Tf",
        margen + " " + (altoPagina - margen - tamanoFuente) + " Td",
    ];
    lineas.forEach(function (linea, indice) {
        instrucciones.push("(" + _escaparTextoPdf(linea) + ") Tj");
        if (indice < lineas.length - 1) instrucciones.push("0 -" + altoLinea + " Td");
    });
    instrucciones.push("ET");
    const contenido = instrucciones.join("\n") + "\n";
    let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = [0];
    const agregarObjeto = function (contenidoObjeto) {
        offsets.push(pdf.length);
        pdf += offsets.length - 1 + " 0 obj\n" + contenidoObjeto + "\nendobj\n";
    };
    agregarObjeto("<< /Type /Catalog /Pages 2 0 R >>");
    agregarObjeto("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    agregarObjeto("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + anchoPagina + " " + altoPagina + "] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>");
    agregarObjeto("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
    agregarObjeto("<< /Length " + contenido.length + " >>\nstream\n" + contenido + "endstream");
    const inicioXref = pdf.length;
    pdf += "xref\n0 " + offsets.length + "\n0000000000 65535 f \n";
    for (let indice = 1; indice < offsets.length; indice += 1) {
        pdf += String(offsets[indice]).padStart(10, "0") + " 00000 n \n";
    }
    pdf += "trailer\n<< /Size " + offsets.length + " /Root 1 0 R >>\nstartxref\n" + inicioXref + "\n%%EOF";
    return new Blob([_aBytesPdf(pdf)], { type: "application/pdf" });
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
    _previewPdf = null;
    body.innerHTML = html;
    overlay.style.display = "flex";
    if (shareBtn) {
        shareBtn.disabled = true;
        shareBtn.textContent = "Preparando PDF...";
    }
    requestAnimationFrame(function () {
        Promise.resolve().then(function () {
            return _generarPdf(comp);
        }).then(function (blob) {
            if (seq !== _previewSeq) return;
            _previewPdf = blob;
            if (shareBtn) {
                shareBtn.disabled = false;
                shareBtn.textContent = "Compartir PDF";
            }
        }).catch(function () {
            if (seq !== _previewSeq) return;
            if (shareBtn) {
                shareBtn.disabled = true;
                shareBtn.textContent = "PDF no disponible";
            }
            mostrarMsg("No se pudo generar el comprobante como PDF", "err");
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
    _previewPdf = null;
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
        if (_previewPdf && typeof File !== "undefined" && navigator.share) {
            const nombre = (esCotizacion ? "cotizacion-" : "comprobante-") + (c.codigo || c.numero || (esCotizacion ? "nueva" : "venta")) + ".pdf";
            const archivo = new File([_previewPdf], nombre, { type: "application/pdf" });
            const puedeArchivo = !navigator.canShare || navigator.canShare({ files: [archivo] });
            if (puedeArchivo) {
                await navigator.share({ title: titulo, files: [archivo] });
                return;
            }
        }
    } catch (error) {
        if (error && error.name === "AbortError") return;
    }
    mostrarMsg("Este dispositivo no permite compartir el comprobante como PDF", "err");
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
    const c = { ...cotizacion, tipoDocumento: "COTIZACION", sucursalVisible: _nombreSucursalVisible(cotizacion) };
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
