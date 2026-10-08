# Portal: actualizar por cambios

Las lecturas privadas conservan su resultado en memoria de la sesión hasta un aviso de revisión, una fecha de negocio o un máximo de respaldo de quince minutos. Noticias, reglas y catálogo usan la caché pública de Vercel; una revisión nueva solicita una URL nueva y evita reutilizar una publicación anterior.

El cliente WebSocket existente recibe avisos de la cuenta y del contenido común. Al reconectar verifica revisiones; cuando un canal falla conserva la verificación limitada de respaldo. Una actualización recarga solo la sección visible; las otras se consultan al abrirlas.

El canje consulta disponibilidad al abrir y la operación conserva en PostgreSQL las validaciones de stock, puntos, sesión e idempotencia. La actividad de interacciones reales se añade a peticiones privadas cuando corresponde; si no hay una petición útil sigue el aviso de actividad necesario para la seguridad.

Verificación: 186 pruebas del frontend, más las comprobaciones finales de recuperación y compilación desde Git. Ensayo local con 50 navegadores reales, tres suscripciones privadas por persona, navegación repetida sin lecturas de contenido adicionales, cambio privado a una sola cuenta, noticia a las 50 y dos canjes cancelados con stock restituido. La prueba local no demuestra capacidad del cómputo Nano de producción.
