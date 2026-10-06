# Club Eruditos en Vercel

Este proyecto publica solo el portal de clientes. Usa el mismo código y el mismo backend de Supabase que el Club del sistema principal. La compilación copia únicamente los archivos públicos necesarios a `dist/` y adapta las rutas para que el portal abra desde la raíz del nuevo dominio.

1. Sube estos archivos al repositorio `eruditolibreria/inventario-web`.
2. En Vercel, crea un proyecto nuevo e importa ese mismo repositorio.
3. Define **Root Directory** como `club-standalone` y mantén activada **Include source files outside of the Root Directory in the Build Step**. El proyecto necesita leer `club/` y `js/config.js` del repositorio.
4. Usa **Framework Preset: Other**. `vercel.json` ya define `node build.mjs` y `dist` como carpeta de salida. No se necesitan variables de entorno nuevas.
5. Despliega y abre la URL asignada por Vercel. El portal, su manifest y el service worker se sirven desde `/`.

Al cambiar de dominio, los clientes deberán iniciar sesión de nuevo. Sus cuentas y puntos siguen en el mismo Supabase.

Para revisar la salida antes de desplegar, ejecuta `node club-standalone/build.mjs` desde la raíz del repositorio. `dist/` es un resultado generado y no debe añadirse a Git.


El contenido común ahora se lee por `/api/club/v1/{reglas,noticias,catalogo}` usando la caché CDN de Vercel. Antes de publicar esta versión, aplicar las dos migraciones CLUB del 5 de octubre de 2026 y desplegar las funciones `club-content`, `club-cache`, `club-public` y `club-admin` del backend. La invalidación requiere secretos únicamente en Supabase/Vault, sin variables privadas en este frontend. Consultar `docs/club-cache-despliegue.md` en eruditos-backend para el orden, configuración, verificación y recuperación.

El service worker almacena exclusivamente archivos estáticos y su versión se genera automáticamente durante el build. El stock y los datos personales siguen fuera de la caché compartida.

La versión se desplegó el 6 de octubre de 2026 en ambos proyectos Vercel, con HIT y purga verificados. Las tres funciones de api/club/v1 llaman a Supabase mediante server/club-content-proxy.cjs y excluyen Set-Cookie del origen: la cookie de infraestructura impedía cachear un rewrite directo. El contenido público no requiere tokens en Vercel; los tokens de purga permanecen exclusivamente en Supabase. Las respuestas privadas y la disponibilidad siguen fuera del CDN.
