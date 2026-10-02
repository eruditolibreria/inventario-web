# CLUB: pruebas locales

Portal: http://127.0.0.1:5500/club/

Supabase local: http://127.0.0.1:54323/

La cuenta «PRUEBA LOCAL CLUB» está abierta en el portal. Su usuario es `swp4283129` y su contraseña de prueba es `ClubLocal2026!`.

Las migraciones `20261001010000_club_bono_invitado.sql` y `20261001020000_club_niveles_retos.sql` están aplicadas únicamente en local. Las compras anteriores conservan su divisor; los ascensos anteriores conservan tres puntos. Los retos nuevos cuentan compras y primeras verificaciones desde la aplicación de la segunda migración.

## Reglas para verificar

| Nivel | Puntos del ascenso, tras 7 días | Compra por punto extra |
| --- | --- | --- |
| Mini erudito | — | — |
| Aprendiz de Erudito | 2 | — |
| Erudito Iniciado | 3 | Bs 100 |
| Erudito Académico | 4 | Bs 90 |
| Gran Erudito | 5 | Bs 80 |
| Erudito Maestro | 6 | Bs 70 |
| Erudito Superior | 7 | Bs 60 |
| Archierudito | 8 | Bs 50 |
| Erudito ancestral | 9 | Bs 40 |
| Erudito Supremo | 10 | Bs 30 |

Los niveles avanzan cada Bs 200 de compras netas pagadas en 365 días. El punto extra usa el nivel anterior a cada compra y redondea hacia abajo. Un salto de varios niveles registra cada ascenso una sola vez.

| Reto | Condición | Premio | Frecuencia |
| --- | --- | --- | --- |
| Erudito constante | Bs 50 acumulados | 1 punto tras 2 días | Semanal |
| Erudito diligente | Bs 250 acumulados | 5 puntos tras 7 días | Mensual |
| Erudito Comedido | 10 unidades de un producto en una compra, precio neto por unidad mayor a Bs 5 | 5 puntos tras 7 días | Semanal |
| Erudito Amiguero | 10 amigos nuevos, activos y verificados por primera vez | 10 puntos tras 7 días | Mensual |

Las semanas van de lunes a domingo y los meses son de calendario, en hora de Bolivia. La espera comienza al cumplir la condición; un premio pendiente sigue procesándose cuando termina su periodo. Una compra puede avanzar varios retos. Los créditos cuentan cuando están pagados; las devoluciones y anulaciones recalculan los beneficios.

## Comprobaciones manuales

1. Comprueba que el nivel aparece debajo del usuario, más grande y animado. Al cambiar de nivel varían la fuente y el color; Supremo usa letras doradas. El diseño del diálogo del Camino se conserva.
2. Compra Bs 25 y después otros Bs 25 con un cliente de prueba activo: el semanal pasa de «En progreso» a «Pendiente». Una compra de Bs 250 también cumple el mensual.
3. Compra 10 unidades del mismo producto a Bs 6: cumple el mayorista. Bs 5 exactos, Bs 6 descontados a Bs 5, productos diferentes o unidades repartidas entre compras no cumplen.
4. Devuelve una unidad de una compra de 10 unidades: el mayorista pierde su condición. Los puntos ya entregados se revierten en el historial.
5. Verifica 10 referidos nuevos del mes: el Amigo Fiel queda pendiente. Repetir la verificación conserva la fecha original; los mismos amigos no cuentan de nuevo el mes siguiente.
6. Prueba los cuatro retos en pantalla pequeña y en ambos temas. Arrastra entre Inicio, Premios, Puntos y Canjes; al superar el 30% cambia de tarjeta y el recorrido continúa en ambos sentidos.
7. Inicia sesión desde un navegador nuevo. La primera carga reintenta una vez los cortes de conexión o errores temporales del servidor. Si continúa fallando, usa «Reintentar» sin recargar. Las peticiones tienen un límite de 30 segundos y los errores de autorización conservan el flujo normal de ingreso.
8. En Android, inicia un arrastre desde el encabezado, los márgenes, una imagen o un botón. Debe mostrar la tarjeta vecina y cambiar al superar el 30%. El scroll vertical, los campos de texto y las ventanas abiertas conservan su comportamiento. Ocultar la barra del navegador no debe cancelar el arrastre.
9. En Chrome de Android, espera a que aparezca el botón de instalar. Solo aparece cuando el navegador ofrece el aviso nativo; al tocarlo abre ese aviso directamente. Confirma «Instalar» en el navegador. La comprobación en un teléfono físico debe realizarse en una URL HTTPS; localhost es una excepción para pruebas en la propia computadora. Tras aceptar, el botón se oculta. En iPhone se mantienen las instrucciones manuales.
10. Abre la misma cuenta desde dos dispositivos y confirma «Sí, usar aquí» en el segundo. El primero debe volver al ingreso inmediatamente, con el mensaje de sesión trasladada, sin tocar ni recargar su pantalla. Cancelar conserva la sesión anterior. Si el primero está sin conexión o suspendido, el traslado se comprueba al volver; mientras falla el canal de tiempo real, hay una comprobación de respaldo cada 15 segundos con la pantalla activa. Esta función requiere la migración local `20261001030000_club_sesion_realtime.sql` y la acción `SESION` de `club-auth`.
11. Deja la cuenta sin interacción durante 10 minutos. Debe volver al ingreso sin cuenta regresiva ni aviso previo y mostrar «Tu sesión se cerró por inactividad, inicia sesión nuevamente». Recargar, renovar el token y las consultas automáticas no reinician el plazo; los toques, movimientos, escritura, rueda de desplazamiento y Atrás sí cuentan. El servidor también rechaza el acceso vencido. Se aplicó en local `20261002010000_club_inactividad.sql`.
12. Usa dos pestañas del mismo navegador: la actividad en una mantiene ambas abiertas. Suspende el teléfono o deja una pestaña oculta durante más de 10 minutos; al volver debe pedir ingreso. Un toque después del vencimiento no reactiva la sesión anterior. Al ingresar nuevamente comienza un plazo nuevo.
13. Desde la pantalla principal, presiona Atrás: aparece «Presiona atrás nuevamente para salir». Presiona otra vez dentro de 1,8 segundos para abandonar el portal mediante la navegación nativa. Si esperas, vuelve a requerir dos toques. Con el Camino, una imagen o un diálogo abierto, el primer Atrás cierra esa ventana. La función se comparte con administración; comprobar también el botón físico/gesto de Atrás en una PWA de Android. Salir del portal con Atrás conserva el acceso hasta que venza su plazo de inactividad. El botón «Cerrar sesión» permite cancelar o confirmar el cierre inmediato.

Para comprobar los plazos sin esperar días, las pruebas SQL ajustan las fechas de calificación dentro de una transacción y deshacen sus datos al terminar. No se modificó el reloj ni se aceleraron los plazos reales del portal local.

Pruebas del backend: `supabase/tests/club_niveles_retos.test.sql`, `club_bono_invitado.test.sql` y `club_eruditos.test.sql`. El proceso automático atiende lotes de hasta 500 cuentas cada cinco minutos y continúa desde la última cuenta atendida.

No se desplegó ningún cambio a producción.
