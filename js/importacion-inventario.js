const COLUMNAS_REQUERIDAS = ["producto", "sucursal", "stock_inicial", "precio_venta"];

export function normalizarEncabezado(valor) {
    return String(valor ?? "").trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s-]+/g, "_");
}

function texto(fila, columna) {
    const clave = Object.keys(fila).find(encabezado => normalizarEncabezado(encabezado) === columna);
    return clave === undefined ? "" : String(fila[clave] ?? "").trim();
}

function numero(valor) {
    const limpio = String(valor ?? "").trim().replace(",", ".");
    if (!/^-?\d+(?:\.\d+)?$/.test(limpio)) return null;
    const resultado = Number(limpio);
    return Number.isFinite(resultado) ? resultado : null;
}

export function validarEncabezadosImportacion(encabezados) {
    const disponibles = new Set((encabezados || []).map(normalizarEncabezado));
    return COLUMNAS_REQUERIDAS
        .filter(columna => !disponibles.has(columna))
        .map(columna => `Falta la columna obligatoria: ${columna}.`);
}

export function validarFilasImportacion(filas) {
    const items = [];
    const errores = [];
    const productos = new Set();
    const codigos = new Set();

    (filas || []).forEach((fila, indice) => {
        const numeroFila = indice + 2;
        const producto = texto(fila, "producto").toUpperCase();
        const sucursal = texto(fila, "sucursal").toUpperCase();
        const stockInicial = numero(texto(fila, "stock_inicial"));
        const precioVenta = numero(texto(fila, "precio_venta"));
        const costoUnitarioTexto = texto(fila, "costo_unitario");
        const costoUnitario = costoUnitarioTexto ? numero(costoUnitarioTexto) : null;
        const stockMinimoTexto = texto(fila, "stock_minimo");
        const stockMinimo = stockMinimoTexto ? numero(stockMinimoTexto) : 5;
        const fechaEntrada = texto(fila, "fecha_entrada");
        const codigoBarras = texto(fila, "codigo_barras").toUpperCase();
        const erroresFila = [];

        if (!producto) erroresFila.push("producto requerido");
        if (!sucursal) erroresFila.push("sucursal requerida");
        if (stockInicial === null || stockInicial < 0) erroresFila.push("stock_inicial debe ser un número mayor o igual a 0");
        if (precioVenta === null || precioVenta < 0) erroresFila.push("precio_venta debe ser un número mayor o igual a 0");
        if (costoUnitarioTexto && (costoUnitario === null || costoUnitario < 0)) erroresFila.push("costo_unitario inválido");
        if (!Number.isInteger(stockMinimo) || stockMinimo < 0) erroresFila.push("stock_minimo debe ser un entero mayor o igual a 0");
        if (fechaEntrada && !/^\d{4}-\d{2}-\d{2}$/.test(fechaEntrada)) erroresFila.push("fecha_entrada debe tener formato AAAA-MM-DD");

        const claveProducto = `${producto}_${sucursal}`;
        const claveCodigo = codigoBarras ? `${sucursal}_${codigoBarras}` : "";
        if (!erroresFila.length && productos.has(claveProducto)) erroresFila.push("producto repetido para la misma sucursal");
        if (!erroresFila.length && claveCodigo && codigos.has(claveCodigo)) erroresFila.push("código de barras repetido para la misma sucursal");
        if (erroresFila.length) {
            errores.push(`Fila ${numeroFila}: ${erroresFila.join(", ")}.`);
            return;
        }

        productos.add(claveProducto);
        if (claveCodigo) codigos.add(claveCodigo);
        items.push({
            producto,
            sucursal,
            stockInicial,
            precioVenta,
            categoria: texto(fila, "categoria").toUpperCase(),
            costoUnitario,
            codigoBarras,
            proveedor: texto(fila, "proveedor").toUpperCase(),
            ubicacion: texto(fila, "ubicacion").toUpperCase(),
            stockMinimo,
            fechaEntrada: fechaEntrada || null,
        });
    });

    if (!items.length && !errores.length) errores.push("La hoja no contiene filas de inventario.");
    return { items, errores };
}
