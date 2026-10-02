import { store } from './store.js';
import { modosAutorizados } from './authorization.js';

const FAVORITOS_INICIALES = ['VENTA', 'BUSQUEDA', 'CLIENTES', 'LAMINAS'];
const GRUPOS = [
    ['Ventas', ['VENTA', 'CLIENTES', 'CLUB', 'DEVOLUCIONES']],
    ['Caja y finanzas', ['CAJA', 'GASTO', 'ARQUEO', 'CUENTAS', 'REPORTES']],
    ['Productos', ['BUSQUEDA', 'INVENTARIO', 'COMPRA', 'TRANSFERENCIAS']],
    ['Servicios', ['SERVICIOS', 'LAMINAS']],
    ['Administración', ['USUARIOS', 'AUDITORIA']]
];
const MODOS = GRUPOS.flatMap(([, modos]) => modos);

function claveFavoritos() {
    const usuario = store.sessionUsuarioId || (store.sessionUser ? 'usuario:' + store.sessionUser : null);
    return usuario ? 'eruditos_favoritos_mobile:v1:' + encodeURIComponent(usuario) : null;
}

function normalizarFavoritos(valor) {
    return [...new Set(valor.filter(modo => MODOS.includes(modo)))].slice(0, 4);
}

function leerFavoritos() {
    try {
        const clave = claveFavoritos();
        const guardados = clave ? JSON.parse(localStorage.getItem(clave)) : null;
        if (Array.isArray(guardados)) return normalizarFavoritos(guardados);
    } catch (_) {}
    return [...FAVORITOS_INICIALES];
}

