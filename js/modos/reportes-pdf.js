const ES_MONEDA = /ingreso|precio|costo|valor|utilidad|monto|total|saldo|entrada|salida|efectivo|transferencia|credito|devolucion|adeudado|abonado|pendiente/i;

export function construirReporteParaImprimir(reporte) {
    const horizontal = reporte.columnas.length > 5;
    const filas = crearFilas(reporte);
    const resumen = crearResumen(reporte.resumen);
    const encabezados = reporte.columnas.map(columna => `<th>${escaparHtml(columna.etiqueta)}</th>`).join("");
    const cuerpo = filas.map(fila => `<tr>${fila.map(valor => `<td>${escaparHtml(valor)}</td>`).join("")}</tr>`).join("");
    const tarjetas = resumen.map(item => `<div class="rp-resumen"><span>${escaparHtml(item.etiqueta)}</span><strong>${escaparHtml(item.valor)}</strong></div>`).join("");
    return `<style>@page{size:letter ${horizontal ? "landscape" : "portrait"};margin:10mm}#printArea.reporte-print{padding:0}.reporte-pdf{font-family:Arial,sans-serif;color:#000}.reporte-pdf header{text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px}.reporte-pdf h1{font-size:16px;margin:6px 0}.reporte-pdf p{font-size:9px;margin:2px 0;color:#555}.reporte-pdf .marca{font-size:14px;font-weight:700}.reporte-pdf .resumenes{display:grid;grid-template-columns:repeat(${horizontal ? 4 : 3},1fr);gap:6px;margin:0 0 10px}.rp-resumen{border:1px solid #bbb;padding:5px 7px}.rp-resumen span{display:block;font-size:7px;text-transform:uppercase;color:#555}.rp-resumen strong{font-size:10px}.reporte-pdf table{width:100%;border-collapse:collapse;font-size:${horizontal ? 7 : 9}px}.reporte-pdf th{font-size:${horizontal ? 6 : 8}px;text-transform:uppercase;background:#eee;border-bottom:2px solid #000}.reporte-pdf th,.reporte-pdf td{text-align:left;vertical-align:top;padding:4px 5px;border-bottom:1px solid #ddd}.reporte-pdf footer{margin-top:10px;padding-top:6px;border-top:1px solid #bbb;text-align:center;font-size:7px;color:#666}</style><article class="reporte-pdf"><header><div class="marca">GRUPO ERUDITOS</div><p>Sistema de Inventario</p><h1>${escaparHtml(reporte.titulo)}</h1><p>Generado: ${escaparHtml(reporte.fecha)} · Usuario: ${escaparHtml(reporte.usuario || "—")}</p></header>${tarjetas ? `<section class="resumenes">${tarjetas}</section>` : ""}<table><thead><tr>${encabezados}</tr></thead><tbody>${cuerpo}</tbody></table><footer>GRUPO ERUDITOS · Documento generado por el Sistema de Inventario</footer></article>`;
}

export function crearArchivoPdfReporte(reporte) {
    const horizontal = reporte.columnas.length > 5;
    const ancho = horizontal ? 792 : 612, alto = horizontal ? 612 : 792, margen = 30;
    const columnas = reporte.columnas, anchoCelda = (ancho - margen * 2) / columnas.length, tamano = horizontal ? 6 : 8, altoLinea = tamano + 3;
    const limite = Math.max(8, Math.floor(anchoCelda / (tamano * 0.53)));
    const paginas = []; let pagina, y;
    const texto = (valor, x, posicionY, fuente = "F1", fuenteTamano = tamano) => pagina.push(`BT /${fuente} ${fuenteTamano} Tf ${x} ${posicionY} Td (${escaparTextoPdf(valor)}) Tj ET`);
    const nuevaPagina = () => {
        pagina = []; paginas.push(pagina); y = alto - 55;
        texto("GRUPO ERUDITOS", margen, alto - 28, "F2", 11);
        texto(reporte.titulo, margen, alto - 42, "F2", 9);
        texto("Generado: " + reporte.fecha + " · Usuario: " + (reporte.usuario || "—"), margen, alto - 51, "F1", 6);
        pagina.push(`${margen} ${alto - 58} m ${ancho - margen} ${alto - 58} l S`);
    };
    const saltarPagina = () => nuevaPagina();
    const encabezadoTabla = () => {
        const lineas = columnas.map(columna => partirTexto(columna.etiqueta, limite));
        const altoEncabezado = Math.max(...lineas.map(lineasColumna => lineasColumna.length)) * altoLinea + 6;
        if (y - altoEncabezado < margen) saltarPagina();
        columnas.forEach((_, indice) => {
            const x = margen + indice * anchoCelda;
            pagina.push(`0.93 g ${x} ${y - altoEncabezado} ${anchoCelda} ${altoEncabezado} re f 0 g`);
            lineas[indice].forEach((linea, lineaIndice) => texto(linea, x + 3, y - 8 - lineaIndice * altoLinea, "F2", tamano - 1));
        });
        y -= altoEncabezado;
    };
    nuevaPagina();
    const resumen = crearResumen(reporte.resumen);
    resumen.forEach((item) => {
        if (y - altoLinea < margen) saltarPagina();
        texto(`${item.etiqueta}: ${item.valor}`, margen, y, "F1", 7);
        y -= altoLinea;
    });
    if (resumen.length) y -= 4;
    encabezadoTabla();
    crearFilas(reporte).forEach((fila) => {
        const lineas = fila.map(valor => partirTexto(valor, limite));
        const altoFila = Math.max(...lineas.map(lineasCelda => lineasCelda.length)) * altoLinea + 5;
        if (y - altoFila < margen) { saltarPagina(); encabezadoTabla(); }
        lineas.forEach((lineasCelda, indice) => {
            const x = margen + indice * anchoCelda;
            lineasCelda.forEach((linea, lineaIndice) => texto(linea, x + 3, y - 8 - lineaIndice * altoLinea));
        });
        y -= altoFila;
        pagina.push(`${margen} ${y + 2} m ${ancho - margen} ${y + 2} l S`);
    });
    return crearDocumentoPdf(paginas, ancho, alto);
}

