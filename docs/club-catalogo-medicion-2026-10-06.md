# Catálogo público de Club: medición del 6 de octubre de 2026

Se midió el catálogo público antes de añadir otra capa de caché. Con el catálogo actual de un premio, Redis con una revisión fresca de PostgreSQL no aporta un ahorro relevante. No se habilita Redis en Club; continúa la caché CDN y su invalidación existente.

## Resultados

| Recorrido | Muestras | Mediana | Percentil 95 de la muestra |
| --- | ---: | ---: | ---: |
| Consulta completa de catálogo en Oregón | 30 | 37,23 ms | 398,71 ms |
| Consulta de revisión + GET de Redis en Oregón | 30 | 38,94 ms | 371,03 ms |
| GET de Redis solo, sin comprobar cambios | 30 | 1,48 ms | 1,88 ms |
| Origen público en región automática (Brasil), desde el equipo de prueba | 10 | 950,69 ms | 1447,19 ms |
| Origen público dirigido a Oregón, desde el mismo equipo | 10 | 431,68 ms | 503,98 ms |

La mediana del origen dirigido a Oregón fue aproximadamente 55 % menor en estas pruebas. Las llamadas se hicieron secuencialmente y en ventanas diferentes. Las muestras pequeñas y su variabilidad no permiten prometer esos porcentajes ni percentiles para todos los usuarios de producción. El percentil 95 con diez muestras es el máximo observado.

En cada uno de los dos portales se realizaron diez solicitudes: una MISS y nueve HIT de CDN. Sus medianas fueron 126,45 ms (Club independiente) y 132,24 ms (portal integrado), incluyendo la solicitud inicial. Estos resultados describen las pruebas, no el tráfico real ni una tasa de aciertos mensual.

El cuerpo público tiene 514 bytes, revisión 6 y un premio. El diagnóstico comparó el resultado completo del RPC (537 bytes, incluyendo siguienteCambio): 30 coincidencias, cero fallos de Redis. La clave temporal tuvo una expiración de 60 segundos. El diagnóstico exigió una credencial verificada mediante un RPC reservado a service_role; el acceso anónimo devolvió 403. La función temporal se retiró al terminar la medición.

## Cambio aplicado

El proxy compartido por ambos proyectos Vercel envía `x-region: us-west-2` únicamente al solicitar el catálogo público a Supabase. La cabecera la fija el servidor y se excluyen las cabeceras del visitante. Reglas y noticias conservan su recorrido actual. La región efectiva del origen se verificó mediante `x-sb-edge-region`.

Se conservan el cuerpo, ETag, TTL, fechas programadas e invalidación por etiquetas de la caché CDN. Disponibilidad, saldos y canjes siguen usando sus consultas actuales. No requiere migraciones ni secretos nuevos.

La prueba del proxy comprueba la selección de región para los tres recursos y la exclusión de credenciales y de la región enviada por el visitante. Los dos conjuntos de rutas utilizan la misma implementación.

## Criterio para reconsiderar Redis

Repetir la medición si crece el catálogo o aumentan los fallos de CDN y la carga del origen. Una caché que consulta la revisión en PostgreSQL en cada lectura conserva esa consulta; no elimina la carga de base de datos. El catálogo actual no justifica añadir la coordinación adicional necesaria para evitarla.

Datos completos, sin credenciales ni datos personales: `club-catalogo-medicion-2026-10-06.json`.

Referencia oficial para la cabecera regional: https://supabase.com/docs/guides/functions/regional-invocation

Verificación previa a publicación: 152 pruebas del frontend aprobadas, incluido el build independiente. Se verificaron los archivos canónicos de Git para evitar que la conversión CRLF de Windows alterara las mediciones de tamaño. El cambio de texto local f259c7a se incluye por autorización expresa del usuario.
