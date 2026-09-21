/* === MODO REPORTES: Tablas, gráficos e impresión === */
import { store, setMovPagina, setRptCache } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, fechaBolivia } from '../utils.js';
import { manejarRespuesta } from '../ui.js';

const TABLAS_REPORTES_MOVIL = {
    tablaRepMas: { principal: 'Producto' },
    tablaRepMenos: { principal: 'Producto' },
    tablaAlertas: { principal: 'Producto', estado: 'Estado' },
    tablaRotacion: { principal: 'Producto', estado: 'Rotacion' },
    tablaValorizacion: { principal: 'Categoria' },
    tablaMovimientos: { principal: 'Producto', estado: 'Tipo' },
    tablaVentasPeriodo: { principal: 'Periodo', estado: 'Tipo' },
    tablaUtilidad: { principal: 'Producto' },
    tablaFlujo: { principal: 'Periodo', estado: 'Tipo' },
    tablaArqueosRep: { principal: 'Fecha', estado: 'Resultado' },
    tablaCobrarRep: { principal: 'Cliente' },
};

const COLUMNAS_PDF = {
    masVendidos: [{ etiqueta: '#', campo: '_indice', formato: 'numero' }, { etiqueta: 'Producto', campo: 'producto' }, { etiqueta: 'Uds', campo: 'cantidad', formato: 'numero' }, { etiqueta: 'Ingresos', campo: 'ingresos', formato: 'moneda' }],
    menosVendidos: [{ etiqueta: '#', campo: '_indice', formato: 'numero' }, { etiqueta: 'Producto', campo: 'producto' }, { etiqueta: 'Uds', campo: 'cantidad', formato: 'numero' }, { etiqueta: 'Ingresos', campo: 'ingresos', formato: 'moneda' }],
    alertas: [{ etiqueta: 'Producto', campo: 'producto' }, { etiqueta: 'Categoría', campo: 'categoria' }, { etiqueta: 'Sucursal', campo: 'sucursal' }, { etiqueta: 'Stock', campo: 'stock', formato: 'numero' }, { etiqueta: 'Mínimo', campo: 'stock_minimo', formato: 'numero' }, { etiqueta: 'Precio', campo: 'precio_venta', formato: 'moneda' }, { etiqueta: 'Ubicación', campo: 'ubicacion' }, { etiqueta: 'Estado', campo: 'estado' }],
    rotacion: [{ etiqueta: 'Producto', campo: 'producto' }, { etiqueta: 'Categoría', campo: 'categoria' }, { etiqueta: 'Sucursal', campo: 'sucursal' }, { etiqueta: 'Stock', campo: 'stock', formato: 'numero' }, { etiqueta: 'Precio', campo: 'precio_venta', formato: 'moneda' }, { etiqueta: 'Última venta', campo: 'ultima_venta' }, { etiqueta: 'Días sin venta', campo: 'dias_sin_venta', formato: 'numero' }, { etiqueta: 'Rotación', campo: 'rotacion' }],
    valorizacion: [{ etiqueta: 'Categoría', campo: 'categoria' }, { etiqueta: 'Sucursal', campo: 'sucursal' }, { etiqueta: 'Productos', campo: 'productos', formato: 'numero' }, { etiqueta: 'Stock total', campo: 'stock_total', formato: 'numero' }, { etiqueta: 'Costo total', campo: 'costo_total', formato: 'moneda' }, { etiqueta: 'Valor venta', campo: 'valor_venta_total', formato: 'moneda' }, { etiqueta: 'Utilidad potencial', campo: 'utilidad_potencial', formato: 'moneda' }],
    movimientos: [{ etiqueta: 'Fecha', campo: 'fecha' }, { etiqueta: 'Sucursal', campo: 'sucursal' }, { etiqueta: 'Producto', campo: 'producto' }, { etiqueta: 'Tipo', campo: 'tipo_mov' }, { etiqueta: 'Origen', campo: 'origen' }, { etiqueta: 'Cant.', campo: 'cantidad', formato: 'numero' }, { etiqueta: 'Monto', campo: 'monto', formato: 'moneda' }, { etiqueta: 'Usuario', campo: 'usuario' }],
    ventasPeriodo: [{ etiqueta: 'Período', campo: '_periodo' }, { etiqueta: 'Sucursal', campo: 'sucursal' }, { etiqueta: 'Tipo', campo: 'tipo' }, { etiqueta: 'Método', campo: 'metodo_pago' }, { etiqueta: 'Operaciones', campo: 'operaciones', formato: 'numero' }, { etiqueta: 'Líneas históricas', campo: 'lineas_legacy', formato: 'numero' }, { etiqueta: 'Unidades', campo: 'unidades', formato: 'numero' }, { etiqueta: 'Total Bs', campo: 'total_bs', formato: 'moneda' }],
    utilidad: [{ etiqueta: 'Período', campo: '_periodo' }, { etiqueta: 'Sucursal', campo: 'sucursal' }, { etiqueta: 'Producto', campo: 'producto' }, { etiqueta: 'Cant.', campo: 'cantidad', formato: 'numero' }, { etiqueta: 'Ingresos', campo: 'ingresos', formato: 'moneda' }, { etiqueta: 'Costo', campo: 'costo', formato: 'moneda' }, { etiqueta: 'Utilidad', campo: 'utilidad_bruta', formato: 'moneda' }, { etiqueta: 'Sin costo', campo: 'unidades_sin_costo', formato: 'numero' }],
    flujo: [{ etiqueta: 'Período', campo: '_periodo' }, { etiqueta: 'Sucursal', campo: 'sucursal' }, { etiqueta: 'Método', campo: 'metodo_pago' }, { etiqueta: 'Tipo', campo: 'tipo' }, { etiqueta: 'Entradas', campo: 'total_entradas', formato: 'moneda' }, { etiqueta: 'Salidas', campo: 'total_salidas', formato: 'moneda' }, { etiqueta: 'Saldo neto', campo: 'saldo_neto', formato: 'moneda' }, { etiqueta: 'Mov.', campo: 'movimientos', formato: 'numero' }],
    cobrar: [{ etiqueta: 'Sucursal', campo: 'sucursal' }, { etiqueta: 'Cliente', campo: 'cliente' }, { etiqueta: 'Cuentas', campo: 'cuentas', formato: 'numero' }, { etiqueta: 'Total adeudado', campo: 'total_adeudado', formato: 'moneda' }, { etiqueta: 'Total abonado', campo: 'total_abonado', formato: 'moneda' }, { etiqueta: 'Saldo pendiente', campo: 'saldo_pendiente', formato: 'moneda' }, { etiqueta: 'Canceladas', campo: 'canceladas', formato: 'numero' }, { etiqueta: 'Pendientes', campo: 'pendientes', formato: 'numero' }],
};

