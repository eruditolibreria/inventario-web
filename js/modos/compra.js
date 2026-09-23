/* === MODO COMPRA: Busqueda, registro y gestion de proveedores === */

/*
 * Funciones del modulo de compras: autocompletado de productos,
 * registro de compras con calculo de costo unitario, y toggle
 * de proveedor para compras a credito.
 *
 * Dependencias directas (ya modulos):
 *   - ../config.js       (Hoy, horaActual)
 *   - ../store.js        (store)
 *   - ../api.js          (api)
 *   - ../utils.js        (mostrarMsg, hoy)
 *   - ../ui.js           (manejarRespuesta)
 *   - ../inventario.js   (construirAC, cargarInventario)
 *
 * Dependencias inyectadas via initCompra() (modos futuros o navegacion):
 *   - verificarEstadoCaja()
 *
 * Uso:
 *   import { initCompra, buscarProductoCompra, registrarCompra } from './modos/compra.js';
 *   initCompra({ verificarEstadoCaja });
 */

import { store } from '../store.js';
import { api } from '../api.js';
import { mostrarMsg, hoy, normBusqueda, mostrarValorInput, obtenerValorInput, debounce } from '../utils.js';
import { manejarRespuesta } from '../ui.js';
import { construirAC } from '../inventario.js';
import { listarProductos, listarCategoriasInventario, buscarProductoPorCodigo, ultimaCompraProducto } from '../db.js';
import { iniciarEscanerCamara, detenerEscanerCamara } from '../escaner.js';
import { can } from '../authorization.js';

let _categoriasCompra = [];
let _categoriasCompraCargadas = false;
let _cargaCategoriasCompra = null;
let _indiceCategoriaActivo = -1;

// ── CALLBACKS ─────────────────────────────────────────────────
let _verificarEstadoCaja = null;

export function initCompra(callbacks) {
    if (callbacks.verificarEstadoCaja) _verificarEstadoCaja = callbacks.verificarEstadoCaja;
    configurarAutocompletadoProveedorCompra();
    configurarAutocompletadoCategoriaCompra();
    if (store.sessionToken) {
        cargarProveedoresCompra();
        cargarCategoriasCompra();
    }
}

function cargarCategoriasCompra(forzar = false) {
    if (!store.sessionToken || !can("inventario.ver")) return Promise.resolve([]);
    if (!forzar && _categoriasCompraCargadas) return Promise.resolve(_categoriasCompra);
    if (_cargaCategoriasCompra) return _cargaCategoriasCompra;

    _cargaCategoriasCompra = listarCategoriasInventario()
        .then(categorias => {
            _categoriasCompra = categorias;
            _categoriasCompraCargadas = true;
            return categorias;
        })
        .catch(() => _categoriasCompra)
        .finally(() => { _cargaCategoriasCompra = null; });
    return _cargaCategoriasCompra;
}

function configurarAutocompletadoCategoriaCompra() {
    const input = document.getElementById("categoriaCompra");
    const boton = document.getElementById("btnCategoriasCompra");
    if (!input || input.dataset.autocompletadoCategoria === "true") return;
    input.dataset.autocompletadoCategoria = "true";
    input.addEventListener("focus", () => { cargarCategoriasCompra(); });
    input.addEventListener("input", () => {
        ocultarListaCategoriasCompra();
        if (!input.value.trim()) {
            ocultarSugerenciasCategoriaCompra();
            return;
        }
        mostrarSugerenciasCategoriaCompra(input.value);
    });
    input.addEventListener("blur", () => setTimeout(ocultarSugerenciasCategoriaCompra, 120));
    input.addEventListener("keydown", evento => {
        const lista = document.getElementById("listaSugerenciasCategoriasCompra");
        const opciones = lista ? Array.from(lista.querySelectorAll("[data-categoria-nombre]")) : [];
        if (evento.key === "Escape") {
            ocultarSugerenciasCategoriaCompra();
            return;
        }
        if (!opciones.length || !["ArrowDown", "ArrowUp", "Enter"].includes(evento.key)) return;
        if (evento.key === "Enter" && _indiceCategoriaActivo >= 0) {
            evento.preventDefault();
            seleccionarCategoriaCompra(opciones[_indiceCategoriaActivo].dataset.categoriaNombre);
            return;
        }
        if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
            evento.preventDefault();
            const salto = evento.key === "ArrowDown" ? 1 : -1;
            _indiceCategoriaActivo = (_indiceCategoriaActivo + salto + opciones.length) % opciones.length;
            opciones.forEach((opcion, indice) => {
                const activa = indice === _indiceCategoriaActivo;
                opcion.classList.toggle("active", activa);
                opcion.setAttribute("aria-selected", String(activa));
            });
            input.setAttribute("aria-activedescendant", opciones[_indiceCategoriaActivo].id);
        }
    });
    if (!boton) return;
    boton.addEventListener("click", async evento => {
        evento.stopPropagation();
        const lista = document.getElementById("listaCategoriasCompra");
        ocultarSugerenciasCategoriaCompra();
        if (lista?.classList.contains("show")) {
            ocultarListaCategoriasCompra();
            return;
        }
        await cargarCategoriasCompra();
        mostrarListaCategoriasCompra();
    });
}

