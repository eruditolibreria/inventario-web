# Plan de implementación: acceso al sistema y Club Eruditos

Fecha: 6 de octubre de 2026. Estado: diagnóstico terminado; cambios propuestos, todavía sin implementar ni publicar.

## Resultado y decisión

Priorizar Oregón y reducir viajes a PostgreSQL. Mantener Supabase Auth para contraseñas y tokens. Redis puede acelerar el rechazo de bloqueos temporales ya confirmados. Conservar PostgreSQL como fuente de los contadores: una clave Redis ausente, vencida o un error siempre conduce a comprobar SQL, nunca a conceder acceso.

## Mediciones

Se usaron dos cuentas Auth temporales con account_type=DIAGNOSTIC, sin registros de personal ni identidad Club. Doce muestras consecutivas por operación y región, incluyendo la primera; no fue una prueba de carga ni del tráfico real. Tiempos de operaciones completas del SDK, incluyendo red y PostgREST/Auth, no tiempos SQL internos.

| Operación | Mediana Brasil | Mediana Oregón |
| --- | ---: | ---: |
| Comprobar bloqueos de usuario/IP, dos consultas paralelas | 252,30 ms | 100,96 ms |
| Validar contraseña en Supabase Auth | 287,82 ms | 124,58 ms |
| Consultar contexto del personal, sin membresía | 237,78 ms | 91,23 ms |
| Resolver identidad Club, sin coincidencia | 237,87 ms | 68,27 ms |
| Verificar usuario con getUser | 198,58 ms | 42,85 ms |
| Renovar token | 211,50 ms | 60,11 ms |
| Redis MGET de dos claves temporales | 12 fallos dentro del límite de 100 ms | 1,52 ms; cero fallos |
| Redis EVAL con dos incrementos y expiración | 12 fallos dentro del límite de 100 ms | 1,56 ms; cero fallos |

La mediana de Auth fue aproximadamente 57 % menor en Oregón, y la comprobación de bloqueos aproximadamente 60 % menor. No representan una mejora demostrada del login completo. Se confirmó también que los endpoints actuales usuarios y club-auth utilizan Brasil desde el equipo de prueba y aceptan forceFunctionRegion=us-west-2. La comprobación de estas rutas se rechazó antes de autenticar o escribir y no se usa como tiempo de login.

La variación fue alta. El percentil 95 del contexto sin membresía fue 714,80 ms en Brasil y 1236,07 ms en Oregón; con doce muestras ese percentil es el máximo observado. No se demuestra una mejora del percentil 95 del acceso completo ni se obtiene éste sumando medianas o percentiles de componentes.

Auth, getUser y refresh sí funcionaron exitosamente para las cuentas temporales. Las consultas SQL midieron claves sin registros coincidentes. No se midieron un contexto completo de empleado, una identidad Club válida, la toma/traslado de sesión Club, escrituras de auditoría, último acceso ni la carga visual posterior. La inspección SQL por CLI no produjo una salida estructurada utilizable; no se atribuyen tiempos internos SQL.

El diagnóstico rechazó el acceso anónimo con 403. Ambas cuentas se eliminaron y la comprobación posterior encontró cero cuentas temporales restantes. La función temporal también se retiró. Las claves Redis tuvieron prefijo único de diagnóstico y vencimiento de 60 segundos. No se utilizaron sesiones reales, contadores de usuarios reales ni permisos de personal. Datos completos: login-medicion-2026-10-06.json.

## Fase 1: instrumentar y acercar los accesos a PostgreSQL

1. Añadir tiempos por etapa y total del servidor en usuarios/LOGIN, usuarios/REFRESH_TOKEN y club-auth/LOGIN. Registrar sólo duración, resultado y región, sin contraseñas, tokens, nombres, documentos ni IP. Medir aparte la respuesta HTTP y la carga posterior de la pantalla.
2. En js/api.js, dirigir LOGIN y REFRESH_TOKEN a us-west-2. En club/app.js, dirigir LOGIN a esa región. Usar forceFunctionRegion y una bandera independiente; conservar otras acciones hasta medirlas.
3. Comparar al menos 50 accesos completos por variante cuando existan tráfico o cuentas de prueba válidas: mediana, percentil 95, errores y casos con otro dispositivo. No provocar accesos de personas reales para las pruebas.
4. Conservar reversión a selección automática. Supabase no cambia automáticamente de región cuando se fuerza una; evitar reintentos automáticos de LOGIN porque podría haber creado o trasladado una sesión aunque se pierda la respuesta.

## Fase 2: consolidar el sistema y corregir concurrencia

Actualmente se consultan dos tablas de bloqueos. Al registrar un fallo se lee el contador y después se hace upsert, secuencialmente para usuario e IP: dos fallos simultáneos pueden perder un incremento. La comprobación inicial tampoco verifica errores de esas consultas.

