(() => {
    const inicio = performance.now();
    const modoInstalado = matchMedia('(display-mode: standalone)');
    const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const esAndroid = /Android/i.test(navigator.userAgent);
    let solicitudInstalacion = null;
    let instalacionConfirmada = false;
    let instalacionIntentada = false;
    let instalacionEnCurso = false;
    let splashOculto = false;

    function actualizarBotones() {
        const instalado = instalacionConfirmada || modoInstalado.matches || navigator.standalone === true;
        document.querySelectorAll('.pwa-install-button').forEach(boton => {
            const instruccionesAndroid = esAndroid && boton.dataset.installFallback === 'android';
            boton.hidden = instalado || (!solicitudInstalacion && !esIOS && !instalacionIntentada && !instruccionesAndroid);
            boton.disabled = instalacionEnCurso;
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
        function mostrarInstrucciones() {
            instrucciones.textContent = esIOS
                ? 'En tu iPhone o iPad, abre el menú Compartir del navegador y elige «Añadir a pantalla de inicio». Después toca «Añadir».'
                : 'En el menú del navegador, toca «Instalar aplicación» o «Añadir a pantalla de inicio». Si no aparece, abre el sistema en Chrome y vuelve a intentarlo.';
            dialogo.showModal();
        }
        document.querySelectorAll('.pwa-install-button').forEach(boton => {
            boton.addEventListener('click', async () => {
                if (instalacionEnCurso || instalacionConfirmada || modoInstalado.matches || navigator.standalone === true) return;
                if (solicitudInstalacion) {
                    const solicitud = solicitudInstalacion;
                    solicitudInstalacion = null;
                    instalacionIntentada = true;
                    instalacionEnCurso = true;
                    actualizarBotones();
                    try {
                        await solicitud.prompt();
                        await solicitud.userChoice;
                    } catch (_) {
                        mostrarInstrucciones();
                    } finally {
                        instalacionEnCurso = false;
                        actualizarBotones();
                    }
                    return;
                }
                mostrarInstrucciones();
            });
        });
        document.getElementById('pwaInstallClose').addEventListener('click', () => dialogo.close());
        actualizarBotones();
    });
})();