function mostrarSugerenciasCategoriaCompra(texto = "") {
    const input = document.getElementById("categoriaCompra");
    const lista = document.getElementById("listaSugerenciasCategoriasCompra");
    if (!input || !lista) return;
    const busqueda = normBusqueda(texto);
    if (!busqueda) {
        ocultarSugerenciasCategoriaCompra();
        return;
    }
    const categorias = _categoriasCompra
        .filter(categoria => normBusqueda(categoria).includes(busqueda))
        .slice(0, 8);

    ocultarListaCategoriasCompra();
    _indiceCategoriaActivo = -1;
    renderizarListaCategoriasCompra(lista, categorias);
    input.setAttribute("aria-expanded", String(categorias.length > 0));
}

function mostrarListaCategoriasCompra() {
    const boton = document.getElementById("btnCategoriasCompra");
    const lista = document.getElementById("listaCategoriasCompra");
    if (!boton || !lista) return;
    renderizarListaCategoriasCompra(lista, _categoriasCompra);
    boton.setAttribute("aria-expanded", String(_categoriasCompra.length > 0));
}

function renderizarListaCategoriasCompra(lista, categorias) {
    lista.innerHTML = "";
    categorias.forEach((categoria, indice) => {
        const opcion = document.createElement("div");
        opcion.id = lista.id + "-opcion-" + indice;
        opcion.className = "ac-item";
        opcion.setAttribute("role", "option");
        opcion.setAttribute("aria-selected", "false");
        opcion.dataset.categoriaNombre = categoria;
        const nombre = document.createElement("strong");
        nombre.textContent = categoria;
        opcion.appendChild(nombre);
        opcion.addEventListener("mousedown", evento => {
            evento.preventDefault();
            seleccionarCategoriaCompra(categoria);
        });
        lista.appendChild(opcion);
    });
    lista.classList.toggle("show", categorias.length > 0);
}

function ocultarSugerenciasCategoriaCompra() {
    const input = document.getElementById("categoriaCompra");
    const lista = document.getElementById("listaSugerenciasCategoriasCompra");
    _indiceCategoriaActivo = -1;
    if (lista) lista.classList.remove("show");
    if (input) {
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
    }
}

function ocultarListaCategoriasCompra() {
    const boton = document.getElementById("btnCategoriasCompra");
    const lista = document.getElementById("listaCategoriasCompra");
    if (lista) lista.classList.remove("show");
    if (boton) boton.setAttribute("aria-expanded", "false");
}

function seleccionarCategoriaCompra(categoria) {
    const input = document.getElementById("categoriaCompra");
    if (!input) return;
    input.value = categoria || "";
    ocultarSugerenciasCategoriaCompra();
    ocultarListaCategoriasCompra();
    input.focus();
}


// Muestra/oculta el campo de proveedor segun metodo de pago (CREDITO)
            export function toggleClienteCompra() {
                document.getElementById("campoClienteCompra").classList.toggle("oculto", document.getElementById("metodoPagoCompra").value !== "CREDITO")
            }

