# Plan final de implementación Redis para Eruditos

Implementación posterior: ver [estado y evidencia](redis-implementacion-2026-10-06.md). El contenido siguiente conserva el plan aprobado previo a la ejecución.

Fecha: 6 de octubre de 2026. Este documento reemplaza las prioridades de los análisis previos. Es un plan: no se han instalado dependencias, configurado secretos, ejecutado comandos Redis, migrado tablas ni desplegado cambios en esta revisión.

## Infraestructura confirmada

Se accedió a la consola autenticada de [SistemaEruditosREDIS](https://console.upstash.com/redis/d553bfb1-dc2f-4cfb-a985-c9b9cb8ca132/details?teamid=0). Se verificaron:

- Upstash Redis, plan Free Tier, región primaria Oregon / AWS us-west-2; la consola identifica la base como Global.
- Acceso REST disponible y TLS/SSL habilitado.
- Límites mostrados: 500.000 comandos al mes, 256 MB de datos y 10 GB de transferencia; uso mostrado cero en esas métricas.
- Eviction activado. Puede expulsar claves para hacer espacio; la aplicación debe tratarlo como un fallo normal de caché.

No se cambiaron ajustes ni se extrajeron tokens. Las variables UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN y CACHE_ENABLED todavía no están definidas en el archivo local supabase/.env.local. No se ha comprobado si están presentes en Supabase Secrets de producción. Tener acceso a la consola no equivale a tener la aplicación conectada: la conexión real se verificará en la primera entrega.

Se mantiene la instancia existente. Antes de activar, verificar región de Supabase y medir el recorrido Edge → Upstash y Edge → PostgreSQL. Oregon no demuestra cercanía al backend. No cambiar región, suscripción ni crear recursos adicionales sin necesidad demostrada.

La integración será mediante HTTPS desde Edge Functions Deno, conforme al [ejemplo de integración de Supabase](https://supabase.com/docs/guides/functions/examples/rate-limiting). Los secretos permanecerán en configuración local excluida de Git y en Supabase Secrets. Se necesita un token capaz de leer y escribir las entradas; el token de solo lectura no permite rellenar la caché.

## Alcance final

### Catálogos que se implementarán gradualmente

Los TTL son puntos de partida ajustables. Invalidar por cambios; el plazo no debe utilizarse como espera obligatoria para ver una edición.

| Datos | Proyección cacheada | TTL inicial | Entrega |
| --- | --- | --- | --- |
| Proveedores | ID, nombre y contacto necesario | 30 min | Piloto |
| Sucursales | Datos descriptivos permitidos, etiquetas y detalles | 30 min | Piloto |
| Categorías de inventario | DISTINCT dentro del alcance autorizado | 15 min | Piloto |
| Usuarios para selectores | ID y usuario/nombre mostrado | 15 min | Ampliación |
| Clientes para selección | ID, código y nombre; contacto donde haga falta | 10 min | Ampliación |
| Filtros de auditoría | Usuarios y sucursales visibles | 10 min | Ampliación; reutilizar catálogos |
| Roles/descripciones de permisos | Código/nombre, módulo, acción y descripción | 30 min | Ampliación |

La RPC actual de contexto ya devuelve sucursales y sus nombres. Reutilizar ese resultado verificado para etiquetas y selectores cuando alcance; Redis aporta a los detalles/proyecciones adicionales y lecturas repetidas. No duplicar una consulta que ya se resolvió en la misma petición ni cachear la RPC de autorización.

### Ampliación condicionada a resultados

- Fichas descriptivas de productos y láminas: 15 min; separar stock/precio/estado.
- Código de barras → IDs y sucursales: 15 min; conservar múltiples coincidencias y resolver disponibilidad aparte.
- Búsquedas de láminas: 60 s, con filtros, paginación y cambios de estado cubiertos.
- Un reporte repetido: 30–60 s y antigüedad visible.
- Última compra y cuerpo de comprobantes: después de medir coste, repetición e invalidación de nuevas compras/anulaciones.

La búsqueda POS y el inventario actual usan Supabase directamente. No migrar todas esas lecturas a Edge por defecto. Comparar ruta directa contra Edge + Redis en aciertos y fallos antes de adoptar un cambio.

### Autoridad de PostgreSQL y cachés existentes

Validación actual de identidad, usuario activo, sesión del Club, permisos y alcance; reserva, liberación, cobro, idempotencia, caja, crédito, puntos y canjes mantienen su lógica PostgreSQL. Las operaciones no se autorizan con un valor cacheado de estado/precio/stock.

Conservar la caché CDN existente del Club para reglas, noticias y catálogo, así como la instantánea de progreso privado en PostgreSQL. Tipos de servicio, métodos de pago y categorías de gasto ya son opciones HTML estáticas. Los archivos e imágenes permanecen en Storage/CDN; Redis guardará referencias descriptivas cuando corresponda.

## Diseño de lectura

1. Validar identidad, permisos y alcance actuales mediante las utilidades existentes.
2. Validar filtros; resolver defaults y proyección autorizada.
3. Leer la generación vigente del catálogo en PostgreSQL.
4. Construir la clave y buscar en Redis.
5. Validar formato, generación y vencimiento de la entrada. Un acierto devuelve la proyección admitida.
6. Ante ausencia, error, cuota agotada o tiempo excedido, consultar PostgreSQL y devolver sus datos.
7. Guardar únicamente resultados exitosos con TTL en una operación; un fallo al guardar no cambia el éxito de la lectura.

Claves: eruditos:<entorno>:v1:<dominio>:<generacion>:<hash-alcance-proyeccion-filtros>.

Separar local/pruebas/producción mediante prefijos y banderas. No incluir JWT, documentos o nombres personales como texto visible en claves. Las claves restringidas incluirán usuario verificado o una equivalencia de visibilidad demostrada, además del alcance efectivo y proyección. SOLO_ACTIVOS, texto, fechas, orden, página y límite participan cuando alteren el resultado. Mantener la normalización exacta de cada consulta.

Añadir supabase/functions/_shared/redis.ts y cache.ts, con dependencia fijada compatible con Deno, abortos, serialización validada y métricas. Configuración: CACHE_ENABLED y CACHE_DOMAINS para activar grupos. Presupuesto de espera provisional: 100 ms para el intento de caché, ajustado por medición. Sin bucles de reintento en cada petición; después de fallos repetidos, una instancia omite Redis temporalmente. El resto de la solicitud sigue hacia PostgreSQL.

Deduplicar regeneraciones simultáneas dentro de la instancia; variar TTL hacia abajo para repartir expiraciones sin superar el máximo anunciado. Añadir coordinación entre instancias solo si aparece carga repetida relevante. No usar locks Redis para stock o cobros.

## Invalidación elegida: generaciones en PostgreSQL

Usar una tabla privada de generaciones por catálogo, actualizada dentro de la misma transacción por triggers de las tablas que lo alimentan. No almacenar la generación autoritativa en Redis: Upstash documenta [consistencia eventual](https://upstash.com/docs/redis/features/consistency) y la instancia permite expulsión de claves. Una clave perdida o una réplica atrasada debe producir una consulta de origen, no restablecer un contador de versiones.

Cada petición que consulte Redis obtiene una generación vigente de PostgreSQL. Integrar esa lectura en el contexto actual cuando sea sencillo y compatible, o usar una RPC pequeña con todos los dominios necesarios en una sola consulta. Mantener la autorización actual; si no se puede verificar la versión, omitir Redis.

Al confirmar un cambio, las siguientes peticiones ya buscan claves con la nueva generación. Las anteriores caducan por TTL; no hace falta barrer todo Redis. Al rellenar, obtener datos y versión desde el mismo snapshot o comprobar la versión después y descartar el guardado si cambió. Una lectura iniciada antes de una escritura puede devolver su snapshot anterior; no deberá contaminar claves de la generación posterior. El navegador se refresca después de su propia escritura y omite la copia local.

Matriz mínima:

| Dominio | Tablas/cambios que afectan su generación |
| --- | --- |
| Proveedores | Altas, edición, baja y pertenencia a filtros de proveedores |
| Sucursales | Nombres, detalles y estado; alcance actual separado |
| Usuarios/selectores/auditoría | Usuarios y membresías que alteren las listas visibles |
| Clientes | Nombre/código/contacto/estado y reglas de visibilidad de la proyección |
| Roles/descripciones | Roles y catálogo de permisos; asignaciones de seguridad siguen actuales |
| Categorías/productos descriptivos | Campos descriptivos de inventario, altas/bajas/importaciones/traslados |
| Láminas | Metadatos y estado cuando la selección dependa de él |

Para inventario descriptivo, no incrementar generación por cada modificación exclusiva de stock: comparar los campos que componen el catálogo. Revisar todos los canales de escritura, incluyendo RPC de compras/importaciones y SQL administrativo. Aplicar invalidación por sentencia donde sea posible para evitar incrementos por cada fila de una importación; medir contención. No efectuar llamadas HTTP desde triggers de venta.

La generación permite invalidación lógica sin depender de DEL. Por tanto, el piloto no requiere un worker de purga ni una outbox nueva. Si posteriormente se utiliza invalidación por borrados para otro dominio, diseñarla de manera explícita; el worker actual del Club purga Vercel y tiene otro propósito.

## Integración por repositorio

Backend:

- Utilidades compartidas redis/cache.
- Migración para generaciones y RPC protegida; triggers de los catálogos habilitados.
- proveedores/index.ts y usuarios/index.ts para el piloto, preservando respuestas existentes.
- RPC de DISTINCT de categorías y acción de lectura en inventario/index.ts. Ejecutar consultas de datos con el JWT del usuario cuando deban conservar las reglas de la RPC/RLS existente.
- clientes/index.ts, auditoria/index.ts y proyecciones ligeras de usuarios/roles para la ampliación. Evitar calcular deuda/agregados cuando solo se solicitan nombres.

Frontend:

- js/api.js: nuevas acciones seleccionadas y metadatos de vigencia.
- js/sucursales.js y js/modos/compra.js: invalidación tras cambios y reutilización de nombres/categorías/proveedores.
- js/db.js: categorías con la ruta seleccionada, conservando la alternativa directa para pruebas y reversión.
- Clientes, servicios, venta, auditoría y administración: adoptar proyecciones ligeras sin retirar las comprobaciones necesarias de crédito/acceso.

Las respuestas indicarán generación, generadoEn y expiraEn. El navegador reutiliza datos hasta el mínimo entre su TTL local y el vencimiento efectivo de origen, considerando antigüedad para no alargarlo al recibirlos. Vaciar copias por usuario/sucursal/cambio de acceso; proteger respuestas tardías tras logout. La actualización forzada omite caché local y Redis con límites, conservando autorización. Las respuestas privadas no se incorporan al service worker ni al CDN público.

## Entregas y comprobación

1. **Conexión y línea base:** configurar URL/token en entornos autorizados, verificar conectividad con claves sintéticas que expiren, medir Edge/Redis/origen y repetición real. Revisar región de Supabase y secretos desplegados. Registrar coste de generación/contexto además del dato cacheado.
2. **Piloto completo:** proveedores, sucursales y categorías; utilidades, migración/generaciones, interfaz y pruebas. Caché desactivada por defecto hasta terminar validación.
3. **Ampliación descriptiva:** usuarios, clientes, filtros de auditoría y nombres/descripciones de roles. Nuevas proyecciones, alcance vigente y pruebas de cambios entre administradores.
4. **Evaluación posterior:** productos/láminas/códigos y reportes, incorporados solo cuando mejoren tiempos o carga de consultas sin introducir regresiones.
5. **Activación gradual:** desplegar migración compatible, funciones con bandera desactivada y frontend; activar primero proveedores, después sucursales/categorías y finalmente los otros dominios validados. Conservar reversión por bandera y rutas directas correspondientes.

Pruebas: hit/miss/expulsión/vencimiento, cambio de nombre/alta/baja, importaciones, edición mientras se rellena, permisos revocados con caché caliente, visibilidad entre sucursales/usuarios, proyección sin costos/deuda, respuestas tardías y vencimientos combinados; Redis lento, caído, cuota y escritura fallida. Verificar TTL y generaciones con Redis real en prefijo de pruebas, más simulaciones de errores. Ejecutar pruebas existentes afectadas. No registrar ventas reales para probar caché de catálogos.

Criterios: resultados y proyecciones iguales a origen para el mismo snapshot/autorización; cambios confirmados hacen seleccionar la nueva generación; cero regresiones de acceso, reserva e idempotencia; errores de Redis no convierten operaciones correctas en fallos. En al menos 50 muestras comparables por flujo medir p50/p95 frío/caliente y consultas de datos evitadas. Objetivo orientativo: reducir p95 de los flujos elegidos al menos 20 % con repetición representativa, o justificar una reducción material de consultas sin empeorar la experiencia. La autenticación/contexto y verificación de generación seguirán consultándose: no prometer eliminar todas las consultas SQL.

## Capacidad y operación

La consola muestra 500.000 comandos mensuales; en 30 días equivale a unos 16.667 comandos diarios, como promedio, no límite diario. Un fallo de caché añade escrituras a las lecturas. Contabilizar comandos por lectura/escritura, claves y respuestas; no confundir peticiones HTTP con comandos Redis. No añadir contadores INCR por petición solo para medir; usar logs y consola.

Observar aciertos, errores, tiempos, regeneraciones y consumo proyectado. Como objetivo operativo, mantener inicialmente proyección por debajo de 350.000 comandos/mes para dejar margen, sin presentarlo como cuota contratada. Acotar búsquedas/páginas y respuestas; no precargar toda la base. La expulsión activada es apropiada para datos regenerables y el [algoritmo de Upstash](https://upstash.com/docs/redis/features/eviction) no debe asumirse LRU.

Si no mejora la latencia, se alcanza la cuota o falla Redis, desactivar los dominios afectados y continuar con PostgreSQL. Cualquier cambio de plan/región dependerá de mediciones. La primera implementación utiliza la instancia existente y conserva todas las fuentes de verdad y cachés del Club ya desplegadas.
