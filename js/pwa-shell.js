(() => {
    const inicio = performance.now();
    const modoInstalado = matchMedia('(display-mode: standalone)');
    const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let solicitudInstalacion = null;
    let instalacionConfirmada = false;
    let instalacionIntentada = false;
    let splashOculto = false;

    function actualizarBotones() {
        const instalado = instalacionConfirmada || modoInstalado.matches || navigator.standalone === true;
        document.querySelectorAll('.pwa-install-button').forEach(boton => {
            boton.hidden = instalado || (!solicitudInstalacion && !esIOS && !instalacionIntentada);
        });
    }

    function ocultarSplash() {
        if (splashOculto) return;
        splashOculto = true;
        setTimeout(() => {
            const splash = document.getElementById('pwaSplash');
            if (!splash) return;
            splash.classList.add('is-hidden');
            splash.setAttribute('aria-hidden', 'true');
        }, Math.max(0, 400 - (performance.now() - inicio)));
    }

    window.addEventListener('beforeinstallprompt', evento => {
        evento.preventDefault();
        solicitudInstalacion = evento;
        actualizarBotones();
    });
    window.addEventListener('appinstalled', () => {
        instalacionConfirmada = true;
        solicitudInstalacion = null;
        actualizarBotones();
    });
    modoInstalado.addEventListener?.('change', actualizarBotones);
    window.addEventListener('eruditos:ready', ocultarSplash, { once: true });
    setTimeout(ocultarSplash, 12000);

    document.addEventListener('DOMContentLoaded', () => {
        const dialogo = document.getElementById('pwaInstallDialog');
        const instrucciones = document.getElementById('pwaInstallInstructions');
        document.querySelectorAll('.pwa-install-button').forEach(boton => {
            boton.addEventListener('click', async () => {
                if (instalacionConfirmada || modoInstalado.matches || navigator.standalone === true) return;
                if (solicitudInstalacion) {
                    const solicitud = solicitudInstalacion;
                    solicitudInstalacion = null;
                    instalacionIntentada = true;
                    actualizarBotones();
                    try { await solicitud.prompt(); } catch (_) {}
                    return;
                }
                instrucciones.textContent = esIOS
                    ? 'En tu iPhone o iPad, abre el menú Compartir del navegador y elige «Añadir a pantalla de inicio». Después toca «Añadir».'
                    : 'Abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio».';
                dialogo.showModal();
            });
        });
        document.getElementById('pwaInstallClose').addEventListener('click', () => dialogo.close());
        actualizarBotones();
    });
})();
