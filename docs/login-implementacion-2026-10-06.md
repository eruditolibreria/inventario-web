# Accesos del sistema y Club — 6 de octubre de 2026

El acceso valida siempre contraseña en Supabase Auth y consulta estado, permisos y sucursales actuales. Esta versión reduce viajes a PostgreSQL y permite dirigir LOGIN/REFRESH_TOKEN del personal y LOGIN de Club a us-west-2, cerca de la base de datos. No guarda respuestas de autenticación, tokens ni permisos en Redis.

## Backend y seguridad

Migración aditiva 20261006020000_login_optimizado.sql, con cuatro RPC exclusivos de service_role:

- login_comprobar_bloqueo: estado de usuario e IP, con reloj SQL.
- login_registrar_fallo: incrementos atómicos por usuario/IP y auditoría en la misma transacción. Conserva un bloqueo activo ante fallos concurrentes.
- staff_finalizar_login: contexto fresco, limpieza de contadores y auditoría confirmada. Una cuenta desactivada no recibe credenciales; se revoca la sesión Auth recién creada.
- club_finalizar_login: identidad/cliente actuales, toma o traslado de sesión, último acceso y evento de seguridad. Conserva cuentas pendientes de activación, conflicto HTTP 409 y vencimiento por diez minutos de inactividad.

Ante fallo de SQL se rechaza el acceso con un mensaje temporal sin detalles internos. LOGIN y REFRESH mantienen no-store. Las métricas login_timing registran sistema, acción, región, resultado, totalMs y etapas, sin usuario, IP, contraseña o tokens.

## Banderas y reversión

STAFF_LOGIN_RPC_ENABLED=true y CLUB_LOGIN_RPC_ENABLED=true activan cada consolidación. false recupera el recorrido anterior; la migración se conserva. LOGIN_METRICS_ENABLED=false apaga las métricas. En el frontend LOGIN_REGION_ENABLED=false en js/config.js restaura selección automática de región; requiere publicar y actualizar el service worker.

STAFF_LOGIN_BLOCK_CACHE_ENABLED=false es el valor inicial previsto para producción. La caché está implementada y probada, pero se activa sólo cuando el volumen de rechazos justifique una lectura Redis adicional por intento. LOGIN_CACHE_HMAC_SECRET es un secreto aleatorio dedicado de al menos 32 caracteres y nunca se publica en el frontend.

La caché guarda únicamente bloqueos confirmados por SQL, claves HMAC separadas por entorno y usuario/IP, TTL máximo de 60 segundos y limitado al tiempo restante. Ausencia, corrupción, vencimiento o fallo de Redis vuelve a SQL; tres errores abren un circuito de 30 segundos. Sólo funciona en us-west-2 o entorno test. Desactivarla mantiene los límites SQL. No se añade una política nueva de bloqueo al público Club.

Los umbrales existentes siguen siendo LOGIN_MAX_INTENTOS y LOGIN_BLOQUEO_SEGUNDOS, por defecto 3 y 60. No se sobrescriben configuraciones existentes al publicar.

## Verificación realizada

- 84 pruebas Node del backend aprobadas; seis integraciones opcionales omitidas en la ejecución general. Tres de ellas, las nuevas integraciones locales de acceso/concurrencia, se ejecutaron aparte y pasaron.
- 157 pruebas del frontend aprobadas, incluida construcción del portal independiente, región, reversión y ausencia de reintentos de LOGIN.
- Verificación de tipos de usuarios y club-auth con Deno aprobada.
- SQL: login optimizado (25 aserciones), contexto unificado, inactividad Club, traslados Realtime, buffer de auditoría, seguridad y autorización aprobados.
- Integración local real: 20 fallos SQL simultáneos conservan ambos contadores y todos los eventos. Staff verifica DENY actualizado, refresh inválido, vencimiento de bloqueo, contraseña cambiada y desactivación. Club verifica activación pendiente, sesión válida, conflicto, traslado, inactividad y renombrado.
- Redis simulado: claves opacas, TTL, prioridad de bloqueos, fallos, corrupción, circuito y limpieza.

Las cuentas y datos de las integraciones son temporales y locales; se eliminan al finalizar. No se utiliza una sesión de un cliente o empleado real en producción.

## Publicación y medición posterior

Orden de publicación: migración privada, backend, banderas de consolidación, frontend con versiones de service worker actualizadas. Redis de bloqueos queda apagado inicialmente. Las cachés descriptivas Redis ya existentes mantienen su configuración.

La comparación anterior de componentes indicó menor latencia desde Oregón. Para cuantificar la mejora del login completo faltan al menos 50 accesos reales por variante con métricas y una muestra comparable. No se presenta el porcentaje objetivo del plan como una mejora ya demostrada. Evidencia y plan previo: docs/login-medicion-2026-10-06.json y docs/plan-login-redis-2026-10-06.md en el frontend.

## Comprobación de producción

Migración aplicada y reconciliada; no quedan migraciones pendientes. Backend f5db92b4c05b465a1f37c657854b88870b8ac755 desplegado correctamente por GitHub Actions. Banderas de consolidación y métricas verificadas por digest; Redis de bloqueos apagado y secreto HMAC dedicado configurado. No existen umbrales personalizados, por lo que siguen vigentes tres fallos y 60 segundos.

Comprobaciones contra producción: cuatro RPC inaccesibles para anon; resolución de bloqueo disponible; finalización Staff/Club rechaza una identidad sin membresía; LOGIN y REFRESH de una cuenta Auth temporal no entregan acceso al sistema; Club conserva la validación de dispositivo y no-store. La cuenta temporal se eliminó y se confirmó su ausencia. Evidencia: login-verificacion-produccion-2026-10-06.json.

Frontend incluye región y mensajes de indisponibilidad, con service workers eruditos-v125 y club-eruditos-v32. Las pruebas de construcción incluyen el portal Club independiente. CodeGraph de ambos repositorios actualizado y consultado sobre los recorridos modificados.
