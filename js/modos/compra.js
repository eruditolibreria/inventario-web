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
import { listarProductos, buscarProductoPorCodigo, ultimaCompraProducto } from '../db.js';
import { iniciarEscanerCamara, detenerEscanerCamara } from '../escaner.js';
import { can } from '../authorization.js';

// ── CALLBACKS ─────────────────────────────────────────────────
let _verificarEstadoCaja = null;

export function initCompra(callbacks) {
    if (callbacks.verificarEstadoCaja) _verificarEstadoCaja = callbacks.verificarEstadoCaja;
    if (store.sessionToken) cargarProveedoresCompra();
}


// Muestra/oculta el campo de proveedor segun metodo de pago (CREDITO)
            export function toggleClienteCompra() {
                document.getElementById("campoClienteCompra").classList.toggle("oculto", document.getElementById("metodoPagoCompra").value !== "CREDITO")
            }

let _proveedorFiltroTimer = null;

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
        const opciones = document.getElementById("proveedoresCompraOpciones");
        if (opciones) opciones.innerHTML = (data.datos || [])
            .map(proveedor => `<option value="${escaparProveedor(proveedor.nombre)}"></option>`).join("");
    } catch (_) {}
}

export async function abrirProveedores() {
    if (!can("proveedores.ver")) {
        mostrarMsg("Sin permiso para consultar proveedores", "err");
        return;
    }
    document.getElementById("proveedoresOverlay").style.display = "flex";
    await cargarListaProveedores();
}

export function cerrarProveedores(evento) {
    const overlay = document.getElementById("proveedoresOverlay");
    if (evento && evento.target !== overlay) return;
    overlay.style.display = "none";
}

export function buscarProveedores() {
    clearTimeout(_proveedorFiltroTimer);
    _proveedorFiltroTimer = setTimeout(() => {
        cargarListaProveedores(document.getElementById("proveedoresBusqueda").value);
    }, 250);
}

async function cargarListaProveedores(busqueda = "") {
    const contenido = document.getElementById("proveedoresContenido");
    contenido.innerHTML = "<div style=\"padding:14px;color:var(--text-light)\">Cargando proveedores…</div>";
    try {
        const data = await api({ ACCION: "LISTAR_PROVEEDORES", BUSQUEDA: busqueda, TOKEN: store.sessionToken });
        if (!data.ok) throw new Error(data.error || "No se pudo cargar proveedores.");
        const proveedores = data.datos || [];
        contenido.innerHTML = `<div style="display:flex;gap:8px;margin-bottom:12px"><input id="proveedoresBusqueda" type="search" placeholder="Buscar por nombre, NIT o teléfono" value="${escaparProveedor(busqueda)}" style="flex:1;min-width:0"><button id="btnNuevoProveedor" class="btn btn-primary" type="button" style="width:auto;min-width:0;padding:6px 10px">+ Nuevo</button></div>
            <div style="max-height:52vh;overflow:auto">${proveedores.length ? proveedores.map(proveedor => `<button class="btn btn-ghost proveedor-lista-item" type="button" data-proveedor-id="${escaparProveedor(proveedor.id)}" style="width:100%;text-align:left;margin-bottom:7px;padding:11px"><strong>${escaparProveedor(proveedor.nombre)}</strong><span style="display:block;font-size:12px;color:var(--text-light);margin-top:3px">${escaparProveedor(proveedor.nit || "Sin NIT")} · ${escaparProveedor(proveedor.telefono || "Sin teléfono")}</span></button>`).join("") : "<div style=\"padding:14px;color:var(--text-light)\">No hay proveedores registrados.</div>"}</div>`;
        document.getElementById("proveedoresBusqueda").addEventListener("input", buscarProveedores);
        document.getElementById("btnNuevoProveedor").addEventListener("click", abrirFormularioProveedor);
        contenido.querySelectorAll("[data-proveedor-id]").forEach(boton => {
            boton.addEventListener("click", () => verProveedor(boton.dataset.proveedorId));
        });
    } catch (error) {
        contenido.innerHTML = `<div style="padding:14px;color:var(--danger)">${escaparProveedor(error.message || "No se pudo cargar proveedores.")}</div>`;
    }
}

export function abrirFormularioProveedor() {
    if (!can("proveedores.crear")) {
        mostrarMsg("Sin permiso para registrar proveedores", "err");
        return;
    }
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
    const contenido = document.getElementById("proveedoresContenido");
    contenido.innerHTML = "<div style=\"padding:14px;color:var(--text-light)\">Cargando ficha…</div>";
    try {
        const data = await api({ ACCION: "OBTENER_PROVEEDOR", ID: idProveedor, TOKEN: store.sessionToken });
        if (!data.ok) throw new Error(data.error || "No se pudo cargar la ficha.");
        const proveedor = data.proveedor;
        const compras = data.compras || [], productos = data.productos || [];
        contenido.innerHTML = `<button id="btnVolverListaProveedores" class="btn btn-ghost" type="button" style="width:auto;min-width:0;padding:4px 9px;margin-bottom:12px">← Volver</button>
            <div style="padding-bottom:12px;border-bottom:1px solid var(--border)"><strong style="font-size:18px">${escaparProveedor(proveedor.nombre)}</strong><div style="font-size:13px;color:var(--text-light);margin-top:6px">NIT: ${escaparProveedor(proveedor.nit || "—")} · Contacto: ${escaparProveedor(proveedor.personaContacto || "—")}</div><div style="font-size:13px;color:var(--text-light);margin-top:3px">Teléfono: ${escaparProveedor(proveedor.telefono || "—")} · Dirección: ${escaparProveedor(proveedor.direccion || "—")}</div></div>
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
        const { datos } = await listarProductos({ query: t, sucursal: s, limite: 8 });
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
