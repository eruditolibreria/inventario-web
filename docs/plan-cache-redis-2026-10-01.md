Plan final vigente: [plan-final-redis-2026-10-06.md](</F:/Sistema de Inventario/eruditos-frontend/docs/plan-final-redis-2026-10-06.md>). Este archivo conserva los análisis anteriores.

# Plan de caché Redis para Eruditos

Fecha: 1 de octubre de 2026. Alcance: análisis de los checkouts locales del frontend y del backend; implementación propuesta, todavía sin ejecutar.

## Ampliación de candidatos — 6 de octubre de 2026

Esta revisión prevalece sobre las prioridades del plan original del 1 de octubre. Se utilizaron CodeGraph y las skills karpathy-guidelines y supabase-postgres-best-practices. No se implementó Redis ni se modificó código de negocio.

El índice del backend se sincronizó: 61 archivos, 882 nodos y 3.504 relaciones. El frontend omitía club/content.js y otros archivos recientes pese a informar que estaba actualizado; la sincronización incremental no lo resolvió. Se reconstruyó con acceso autorizado y se comprobó createClubContentClient y sus dependencias: 76 archivos, 1.438 nodos y 6.041 relaciones. Las migraciones SQL se revisaron directamente.

### Catálogos y proyecciones descriptivas

Los TTL son puntos de partida sujetos a medición. Conservar autorización vigente antes de acceder a Redis e invalidar por alta, edición, baja y cambio de pertenencia al filtro. Un estado cacheado puede servir para una pantalla, pero no decide si se permite una operación de negocio.

| Candidato | Datos cacheables | TTL inicial | Condiciones |
| --- | --- | --- | --- |
| Proveedores | ID, nombre, NIT y contacto necesario | 15–30 min | Alta prioridad. LISTAR_PROVEEDORES alimenta compras. Separar del historial y stock incluidos en OBTENER_PROVEEDOR. |
| Sucursales | ID, código, nombre visible y descripción autorizada | 15–60 min | Alta. Reutilizar etiquetas en selectores, Club, auditoría y comprobantes; membresías/estado se validan actualmente. |
| Usuarios para selectores | ID y usuario/nombre mostrado | 15–30 min | Alta. Proyección nueva: LISTAR_USUARIOS_ADMIN también devuelve rol, estado, sucursales y excepciones. |
| Clientes para selección | ID, código y nombre; contacto donde haga falta | 5–15 min | Alta. Separar deuda, crédito y agregados de compras de la respuesta actual. |
| Categorías de inventario | Valores distintos visibles | 15–30 min | Alta. Primero RPC DISTINCT autorizada; hoy se descargan páginas para deduplicar en el navegador. |
| Filtros de auditoría | Sucursales y usuarios autorizados | 5–15 min | Alta/media. Reutilizar catálogos anteriores bajo acceso actual. |
| Roles/descripciones de permisos | Código/nombre, módulo, acción y descripción | 15–60 min | Media. Separar de asignaciones de LISTAR_ROLES_PERMISOS; permisos efectivos actuales por solicitud. |
| Ficha descriptiva de producto | ID, nombre, categoría, proveedor, ubicación, código de barras y URL de imagen | 15–30 min | Media. Separar stock y precio; mantener identidad por sucursal. |
| Código de barras → productos | IDs y sucursales coincidentes | 15–30 min | Media. Un código puede devolver varias existencias; no asumir un ID global único. Stock/precio/acceso se resuelven aparte. |
| Ficha descriptiva de lámina | ID, título, categoría, ubicación y sucursal | 15–30 min | Media. Separar estado/disponibilidad. |
| Categorías/ubicaciones para filtros | DISTINCT de valores autorizados | 15–30 min | Media/baja. Consultas propuestas, crear solo cuando la interfaz las necesite. |

Acotar entradas, páginas, búsquedas y tamaño. Para clientes, preferir entidades por ID y búsquedas repetidas; no almacenar todas las combinaciones escritas. El listado de proveedores limita a 200 resultados: conservar límite y filtros, sin asumir que sea exhaustivo. Las compras pueden guardar nombres libres fuera del maestro.

### Candidatos condicionados