let observadorReportesMovil = null;
let moduloPdfReportes = null;
let cargaModuloPdfReportes = null;
const ES_MOVIL = /Android|iPhone|iPad|iPod/i;

function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[caracter]);
}

function textoCelda(celda) {
    return String(celda?.textContent || '').replace(/\s+/g, ' ').trim() || '—';
}

function claseEstadoReporte(valor) {
    const estado = String(valor || '').toUpperCase();
    if (/AGOTADO|BAJO|SALIDA|PENDIENTE|FALTANTE|ANULAD|NUNCA/.test(estado)) return 'advertencia';
    if (/OK|ACTIVO|ENTRADA|CUADRA|PAGAD|CERRAD/.test(estado)) return 'ok';
    return 'neutro';
}

function adaptarTablaReporteMovil(contenedor, configuracion) {
    const tabla = contenedor.querySelector('table');
    if (!tabla) return;

    tabla.classList.add('reporte-tabla-escritorio');
    contenedor.querySelector('.reporte-lista-movil')?.remove();
    const encabezados = [...tabla.querySelectorAll('thead th')].map(encabezado => textoCelda(encabezado));
    const indicePrincipal = Math.max(0, encabezados.indexOf(configuracion.principal));
    const indiceEstado = encabezados.indexOf(configuracion.estado);
    const filas = [...tabla.querySelectorAll('tbody tr')];
    const lista = document.createElement('div');
    lista.className = 'reporte-lista-movil';

    lista.innerHTML = filas.map(fila => {
        const valores = [...fila.querySelectorAll('td')].map(textoCelda);
        const principal = valores[indicePrincipal] || '—';
        const estado = indiceEstado >= 0 ? valores[indiceEstado] : '';
        const datos = encabezados.map((etiqueta, indice) => ({ etiqueta, valor: valores[indice] || '—' }))
            .filter((_, indice) => indice !== indicePrincipal && indice !== indiceEstado)
            .map(dato => `<div><span>${escaparHtml(dato.etiqueta)}</span><strong>${escaparHtml(dato.valor)}</strong></div>`)
            .join('');
        const insignia = estado ? `<span class="reporte-estado ${claseEstadoReporte(estado)}">${escaparHtml(estado)}</span>` : '';
        return `<article class="reporte-tarjeta-movil"><div class="reporte-tarjeta-cabecera"><strong>${escaparHtml(principal)}</strong>${insignia}</div><div class="reporte-tarjeta-datos">${datos}</div></article>`;
    }).join('');
    contenedor.appendChild(lista);
}

function observarTablasReportesMovil() {
    if (observadorReportesMovil) return;
    observadorReportesMovil = new MutationObserver((mutaciones) => {
        mutaciones.forEach(mutacion => {
            const contenedor = mutacion.target;
            const configuracion = TABLAS_REPORTES_MOVIL[contenedor.id];
            if (configuracion && contenedor.querySelector('table') && !contenedor.querySelector('.reporte-lista-movil')) {
                adaptarTablaReporteMovil(contenedor, configuracion);
            }
        });
    });
    Object.entries(TABLAS_REPORTES_MOVIL).forEach(([id, configuracion]) => {
        const contenedor = document.getElementById(id);
        if (!contenedor) return;
        observadorReportesMovil.observe(contenedor, { childList: true });
        if (contenedor.querySelector('table')) adaptarTablaReporteMovil(contenedor, configuracion);
    });
}

// ── HELPERS ──────────────────────────────────────────────────

function guardarReportePdf(tipo, datos, titulo, resumen, boton) {
    setRptCache(tipo, { datos, columnas: COLUMNAS_PDF[tipo], titulo, resumen });
    habilitarPdfReporte(boton);
}