let _proveedorFiltroTimer = null;
let _proveedorBusquedaVersion = 0;
let _proveedoresCompra = [];
let _indiceProveedorActivo = -1;

function escaparProveedor(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[caracter]);
}

export async function cargarProveedoresCompra() {
    if (!store.sessionToken || !can("proveedores.ver")) return;
    try {
        const data = await api({ ACCION: "LISTAR_PROVEEDORES", SOLO_ACTIVOS: true, TOKEN: store.sessionToken });
        if (!data.ok) return;
        _proveedoresCompra = data.datos || [];
        const input = document.getElementById("proveedorCompra");
        if (input && document.activeElement === input) mostrarSugerenciasProveedorCompra(input.value);
    } catch (_) {}
}

function configurarAutocompletadoProveedorCompra() {
    const input = document.getElementById("proveedorCompra");
    if (!input || input.dataset.autocompletadoProveedor === "true") return;
    input.dataset.autocompletadoProveedor = "true";
    input.addEventListener("focus", () => mostrarSugerenciasProveedorCompra(input.value));
    input.addEventListener("input", () => mostrarSugerenciasProveedorCompra(input.value));
    input.addEventListener("blur", () => setTimeout(ocultarSugerenciasProveedorCompra, 120));
    input.addEventListener("keydown", evento => {
        const opciones = Array.from(document.querySelectorAll("#listaProveedoresCompra [data-proveedor-nombre]"));
        if (evento.key === "Escape") {
            ocultarSugerenciasProveedorCompra();
            return;
        }
        if (!opciones.length || !["ArrowDown", "ArrowUp", "Enter"].includes(evento.key)) return;
        if (evento.key === "Enter" && _indiceProveedorActivo >= 0) {
            evento.preventDefault();
            seleccionarProveedorCompra(opciones[_indiceProveedorActivo].dataset.proveedorNombre);
            return;
        }
        if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
            evento.preventDefault();
            const salto = evento.key === "ArrowDown" ? 1 : -1;
            _indiceProveedorActivo = (_indiceProveedorActivo + salto + opciones.length) % opciones.length;
            opciones.forEach((opcion, indice) => opcion.classList.toggle("active", indice === _indiceProveedorActivo));
            input.setAttribute("aria-activedescendant", opciones[_indiceProveedorActivo].id);
        }
    });
}

function mostrarSugerenciasProveedorCompra(texto = "") {
    const input = document.getElementById("proveedorCompra");
    const lista = document.getElementById("listaProveedoresCompra");
    if (!input || !lista) return;
    const busqueda = normBusqueda(texto);
    const proveedores = _proveedoresCompra.filter(proveedor =>
        [proveedor.nombre, proveedor.personaContacto, proveedor.telefono, proveedor.direccion]
            .some(valor => normBusqueda(valor).includes(busqueda))
    ).slice(0, 8);
    _indiceProveedorActivo = -1;
    lista.innerHTML = proveedores.map((proveedor, indice) =>
        `<div id="proveedor-compra-opcion-${indice}" class="ac-item" role="option" data-proveedor-nombre="${escaparProveedor(proveedor.nombre)}"><strong>${escaparProveedor(proveedor.nombre)}</strong><small>${escaparProveedor(proveedor.personaContacto || "Sin contacto")} · ${escaparProveedor(proveedor.telefono || "Sin celular")}</small></div>`
    ).join("");
    lista.querySelectorAll("[data-proveedor-nombre]").forEach(opcion => {
        opcion.addEventListener("mousedown", evento => {
            evento.preventDefault();
            seleccionarProveedorCompra(opcion.dataset.proveedorNombre);
        });
    });
    lista.classList.toggle("show", proveedores.length > 0);
    input.setAttribute("aria-expanded", String(proveedores.length > 0));
}

function ocultarSugerenciasProveedorCompra() {
    const input = document.getElementById("proveedorCompra");
    const lista = document.getElementById("listaProveedoresCompra");
    if (lista) lista.classList.remove("show");
    if (input) {
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
    }
    _indiceProveedorActivo = -1;
}

function seleccionarProveedorCompra(nombre) {
    const input = document.getElementById("proveedorCompra");
    if (input) input.value = nombre || "";
    ocultarSugerenciasProveedorCompra();
}

