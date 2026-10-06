# Redis implementado

Entrega autorizada para publicación en main de ambos repositorios el 6 de octubre de 2026. La migración ya está aplicada en producción y no hay migraciones pendientes. El backend se publica por GitHub Actions y el frontend por Vercel; la activación inicial de Redis corresponde a proveedores después de verificar ambos despliegues. Backend: F:/Sistema de Inventario/eruditos-backend.

Catálogos: proveedores, sucursales, categorías, clientes descriptivos, usuarios visibles de auditoría y metadatos de roles. Invalida mediante versiones transaccionales de PostgreSQL y vuelve a SQL si Redis falla. Stock, crédito, permisos efectivos y cobros conservan verificación fresca. La interfaz espera el cliente seleccionado antes de cobrar/cotizar y descarta respuestas antiguas.

Preparación comprobada: secretos locales excluidos de Git, secretos Supabase de producción con CACHE_ENABLED=false, migración local y dry-run remoto de una única migración, tipos Deno, 151 pruebas frontend, 77 backend y 107 comprobaciones SQL. Script real de seis catálogos con aciertos y expiración. CodeGraph actualizado en ambos repositorios.

250 muestras de datos desde Supabase Edge us-west-2 a Upstash us-west-2: p95 Redis 1,66–2,18 ms, consultas SQL equivalentes 56,27–390,94 ms, cero fallos. Son tiempos de datos: la autenticación/contexto siguen consultándose. Se añadió forceFunctionRegion=us-west-2 únicamente a las lecturas de catálogos; sin él las invocaciones desde Bolivia se ejecutaron en Brasil y agotaron el presupuesto de 100 ms.

Procedimiento de despliegue, activación gradual y reversión: backend/docs/redis-produccion-2026-10-06.md. Evidencia de tiempos: backend/docs/redis-benchmark-2026-10-06.json. Se requiere publicar primero la migración, después las cinco funciones y el frontend, y activar por dominios. Los cambios preexistentes en club/index.html están fuera de esta entrega.