| Candidato | TTL orientativo | Condición |
| --- | --- | --- |
| Búsquedas de láminas | 30–120 s | Incluyen estado y total. Invalidar por alta, edición o cambio de estado. SIN STOCK es una selección variable aunque muestre datos descriptivos. |
| Última compra del producto | 1–5 min | Cada compra cambia la fila más reciente; preservar autorización de costos. Medir si compensa cachear una consulta de una fila y añadir una ruta Edge. |
| Comprobante consultado repetidamente | 5–15 min para su cuerpo estable | Su estado cambia con anulaciones; el nombre visible de sucursal también puede cambiar. Verificar estado actual o usar versiones antes de reimprimir. |
| Reportes con filtros repetidos | 30–60 s | Invalidación por ventas, devoluciones, pagos y otras fuentes. Medir repetición. |

### Contenido ya cubierto o sin necesidad de Redis

- Club público: el código actual implementa caché CDN Vercel para reglas (900 s), noticias (300 s) y catálogo (300 s), con ETag, etiquetas, límite por fechas y cola SQL de invalidación. Reutilizarla; Redis debajo solo si fallos de CDN generan carga relevante. La documentación local registra despliegue y pruebas, sin nueva verificación de producción en este análisis.
- Club privado: la migración del 5 de octubre añade progreso calculado, revisiones y trabajo pendiente por cuenta. La ruta RESUMEN con SEPARAR_CONTENIDO consulta esa instantánea. El diagnóstico histórico sobre procesamiento en cada RESUMEN describe la ruta anterior, que sigue como compatibilidad. No duplicar puntos, sesión o disponibilidad en Redis como primera etapa.
- Tipos de servicio, papel, color, tamaños, categorías de gasto y métodos de pago: definidos en HTML; Redis no ahorraría una consulta de base de datos. Mantener recursos estáticos hasta tener catálogos editables en servidor.
- Nombres de niveles del Club: NIVELES está definido en club/app.js; reglas públicas y retos participan en la caché CDN.
- Fotos/logos/PDF: servir mediante Storage/CDN; Redis puede guardar referencias descriptivas, sin duplicar binarios.

### Evidencias locales

| Fuente | Hallazgo |
| --- | --- |
| [Proveedores](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/proveedores/index.ts:45>) y [compras](</F:/Sistema de Inventario/eruditos-frontend/js/modos/compra.js:214>) | Lista usada por autocompletado; detalle mezcla compras y stock/costos. |
| [Usuarios](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/usuarios/index.ts:182>) y [roles/permisos](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/usuarios/index.ts:508>) | Separar etiquetas de acceso/asignaciones. Edición administrativa necesita datos vigentes o versión para evitar sobrescribir cambios ajenos. |
| [Filtros de auditoría](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/auditoria/index.ts:144>) | Usuarios filtrados por identidad/membresías y alcance global actual. |
| [Clientes](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/clientes/index.ts:86>) | La proyección ligera debe evitar calcular agregados en cada fallo de caché si solo se necesitan nombres. |
| [Láminas](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/laminas/index.ts:30>) | Claves con texto, categoría, estado, sucursal, página/límite y alcance. |
| [Última compra](</F:/Sistema de Inventario/eruditos-frontend/js/db.js:159>) | Supabase directo; medir sobrecarga de nueva ruta Redis. |
| [Comprobante](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/comprobantes/index.ts:88>) y [anulación](</F:/Sistema de Inventario/eruditos-backend/supabase/migrations/20260904020000_devoluciones_y_anulaciones_venta.sql:116>) | La respuesta completa no es inmutable. |
| [Club público](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/_shared/club-content.ts:3>) y [resumen privado](</F:/Sistema de Inventario/eruditos-backend/supabase/migrations/20261005030000_club_resumen_privado.sql:1>) | Implementaciones posteriores que cambian las prioridades originales. |

### Invalidación y orden revisado

Invalidar entidad y listas/búsquedas. Código de barras modificado: código anterior y nuevo. Categoría/ubicación: DISTINCT de alcances afectados. Traslado: sucursal anterior, nueva y alcance global. Cubrir funciones, compras/importaciones por RPC y administración directa. No exponer datos personales en claves ni reutilizar entradas de privilegios anteriores.