export async function abrirProveedores() {
    if (!can("proveedores.ver")) {
        mostrarMsg("Sin permiso para consultar proveedores", "err");
        return;
    }
    document.getElementById("proveedoresOverlay").style.display = "flex";
    clearTimeout(_proveedorFiltroTimer);
    const buscador = document.getElementById("proveedoresBusqueda");
    if (buscador) buscador.value = "";
    await cargarListaProveedores("");
}

export function cerrarProveedores(evento) {
    const overlay = document.getElementById("proveedoresOverlay");
    if (evento && evento.target !== overlay) return;
    overlay.style.display = "none";
}

export function buscarProveedores() {
    clearTimeout(_proveedorFiltroTimer);
    const version = ++_proveedorBusquedaVersion;
    const busqueda = document.getElementById("proveedoresBusqueda").value;
    _proveedorFiltroTimer = setTimeout(() => {
        cargarListaProveedores(busqueda, version);
    }, 250);
}

function renderizarListaProveedores() {
    const contenido = document.getElementById("proveedoresContenido");
    if (document.getElementById("proveedoresBusqueda")) return;
    contenido.innerHTML = `<div style="display:flex;gap:8px;margin-bottom:12px"><input id="proveedoresBusqueda" type="search" placeholder="Buscar por nombre, NIT o teléfono" style="flex:1;min-width:0"><button id="btnNuevoProveedor" class="btn btn-primary" type="button" style="width:auto;min-width:0;padding:6px 10px">+ Nuevo</button></div><div id="proveedoresResultados" style="max-height:52vh;overflow:auto"></div>`;
    document.getElementById("proveedoresBusqueda").addEventListener("input", buscarProveedores);
    document.getElementById("btnNuevoProveedor").addEventListener("click", abrirFormularioProveedor);
}

async function cargarListaProveedores(busqueda = "", version = ++_proveedorBusquedaVersion) {
    renderizarListaProveedores();
    const resultados = document.getElementById("proveedoresResultados");
    resultados.innerHTML = "<div style=\"padding:14px;color:var(--text-light)\">Cargando proveedores…</div>";
    try {
        const data = await api({ ACCION: "LISTAR_PROVEEDORES", BUSQUEDA: busqueda, TOKEN: store.sessionToken });
        if (version !== _proveedorBusquedaVersion) return;
        if (!data.ok) throw new Error(data.error || "No se pudo cargar proveedores.");
        const proveedores = data.datos || [];
        resultados.innerHTML = proveedores.length ? proveedores.map(proveedor => `<button class="btn btn-ghost proveedor-lista-item" type="button" data-proveedor-id="${escaparProveedor(proveedor.id)}" style="width:100%;text-align:left;margin-bottom:7px;padding:11px"><strong>${escaparProveedor(proveedor.nombre)}</strong><span style="display:block;font-size:12px;color:var(--text-light);margin-top:3px">Contacto: ${escaparProveedor(proveedor.personaContacto || "—")} · Celular: ${escaparProveedor(proveedor.telefono || "—")}</span><span style="display:block;font-size:12px;color:var(--text-light);margin-top:3px">Dirección: ${escaparProveedor(proveedor.direccion || "—")}</span></button>`).join("") : "<div style=\"padding:14px;color:var(--text-light)\">No hay proveedores registrados.</div>";
        resultados.querySelectorAll("[data-proveedor-id]").forEach(boton => {
            boton.addEventListener("click", () => verProveedor(boton.dataset.proveedorId));
        });
    } catch (error) {
        if (version === _proveedorBusquedaVersion) resultados.innerHTML = `<div style="padding:14px;color:var(--danger)">${escaparProveedor(error.message || "No se pudo cargar proveedores.")}</div>`;
    }
}