function crearFilas(reporte) {
    return reporte.datos.map((dato, indice) => reporte.columnas.map(columna => formatearCelda(dato, columna, indice)));
}

function crearResumen(resumen) {
    return Object.entries(resumen || {}).map(([clave, valor]) => ({ etiqueta: etiquetaResumen(clave), valor: formatearResumen(clave, valor) }));
}

function formatearCelda(dato, columna, indice) {
    let valor;
    if (columna.campo === "_indice") valor = indice + 1;
    else if (columna.campo === "_periodo") valor = dato.periodo || [dato.dia || dato.semana || dato.mes, dato.anio].filter(Boolean).join(" ");
    else valor = dato[columna.campo];
    if (valor === null || valor === undefined || valor === "") return "—";
    if (columna.formato === "moneda") return "Bs " + Number(valor || 0).toFixed(2);
    if (columna.formato === "numero") return Number(valor || 0).toLocaleString("es-BO");
    return String(valor);
}

function formatearResumen(clave, valor) {
    if (valor === null || valor === undefined || valor === "") return "—";
    if (typeof valor === "number") return ES_MONEDA.test(clave) ? "Bs " + valor.toFixed(2) : valor.toLocaleString("es-BO");
    return String(valor);
}

function etiquetaResumen(clave) {
    return String(clave).replace(/_/g, " ").replace(/([A-Z])/g, " $1").replace(/^./, letra => letra.toUpperCase());
}

function partirTexto(valor, limite) {
    const palabras = String(valor || "—").trim().split(/\s+/).filter(Boolean), lineas = []; let linea = "";
    palabras.forEach((palabra) => {
        while (palabra.length > limite) { if (linea) { lineas.push(linea); linea = ""; } lineas.push(palabra.slice(0, limite)); palabra = palabra.slice(limite); }
        const candidata = linea ? linea + " " + palabra : palabra;
        if (candidata.length > limite && linea) { lineas.push(linea); linea = palabra; } else linea = candidata;
    });
    if (linea) lineas.push(linea);
    return lineas.length ? lineas : ["—"];
}

function crearDocumentoPdf(paginas, ancho, alto) {
    const objetos = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"], referencias = [];
    paginas.forEach((comandos) => {
        const idPagina = objetos.length + 1, idContenido = idPagina + 1, contenido = comandos.join("\n") + "\n";
        referencias.push(`${idPagina} 0 R`);
        objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idContenido} 0 R >>`, `<< /Length ${contenido.length} >>\nstream\n${contenido}endstream`);
    });
    objetos[1] = `<< /Type /Pages /Kids [${referencias.join(" ")}] /Count ${paginas.length} >>`;
    let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"; const offsets = [0];
    objetos.forEach((objeto, indice) => { offsets.push(pdf.length); pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`; });
    const inicioXref = pdf.length;
    pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
    for (let indice = 1; indice < offsets.length; indice += 1) pdf += `${String(offsets[indice]).padStart(10, "0")} 00000 n \n`;
    return new Blob([aBytesPdf(pdf + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`)], { type: "application/pdf" });
}

function escaparTextoPdf(valor) {
    return Array.from(String(valor ?? "")).map((caracter) => {
        if (caracter === "\\" || caracter === "(" || caracter === ")") return "\\" + caracter;
        if (caracter === "−" || caracter === "–" || caracter === "—") return "-";
        return caracter.codePointAt(0) >= 32 && caracter.codePointAt(0) <= 255 ? caracter : "?";
    }).join("");
}

function aBytesPdf(valor) {
    const bytes = new Uint8Array(valor.length);
    for (let indice = 0; indice < valor.length; indice += 1) bytes[indice] = valor.charCodeAt(indice) & 0xff;
    return bytes;
}

function escaparHtml(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[caracter]);
}
