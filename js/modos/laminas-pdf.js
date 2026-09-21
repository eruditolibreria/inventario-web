const ESTILO_IMPRESION = `<style>@page{size:letter portrait;margin:12mm}#printArea.laminas-print{padding:0}.laminas-reporte{color:#000;font-family:Arial,sans-serif}.laminas-reporte-encabezado{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px}.print-logo{font-size:16px;font-weight:700}.print-sub,.laminas-reporte-encabezado p{margin:3px 0;font-size:9px;color:#555}.laminas-reporte-encabezado h1{font-size:17px;margin:8px 0 4px}.laminas-reporte-lista{column-count:2;column-gap:18px}.laminas-reporte-lista section{break-inside:avoid;page-break-inside:avoid;margin:0 0 14px}.laminas-reporte-lista h2{font-size:11px;margin:0;padding:5px 7px;background:#eee;border-left:3px solid #000}.laminas-reporte-lista table{width:100%;border-collapse:collapse;margin:0;font-size:9px}.laminas-reporte-lista th{font-size:8px;padding:4px 6px;text-align:left;border-bottom:2px solid #000}.laminas-reporte-lista td{padding:4px 6px;text-align:left;border-bottom:1px solid #ddd}</style>`;

export function construirReporteLaminasSinStock(laminas, sucursal, fecha) {
    const categorias = agruparLaminas(laminas);
    const secciones = [...categorias.entries()].sort(([a], [b]) => a.localeCompare(b, "es"))
        .map(([categoria, items]) => `<section><h2>${escaparHtml(categoria)}</h2><table><thead><tr><th>Lámina</th><th>Ubicación</th></tr></thead><tbody>${items.sort(ordenarTitulo).map((lamina) => `<tr><td>${escaparHtml(lamina.titulo || "Sin título")}</td><td>${escaparHtml(lamina.ubicacion || "—")}</td></tr>`).join("")}</tbody></table></section>`).join("");
    return `${ESTILO_IMPRESION}<section class="laminas-reporte"><header class="laminas-reporte-encabezado"><div class="print-logo">GRUPO ERUDITOS</div><div class="print-sub">Sistema de Inventario</div><h1>Lista de láminas sin stock</h1><p>Sucursal: ${escaparHtml(sucursal)}</p><p>Generado: ${escaparHtml(fecha)} · Total: ${laminas.length}</p></header><main class="laminas-reporte-lista">${secciones}</main></section>`;
}

export function crearArchivoPdfLaminasSinStock(laminas, sucursal, fecha) {
    const margen = 36, ancho = 612, alto = 792, anchoColumna = 258, altoLinea = 11, inicio = 688, pie = 42, columnas = [margen, 318], paginas = [];
    let pagina, columna = 0, y = inicio;
    const texto = (valor, x, posicionY, fuente = "F1", tamano = 9) => pagina.push(`BT /${fuente} ${tamano} Tf ${x} ${posicionY} Td (${escaparTextoPdf(valor)}) Tj ET`);
    const nuevaPagina = () => {
        pagina = []; paginas.push(pagina); columna = 0; y = inicio;
        texto("GRUPO ERUDITOS", margen, 758, "F2", 13);
        texto("Lista de láminas sin stock · " + sucursal, margen, 742, "F2", 11);
        texto("Generado: " + fecha + " · Total: " + laminas.length, margen, 728, "F1", 8);
        pagina.push(`${margen} 716 m ${ancho - margen} 716 l S`);
    };
    const siguienteColumna = () => columna === 0 ? (columna = 1, y = inicio) : nuevaPagina();
    const encabezado = (categoria, continua = false) => {
        if (y - 30 < pie) siguienteColumna();
        const x = columnas[columna];
        pagina.push(`0.94 g ${x} ${y - 15} ${anchoColumna} 16 re f 0 g`);
        texto(continua ? categoria + " (continúa)" : categoria, x + 6, y - 11, "F2", 9); y -= 19;
        texto("LÁMINA", x + 4, y - 8, "F2", 7); texto("UBICACIÓN", x + 177, y - 8, "F2", 7); y -= 12;
    };
    nuevaPagina();
    [...agruparLaminas(laminas).entries()].sort(([a], [b]) => a.localeCompare(b, "es")).forEach(([categoria, items]) => {
        const filas = items.sort(ordenarTitulo).map((lamina) => ({ titulo: partirTexto(lamina.titulo || "Sin título", 27), ubicacion: partirTexto(lamina.ubicacion || "—", 13) }));
        const altoGrupo = 30 + filas.reduce((total, fila) => total + Math.max(fila.titulo.length, fila.ubicacion.length) * altoLinea + 3, 0);
        if (altoGrupo <= inicio - pie && y - altoGrupo < pie) siguienteColumna();
        encabezado(categoria);
        filas.forEach((fila) => {
            const altoFila = Math.max(fila.titulo.length, fila.ubicacion.length) * altoLinea + 3;
            if (y - altoFila < pie) { siguienteColumna(); encabezado(categoria, true); }
            const x = columnas[columna], baseY = y - 9;
            fila.titulo.forEach((linea, indice) => texto(linea, x + 4, baseY - indice * altoLinea));
            fila.ubicacion.forEach((linea, indice) => texto(linea, x + 177, baseY - indice * altoLinea));
            y -= altoFila; pagina.push(`${x} ${y + 2} m ${x + anchoColumna} ${y + 2} l S`);
        });
        y -= 8;
    });
    return crearDocumentoPdf(paginas, ancho, alto);
}

function agruparLaminas(laminas) {
    return laminas.reduce((categorias, lamina) => {
        const categoria = lamina.categoria || "SIN CATEGORÍA";
        if (!categorias.has(categoria)) categorias.set(categoria, []);
        categorias.get(categoria).push(lamina);
        return categorias;
    }, new Map());
}

function ordenarTitulo(a, b) {
    return String(a.titulo || "").localeCompare(String(b.titulo || ""), "es");
}

function partirTexto(valor, limite) {
    const palabras = String(valor || "").trim().split(/\s+/).filter(Boolean);
    if (!palabras.length) return ["—"];
    const lineas = []; let linea = "";
    palabras.forEach((palabra) => {
        while (palabra.length > limite) {
            if (linea) { lineas.push(linea); linea = ""; }
            lineas.push(palabra.slice(0, limite)); palabra = palabra.slice(limite);
        }
        const candidata = linea ? linea + " " + palabra : palabra;
        if (candidata.length > limite && linea) { lineas.push(linea); linea = palabra; } else linea = candidata;
    });
    if (linea) lineas.push(linea);
    return lineas;
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