export function abrirFormularioProveedor() {
    if (!can("proveedores.crear")) {
        mostrarMsg("Sin permiso para registrar proveedores", "err");
        return;
    }
    clearTimeout(_proveedorFiltroTimer);
    ++_proveedorBusquedaVersion;
    document.getElementById("proveedoresOverlay").style.display = "flex";
    const contenido = document.getElementById("proveedoresContenido");
    contenido.innerHTML = `<div class="field-group" style="margin-bottom:10px"><label class="field-label">Nombre comercial</label><input id="proveedorNombre" autocomplete="organization" placeholder="Ej: Distribuidora Andina"></div>
        <div class="row-2"><div class="field-group" style="margin-bottom:10px"><label class="field-label">NIT</label><input id="proveedorNit" inputmode="numeric" placeholder="Opcional"></div><div class="field-group" style="margin-bottom:10px"><label class="field-label">Teléfono</label><input id="proveedorTelefono" inputmode="tel" placeholder="Opcional"></div></div>
        <div class="field-group" style="margin-bottom:10px"><label class="field-label">Persona de contacto</label><input id="proveedorContacto" placeholder="Opcional"></div>
        <div class="field-group" style="margin-bottom:16px"><label class="field-label">Dirección</label><textarea id="proveedorDireccion" rows="3" placeholder="Opcional"></textarea></div>
        <div id="proveedorFormularioResultado" aria-live="polite" style="min-height:20px;margin-bottom:10px;color:var(--danger);font-size:13px"></div>
        <div class="row-2"><button id="btnGuardarProveedor" class="btn btn-primary" type="button">Guardar proveedor</button><button id="btnVolverProveedores" class="btn btn-ghost" type="button">Volver</button></div>`;
    document.getElementById("btnGuardarProveedor").addEventListener("click", guardarProveedor);
    document.getElementById("btnVolverProveedores").addEventListener("click", abrirProveedores);
    document.getElementById("proveedorNombre").focus();
}

export async function guardarProveedor() {
    const resultado = document.getElementById("proveedorFormularioResultado");
    const boton = document.getElementById("btnGuardarProveedor");
    const nombre = document.getElementById("proveedorNombre").value.trim();
    if (!nombre) {
        resultado.textContent = "Ingresa el nombre comercial.";
        return;
    }
    boton.disabled = true;
    resultado.textContent = "Guardando proveedor…";
    try {
        const data = await api({
            ACCION: "CREAR_PROVEEDOR", NOMBRE: nombre,
            NIT: document.getElementById("proveedorNit").value.trim(),
            TELEFONO: document.getElementById("proveedorTelefono").value.trim(),
            PERSONA_CONTACTO: document.getElementById("proveedorContacto").value.trim(),
            DIRECCION: document.getElementById("proveedorDireccion").value.trim(),
            TOKEN: store.sessionToken
        });
        if (!data.ok) throw new Error(data.error || "No se pudo registrar el proveedor.");
        document.getElementById("proveedorCompra").value = data.proveedor.nombre;
        await cargarProveedoresCompra();
        mostrarMsg("✅ Proveedor registrado", "ok");
        await abrirProveedores();
    } catch (error) {
        resultado.textContent = error.message || "No se pudo registrar el proveedor.";
    } finally {
        boton.disabled = false;
    }
}

