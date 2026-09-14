/* === SUCURSALES: selector global y listas compartidas === */

import { store, setSucursalActiva } from './store.js';
import { api } from './api.js';
import { mostrarMsg } from './utils.js';
import { can } from './authorization.js';

let sucursalesCache = [];
let sucursalesActualizadasEn = 0;
let cargaSucursalesPromise = null;
const CACHE_SUCURSALES_MS = 60 * 1000;

export const escaparSucursal = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const nombreSucursal = sucursal => sucursal.nombre_visible || sucursal.nombre;
export const obtenerSucursalesCache = () => sucursalesCache;

function renderSelectorSucursalActiva(sucursales) {
    const activas = sucursales.filter(sucursal => sucursal.estado === "ACTIVO");
    const badge = document.querySelector(".user-badge");
    if (!badge || activas.length === 0) return;
    let contenedor = document.getElementById("selectorSucursalActiva");
    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.id = "selectorSucursalActiva";
        contenedor.style.cssText = "min-width:150px;max-width:220px";
        badge.parentElement.insertBefore(contenedor, badge);
    }
    const esAdministrador = store.sessionRol === "ADMIN" || can("usuarios.asignar_roles_criticos");
    if (esAdministrador) {
        contenedor.innerHTML = '<span class="selector-sucursal-etiqueta">Sucursales</span><span class="selector-sucursal-todas">TODAS</span>';
        return;
    }
    if (!contenedor.querySelector("select")) {
        contenedor.innerHTML = '<label for="sucursalActivaGlobal" class="selector-sucursal-etiqueta">Sucursal actual</label><select id="sucursalActivaGlobal" aria-label="Sucursal actual"></select>';
        if (!contenedor.dataset.detieneCierreSesion) {
            contenedor.addEventListener("click", evento => evento.stopPropagation());
            contenedor.dataset.detieneCierreSesion = "true";
        }
    }
    const select = contenedor.querySelector("select");
    select.onchange = evento => {
        const sucursal = evento.target.value;
        if (!setSucursalActiva(sucursal)) {
            mostrarMsg("No tienes acceso a esa sucursal", "err");
            evento.target.value = store.sessionSucursal || "";
            return;
        }
        document.querySelectorAll("select[id*='Sucursal']:not(#sucursalActivaGlobal), select#sucursalVenta, select#sucursalCompra, select#sucursalGasto")
            .forEach(selectModulo => {
                if ([...selectModulo.options].some(opcion => opcion.value === store.sessionSucursal)) selectModulo.value = store.sessionSucursal;
            });
        window.dispatchEvent(new CustomEvent("eruditos:sucursal-cambiada", { detail: { sucursal: store.sessionSucursal } }));
        mostrarMsg("Sucursal actual: " + store.sessionSucursal, "ok");
    };
    select.innerHTML = activas.map(sucursal => `<option value="${escaparSucursal(sucursal.nombre)}">${escaparSucursal(nombreSucursal(sucursal))}</option>`).join("");
    const seleccion = activas.some(sucursal => sucursal.nombre === store.sessionSucursal)
        ? store.sessionSucursal
        : activas[0].nombre;
    select.value = seleccion;
    if (seleccion !== store.sessionSucursal) setSucursalActiva(seleccion);
}

function aplicarSucursalesEnDropdowns(sucursales) {
    const selects = document.querySelectorAll("select[id$='Sucursal']:not(#sucursalActivaGlobal), select[id*='Sucursal']:not(#sucursalActivaGlobal):not(#nuevoUsuarioSucursales), select#sucursalVenta, select#sucursalCompra, select#sucursalGasto, select#transfOrigen, select#transfDestino, select#filtroTransfOrigen, select#filtroTransfDestino");
    selects.forEach(function(sel) {
        if (sel.disabled) return;
        const actual = sel.value;
        while (sel.options.length > 0) sel.remove(0);
        const esFiltroSucursal = ["filtroInvSucursal", "filtroTransfOrigen", "filtroTransfDestino", "auditoriaSucursal"].includes(sel.id);
        sel.add(new Option(esFiltroSucursal ? "Todas las sucursales" : "🏪 Seleccionar sucursal", ""));
        sucursales.forEach(function(s) {
            if (s.estado === "ACTIVO") sel.add(new Option(nombreSucursal(s), s.nombre));
        });
        if ([...sel.options].some(opcion => opcion.value === actual)) sel.value = actual;
    });
    const sucursalesUsuario = document.getElementById("nuevoUsuarioSucursales");
    if (sucursalesUsuario) {
        sucursalesUsuario.innerHTML = sucursales.filter(s => s.estado === "ACTIVO").map(s => `<option value="${escaparSucursal(s.id)}">${escaparSucursal(nombreSucursal(s))}</option>`).join("");
        sucursalesUsuario.disabled = !can("usuarios.cambiar_sucursales");
    }
    const accesoGlobal = document.getElementById("nuevoUsuarioAccesoGlobal");
    if (accesoGlobal) accesoGlobal.disabled = !can("usuarios.asignar_roles_criticos");
    renderSelectorSucursalActiva(sucursales);
}

export function invalidarSucursalesCache() {
    sucursalesActualizadasEn = 0;
}

export async function cargarSucursalesEnDropdowns(forzar = false) {
    if (!store.sessionToken) return [];
    const vigente = sucursalesCache.length > 0 && Date.now() - sucursalesActualizadasEn < CACHE_SUCURSALES_MS;
    if (!forzar && vigente) {
        aplicarSucursalesEnDropdowns(sucursalesCache);
        return sucursalesCache;
    }
    if (cargaSucursalesPromise) return cargaSucursalesPromise;
    cargaSucursalesPromise = (async () => {
        try {
            const data = await api({ ACCION: "LISTAR_SUCURSALES", TOKEN: store.sessionToken });
            if (!data.ok) return [];
            sucursalesCache = data.datos || [];
            sucursalesActualizadasEn = Date.now();
            aplicarSucursalesEnDropdowns(sucursalesCache);
            return sucursalesCache;
        } catch (_) { return []; }
        finally { cargaSucursalesPromise = null; }
    })();
    return cargaSucursalesPromise;
}
