# -*- coding: utf-8 -*-
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

old = '                if (modoAnterior === modo) return;'

new = '''                if (modoAnterior === modo) {
                    /* Mismo modo: solo asegurar visibilidad sin animacion */
                    var secMisma = document.getElementById("seccion-" + modo);
                    if (secMisma) {
                        secMisma.classList.remove("oculto", "push-transitioning", "push-dragging");
                        secMisma.style.animation = "";
                        secMisma.style.transform = "";
                        secMisma.style.opacity = "";
                    }
                    actualizarIndicador(modo);
                    return;
                }'''

if old in content:
    content = content.replace(old, new)
    print('[OK] Reemplazo hecho')
else:
    print('[ERROR] No encontrado')
    idx = content.find('if (modoAnterior === modo)')
    if idx >= 0:
        print('Encontrado:', repr(content[idx:idx+60]))

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('[OK] index.html actualizado')