async function verProveedor(idProveedor) {
    clearTimeout(_proveedorFiltroTimer);
    ++_proveedorBusquedaVersion;
    const contenido = document.getElementById("proveedoresContenido");
    contenido.innerHTML = "<div style=\"padding:14px;color:var(--text-light)\">Cargando ficha…</div>";
    try {
        const data = await api({ ACCION: "OBTENER_PROVEEDOR", ID: idProveedor, TOKEN: store.sessionToken });
        if (!data.ok) throw new Error(data.error || "No se pudo cargar la ficha.");
        const proveedor = data.proveedor;
        const compras = data.compras || [], productos = data.productos || [];
        contenido.innerHTML = `<button id="btnVolverListaProveedores" class="btn btn-ghost" type="button" style="width:auto;min-width:0;padding:4px 9px;margin-bottom:12px">← Volver</button>
            <div style="padding-bottom:12px;border-bottom:1px solid var(--border)"><strong style="font-size:18px">${escaparProveedor(proveedor.nombre)}</strong><div style="font-size:13px;color:var(--text-light);margin-top:6px">NIT: ${escaparProveedor(proveedor.nit || "—")} · Contacto: ${escaparProveedor(proveedor.personaContacto || "—")}</div><div style="font-size:13px;color:var(--text-light);margin-top:3px">Celular: ${escaparProveedor(proveedor.telefono || "—")} · Dirección: ${escaparProveedor(proveedor.direccion || "—")}</div></div>
            <div style="margin-top:14px"><strong>Productos actuales (${productos.length})</strong>${productos.length ? `<div style="margin-top:6px;font-size:13px">${productos.map(producto => `<div style="padding:6px 0;border-bottom:1px solid var(--border)">${escaparProveedor(producto.producto)} · ${escaparProveedor(producto.sucursal)} · Stock: ${Number(producto.stock)}</div>`).join("")}</div>` : "<div style=\"margin-top:6px;font-size:13px;color:var(--text-light)\">Sin productos asociados.</div>"}</div>
            <div style="margin-top:16px"><strong>Compras registradas (${compras.length})</strong>${compras.length ? `<div style="margin-top:6px;font-size:13px">${compras.map(compra => `<div style="padding:6px 0;border-bottom:1px solid var(--border)">${escaparProveedor(compra.fecha)} · ${escaparProveedor(compra.producto)} · ${Number(compra.unidades)} unid. · Bs ${Number(compra.total).toFixed(2)}</div>`).join("")}</div>` : "<div style=\"margin-top:6px;font-size:13px;color:var(--text-light)\">Sin compras asociadas.</div>"}</div>`;
        document.getElementById("btnVolverListaProveedores").addEventListener("click", abrirProveedores);
    } catch (error) {
        contenido.innerHTML = `<div style="padding:14px;color:var(--danger)">${escaparProveedor(error.message || "No se pudo cargar la ficha.")}</div>`;
    }
}

// Busca productos en inventario para autocompletar en la compra
// (paginado server-side con debounce de 300ms; RLS aplica)
// Al seleccionar, precarga todos los datos del producto + los de su ultima compra
const _compraAcBuscar = debounce(async function(t, s, l, info) {
    try {
        const { datos } = await listarProductos({ query: t, sucursal: s, limite: 8, contar: false });
        construirAC(l, datos, async p => {
            document.getElementById("productoCompra").value = p.producto;
            document.getElementById("categoriaCompra").value = p.categoria || "";
            mostrarValorInput(document.getElementById("precioVentaCompra"), p.precio);
            document.getElementById("proveedorCompra").value = p.proveedor || "";
            document.getElementById("ubicacionCompra").value = p.ubicacion || "";
            await precargarUltimaCompra(p.producto, s);
            info.textContent = "Stock actual: " + p.stock;
            info.classList.add("show")
        });
    } catch (_) {}
}, 300);

// Prellena costo paquete, cant. paquetes, unid. x paquete (y proveedor si falta)
// con los valores de la ultima compra registrada del producto
async function precargarUltimaCompra(producto, sucursal) {
    const limpiar = () => {
        document.getElementById("costoCompra").value = "";
        document.getElementById("cantidadCompra").value = "";
        document.getElementById("unidadesCompra").value = "";
    };
    try {
        const uc = await ultimaCompraProducto(producto, sucursal);
        if (!uc) { limpiar(); return; }
        mostrarValorInput(document.getElementById("costoCompra"), Number(uc.costo_paquete || 0));
        document.getElementById("cantidadCompra").value = uc.cant_paquete != null ? uc.cant_paquete : "";
        document.getElementById("unidadesCompra").value = uc.unid_paquete != null ? uc.unid_paquete : "";
        if (!document.getElementById("proveedorCompra").value.trim()) {
            document.getElementById("proveedorCompra").value = uc.proveedor || "";
        }
    } catch (_) {
        limpiar();
    }
}

export function buscarProductoCompra() {
    const t = normBusqueda(document.getElementById("productoCompra").value)
      , s = document.getElementById("sucursalCompra").value
      , l = document.getElementById("listaCompra")
      , info = document.getElementById("infoCompra");
    info.classList.remove("show");
    if (t.length < 1) {
        l.classList.remove("show");
        return
    }
    _compraAcBuscar(t, s, l, info)
}