function habilitarPdfReporte(id) {
    const boton = document.getElementById(id);
    if (!boton) return;
    boton.style.display = 'inline-block';
    boton.disabled = true;
    cargarModuloPdfReportes().then(() => { boton.disabled = false; }).catch(() => {
        boton.style.display = 'none';
        mostrarMsg('No se pudo preparar el PDF', 'err');
    });
}

function cargarModuloPdfReportes() {
    if (!cargaModuloPdfReportes) {
        cargaModuloPdfReportes = import('./reportes-pdf.js').then(modulo => {
            moduloPdfReportes = modulo;
            return modulo;
        }).catch(error => {
            cargaModuloPdfReportes = null;
            throw error;
        });
    }
    return cargaModuloPdfReportes;
}

export function obtenerFiltrosReporte() {
    return {
        sucursal: document.getElementById("repSucursal").value,
        limite: document.getElementById("repLimite").value,
        fechaDesde: document.getElementById("repFechaDesde").value,
        fechaHasta: document.getElementById("repFechaHasta").value
    };
}

export function renderTablaReporte(cId, tId, datos, totales, cb) {
    const co = document.getElementById(cId),
          td = document.getElementById(tId);
    if (!datos || datos.length === 0) {
        co.innerHTML = `<div class="empty-state">Sin datos para el período seleccionado</div>`;
        td.style.display = "none";
        return;
    }
    td.style.display = "grid";
    td.innerHTML = `<div class="reporte-total-card"><div class="rtc-label">Unidades vendidas</div><div class="rtc-val">${totales.cantidad.toLocaleString()}</div></div><div class="reporte-total-card"><div class="rtc-label">Ingresos totales</div><div class="rtc-val">Bs ${Number(totales.ingresos).toFixed(2)}</div></div>`;
    const mx = Math.max(...datos.map(d => d.cantidad), 1);
    let h = `<table><thead><tr><th style="width:32px">#</th><th class="col-prod">Producto</th><th>Uds</th><th>Ingresos</th></tr></thead><tbody>`;
    datos.forEach((d, i) => {
        const pc = Math.round((d.cantidad / mx) * 100);
        h += `<tr><td class="rank-num">${i + 1}</td><td class="col-prod" style="padding-right:8px">${d.producto}<div class="rank-bar-wrap"><div class="rank-bar ${cb}" style="width:${pc}%"></div></div></td><td style="font-family:var(--mono);font-size:12px">${d.cantidad}</td><td style="font-family:var(--mono);font-size:12px">Bs ${Number(d.ingresos).toFixed(2)}</td></tr>`;
    });
    co.innerHTML = h + `</tbody></table>`;
}

