# Corrección de carga del acceso — 6 de octubre de 2026

Incidencia: el botón «Ingresar al sistema» no respondía tras publicar la optimización de login. En una carga limpia de producción sí ejecutaba la validación; se investigó la mezcla de recursos guardados y nuevos.

Se reprodujo el bloqueo al enlazar el módulo completo js/main.js con una copia de js/config.js anterior a la publicación: «The requested module './config.js' does not provide an export named 'LOGIN_REGION_ENABLED'». El import obligatorio de la nueva bandera impedía inicializar la pantalla y registrar window.loginSubmit. Las pruebas anteriores validaban los módulos aislados y el acceso local, pero no esta combinación de versiones.

La lectura de caché del service worker también buscaba en todas las cachés del mismo dominio, incluidas las de Club. Eso podía devolver una configuración antigua de otra aplicación incluso después de cambiar la versión del sistema.

La corrección:

- Lee la nueva opción a través del espacio de nombres del módulo, compatible con una configuración anterior que todavía no la exporta. La bandera false conserva la reversión de región.
- Los dos service workers consultan únicamente su propia caché. El del sistema toma las ventanas después de eliminar sus versiones antiguas.
- Las páginas mobile/desktop recuperan una carga de módulos interrumpida cuando se activa el worker nuevo. No recargan una aplicación que ya tiene su manejador de acceso inicializado. La comprobación del worker evita la caché HTTP.
- Publica eruditos-v126 y club-eruditos-v33; el portal independiente conserva su versión calculada por contenido.

Verificación: ocho pruebas nuevas de compatibilidad/caché/recuperación, 165 pruebas frontend aprobadas y 17 pruebas relacionadas del backend aprobadas. Se comprobó el enlace de los módulos completos tanto del sistema como de Club con la configuración anterior.

Durante el diagnóstico se desactivó temporalmente STAFF_LOGIN_RPC_ENABLED como mitigación. El síntoma aclarado por el usuario era anterior a la petición HTTP: no requería modificar contraseñas, usuarios o permisos. Club conserva su recorrido y las cachés Redis de catálogos mantienen su configuración.