// Registra una compra de mercaderia con validaciones
            export async function registrarCompra() {
                if (!store.sessionToken) {
                    mostrarMsg("Sesión expirada", "err");
                    return
                }
                const mp = document.getElementById("metodoPagoCompra").value
                  , cl = document.getElementById("clienteCompra").value || document.getElementById("proveedorCompra").value;
                if (mp === "CREDITO" && !document.getElementById("proveedorCompra").value.trim()) {
                    mostrarMsg("Ingresa el nombre del proveedor/acreedor para compras a crédito", "err");
                    return
                }
                const loader = document.getElementById("loaderCompra");
                loader.style.display = "block";
                try {
                    const data = await api({
                        ACCION: "COMPRA",
                        PRODUCTO: document.getElementById("productoCompra").value,
                        CATEGORIA: document.getElementById("categoriaCompra").value,
                        COSTO_PAQUETE: obtenerValorInput(document.getElementById("costoCompra")),
                        CANTIDAD_PAQUETE: document.getElementById("cantidadCompra").value,
                        UNIDADES_PAQUETE: document.getElementById("unidadesCompra").value,
                        PRECIO_VENTA: obtenerValorInput(document.getElementById("precioVentaCompra")),
                        PROVEEDOR: document.getElementById("proveedorCompra").value,
                        FECHA_ENTRADA: document.getElementById("fechaCompra").value,
                        UBICACION_PRODUCTO: document.getElementById("ubicacionCompra").value,
                        SUCURSAL: document.getElementById("sucursalCompra").value,
                        METODO_PAGO: mp,
                        CLIENTE: cl,
                        CODIGO_BARRAS: document.getElementById("codigoBarrasCompra").value.trim(),
                        TOKEN: store.sessionToken
                    });
                    if (!manejarRespuesta(data)) {
                        loader.style.display = "none";
                        return
                    }
                    if (data.ok) {
                        mostrarMsg(mp === "CREDITO" ? "📝 Compra a crédito registrada" : "✅ Compra registrada", "ok");
                        cargarCategoriasCompra(true);
                        document.querySelectorAll("#seccion-COMPRA input").forEach(i => i.value = "");
                        document.getElementById("categoriaCompra").value = "";
                        document.getElementById("metodoPagoCompra").value = "EFECTIVO";
                        toggleClienteCompra();
                        document.getElementById("fechaCompra").value = hoy();
                        if (_verificarEstadoCaja) _verificarEstadoCaja();
                    } else {
                        mostrarMsg("Error: " + (data.error || JSON.stringify(data)), "err")
                    }
                } catch (e) {
                    mostrarMsg("Error de conexión", "err")
                }
                loader.style.display = "none";
            }

export async function abrirEscanerCompra() {
    const modal = document.getElementById("escanerModal");
    const video = document.getElementById("escanerVideo");
    const estado = document.getElementById("escanerEstado");
    modal.style.display = "flex";
    estado.textContent = "Apuntando cámara...";
    try {
        const codigo = await iniciarEscanerCamara(video);
        const suc = document.getElementById("sucursalCompra").value;
        const p = await buscarProductoPorCodigo(codigo, suc);
        if (p) {
            document.getElementById("productoCompra").value = p.producto || "";
            document.getElementById("categoriaCompra").value = p.categoria || "";
            mostrarValorInput(document.getElementById("precioVentaCompra"), p.precio);
            document.getElementById("codigoBarrasCompra").value = p.codigoBarras || codigo;
            document.getElementById("proveedorCompra").value = p.proveedor || "";
            document.getElementById("ubicacionCompra").value = p.ubicacion || "";
            await precargarUltimaCompra(p.producto, suc);
            mostrarMsg("Producto encontrado: " + p.producto + " | Stock: " + (p.stock || 0), "ok");
        } else {
            document.getElementById("codigoBarrasCompra").value = codigo;
            mostrarMsg("Producto nuevo (" + codigo + "). Completa los datos y registra.", "ok");
        }
    } catch(e) {
        if (e.message !== "NO_SOPORTADO") mostrarMsg("Error de cámara", "err");
    }
    detenerEscanerCamara();
    modal.style.display = "none";
}

// ── Init: main.js llamara initCompra() en fase 5 ──────────────