La cola del Club es referencia de diseño; su worker purga Vercel y no debe reutilizarse a ciegas para Redis. TTL como respaldo; versiones transaccionales donde haga falta frescura tras cambios. [Redis documenta expiración e invalidación al escribir](https://redis.io/docs/latest/develop/use-cases/cache-aside/) y [Vercel documenta su capa CDN](https://vercel.com/docs/caching/cdn-cache).

Orden propuesto:

1. Proveedores y datos descriptivos de sucursales.
2. Categorías con DISTINCT autorizado y filtros de auditoría reutilizando usuarios/sucursales.
3. Clientes y usuarios básicos separados de crédito, totales y configuración de acceso.
4. Roles/descripciones de permisos y fichas descriptivas de productos/láminas con lecturas repetidas.
5. Un reporte y candidatos condicionados cuando las mediciones justifiquen su coste.

La prioridad combina estabilidad, tamaño y facilidad de integración; la frecuencia/latencia real decidirá el alcance final. Reglas/noticias/catálogo del Club mantienen su capa CDN. Esta ampliación es análisis y planificación, no implementación.

## Plan original del 1 de octubre — contexto histórico

## Recomendación

Incorporar Redis gradualmente en las Edge Functions de Supabase, empezando por reportes repetidos y contenidos comunes del Club. Mantener PostgreSQL como autoridad para permisos, stock, reservas, cobros, crédito, puntos y canjes. Evaluar inventario y sugerencias POS en una entrega posterior: hoy esas lecturas usan Supabase directamente y pasar por una Edge Function puede añadir latencia.

La opción inicial recomendada es Redis administrado con API HTTPS, como Upstash, por su encaje con Deno y funciones sin servidor. Elegir región mediante mediciones desde las funciones reales y la base de datos. No se ha elegido proveedor, contratado infraestructura ni verificado un precio. Supabase documenta este tipo de integración en [su ejemplo de Redis para Edge Functions](https://supabase.com/docs/guides/functions/examples/rate-limiting); [Upstash documenta su cliente REST](https://upstash.com/docs/redis/howto/connect-with-upstash-redis).

## Verificación realizada

- CodeGraph del frontend: índice actualizado, 54 archivos, 1.248 nodos, 5.308 relaciones.
- CodeGraph del backend: índice actualizado, 51 archivos, 777 nodos, 3.132 relaciones. La sincronización confirmó que no había cambios por indexar.
- El primer acceso al índice del backend devolvió `unable to open database file`. La ejecución con acceso autorizado lo resolvió: no fue necesario reconstruir ni borrar la base SQLite.
- Se consultaron fuentes, dependencias e impacto con CodeGraph en ambos repositorios. No hay herramientas MCP de CodeGraph expuestas en esta sesión; se utilizó su CLI instalada.
- El índice del backend no incluye SQL. Las migraciones, políticas y reservas se revisaron directamente; las relaciones de CodeGraph complementan esta lectura y no constituyen cobertura completa de todas las rutas.
- Skills aplicadas: [karpathy-guidelines](</C:/Users/Librería Eruditos/.agents/skills/karpathy-guidelines/SKILL.md>) y [supabase-postgres-best-practices](</C:/Users/Librería Eruditos/.agents/skills/supabase-postgres-best-practices/SKILL.md>), incluidas sus referencias sobre RLS, pg_stat_statements y EXPLAIN.
- No se ejecutaron operaciones de negocio, pruebas de carga, migraciones ni despliegues. No se modificó código de aplicación. Este documento es el entregable del análisis.

## Hallazgos que determinan el diseño

| Área | Evidencia local | Consecuencia |
| --- | --- | --- |
| Dos rutas de lectura | [js/api.js](</F:/Sistema de Inventario/eruditos-frontend/js/api.js:20>) llama Edge Functions; [js/db.js](</F:/Sistema de Inventario/eruditos-frontend/js/db.js:72>) usa PostgREST/RPC directamente | Redis en funciones solo cubre la primera ruta. No es un cambio transparente para todo el sistema. |
| Inventario optimizado | [RPC de búsqueda](</F:/Sistema de Inventario/eruditos-backend/supabase/migrations/20260923010000_inventario_busqueda_filtrada.sql:3>) filtra dentro de SQL, limita sugerencias y oculta costos según permisos | Medir la implementación actual antes de añadir un salto HTTP. Conservar estas reglas y campos. |
| Categorías | [listarCategoriasInventario](</F:/Sistema de Inventario/eruditos-frontend/js/db.js:104>) descarga páginas de hasta 1.000 filas para deduplicar categorías en el navegador | Primero crear una RPC de categorías distintas bajo autorización. Redis sería una mejora adicional si la consulta se repite. |
| Autenticación | [auth.ts](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/_shared/auth.ts:47>) verifica identidad y llama a una RPC de contexto unificado | No reaplicar el diagnóstico antiguo de seis consultas de contexto. Un acierto de Redis tampoco elimina estas validaciones actuales. |
| Reportes | [reportes/index.ts](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/reportes/index.ts:44>) valida permisos y alcance antes de ejecutar RPC; VENTAS_PERIODO puede hacer dos RPC | Buen piloto para resultados repetidos con los mismos filtros. Hay que cachear el resultado completo y exitoso, con sus totales. |
| Club RESUMEN | [club-public/index.ts](</F:/Sistema de Inventario/eruditos-backend/supabase/functions/club-public/index.ts:40>) ejecuta `club_preparar_resumen`, que procesa la cuenta y referidos | No envolver toda la acción en caché: un acierto podría omitir procesamiento necesario. Cachear solo noticias y términos compartidos. |
| Club PREMIOS | La acción `PREMIOS` mezcla catálogo, fechas de vigencia y stock de premios/inventario | Separar metadatos del premio de disponibilidad antes de cachear. Un catálogo almacenado nunca autoriza un canje. |
| Reservas | [reservar_stock_carrito](</F:/Sistema de Inventario/eruditos-backend/supabase/migrations/20260908060000_reservas_stock_carrito.sql:30>) bloquea inventario y calcula stock comprometido | Conservar reserva y venta en transacciones PostgreSQL. `inventario.stock` es físico y no equivale a disponibilidad descontando reservas. |
| Caché del navegador | Club usa 30 s para resumen/movimientos, 60 s para premios y 15 s para canjes; [sucursales.js](</F:/Sistema de Inventario/eruditos-frontend/js/sucursales.js:8>) usa 60 s | Redis y navegador deben compartir una fecha de expiración efectiva; sus períodos pueden acumularse. |
| Caché en funciones | `_sucursalesCache` y `_sucursalesLoaded` en varios `_shared.ts` cargan una vez por instancia sin TTL | Revisar los usos de `valSuc` y sustituir esa validación por datos actuales o una caché con vencimiento explícito. Redis no corrige automáticamente estas copias locales. |
| Realtime | [realtime.js](</F:/Sistema de Inventario/eruditos-frontend/js/realtime.js:22>) actualiza pantallas por cambios de inventario | Mantenerlo para refrescar interfaz. La invalidación del servidor debe funcionar aunque todos los navegadores estén desconectados. |

El [diagnóstico del 23 de septiembre](</F:/Sistema de Inventario/eruditos-backend/docs/diagnostico-rendimiento-produccion-2026-09-23.md:19>) encontró latencia SQL y de red, además de un catálogo relativamente pequeño. Sus cifras preceden a mejoras presentes en este checkout. Son antecedentes, no mediciones actuales ni prueba de que Redis vaya a acelerar el POS.

## Qué cachear y con qué vigencia

Los siguientes TTL son puntos de partida sujetos a medición y a la tolerancia de cada pantalla.

| Datos | Prioridad | TTL inicial | Condición |
| --- | --- | --- | --- |
| Noticias publicadas del Club | Piloto | 60–120 s | Solo contenido común; conservar identidad y estado de cuenta actuales. Invalidar al publicar, editar o retirar noticias. |
| Términos y configuración pública del Club | Piloto | 300 s | Campos explícitamente públicos; no cachear reglas de autorización de operaciones. |
| RESUMEN_COMERCIAL, ventas por período, productos más/menos vendidos | Piloto | 30–60 s | Autorización actual antes de consultar caché; filtros completos; indicar antigüedad y permitir actualización directa. |
| Utilidad bruta | Ampliación | 30–60 s | Mantener `reportes.ver_utilidad`, proyección y aislamiento específicos. |
| Sucursales visibles | Ampliación | 30–60 s | Claves por usuario/alcance y proyección. La respuesta global incluye campos que usuarios limitados no reciben. |
| Categorías de inventario | Ampliación | 300 s | Nueva RPC de DISTINCT autorizada; invalidar al modificar catálogo, sucursal o acceso. |
| Inventario y sugerencias POS | Experimento posterior | 5–10 s | Solo lectura informativa. Migrar únicamente las consultas elegidas; exigir mejora medida y control de invalidación. |
| Reportes históricos | Posterior | Hasta 300 s | Solo con versiones fiables: anulaciones, devoluciones o ajustes pueden cambiar períodos antiguos. |

Excluir de la primera implementación: login, refresh/logout, permisos efectivos, estado activo del usuario, sesión activa del Club, reservas y liberación, cobro, idempotencia, saldo de caja, deuda y crédito disponible, puntos personales, canjes y respuestas con códigos de recuperación/retiro. La búsqueda actual de clientes mezcla identidad con cifras de deuda; no cachear su respuesta completa. Optimizar esas rutas por separado si las mediciones lo justifican.

## Arquitectura propuesta

1. La función valida identidad, estado, permiso y alcance actuales.
2. Valida y normaliza filtros usando la semántica existente de cada acción.
3. Calcula una clave y busca el resultado en Redis.
4. Si encuentra una entrada válida, devuelve únicamente la proyección autorizada.
5. Si falta, consulta PostgreSQL, guarda solo un resultado exitoso y devuelve la respuesta.
6. Si Redis falla, está desactivado o excede el tiempo permitido, consulta PostgreSQL.

Este patrón corresponde a [cache-aside](https://redis.io/docs/latest/develop/use-cases/cache-aside/). La caché no envuelve indiscriminadamente todas las acciones POST: usar una lista explícita de lecturas admitidas y puntos de integración posteriores a sus controles.

Implementar utilidades pequeñas en `supabase/functions/_shared/redis.ts` y `cache.ts`: conexión, claves, lectura/escritura JSON con expiración, validación del formato, métricas y omisión de caché. Fijar la versión del cliente compatible con el runtime Deno utilizado. Los secretos REST vivirán en Supabase Secrets; no deben llegar al frontend, logs, Git ni respuestas.

Claves conceptuales:

```text
eruditos:<entorno>:v1:<dominio>:<alcance>:<proyeccion>:<version>:<hash-filtros>
```

Para datos restringidos empezar con usuario verificado + huella de permisos/alcance/proyección. Compartir claves entre usuarios únicamente cuando se demuestre equivalencia de visibilidad. Para noticias y términos públicos, compartir solo los campos comunes. Incluir todas las entradas que alteran el resultado: sucursal efectiva o alcance global, fechas, texto, tipo, agrupación, orden, página y límite. No usar JWT, contraseña, documento o nombre de cliente como parte visible de una clave.

No normalizar textos más agresivamente que SQL: búsquedas de inventario y códigos de barras tienen reglas distintas. Resolver filtros basados en fecha actual antes de formar la clave y respetar el cambio de día del negocio. No guardar una respuesta agregada si falla alguno de sus componentes.

Configurar `CACHE_ENABLED` y activación por dominio, prefijos separados por entorno y versión de formato. Como presupuesto inicial, limitar el intento de Redis a unos 100 ms, medirlo y ajustarlo. Evitar reintentos repetidos dentro de cada petición. Acotar tamaño de objetos y cantidad de entradas; evitar precargar toda la base.

Guardar datos con su TTL en una sola operación. Deduplicar solicitudes simultáneas por clave dentro de cada instancia y variar ligeramente hacia abajo la expiración para reducir vencimientos simultáneos sin ampliar la antigüedad admitida. Si las métricas muestran estampidas entre instancias, añadir un lock Redis breve con propietario y liberación atómica; su fallo debe permitir consultar PostgreSQL. Este lock protege la regeneración de caché y no interviene en reservas ni cobros.

## Invalidación y consistencia

En el piloto, aceptar exclusivamente vigencia acotada para contenido/reportes informativos. Tras una escritura confirmada, invalidar las entradas afectadas como optimización adicional. Un fallo al invalidar debe quedar registrado, sin convertir una venta ya confirmada en un error que invite a repetirla. El TTL sigue siendo el respaldo; este piloto no promete actualización inmediata entre dispositivos.

Para ampliar a datos que deban reflejar cambios confirmados, usar versiones por dominio/alcance mantenidas en PostgreSQL y modificadas dentro de la misma transacción mediante triggers o RPC. Consultar la versión vigente antes de usar una clave; si esa lectura falla, omitir la caché. Incorporar la versión a la clave evita que una consulta iniciada antes de una escritura rellene la clave actual con un resultado antiguo. El resultado y su versión de origen deben corresponder al mismo snapshot, o verificarse de nuevo antes de almacenarlos.

Esta estrategia añade una lectura y puede generar contención en contadores de versiones: medir ambos efectos. No añadirla a cada venta o reserva sin evidencia de necesidad. Evitar un contador global actualizado por todos los movimientos; distinguir dominios y sucursales. Combinar la lectura de versión con metadatos existentes solo si preserva los controles y reduce esperas. Redis seguirá ahorrando la consulta pesada, no todas las consultas SQL.

| Cambio confirmado | Dependencias que se deben revisar |
| --- | --- |
| Venta, servicio, anulación, devolución o pago | Reportes comerciales, financieros y de caja que utilicen las tablas modificadas; inventario cuando corresponda; datos personales del Club si se incorporan después. |
| Compra, importación, ajuste, cambio de producto/imagen/estado | Catálogo, categorías, búsquedas y reportes de inventario afectados. |
| Transferencia | Sucursales de origen y destino; también resultados de alcance global. |
| Reserva, liberación o vencimiento | Disponibilidad comprometida si se expone en lecturas futuras. El paso del tiempo puede invalidar disponibilidad sin una escritura inmediata. |
| Edición/publicación de noticias o configuración | Contenido común del Club. |
| Canje, entrega, cancelación, reversión o procesamiento programado | Disponibilidad de premios/inventario y datos de cuenta afectados. |
| Cambio de rol, permisos, acceso o estado | Autorización actual y huella de alcance/proyección. No reutilizar una entrada con privilegios anteriores. |

La matriz es por dependencia de tablas, no solo por nombre de endpoint: revisar RPC, escrituras directas de funciones, importaciones, administración SQL y tareas programadas. La migración de niveles/retos programa procesamiento de beneficios cada cinco minutos; invalidar solo desde club-admin dejaría fuera esa ruta.

Si se necesita propagar borrados de forma asíncrona, evaluar una outbox transaccional con reintentos. No es necesaria para el piloto con TTL ni sustituye una versión vigente cuando se exige frescura. No hacer llamadas HTTP a Redis desde triggers dentro de la transacción de venta. No usar `KEYS *` ni `FLUSHALL` para invalidar.

## Coordinación con el frontend

- Añadir metadatos de lectura como `generadoEn` y `expiraEn`; para resultados compuestos, usar el vencimiento más próximo de sus componentes cacheados.
- El navegador no debe iniciar un TTL completo al recibir datos que ya estaban envejecidos en Redis. Mantener su entrada hasta el mínimo entre su TTL local y el vencimiento indicado por el servidor.
- Actualizar debe poder omitir tanto caché local como Redis, conservando autenticación y límites. Restringir y acotar este mecanismo para no convertirlo en una vía de carga ilimitada.
- Vaciar lecturas locales ante logout, cambio de identidad, sucursal o permisos y después de mutaciones pertinentes. Proteger respuestas tardías con el mecanismo de época ya existente en el Club.
- Mantener Realtime para refrescar inventario visible. Los service workers actuales cachean recursos estáticos; no añadirles respuestas privadas de API.
- Si se experimenta con Redis para inventario, cambiar únicamente las funciones elegidas de `js/db.js` y sus rutas en `js/api.js`; conservar la alternativa RPC directa para comparación y reversión.

## Entregas y criterios de aceptación

### 1. Medición y elección de infraestructura

Revisar qué migraciones y funciones están desplegadas. Medir al menos 50 lecturas representativas por flujo bajo usuarios equivalentes: reportes repetidos y distintos, carga del Club, categorías, búsquedas POS y códigos. Separar red, autenticación, contexto, datos y renderizado; comparar instancias frías/calientes. Medir repeticiones reales dentro del TTL, cardinalidad de filtros y tamaño de respuestas. Consultar pg_stat_statements y EXPLAIN de lecturas con datos representativos sin confundir medias acumuladas con p95.

Resultado: línea base actual, región elegida por latencia real y presupuesto. Estimar operaciones Redis por día como lecturas de caché + escrituras en fallos + invalidaciones/versiones/locks, contabilizando comandos adicionales. Elegir capacidad/precio después de medir; no asumir que un plan gratuito será suficiente.

### 2. Infraestructura y piloto limitado

Crear utilidades compartidas, secretos y banderas. Cachear noticias/términos comunes y un reporte, preferentemente RESUMEN_COMERCIAL. Mantener todas las verificaciones actuales y el procesamiento de RESUMEN. Añadir tiempos de Redis y origen, aciertos/fallos/omisiones, antigüedad y errores sin datos sensibles.

Resultado: la API conserva sus resultados autorizados con caché activada/desactivada y continúa funcionando si Redis no está disponible. Backend inicial: `_shared/redis.ts`, `_shared/cache.ts`, `reportes/index.ts` y componentes comunes de `club-public/index.ts`. Frontend: coordinación de vigencia/actualización en `club/app.js`, `js/api.js` y la pantalla de reportes que reciba los metadatos.

### 3. Ampliación e invalidación fiable

Extender a reportes seleccionados y sucursales; crear la RPC autorizada de categorías. Revisar los `valSuc` usados y sus cachés locales. Incorporar versiones PostgreSQL donde se requiera frescura posterior a cambios, junto con sus pruebas SQL. Evaluar impacto de escritura y lectura de versiones antes de extender a inventario.

Resultado: cambios de datos o acceso dejan de seleccionar entradas de generaciones anteriores. Las escrituras realizadas por canales distintos de la función lectora también quedan cubiertas. El catálogo de sucursales cacheado nunca sustituye la validación de acceso.

### 4. Experimento POS condicionado

Comparar la RPC directa actual contra Edge + autorización + Redis, tanto en aciertos como en fallos. Usar claves cortas por búsqueda/alcance y TTL de 5–10 s solo para resultados informativos. Revisar precio/estado al reservar o cobrar según las reglas actuales. Reutilizar la respuesta de reserva como autoridad para disponibilidad.

Resultado: habilitar la nueva ruta solo si mejora el p95 completo sin deteriorar materialmente los fallos ni las funciones de compra, transferencias y Club que dependen de las búsquedas. Si no mejora, conservar Redis para los otros dominios y mantener el POS directo.

### 5. Validación y despliegue gradual

Pruebas significativas: aislamiento de usuarios/sucursales y costos; permisos revocados con entrada caliente; sesión del Club trasladada; filtros/defaults/paginación; expiración real; procesamiento de RESUMEN en cada solicitud que llega al servidor; lectura simultánea con escritura; transferencias entre sucursales; fallos de Redis; resultado confirmado de venta seguido de fallo de invalidación; doble cobro/reintento y reserva concurrente; TTL combinado del navegador; respuestas tardías tras logout. Usar pruebas con Redis real para expiración y concurrencia, además de simulaciones de indisponibilidad. Ejecutar las pruebas existentes de los flujos afectados.

Objetivos propuestos para decidir, no mejoras prometidas: al menos 25 % de reducción de p95 en los flujos elegidos y 50 % menos consultas de datos de esos flujos bajo carga representativa con repeticiones; cero regresiones de permisos, reservas o idempotencia. Reportar por separado autenticación/contexto, que siguen ejecutándose. Si no se alcanzan o el uso no se repite, reducir el alcance de caché.

Desplegar primero migraciones compatibles, luego funciones con caché desactivada y finalmente frontend/metadatos. Activar por dominio con comparación de métricas. Revertir desactivando la bandera y, para el experimento POS, recuperando la RPC directa. No hacen falta borrados de datos de negocio para revertir.

## Alcance recomendado de la primera implementación

Entregas 1 y 2: Redis administrado por HTTPS, utilidades mínimas, noticias/términos del Club y un reporte con TTL corto, autenticación vigente, vigencia coordinada y salida a PostgreSQL ante fallos. Las entregas restantes dependen de los resultados del piloto. Esto permite demostrar utilidad antes de cambiar rutas de inventario o añadir invalidación transaccional a operaciones frecuentes.
