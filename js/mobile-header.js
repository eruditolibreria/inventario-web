(() => {
    const menu = document.getElementById('mobileHeaderMenu');
    const boton = document.getElementById('mobileMenuBtn');
    if (!menu || !boton) return;
    boton.addEventListener('click', () => {
        menu.showModal();
        boton.setAttribute('aria-expanded', 'true');
    });
    menu.addEventListener('close', () => boton.setAttribute('aria-expanded', 'false'));
    document.getElementById('mobileMenuClose').addEventListener('click', () => menu.close());
    menu.addEventListener('click', event => {
        if (event.target === menu) {
            const rect = menu.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) menu.close();
        }
    });
    menu.querySelector('.pwa-install-button').addEventListener('click', () => menu.close(), true);
    document.getElementById('mobileLogoutBtn').addEventListener('click', () => {
        menu.close();
        window.cerrarSesion();
    });
    window.addEventListener('eruditos:logout', () => menu.close());
})();