export function initMobileNavigation(abrirModo) {
    const nav = document.querySelector('.mode-tabs');
    if (!nav || document.body.classList.contains('desktop')) return null;
    const tabs = new Map(MODOS.map(modo => [modo, document.getElementById('tab-' + modo)]).filter(([, tab]) => tab));
    const nombre = modo => tabs.get(modo).getAttribute('aria-label');
    const estilos = document.createElement('style');
    estilos.textContent = `body:not(.desktop) .mode-tabs.mobile-favorites-nav{left:50%;right:auto;bottom:calc(12px + env(safe-area-inset-bottom));transform:translateX(-50%);width:calc(100% - 24px);max-width:584px;justify-content:center;gap:2px;overflow:hidden;padding:6px;border:1px solid var(--border);border-radius:24px;background:var(--surface);box-shadow:0 8px 28px #0003}body.mobile-floating-nav .panel-body{max-height:calc(100dvh - 190px - env(safe-area-inset-bottom));padding-bottom:calc(100px + env(safe-area-inset-bottom));scroll-padding-bottom:calc(100px + env(safe-area-inset-bottom))}.mobile-favorites-nav #navIndicator{display:none}body:not(.desktop) .mobile-favorites-nav .mode-tab{flex:0 1 112px;min-width:0;width:20%;min-height:52px;padding:6px 2px;font:600 11px var(--font);background:transparent;border:0;border-radius:18px;color:var(--muted)}body:not(.desktop) .mobile-favorites-nav .mode-tab.active{color:var(--accent-text);background:var(--accent-dim)}.mobile-favorites-nav .nav-label{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mobile-favorites-nav .tab-icon{width:24px;margin:0 auto 2px}.mobile-favorites-nav .tab-icon svg{width:18px;height:18px;fill:currentColor}.mobile-favorites-nav button:focus-visible,.mobile-modules button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}.mobile-modules{inset:auto 0 0;margin:0 auto;width:min(640px,100%);max-width:100%;max-height:85dvh;overflow:auto;overscroll-behavior:contain;padding:16px 16px calc(16px + env(safe-area-inset-bottom));border:1px solid var(--border);border-radius:20px 20px 0 0;background:var(--surface);color:var(--text);font:14px var(--font)}.mobile-modules::backdrop{background:#0008}.mobile-modules [hidden]{display:none!important}.mobile-modules-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.mobile-modules h2{font-size:20px;margin:0}.mobile-modules h3{font-size:14px;margin:16px 0 8px}.mobile-modules p{line-height:1.4}.mobile-modules button{min-height:44px;cursor:pointer}.mobile-modules-close{width:44px;border:0;border-radius:8px;background:var(--surface2);color:var(--text);font-size:24px}.mobile-modules input[type=search]{width:100%;min-height:44px;padding:10px;margin:12px 0;border:1px solid var(--border);border-radius:10px;background:var(--surface2);color:var(--text);font:inherit}.mobile-modules-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mobile-module-choice{display:flex;align-items:center;gap:8px;padding:10px;min-width:0;border:1px solid var(--border);border-radius:10px;background:var(--surface2);color:var(--text);font:600 13px var(--font);text-align:left;overflow-wrap:anywhere}.mobile-module-choice .tab-icon{flex:none}.mobile-module-choice.active{border-color:var(--accent);background:var(--accent-dim)}.mobile-module-choice input{flex:none;width:20px;height:20px;accent-color:var(--accent)}.mobile-module-choice:has(input:disabled){opacity:.6}.mobile-modules-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.mobile-modules-actions .btn{flex:1;min-width:100px}.mobile-favorite-row{display:flex;align-items:center;gap:8px;margin-top:6px}.mobile-favorite-row span{flex:1;min-width:0;overflow-wrap:anywhere}.mobile-favorite-row button{flex:none;width:44px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text)}.mobile-favorite-row button:disabled{opacity:.4}.mobile-favorite-count{font-weight:600}.mobile-favorite-error{color:var(--red)}`;
    document.head.appendChild(estilos);
    const reserva = document.createElement('div');
    reserva.hidden = true;
    nav.after(reserva);
    const mas = document.createElement('button');
    mas.type = 'button';
    mas.className = 'mode-tab';
    mas.id = 'mobileModulesBtn';
    mas.setAttribute('aria-haspopup', 'dialog');
    mas.setAttribute('aria-controls', 'mobileModulesDialog');
    mas.setAttribute('aria-expanded', 'false');
    mas.innerHTML = '<span class="tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/></svg></span><span class="nav-label">Módulos</span>';
    const dialogo = document.createElement('dialog');
    dialogo.id = 'mobileModulesDialog';
    dialogo.className = 'mobile-modules';
    dialogo.setAttribute('aria-labelledby', 'mobileModulesTitle');
    dialogo.innerHTML = '<div class="mobile-modules-head"><h2 id="mobileModulesTitle">Módulos</h2><button type="button" class="mobile-modules-close" aria-label="Cerrar módulos">×</button></div><div id="mobileModulesBrowse"><p id="mobileModulesCurrent"></p><input id="mobileModulesSearch" type="search" placeholder="Buscar módulo…" aria-label="Buscar módulo"><div class="mobile-modules-actions"><button type="button" class="btn btn-ghost" id="mobileFavoritesCustomize">Personalizar favoritos</button></div><div id="mobileModulesList"></div></div><div id="mobileFavoritesEdit" hidden><p>Elige hasta 4 favoritos y cambia su orden con las flechas.</p><p id="mobileFavoritesCount" class="mobile-favorite-count" role="status"></p><div id="mobileFavoritesSelected"></div><h3>Módulos disponibles</h3><div id="mobileFavoritesChoices" class="mobile-modules-grid"></div><p id="mobileFavoritesError" class="mobile-favorite-error" role="status" hidden></p><div class="mobile-modules-actions"><button type="button" id="mobileFavoritesReset" class="btn btn-ghost">Restablecer</button><button type="button" id="mobileFavoritesCancel" class="btn btn-ghost">Cancelar</button><button type="button" id="mobileFavoritesSave" class="btn btn-primary">Guardar</button></div></div>';
    document.body.appendChild(dialogo);
    const el = id => document.getElementById(id);
    let favoritos = [], borrador = [], editando = false, propietario = null, propietarioEdicion = null;
    const permitidos = () => store.sessionToken ? modosAutorizados().filter(modo => tabs.has(modo)) : [];
    const visibles = () => favoritos.filter(modo => permitidos().includes(modo));
    const icono = modo => tabs.get(modo).querySelector('.tab-icon').cloneNode(true);

    function actualizarActivo(modo = store.modoActual) {
        const otro = !visibles().includes(modo);
        mas.classList.toggle('active', otro);
        mas.setAttribute('aria-label', otro && tabs.has(modo) ? 'Módulos. Actual: ' + nombre(modo) : 'Módulos');
        mas.toggleAttribute('aria-current', otro);
        if (otro) mas.setAttribute('aria-current', 'page');
        tabs.forEach((tab, codigo) => {
            if (codigo === modo) tab.setAttribute('aria-current', 'page');
            else tab.removeAttribute('aria-current');
        });
        el('mobileModulesCurrent').textContent = tabs.has(modo) ? 'Actual: ' + nombre(modo) : '';
    }

    function renderBarra() {
        tabs.forEach(tab => reserva.appendChild(tab));
        visibles().forEach(modo => nav.appendChild(tabs.get(modo)));
        nav.appendChild(mas);
        nav.classList.add('mobile-favorites-nav');
        document.body.classList.add('mobile-floating-nav');
        actualizarActivo();
        window.dispatchEvent(new Event('resize'));
    }

    function renderCatalogo() {
        const filtro = el('mobileModulesSearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const lista = el('mobileModulesList');
        lista.replaceChildren();
        GRUPOS.forEach(([titulo, modos]) => {
            const coincidencias = modos.filter(modo => permitidos().includes(modo) && nombre(modo).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(filtro));
            if (!coincidencias.length) return;
            const encabezado = document.createElement('h3');
            encabezado.textContent = titulo;
            const grupo = document.createElement('div');
            grupo.className = 'mobile-modules-grid';
            coincidencias.forEach(modo => {
                const boton = document.createElement('button');
                boton.type = 'button';
                boton.className = 'mobile-module-choice';
                boton.dataset.module = modo;
                boton.classList.toggle('active', store.modoActual === modo);
                const texto = document.createElement('span');
                texto.textContent = nombre(modo);
                boton.append(icono(modo), texto);
                boton.addEventListener('click', () => {
                    if (!permitidos().includes(modo)) { actualizarSesion(); return; }
                    dialogo.close();
                    abrirModo(modo);
                });
                grupo.appendChild(boton);
            });
            lista.append(encabezado, grupo);
        });
        if (!lista.children.length) lista.textContent = 'No hay módulos disponibles con esa búsqueda.';
    }

    function renderEditor() {
        el('mobileFavoritesCount').textContent = borrador.length + ' de 4 favoritos' + (borrador.length === 4 ? '. Quita uno para elegir otro.' : '');
        const seleccion = el('mobileFavoritesSelected');
        seleccion.replaceChildren();
        borrador.forEach((modo, indice) => {
            const fila = document.createElement('div');
            fila.className = 'mobile-favorite-row';
            const texto = document.createElement('span');
            texto.textContent = (indice + 1) + '. ' + nombre(modo);
            fila.appendChild(texto);
            [-1, 1].forEach(direccion => {
                const boton = document.createElement('button');
                boton.type = 'button';
                boton.textContent = direccion < 0 ? '←' : '→';
                boton.setAttribute('aria-label', 'Mover ' + nombre(modo) + (direccion < 0 ? ' a la izquierda' : ' a la derecha'));
                boton.dataset.move = modo + ':' + direccion;
                const destino = indice + direccion;
                boton.disabled = destino < 0 || destino >= borrador.length;
                boton.addEventListener('click', () => {
                    [borrador[indice], borrador[destino]] = [borrador[destino], borrador[indice]];
                    renderEditor();
                    const control = el('mobileFavoritesSelected').querySelector(`[data-move="${modo}:${direccion}"]`);
                    (control.disabled ? control.parentElement.querySelector('button:not(:disabled)') : control)?.focus({ preventScroll: true });
                });
                fila.appendChild(boton);
            });
            seleccion.appendChild(fila);
        });
        const opciones = el('mobileFavoritesChoices');
        opciones.replaceChildren();
        permitidos().forEach(modo => {
            const etiqueta = document.createElement('label');
            etiqueta.className = 'mobile-module-choice';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = modo;
            checkbox.checked = borrador.includes(modo);
            checkbox.disabled = borrador.length === 4 && !checkbox.checked;
            const texto = document.createElement('span');
            texto.textContent = nombre(modo);
            etiqueta.append(checkbox, texto);
            checkbox.addEventListener('change', () => {
                borrador = checkbox.checked ? [...borrador, modo].slice(0, 4) : borrador.filter(item => item !== modo);
                renderEditor();
                opciones.querySelector(`input[value="${modo}"]`)?.focus({ preventScroll: true });
            });
            opciones.appendChild(etiqueta);
        });
    }

    function mostrarVista(edicion) {
        editando = edicion;
        el('mobileModulesTitle').textContent = edicion ? 'Personalizar favoritos' : 'Módulos';
        el('mobileModulesBrowse').hidden = edicion;
        el('mobileFavoritesEdit').hidden = !edicion;
        el('mobileFavoritesError').hidden = true;
        dialogo.scrollTop = 0;
        if (!edicion) renderCatalogo();
    }

    function cancelarEdicion() {
        borrador = [];
        mostrarVista(false);
        el('mobileFavoritesCustomize').focus();
    }

    function cerrarConAtras() {
        if (!dialogo.open) return false;
        if (editando) cancelarEdicion();
        else dialogo.close();
        return true;
    }

    function actualizarSesion() {
        if (dialogo.open) dialogo.close();
        propietario = claveFavoritos();
        favoritos = leerFavoritos();
        borrador = [];
        renderBarra();
    }

    mas.addEventListener('click', () => {
        if (!store.sessionToken) return;
        if (propietario !== claveFavoritos()) actualizarSesion();
        el('mobileModulesSearch').value = '';
        mostrarVista(false);
        actualizarActivo();
        dialogo.showModal();
        mas.setAttribute('aria-expanded', 'true');
        dialogo.querySelector('.mobile-modules-close').focus();
    });
    el('mobileModulesSearch').addEventListener('input', renderCatalogo);
    dialogo.querySelector('.mobile-modules-close').addEventListener('click', () => dialogo.close());
    dialogo.addEventListener('cancel', event => { if (editando) { event.preventDefault(); cancelarEdicion(); } });
    dialogo.addEventListener('close', () => {
        editando = false;
        borrador = [];
        mas.setAttribute('aria-expanded', 'false');
    });
    dialogo.addEventListener('click', event => {
        if (event.target !== dialogo) return;
        const rect = dialogo.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialogo.close();
    });
    el('mobileFavoritesCustomize').addEventListener('click', () => {
        propietarioEdicion = claveFavoritos();
        borrador = [...visibles()];
        mostrarVista(true);
        renderEditor();
        el('mobileFavoritesSelected').querySelector('button:not(:disabled)')?.focus();
    });
    el('mobileFavoritesReset').addEventListener('click', () => {
        borrador = FAVORITOS_INICIALES.filter(modo => permitidos().includes(modo));
        renderEditor();
    });
    el('mobileFavoritesCancel').addEventListener('click', cancelarEdicion);
    el('mobileFavoritesSave').addEventListener('click', () => {
        if (!store.sessionToken || propietarioEdicion !== claveFavoritos()) { actualizarSesion(); return; }
        const elegidos = normalizarFavoritos(borrador).filter(modo => permitidos().includes(modo));
        try {
            localStorage.setItem(propietarioEdicion, JSON.stringify(elegidos));
        } catch (_) {
            el('mobileFavoritesError').textContent = 'No se pudo guardar. Revisa el almacenamiento del navegador e intenta nuevamente.';
            el('mobileFavoritesError').hidden = false;
            return;
        }
        favoritos = elegidos;
        renderBarra();
        mostrarVista(false);
        el('mobileFavoritesCustomize').focus();
    });
    window.addEventListener('eruditos:logout', () => {
        dialogo.close();
        favoritos = borrador = [];
        propietario = propietarioEdicion = null;
        renderBarra();
        el('mobileModulesList').replaceChildren();
        el('mobileFavoritesChoices').replaceChildren();
        el('mobileFavoritesSelected').replaceChildren();
    });
    window.addEventListener('storage', event => { if (event.key === claveFavoritos() || event.key === null) actualizarSesion(); });
    actualizarSesion();
    return { actualizarSesion, actualizarActivo, cerrarConAtras, tabActivo: modo => visibles().includes(modo) ? tabs.get(modo) : mas };
}