- Crear un RPC privado para comprobar ambos bloqueos en una sola ida a PostgREST.
- Crear un RPC privado que incremente ambos contadores atómicamente, con bloqueo de filas en orden consistente y una transacción. Conservar umbrales, duración y limpieza configurados. El código usa por defecto tres fallos y 60 segundos; verificar valores efectivos antes del despliegue.
- Consolidar el final del acceso exitoso: obtener contexto fresco, limpiar intentos pertinentes y confirmar auditoría. Usar únicamente la identidad verificada por Auth; si el usuario no está habilitado, conservar el rechazo y revocar la sesión recién creada.
- Mantener estado, permisos y sucursales autorizadas frescos. No sustituirlos por nombres descriptivos cacheados.
- Si SQL falla, devolver indisponibilidad temporal; no interpretarlo como ausencia de bloqueo.

## Fase 3: consolidar el final del login de Club

Actualmente Club resuelve identidad, valida contraseña, toma sesión, actualiza último acceso y registra el evento mediante operaciones consecutivas.

- Conservar la resolución inicial fresca y la validación de contraseña en Supabase Auth.
- Crear club_finalizar_login: volver a verificar cliente/identidad, tomar sesión con el bloqueo de fila actual, actualizar último acceso y registrar el evento en una sola transacción.
- Preservar conflicto por otro dispositivo, traslado forzado, inactividad y acceso de cuentas pendientes de activación que el flujo actual permite.
- Preservar el evento de rechazo por conflicto y la revocación de la nueva sesión Auth cuando corresponda.
- El cierre de otras sesiones en Auth al forzar un traslado sigue siendo una operación adicional; medirla por separado.
- Confirmar persistencia de eventos antes de responder. No trasladarlos a tareas de fondo sin confirmación.

## Fase 4: Redis de bloqueos confirmados

Activar sólo si el volumen real de solicitudes bloqueadas justifica reducir carga. Esta fase no promete acelerar el acceso normal: sin bloqueo confirmado en Redis todavía se comprueba PostgreSQL.

- Separar claves por entorno y por sistema, usuario normalizado e IP. Usar HMAC con un secreto dedicado para evitar nombres e IP en las claves; conservar la normalización actual de cada aplicación.
- Guardar únicamente bloqueos confirmados por SQL, fecha límite y TTL limitado al tiempo restante. No cachear estados de «no bloqueado», respuestas exitosas, contraseñas, tokens o permisos.
- MGET consulta ambas claves. Un bloqueo válido permite rechazar sin llamar a Auth ni SQL. Ante ausencia, vencimiento, datos inválidos o error Redis, consultar el RPC SQL.
- El RPC atómico registra los fallos y devuelve los bloqueos; actualizar Redis desde ese resultado. SQL conserva los contadores durante fallos o vaciados de Redis. El desbloqueo administrativo, si se incorpora, debe eliminar sus claves.
- Reutilizar el cliente Redis, timeout acotado, sin reintentos y con circuito de protección. Activar sólo después de verificar Oregón: las pruebas desde Brasil fallaron con el límite actual de 100 ms.
- Mantener los límites actuales del personal. Para Club, revisar eventos y definir límites considerando IP compartidas de sucursales y familias; no copiar automáticamente el umbral del personal al público.
- Empezar en observación y usar banderas independientes por sistema. Si fallan Redis y la comprobación SQL, impedir nuevos accesos; no eliminar por ese motivo las sesiones vigentes.

El incremento atómico Redis medido fue rápido en Oregón, pero no se propone convertirlo en la única fuente de bloqueo: conservar límites durante fallos o cambios de proveedor añadiría complejidad. La primera versión usa contadores SQL atómicos y caché sólo de bloqueos positivos.

## Verificación, publicación y reversión

Probar con cuentas dedicadas: contraseña incorrecta/cambiada, personal inactivo, cambios de permisos, refresh inválido/usado, identidad Club renombrada, activación pendiente, traslado e inactividad. Probar concurrencia, vencimiento exacto de bloqueos, IP compartidas, normalización, Redis caído/lento/vaciado/datos inválidos, SQL caído y persistencia de eventos. Ningún fallo debe conceder acceso saltándose controles.

Conservar Cache-Control: private, no-store en autenticación; excluir credenciales del CDN y service worker. Los RPC serán privados, ejecutables sólo por service_role. Crear migraciones aditivas y activar nuevos recorridos con banderas, conservando el anterior.

Orden: migraciones y RPC, backend, frontend; después activar métricas/región, consolidación del sistema, consolidación Club y Redis sólo si se justifica. Aceptar cada etapa si conserva comportamientos y mejora mediana sin empeorar materialmente errores o percentil 95 con muestras suficientes. Objetivo inicial: al menos 25 % menos de mediana de tiempo de servidor para región/consolidación, como criterio de evaluación, no como promesa del diagnóstico. Revertir por banderas; desactivar Redis mantiene límites SQL.

## Archivos principales

Frontend: js/api.js, club/app.js y pruebas de acceso/Club.
Backend: funciones usuarios y club-auth, módulos compartidos de autenticación/Club/Redis y migraciones aditivas.

## Referencias oficiales

- https://supabase.com/docs/guides/functions/regional-invocation
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://supabase.com/docs/guides/auth/rate-limits
- https://upstash.com/docs/redis/features/restapi
