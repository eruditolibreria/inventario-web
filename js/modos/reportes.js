/* === MODO REPORTES: Tablas, gráficos e impresión === */
import { store, setMovPagina, setRptCache } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg } from '../utils.js';
import { manejarRespuesta } from '../ui.js';

// ── HELPERS ──────────────────────────────────────────────────
export function _formatearBs(v) { return 'Bs ' + Number(v || 0).toFixed(2); }

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
        setRptCache("masVendidos", { datos: data.datos, cols: ['#', 'Producto', 'Uds', 'Ingresos'], title: 'Productos Más Vendidos', resumen: { cantidad: data.totales.cantidad, ingresos: data.totales.ingresos } });
        document.getElementById('btnPdfMasVendidos').style.display = 'inline-block';
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
        setRptCache("menosVendidos", { datos: data.datos, cols: ['#', 'Producto', 'Uds', 'Ingresos'], title: 'Productos Menos Vendidos', resumen: { cantidad: data.totales.cantidad, ingresos: data.totales.ingresos } });
        document.getElementById('btnPdfMenosVendidos').style.display = 'inline-block';
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
    ["VENTAS", "UTILIDAD", "FLUJO", "COBRAR"].forEach(function (x) {
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
            setRptCache("alertas", { datos: data.datos, cols: ['Producto', 'Categoria', 'Sucursal', 'Stock', 'Minimo', 'Precio', 'Ubicacion', 'Estado'], title: 'Alertas de Stock', resumen: null });
            document.getElementById('btnPdfAlertas').style.display = 'inline-block';
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
            setRptCache("rotacion", { datos: data.datos, cols: ['Producto', 'Categoria', 'Sucursal', 'Stock', 'Precio', 'Ultima venta', 'Dias sin venta', 'Rotacion'], title: 'Rotacion de Inventario', resumen: null });
            document.getElementById('btnPdfRotacion').style.display = 'inline-block';
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
            setRptCache("valorizacion", { datos: data.datos, cols: ['Categoria', 'Sucursal', 'Productos', 'Stock total', 'Costo total', 'Valor venta', 'Utilidad potencial'], title: 'Valorizacion de Inventario', resumen: { productos: productos, stockTotal: stockTotal, costoTotal: totalCosto, valorVenta: totalValor, utilidadPotencial: totalUtilidad } });
            document.getElementById('btnPdfValorizacion').style.display = 'inline-block';
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
                var fc = String(d.fecha).slice(0, 10), tipoClase = d.tipo_mov === "ENTRADA" ? "tipo-compra" : "tipo-venta";
                h += '<tr><td style="font-size:11px;color:var(--muted)">' + fc + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td class="col-prod">' + d.producto + '</td><td class="' + tipoClase + '" style="font-size:11px">' + d.tipo_mov + '</td><td style="font-size:10px;color:var(--muted)">' + (d.origen || '') + '</td><td style="font-family:var(--mono);font-size:11px">' + d.cantidad + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.monto).toFixed(2) + '</td><td style="font-size:10px;color:var(--muted)">' + (d.usuario || '') + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            setRptCache("movimientos", { datos: data.datos, cols: ['Fecha', 'Sucursal', 'Producto', 'Tipo', 'Origen', 'Cant', 'Monto', 'Usuario'], title: 'Historial de Movimientos', resumen: null });
            document.getElementById('btnPdfMovimientos').style.display = 'inline-block';
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
            var h = '<table><thead><tr><th>Periodo</th><th>Sucursal</th><th>Tipo</th><th>Metodo</th><th>Operaciones</th><th>Unidades</th><th>Total Bs</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                var periodo = d.dia || d.semana || d.mes || '';
                h += '<tr><td style="font-size:11px;color:var(--muted)">' + periodo + ' ' + (d.anio || '') + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td style="font-size:11px">' + (d.tipo || '') + '</td><td style="font-size:10px;color:var(--muted)">' + (d.metodo_pago || '') + '</td><td style="font-family:var(--mono)">' + d.operaciones + '</td><td style="font-family:var(--mono)">' + d.unidades + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.total_bs).toFixed(2) + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            setRptCache("ventasPeriodo", { datos: data.datos, cols: ['Periodo', 'Sucursal', 'Tipo', 'Metodo', 'Operaciones', 'Unidades', 'Total Bs'], title: 'Ventas por Periodo', resumen: data.resumen || null });
            document.getElementById('btnPdfVentas').style.display = 'inline-block';
            if (data.resumen) { tdiv.style.display = "grid"; tdiv.innerHTML = '<div class="reporte-total-card"><div class="rtc-label">Operaciones</div><div class="rtc-val">' + (data.resumen.operaciones || 0) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Unidades</div><div class="rtc-val">' + (data.resumen.unidades || 0) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Total Bs</div><div class="rtc-val">Bs ' + Number(data.resumen.total_bs || 0).toFixed(2) + '</div></div>'; }
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
            var h = '<table><thead><tr><th>Periodo</th><th>Sucursal</th><th class="col-prod">Producto</th><th>Cant</th><th>Ingresos</th><th>Costo</th><th>Utilidad</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                var periodo = d.dia || d.semana || d.mes || '';
                h += '<tr><td style="font-size:11px;color:var(--muted)">' + periodo + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td class="col-prod">' + d.producto + '</td><td style="font-family:var(--mono)">' + d.cantidad + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.ingresos).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.costo).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.utilidad_bruta).toFixed(2) + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            setRptCache("utilidad", { datos: data.datos, cols: ['Periodo', 'Sucursal', 'Producto', 'Cant', 'Ingresos', 'Costo', 'Utilidad'], title: 'Utilidad Bruta', resumen: data.resumen || null });
            document.getElementById('btnPdfUtilidad').style.display = 'inline-block';
            if (data.resumen) { tdiv.style.display = "grid"; tdiv.innerHTML = '<div class="reporte-total-card"><div class="rtc-label">Ingresos totales</div><div class="rtc-val">Bs ' + Number(data.resumen.ingresos || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Costos totales</div><div class="rtc-val">Bs ' + Number(data.resumen.costo || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Utilidad bruta</div><div class="rtc-val">Bs ' + Number(data.resumen.utilidad_bruta || 0).toFixed(2) + '</div></div>'; }
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
            var h = '<table><thead><tr><th>Periodo</th><th>Sucursal</th><th>Entradas</th><th>Salidas</th><th>Saldo neto</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                var periodo = d.dia || d.semana || d.mes || '';
                h += '<tr><td style="font-size:11px;color:var(--muted)">' + periodo + ' ' + (d.anio || '') + '</td><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td style="font-family:var(--mono);font-size:11px;color:var(--teal)">Bs ' + Number(d.total_entradas).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px;color:var(--red)">Bs ' + Number(d.total_salidas).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.saldo_neto).toFixed(2) + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            setRptCache("flujo", { datos: data.datos, cols: ['Periodo', 'Sucursal', 'Entradas', 'Salidas', 'Saldo neto'], title: 'Flujo de Caja', resumen: data.resumen || null });
            document.getElementById('btnPdfFlujo').style.display = 'inline-block';
            if (data.resumen) { tdiv.style.display = "grid"; tdiv.innerHTML = '<div class="reporte-total-card"><div class="rtc-label">Total entradas</div><div class="rtc-val">Bs ' + Number(data.resumen.total_entradas || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Total salidas</div><div class="rtc-val">Bs ' + Number(data.resumen.total_salidas || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Saldo neto</div><div class="rtc-val">Bs ' + Number(data.resumen.saldo_neto || 0).toFixed(2) + '</div></div>'; }
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>'; }
    loader.style.display = "none";
}

// ══ CUENTAS POR COBRAR REPORTE ════════════════════════════════
export async function cargarCuentasCobrarReporte() {
    if (!store.sessionToken) { mostrarMsg("Sesión expirada", "err"); return; }
    var loader = document.getElementById("loaderCobrar"), tabla = document.getElementById("tablaCobrar"), tdiv = document.getElementById("totalesCobrar");
    loader.style.display = "block"; tabla.innerHTML = ""; tdiv.style.display = "none";
    try {
        var data = await api({ ACCION: "CUENTAS_COBRAR_REPORTE", SUCURSAL: document.getElementById("cobrarSucursal").value, CLIENTE: document.getElementById("cobrarCliente").value.trim(), TOKEN: store.sessionToken });
        if (!manejarRespuesta(data)) { loader.style.display = "none"; return; }
        if (!data.datos || data.datos.length === 0) { tabla.innerHTML = '<div class="empty-state">Sin cuentas por cobrar</div>'; }
        else {
            var h = '<table><thead><tr><th>Sucursal</th><th>Cliente</th><th>Cuentas</th><th>Total adeudado</th><th>Total abonado</th><th>Saldo pendiente</th><th>Canceladas</th><th>Pendientes</th></tr></thead><tbody>';
            data.datos.forEach(function (d) {
                h += '<tr><td style="font-family:var(--mono);font-size:11px">' + d.sucursal + '</td><td style="font-size:11px">' + d.cliente + '</td><td style="font-family:var(--mono)">' + d.cuentas + '</td><td style="font-family:var(--mono);font-size:11px;color:var(--red)">Bs ' + Number(d.total_adeudado).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px;color:var(--teal)">Bs ' + Number(d.total_abonado).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">Bs ' + Number(d.saldo_pendiente).toFixed(2) + '</td><td style="font-family:var(--mono);font-size:11px">' + (d.canceladas || 0) + '</td><td style="font-family:var(--mono);font-size:11px">' + (d.pendientes || 0) + '</td></tr>';
            });
            tabla.innerHTML = h + '</tbody></table>';
            setRptCache("cobrar", { datos: data.datos, cols: ['Sucursal', 'Cliente', 'Cuentas', 'Total adeudado', 'Total abonado', 'Saldo pendiente', 'Canceladas', 'Pendientes'], title: 'Cuentas por Cobrar', resumen: data.resumen || null });
            document.getElementById('btnPdfCobrar').style.display = 'inline-block';
            if (data.resumen) { tdiv.style.display = "grid"; tdiv.innerHTML = '<div class="reporte-total-card"><div class="rtc-label">Total adeudado</div><div class="rtc-val">Bs ' + Number(data.resumen.total_adeudado || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Total abonado</div><div class="rtc-val">Bs ' + Number(data.resumen.total_abonado || 0).toFixed(2) + '</div></div><div class="reporte-total-card"><div class="rtc-label">Saldo pendiente</div><div class="rtc-val">Bs ' + Number(data.resumen.saldo_pendiente || 0).toFixed(2) + '</div></div>'; }
        }
    } catch (e) { tabla.innerHTML = '<div style="color:var(--red);font-size:13px;padding:10px">Error de conexion</div>'; }
    loader.style.display = "none";
}

// ===== FUNCIONES PDF PARA REPORTES ==================================

// ══ IMPRIMIR REPORTE GENÉRICO ═════════════════════════════════=
export function imprimirReporte(title, cols, datos, resumen) {
    var pa = document.getElementById('printArea');
    var h = '';
    h += '<div class="print-header">';
    h += '<div class="print-logo"><i class="fa-solid fa-boxes-stacked"></i> GRUPO ERUDITOS</div>';
    h += '<div class="print-sub">Sistema de Inventario</div>';
    h += '</div>';
    h += '<div class="print-title">' + title + '</div>';
    h += '<div class="print-meta">Generado: ' + new Date().toLocaleString() + ' · Usuario: ' + store.sessionUser + '</div>';
    if (resumen) {
        h += '<div class="print-summary">';
        for (var k in resumen) {
            var v = resumen[k];
            var label = k.replace(/([A-Z])/g, ' $1').replace(/^./, function (s) { return s.toUpperCase(); });
            var val = (typeof v === 'number') ? (v % 1 === 0 ? v.toLocaleString() : _formatearBs(v)) : v;
            h += '<div class="print-summary-card"><div class="psc-label">' + label + '</div><div class="psc-val">' + val + '</div></div>';
        }
        h += '</div>';
    }
    h += '<table><thead><tr>';
    cols.forEach(function (c) { h += '<th>' + c + '</th>'; });
    h += '</tr></thead><tbody>';
    datos.forEach(function (d) {
        h += '<tr>';
        cols.forEach(function (c) {
            var v = d[c] !== undefined ? d[c] : d[c.toLowerCase()];
            if (v === undefined || v === null) v = '';
            h += '<td>' + v + '</td>';
        });
        h += '</tr>';
    });
    h += '</tbody></table>';
    h += '<div class="print-footer">GRUPO ERUDITOS &copy; ' + new Date().getFullYear() + ' · Este documento es una representacion impresa de los datos del sistema.</div>';
    pa.innerHTML = h;
    setTimeout(function () {
        if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            if (confirm('Compartir como PDF?')) {
                var blob = new Blob([pa.innerHTML], { type: 'text/html' });
                var file = new File([blob], title.replace(/\s+/g, '_') + '.html', { type: 'text/html' });
                navigator.share({ title: title, text: 'Reporte: ' + title, files: [file] }).catch(function () { });
            }
        }
        window.print();
        pa.innerHTML = "";
    }, 200);
}

// ══ IMPRIMIR ALERTAS ═══════════════════════════════════════════
export function imprimirReporteAlertas() {
    var c = store._rptCache.alertas; if (!c) { mostrarMsg('Primero consulta las alertas', 'err'); return; }
    imprimirReporte(c.title, c.cols, c.datos, c.resumen);
}

export function imprimirReporteRotacion() {
    var c = store._rptCache.rotacion; if (!c) { mostrarMsg('Primero consulta la rotacion', 'err'); return; }
    imprimirReporte(c.title, c.cols, c.datos, c.resumen);
}

export function imprimirReporteValorizacion() {
    var c = store._rptCache.valorizacion; if (!c) { mostrarMsg('Primero calcula la valorizacion', 'err'); return; }
    imprimirReporte(c.title, c.cols, c.datos, c.resumen);
}

export function imprimirReporteMovimientos() {
    var c = store._rptCache.movimientos; if (!c) { mostrarMsg('Primero consulta los movimientos', 'err'); return; }
    imprimirReporte(c.title, c.cols, c.datos, c.resumen);
}

export function imprimirReporteVentas() {
    var c = store._rptCache.ventasPeriodo; if (!c) { mostrarMsg('Primero genera el reporte de ventas', 'err'); return; }
    imprimirReporte(c.title, c.cols, c.datos, c.resumen);
}

export function imprimirReporteUtilidad() {
    var c = store._rptCache.utilidad; if (!c) { mostrarMsg('Primero calcula la utilidad', 'err'); return; }
    imprimirReporte(c.title, c.cols, c.datos, c.resumen);
}

export function imprimirReporteFlujo() {
    var c = store._rptCache.flujo; if (!c) { mostrarMsg('Primero genera el flujo de caja', 'err'); return; }
    imprimirReporte(c.title, c.cols, c.datos, c.resumen);
}

export function imprimirReporteCobrar() {
    var c = store._rptCache.cobrar; if (!c) { mostrarMsg('Primero consulta las cuentas', 'err'); return; }
    imprimirReporte(c.title, c.cols, c.datos, c.resumen);
}

export function imprimirReporteMasVendidos() {
    var c = store._rptCache.masVendidos; if (!c) { mostrarMsg('Primero genera el reporte', 'err'); return; }
    imprimirReporte(c.title, c.cols, c.datos, c.resumen);
}

export function imprimirReporteMenosVendidos() {
    var c = store._rptCache.menosVendidos; if (!c) { mostrarMsg('Primero genera el reporte', 'err'); return; }
    imprimirReporte(c.title, c.cols, c.datos, c.resumen);
}

// ══ COMPROBANTE DE VENTA ══════════════════════════════════════
export function imprimirComprobante() {
    var v = store.ultimaVenta; if (!v) { mostrarMsg('No hay venta reciente', 'err'); return; }
    var pa = document.getElementById('printArea');
    var h = '';
    h += '<div class="print-header">';
    h += '<div class="print-logo"><i class="fa-solid fa-boxes-stacked"></i> GRUPO ERUDITOS</div>';
    h += '<div class="print-sub">Comprobante de Venta</div>';
    h += '</div>';
    h += '<div class="print-title">COMPROBANTE DE VENTA</div>';
    h += '<div class="print-meta">' + v.fecha + ' ' + v.hora + ' · Sucursal: ' + v.sucursal + ' · Vendedor: ' + v.usuario + '</div>';
    if (v.cliente && v.cliente !== 'MOSTRADOR') h += '<div class="print-meta"><strong>Cliente:</strong> ' + v.cliente + '</div>';
    h += '<table><thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>';
    v.items.forEach(function (item) {
        h += '<tr><td>' + item.producto + '</td><td>' + item.cantidad + '</td><td>' + _formatearBs(item.precio) + '</td><td>' + _formatearBs(item.cantidad * item.precio) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="print-summary">';
    h += '<div class="print-summary-card"><div class="psc-label">Subtotal</div><div class="psc-val">' + _formatearBs(v.total) + '</div></div>';
    if (v.ajusteRedondeo && v.ajusteRedondeo !== 0) {
        h += '<div class="print-summary-card"><div class="psc-label">Redondeo</div><div class="psc-val">' + (v.ajusteRedondeo > 0 ? '+' : '') + _formatearBs(v.ajusteRedondeo) + '</div></div>';
        h += '<div class="print-summary-card"><div class="psc-label">Total a pagar</div><div class="psc-val" style="font-size:1.3em">' + _formatearBs(v.totalRedondeado) + '</div></div>';
    } else {
        h += '<div class="print-summary-card"><div class="psc-label">Total</div><div class="psc-val">' + _formatearBs(v.total) + '</div></div>';
    }
    h += '<div class="print-summary-card"><div class="psc-label">Metodo</div><div class="psc-val">' + v.metodoPago + '</div></div>';
    h += '</div>';
    h += '<div class="print-footer">Gracias por su compra · GRUPO ERUDITOS &copy; ' + new Date().getFullYear() + '</div>';
    pa.innerHTML = h;
    setTimeout(function () {
        if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            if (confirm('Compartir comprobante?')) {
                var blob = new Blob([pa.innerHTML], { type: 'text/html' });
                var file = new File([blob], 'Comprobante_' + v.fecha.replace(/-/g, '') + '.html', { type: 'text/html' });
                navigator.share({ title: 'Comprobante de Venta', text: 'Comprobante GRUPO ERUDITOS', files: [file] }).catch(function () { });
            }
        }
        window.print();
        pa.innerHTML = "";
    }, 200);
}

// ── Init: main.js llamará initReportes() en fase 5 ──────────
export function initReportes() {}