// ══ MÁS VENDIDOS ════════════════════════════════════════════════
export async function cargarMasVendidos() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    const { sucursal, limite, fechaDesde, fechaHasta } = obtenerFiltrosReporte();
    const loader = document.getElementById("loaderRepMas");
    loader.style.display = "block";
    document.getElementById("tablaRepMas").innerHTML = "";
    try {
        const data = await api({ ACCION: "PRODUCTOS_MAS_VENDIDOS", SUCURSAL: sucursal, LIMITE: limite, FECHA_DESDE: fechaDesde, FECHA_HASTA: fechaHasta, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        renderTablaReporte("tablaRepMas", "totalesMas", data.datos, data.totales, "");
        guardarReportePdf('masVendidos', data.datos, 'Productos Más Vendidos', { cantidad: data.totales.cantidad, ingresos: data.totales.ingresos }, 'btnPdfMasVendidos');
    } catch (e) { document.getElementById("tablaRepMas").innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>`; }
    loader.style.display = "none";
}

// ══ MENOS VENDIDOS ═══════════════════════════════════════════════
export async function cargarMenosVendidos() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    const { sucursal, limite, fechaDesde, fechaHasta } = obtenerFiltrosReporte();
    const loader = document.getElementById("loaderRepMenos");
    loader.style.display = "block";
    document.getElementById("tablaRepMenos").innerHTML = "";
    try {
        const data = await api({ ACCION: "PRODUCTOS_MENOS_VENDIDOS", SUCURSAL: sucursal, LIMITE: limite, FECHA_DESDE: fechaDesde, FECHA_HASTA: fechaHasta, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        renderTablaReporte("tablaRepMenos", "totalesMenos", data.datos, data.totales, "orange");
        guardarReportePdf('menosVendidos', data.datos, 'Productos Menos Vendidos', { cantidad: data.totales.cantidad, ingresos: data.totales.ingresos }, 'btnPdfMenosVendidos');
    } catch (e) { document.getElementById("tablaRepMenos").innerHTML = `<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>`; }
    loader.style.display = "none";
}

// ══ CAMBIO DE SUBPESTAÑA STOCK ═══════════════════════════════════
export function setReporteStock(s) {
    ["ALERTAS", "ROTACION", "VALORIZACION", "MOVIMIENTOS"].forEach(function (x) {
        document.getElementById("stock-" + x).classList.toggle("oculto", x !== s);
        document.getElementById("subtab-stock-" + x).classList.toggle("active", x === s);
    });
    if (s === "MOVIMIENTOS") setMovPagina(1);
}

// ══ CAMBIO DE SUBPESTAÑA FINANCIERO ═════════════════════════════
export function setReporteFinanciero(s) {
    ["VENTAS", "UTILIDAD", "FLUJO", "COBRAR", "ARQUEOS"].forEach(function (x) {
        document.getElementById("fin-" + x).classList.toggle("oculto", x !== s);
        document.getElementById("subtab-fin-" + x).classList.toggle("active", x === s);
    });
    if (s === "VENTAS") {
        var a = new Date().getFullYear(), mSel = document.getElementById("vtasMes"), aSel = document.getElementById("vtasAnio");
        mSel.innerHTML = "<option value=\"\">Todos</option>";
        for (var i = 1; i <= 12; i++) {
            var v = i < 10 ? "0" + i : "" + i;
            mSel.innerHTML += '<option value="' + v + '">' + ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][i - 1] + "</option>";
        }
        aSel.innerHTML = "<option value=\"\">Todos</option>";
        for (var j = a - 2; j <= a + 2; j++) aSel.innerHTML += '<option value="' + j + '">' + j + "</option>";
    }
}

// ══ ALERTAS DE STOCK ════════════════════════════════════════════
export async function cargarStockAlertas() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    var loader = document.getElementById("loaderAlerta"), tabla = document.getElementById("tablaAlertas");
    loader.style.display = "block"; tabla.innerHTML = "";
    try {
        var data = await api({ ACCION: "STOCK_ALERTAS", SUCURSAL: document.getElementById("alertaSucursal").value, ESTADO: document.getElementById("alertaEstado").value, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        if (!data.datos || data.datos.length === 0) { tabla.innerHTML = '<div class="empty-state">Sin alertas de stock</div>'; }
        else {
            var h = '<table><thead><tr><th class="col-prod">Producto</th><th>Categoria</th><th>Sucursal</th><th>Stock</th><th>Minimo</th><th>Precio</th><th>Ubicacion</th><th>Estado</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                var estadoClase = d.estado === 'AGOTADO' ? 'estado-agotado' : (d.estado === 'BAJO' ? 'estado-bajo' : '');
                h += '<tr><td class="col-prod">' + d.producto + '</td><td style="font-size:11px;color:var(--muted)">' + d.categoria + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td style="font-family:var(--mono)">' + d.stock + '</td><td style="font-family:var(--mono);font-size:11px;color:var(--muted)">' + d.stock_minimo + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.precio_venta).toFixed(2) + '</td><td style="font-size:10px;color:var(--muted)">' + d.ubicacion + '</td><td class="' + estadoClase + '" style="font-size:11px">' + d.estado + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            guardarReportePdf('alertas', data.datos, 'Alertas de Stock', null, 'btnPdfAlertas');
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>'; }
    loader.style.display = "none";
}

// ══ ROTACIÓN DE INVENTARIO ══════════════════════════════════════
export async function cargarRotacionInventario() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    var loader = document.getElementById("loaderRotacion"), tabla = document.getElementById("tablaRotacion"), tdiv = document.getElementById("totalesRotacion");
    loader.style.display = "block"; tabla.innerHTML = ""; tdiv.style.display = "none";
    try {
        var data = await api({ ACCION: "ROTACION_INVENTARIO", SUCURSAL: document.getElementById("rotacionSucursal").value, ROTACION: document.getElementById("rotacionTipo").value, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        if (!data.datos || data.datos.length === 0) { tabla.innerHTML = '<div class="empty-state">Sin datos de rotacion</div>'; }
        else {
            var h = '<table><thead><tr><th class="col-prod">Producto</th><th>Categoria</th><th>Sucursal</th><th>Stock</th><th>Precio</th><th>Ultima venta</th><th>Dias sin venta</th><th>Rotacion</th></tr></thead><tbody>';
            data.datos.forEach(d => {
                var rotClase = d.rotacion === "NUNCA VENDIDO" ? "stock-bajo" : (d.rotacion.indexOf("90") >= 0 ? "estado-pendiente" : "");
                h += '<tr><td class="col-prod">' + d.producto + '</td><td style="font-size:11px;color:var(--muted)">' + d.categoria + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td style="font-family:var(--mono)">' + d.stock + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.precio_venta).toFixed(2) + '</td><td style="font-size:11px;color:var(--muted)">' + (d.ultima_venta || 'Nunca') + '</td><td style="font-family:var(--mono);font-size:11px">' + d.dias_sin_venta + '</td><td class="' + rotClase + '" style="font-size:11px">' + d.rotacion + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            guardarReportePdf('rotacion', data.datos, 'Rotación de Inventario', null, 'btnPdfRotacion');
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>'; }
    loader.style.display = "none";
}

// ══ VALORIZACIÓN DE INVENTARIO ═════════════════════════════════
export async function cargarValorizacionInventario() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    var loader = document.getElementById("loaderValorizacion"), tabla = document.getElementById("tablaValorizacion"), tdiv = document.getElementById("totalesValorizacion");
    loader.style.display = "block"; tabla.innerHTML = ""; tdiv.style.display = "none";
    try {
        var data = await api({ ACCION: "VALORIZACION_INVENTARIO", SUCURSAL: document.getElementById("valSucursal").value, CATEGORIA: document.getElementById("valCategoria").value.trim(), TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        if (!data.datos || data.datos.length === 0) { tabla.innerHTML = '<div class="empty-state">Sin datos de valorizacion</div>'; }
        else {
            var totalCosto = 0, totalValor = 0, totalUtilidad = 0, productos = 0, stockTotal = 0;
            var h = '<table><thead><tr><th>Categoria</th><th>Sucursal</th><th>Productos</th><th>Stock total</th><th>Costo total</th><th>Valor venta</th><th>Utilidad potencial</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                totalCosto += Number(d.costo_total) || 0; totalValor += Number(d.valor_venta_total) || 0; totalUtilidad += Number(d.utilidad_potencial) || 0; productos += Number(d.productos) || 0; stockTotal += Number(d.stock_total) || 0;
                h += '<tr><td style="font-size:11px;color:var(--muted)">' + d.categoria + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td style="font-family:var(--mono)">' + d.productos + '</td><td style="font-family:var(--mono)">' + d.stock_total + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.costo_total).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.valor_venta_total).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.utilidad_potencial).toFixed(2) + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            tdiv.style.display = "grid"; tdiv.innerHTML = '<div class="reporte-total-card"><div class="rtc-label">Productos</div><div class="rtc-val">' + productos + '</div></div><div class="reporte-total-card"><div class="rtc-label">Stock total</div><div class="rtc-val">' + stockTotal + '</div></div><div class="reporte-total-card"><div class="rtc-label">Costo total</div><div class="rtc-val">Bs ' + totalCosto.toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Valor venta</div><div class="rtc-val">Bs ' + totalValor.toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Utilidad potencial</div><div class="rtc-val">Bs ' + totalUtilidad.toFixed(2) + '</div></div>';
            guardarReportePdf('valorizacion', data.datos, 'Valorización de Inventario', { productos: productos, stockTotal: stockTotal, costoTotal: totalCosto, valorVenta: totalValor, utilidadPotencial: totalUtilidad }, 'btnPdfValorizacion');
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>'; }
    loader.style.display = "none";
}

// ══ HISTORIAL DE MOVIMIENTOS ════════════════════════════════════
export async function cargarHistorialMovimientos(pg) {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    var loader = document.getElementById("loaderMovimientos"), tabla = document.getElementById("tablaMovimientos"), pdiv = document.getElementById("paginMovimientos");
    loader.style.display = "block"; tabla.innerHTML = "";
    try {
        var data = await api({ ACCION: "HISTORIAL_MOVIMIENTOS", SUCURSAL: document.getElementById("movSucursal").value, TIPO_MOV: document.getElementById("movTipo").value, PRODUCTO: document.getElementById("movProducto").value.trim(), FECHA_DESDE: document.getElementById("movFechaDesde").value, FECHA_HASTA: document.getElementById("movFechaHasta").value, PAGINA: pg, LIMITE: 20, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        if (!data.datos || data.datos.length === 0) { tabla.innerHTML = '<div class="empty-state">Sin movimientos encontrados</div>'; pdiv.style.display = "none"; }
        else {
            var h = '<table><thead><tr><th>Fecha</th><th>Sucursal</th><th class="col-prod">Producto</th><th>Tipo</th><th>Origen</th><th>Cant</th><th>Monto</th><th>Usuario</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                var fc = fechaBolivia(d.fecha), tipoClase = d.tipo_mov === "ENTRADA" ? "tipo-compra" : "tipo-venta";
                h += '<tr><td style="font-size:11px;color:var(--muted)">' + fc + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td class="col-prod">' + d.producto + '</td><td class="' + tipoClase + '" style="font-size:11px">' + d.tipo_mov + '</td><td style="font-size:10px;color:var(--muted)">' + (d.origen || '') + '</td><td style="font-family:var(--mono);font-size:11px">' + d.cantidad + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.monto).toFixed(2) + '</td><td style="font-size:10px;color:var(--muted)">' + (d.usuario || '') + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            guardarReportePdf('movimientos', data.datos, 'Historial de Movimientos', null, 'btnPdfMovimientos');
            if (data.paginas > 1) { pdiv.style.display = "flex"; document.getElementById("paginMovimientos-info").textContent = "Pag " + data.pagina + " de " + data.paginas + " (" + data.total + " total)"; pdiv.querySelector("button:first-child").disabled = (pg <= 1); pdiv.querySelector("button:last-child").disabled = (pg >= data.paginas); } else { pdiv.style.display = "none"; }
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>'; }
    loader.style.display = "none";
}

// ══ PAGINACIÓN DE MOVIMIENTOS ═══════════════════════════════════
export function cambiarPaginaMov(d) { cargarHistorialMovimientos(store.movPaginaActual + d); }

// ══ VENTAS POR PERÍODO ══════════════════════════════════════════
export async function cargarVentasPeriodo() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    var loader = document.getElementById("loaderVentasPeriodo"), tabla = document.getElementById("tablaVentasPeriodo"), tdiv = document.getElementById("totalesVentasPeriodo");
    loader.style.display = "block"; tabla.innerHTML = ""; tdiv.style.display = "none";
    try {
        var data = await api({ ACCION: "VENTAS_PERIODO", SUCURSAL: document.getElementById("vtasSucursal").value, TIPO: document.getElementById("vtasTipo").value, AGRUPAR: document.getElementById("vtasAgrupar").value, MES: document.getElementById("vtasMes").value, ANIO: document.getElementById("vtasAnio").value, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        if (!data.datos || data.datos.length === 0) { tabla.innerHTML = '<div class="empty-state">Sin datos de ventas</div>'; }
        else {
            var h = '<table><thead><tr><th>Periodo</th><th>Sucursal</th><th>Tipo</th><th>Metodo</th><th>Operaciones</th><th>Líneas históricas</th><th>Unidades</th><th>Total Bs</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                var periodo = d.dia || d.semana || d.mes || '';
                h += '<tr><td style="font-size:11px;color:var(--muted)">' + periodo + ' ' + (d.anio || '') + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td style="font-size:11px">' + (d.tipo || '') + '</td><td style="font-size:10px;color:var(--muted)">' + (d.metodo_pago || '') + '</td><td style="font-family:var(--mono)">' + d.operaciones + '</td><td style="font-family:var(--mono)">' + (d.lineas_legacy || 0) + '</td><td style="font-family:var(--mono)">' + d.unidades + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.total_bs).toFixed(2) + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            guardarReportePdf('ventasPeriodo', data.datos, 'Ventas por Período', data.resumen || null, 'btnPdfVentas');
            if (data.resumen) {
                tdiv.style.display = "grid";
                var r = data.resumen;
                var cards = '<div class="reporte-total-card"><div class="rtc-label">Operaciones</div><div class="rtc-val">' + (r.operaciones || 0) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Líneas históricas</div><div class="rtc-val">' + (r.lineas_legacy || 0) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Unidades</div><div class="rtc-val">' + (r.unidades || 0) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Ventas brutas</div><div class="rtc-val">Bs ' + Number(r.total_bs || 0).toFixed(2) + '</div></div>';
                if (r.ventas_netas !== undefined) cards += '<div class="reporte-total-card"><div class="rtc-label">Devoluciones</div><div class="rtc-val">Bs ' + Number(r.devoluciones || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Ventas netas</div><div class="rtc-val">Bs ' + Number(r.ventas_netas || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Efectivo</div><div class="rtc-val">Bs ' + Number(r.efectivo || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Transferencia</div><div class="rtc-val">Bs ' + Number(r.transferencia || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Crédito</div><div class="rtc-val">Bs ' + Number(r.credito || 0).toFixed(2) + '</div></div>';
                tdiv.innerHTML = cards;
            }
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>'; }
    loader.style.display = "none";
}

// ══ UTILIDAD BRUTA ═════════════════════════════════════════════
export async function cargarUtilidadBruta() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    var loader = document.getElementById("loaderUtilidad"), tabla = document.getElementById("tablaUtilidad"), tdiv = document.getElementById("totalesUtilidad");
    loader.style.display = "block"; tabla.innerHTML = ""; tdiv.style.display = "none";
    try {
        var data = await api({ ACCION: "UTILIDAD_BRUTA", SUCURSAL: document.getElementById("utilSucursal").value, PRODUCTO: document.getElementById("utilProducto").value.trim(), FECHA_DESDE: document.getElementById("utilFechaDesde").value, FECHA_HASTA: document.getElementById("utilFechaHasta").value, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        if (!data.datos || data.datos.length === 0) { tabla.innerHTML = '<div class="empty-state">Sin datos de utilidad</div>'; }
        else {
            var h = '<table><thead><tr><th>Periodo</th><th>Sucursal</th><th class="col-prod">Producto</th><th>Cant</th><th>Ingresos</th><th>Costo</th><th>Utilidad</th><th>Sin costo</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                var periodo = d.dia || d.semana || d.mes || '';
                h += '<tr><td style="font-size:11px;color:var(--muted)">' + periodo + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td class="col-prod">' + d.producto + '</td><td style="font-family:var(--mono)">' + d.cantidad + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.ingresos).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.costo).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.utilidad_bruta).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">' + Number(d.unidades_sin_costo || 0) + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            guardarReportePdf('utilidad', data.datos, 'Utilidad Bruta', data.resumen || null, 'btnPdfUtilidad');
            if (data.resumen) { tdiv.style.display = "grid"; tdiv.innerHTML = '<div class="reporte-total-card"><div class="rtc-label">Ingresos netos</div><div class="rtc-val">Bs ' + Number(data.resumen.ingresos || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Costos históricos</div><div class="rtc-val">Bs ' + Number(data.resumen.costo || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Utilidad bruta</div><div class="rtc-val">Bs ' + Number(data.resumen.utilidad_bruta || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Unidades sin costo</div><div class="rtc-val">' + Number(data.resumen.unidades_sin_costo || 0) + '</div></div>'; }
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>'; }
    loader.style.display = "none";
}

// ══ FLUJO DE CAJA ═════════════════════════════════════════════
export async function cargarFlujoCajaReporte() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    var loader = document.getElementById("loaderFlujo"), tabla = document.getElementById("tablaFlujo"), tdiv = document.getElementById("totalesFlujo");
    loader.style.display = "block"; tabla.innerHTML = ""; tdiv.style.display = "none";
    try {
        var data = await api({ ACCION: "FLUJO_CAJA_REPORTE", SUCURSAL: document.getElementById("flujoSucursal").value, FECHA_DESDE: document.getElementById("flujoFechaDesde").value, FECHA_HASTA: document.getElementById("flujoFechaHasta").value, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        if (!data.datos || data.datos.length === 0) { tabla.innerHTML = '<div class="empty-state">Sin datos de flujo de caja</div>'; }
        else {
            var h = '<table><thead><tr><th>Periodo</th><th>Sucursal</th><th>Método</th><th>Tipo</th><th>Entradas</th><th>Salidas</th><th>Saldo neto</th><th>Mov.</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                var periodo = d.dia || d.semana || d.mes || '';
                h += '<tr><td style="font-size:11px;color:var(--muted)">' + periodo + ' ' + (d.anio || '') + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td style="font-family:var(--mono);font-size:10px">' + (d.metodo_pago || '') + '</td><td style="font-size:10px">' + (d.tipo || '') + '</td><td style="font-family:var(--mono);font-size:11px;color:var(--teal-text)">Bs ' + Number(d.total_entradas).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px;color:var(--red-text)">Bs ' + Number(d.total_salidas).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.saldo_neto).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">' + Number(d.movimientos || 0) + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            guardarReportePdf('flujo', data.datos, 'Flujo de Caja', data.resumen || null, 'btnPdfFlujo');
            if (data.resumen) { tdiv.style.display = "grid"; tdiv.innerHTML = '<div class="reporte-total-card"><div class="rtc-label">Total entradas</div><div class="rtc-val">Bs ' + Number(data.resumen.total_entradas || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Total salidas</div><div class="rtc-val">Bs ' + Number(data.resumen.total_salidas || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Saldo neto</div><div class="rtc-val">Bs ' + Number(data.resumen.saldo_neto || 0).toFixed(2) + '</div></div>'; }
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>'; }
    loader.style.display = "none";
}

// ══ ARQUEOS ════════════════════════════════════════════════════
export async function cargarArqueosReporte() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    var loader = document.getElementById("loaderArqueosRep"), tabla = document.getElementById("tablaArqueosRep"), tdiv = document.getElementById("totalesArqueosRep");
    loader.style.display = "block"; tabla.innerHTML = ""; tdiv.style.display = "none";
    try {
        var data = await api({ ACCION: "ARQUEOS_REPORTE", SUCURSAL: document.getElementById("arqueosSucursal").value, FECHA_DESDE: document.getElementById("arqueosFechaDesde").value, FECHA_HASTA: document.getElementById("arqueosFechaHasta").value, TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        if (!data.datos || data.datos.length === 0) tabla.innerHTML = '<div class="empty-state">Sin arqueos para el período</div>';
        else {
            var h = '<table><thead><tr><th>Fecha</th><th>Sucursal</th><th>Usuario</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Resultado</th><th>Estado</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                h += '<tr><td style="font-family:var(--mono);font-size:10px">' + d.fecha + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td>' + d.usuario + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.saldo_esperado).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.efectivo_contado).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.diferencia).toFixed(2) + '</td><td>' + d.resultado + '</td><td>' + d.estado + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            setRptCache("arqueos", { datos: data.datos, cols: ['Fecha', 'Sucursal', 'Usuario', 'Esperado', 'Contado', 'Diferencia', 'Resultado', 'Estado'], title: 'Arqueos de Caja', resumen: data.resumen || null });
            if (data.resumen) { tdiv.style.display = "grid"; tdiv.innerHTML = '<div class="reporte-total-card"><div class="rtc-label">Arqueos</div><div class="rtc-val">' + Number(data.resumen.arqueos || 0) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Efectivo esperado</div><div class="rtc-val">Bs ' + Number(data.resumen.saldo_esperado || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Efectivo contado</div><div class="rtc-val">Bs ' + Number(data.resumen.efectivo_contado || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Diferencia acumulada</div><div class="rtc-val">Bs ' + Number(data.resumen.diferencia || 0).toFixed(2) + '</div></div>'; }
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexión</div>'; }
    loader.style.display = "none";
}

// ══ CUENTAS POR COBRAR REPORTE ════════════════════════════════
export async function cargarCuentasCobrarReporte() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    var loader = document.getElementById("loaderCobrarRep"), tabla = document.getElementById("tablaCobrarRep"), tdiv = document.getElementById("totalesCobrar");
    loader.style.display = "block"; tabla.innerHTML = ""; tdiv.style.display = "none";
    try {
        var data = await api({ ACCION: "CUENTAS_COBRAR_REPORTE", SUCURSAL: document.getElementById("cobrarSucursal").value, CLIENTE: document.getElementById("cobrarCliente").value.trim(), TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        if (!data.datos || data.datos.length === 0) { tabla.innerHTML = '<div class="empty-state">Sin cuentas por cobrar</div>'; }
        else {
            var h = '<table><thead><tr><th>Sucursal</th><th>Cliente</th><th>Cuentas</th><th>Total adeudado</th><th>Total abonado</th><th>Saldo pendiente</th><th>Canceladas</th><th>Pendientes</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                h += '<tr><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td style="font-size:11px">' + d.cliente + '</td><td style="font-family:var(--mono)">' + d.cuentas + '</td><td style="font-family:var(--mono);font-size:11px;color:var(--red-text)">Bs ' + Number(d.total_adeudado).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px;color:var(--teal-text)">Bs ' + Number(d.total_abonado).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.saldo_pendiente).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">' + (d.canceladas || 0) + '</td><td style="font-family:var(--mono);font-size:11px">' + (d.pendientes || 0) + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            guardarReportePdf('cobrar', data.datos, 'Cuentas por Cobrar', data.resumen || null, 'btnPdfCobrar');
            if (data.resumen) { tdiv.style.display = "grid"; tdiv.innerHTML = '<div class="reporte-total-card"><div class="rtc-label">Total adeudado</div><div class="rtc-val">Bs ' + Number(data.resumen.total_adeudado || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Total abonado</div><div class="rtc-val">Bs ' + Number(data.resumen.total_abonado || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Saldo pendiente</div><div class="rtc-val">Bs ' + Number(data.resumen.saldo_pendiente || 0).toFixed(2) + '</div></div>'; }
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>'; }
    loader.style.display = "none";
}

// ===== FUNCIONES PDF PARA REPORTES ==================================

// ══ PDF GENÉRICO ══════════════════════════════════════════════
export function imprimirReporte(reporte) {
    if (!moduloPdfReportes) {
        cargarModuloPdfReportes();
        mostrarMsg('Preparando el PDF. Intenta nuevamente en un momento', 'ok');
        return;
    }
    const documento = {
        ...reporte,
        fecha: new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz", hour12: false }),
        usuario: store.sessionUser,
    };
    if (ES_MOVIL.test(navigator.userAgent)) compartirReportePdf(documento);
    else imprimirReporteDirecto(documento);
}

function imprimirReporteDirecto(reporte) {
    const area = document.getElementById('printArea');
    if (!area) return;
    area.className = 'reporte-print';
    area.innerHTML = moduloPdfReportes.construirReporteParaImprimir(reporte);
    window.addEventListener('afterprint', () => {
        area.innerHTML = '';
        area.className = '';
    }, { once: true });
    setTimeout(() => window.print(), 50);
}

function compartirReportePdf(reporte) {
    const pdf = moduloPdfReportes.crearArchivoPdfReporte(reporte);
    const nombre = `reporte-${normalizarNombreArchivo(reporte.titulo)}.pdf`;
    if (typeof File !== 'undefined' && navigator.share) {
        const archivo = new File([pdf], nombre, { type: 'application/pdf' });
        if (!navigator.canShare || navigator.canShare({ files: [archivo] })) {
            navigator.share({ title: reporte.titulo, files: [archivo] }).catch(error => {
                if (error?.name !== 'AbortError') descargarReportePdf(pdf, nombre);
            });
            return;
        }
    }
    descargarReportePdf(pdf, nombre);
}

function descargarReportePdf(pdf, nombre) {
    const enlace = document.createElement('a');
    const url = URL.createObjectURL(pdf);
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function normalizarNombreArchivo(valor) {
    return String(valor || 'reporte').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase() || 'reporte';
}

// ══ IMPRIMIR ALERTAS ═══════════════════════════════════════════
export function imprimirReporteAlertas() {
    var c = store._rptCache.alertas; if (!c) { mostrarMsg('Primero consulta las alertas', 'err'); return; }
    imprimirReporte(c);
}

export function imprimirReporteRotacion() {
    var c = store._rptCache.rotacion; if (!c) { mostrarMsg('Primero consulta la rotacion', 'err'); return; }
    imprimirReporte(c);
}

export function imprimirReporteValorizacion() {
    var c = store._rptCache.valorizacion; if (!c) { mostrarMsg('Primero calcula la valorizacion', 'err'); return; }
    imprimirReporte(c);
}

export function imprimirReporteMovimientos() {
    var c = store._rptCache.movimientos; if (!c) { mostrarMsg('Primero consulta los movimientos', 'err'); return; }
    imprimirReporte(c);
}

export function imprimirReporteVentas() {
    var c = store._rptCache.ventasPeriodo; if (!c) { mostrarMsg('Primero genera el reporte de ventas', 'err'); return; }
    imprimirReporte(c);
}

export function imprimirReporteUtilidad() {
    var c = store._rptCache.utilidad; if (!c) { mostrarMsg('Primero calcula la utilidad', 'err'); return; }
    imprimirReporte(c);
}

export function imprimirReporteFlujo() {
    var c = store._rptCache.flujo; if (!c) { mostrarMsg('Primero genera el flujo de caja', 'err'); return; }
    imprimirReporte(c);
}

export function imprimirReporteCobrar() {
    var c = store._rptCache.cobrar; if (!c) { mostrarMsg('Primero consulta las cuentas', 'err'); return; }
    imprimirReporte(c);
}

export function imprimirReporteMasVendidos() {
    var c = store._rptCache.masVendidos; if (!c) { mostrarMsg('Primero genera el reporte', 'err'); return; }
    imprimirReporte(c);
}

export function imprimirReporteMenosVendidos() {
    var c = store._rptCache.menosVendidos; if (!c) { mostrarMsg('Primero genera el reporte', 'err'); return; }
    imprimirReporte(c);
}

// ── Init: main.js llamará initReportes() en fase 5 ──────────
export function initReportes() { observarTablasReportesMovil(); }
