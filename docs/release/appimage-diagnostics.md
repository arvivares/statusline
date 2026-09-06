# AppImage: diagnóstico de la ventana vacía en Ubuntu

Estado: corrección candidata implementada para [issue #18](https://github.com/arvivares/statusline/issues/18),
pendiente de construir y validar en Linux; **no hay corrección publicada**.
El `.deb` oficial funciona en el equipo Ubuntu 26.04 reportado. Las comparaciones
de diagnóstico siguientes no requieren recompilar.

## Hallazgos en el artefacto 0.1.12

Inspección estática del AppImage publicado, con SHA-256
`df454ae27a48cf2028b6bea45a3c3464ceb76a75d50052c0e3007c2fd2b866f3`:

- Incluye GIO `2.72.4` y un módulo TLS `libgiognutls.so`, pero no los módulos GVFS
  del sistema. El diagnóstico del equipo afectado muestra que mezcla ese GIO con
  GVFS de Ubuntu 26.04.
- `g_task_set_static_name` existe desde [GIO 2.76](https://docs.gtk.org/gio/method.Task.set_static_name.html),
  no desde 2.88. El GIO incluido no proporciona ese símbolo.
- El hook GTK del lanzador fuerza `GDK_BACKEND=x11`. Pasar `GDK_BACKEND=wayland`
  desde fuera no constituye una prueba de Wayland: el hook lo sobrescribe.
- El hook asigna `GIO_EXTRA_MODULES` a los módulos incluidos, pero no fija
  `GIO_MODULE_DIR`, por lo que no excluye el directorio predeterminado del host.
- El inventario no incluye bibliotecas con los nombres `libEGL*` o `libgbm*`.
  Sí incluye `libwayland*`. No hay evidencia suficiente para afirmar que
  «Mesa/EGL antiguo incluido» sea la causa exacta del error gráfico.

Estos hallazgos iniciales separaron las hipótesis de GIO y EGL. La segunda prueba,
documentada más abajo, identificó después el símbolo concreto del conflicto gráfico.

## Ejecutar en el Ubuntu afectado

Usa una terminal de la sesión gráfica normal, no `sudo`, SSH ni una consola sin
escritorio. Sal de Statusline con **Quit/Salir** en el menú del icono: cerrar la
ventana sólo la oculta. No abras otra instancia mientras se ejecuta el script.

Desde la raíz del repositorio, o después de copiar el script al equipo:

```bash
bash apps/desktop/scripts/diagnose-appimage-linux.sh \
  "/ruta/Statusline.Companion_0.1.12_amd64.AppImage" \
  --sha256 df454ae27a48cf2028b6bea45a3c3464ceb76a75d50052c0e3007c2fd2b866f3 \
  --seconds 20 --trace
```

La ruta del AppImage es un ejemplo: reemplázala por la descarga verificada.
El SHA-256 anterior es **sólo para 0.1.12**; para otros artefactos usa el de su
manifest firmado. El script no sustituye la verificación OpenPGP documentada en
[instaladores](desktop-installers.md#firma-de-linux). Si el archivo no tiene
permiso de ejecución, debes concedérselo expresamente antes: el script no cambia
los permisos del original.

No requiere Node, Rust, Docker, una recompilación ni instalar paquetes. Comprueba
que existan las herramientas normales de Ubuntu (`bash`, `file`, `sha256sum`,
`realpath`, `timeout`, `setsid`, `pgrep`, `find`); si falta alguna, se detiene.
Necesita espacio para una copia extraída del AppImage y los logs.

Cada caso utiliza **el mismo `AppRun` extraído sin modificaciones** durante
20 segundos. Observa la interfaz y responde al final de cada caso:
`rendered`, `blank`, `no-window` o `not-observed`. `rendered` significa que el
contenido de Statusline aparece y responde; no basta con que exista una ventana.
Sin entrada interactiva se registra `not-observed`, nunca un éxito inventado.

| Caso                      | Módulos GIO                        | Renderizado       |
| ------------------------- | ---------------------------------- | ----------------- |
| baseline                  | Búsqueda predeterminada del bundle | Predeterminado    |
| gio-bundled-only          | Sólo el directorio incluido        | Predeterminado    |
| software                  | Búsqueda predeterminada del bundle | Software con Mesa |
| gio-bundled-only-software | Sólo el directorio incluido        | Software con Mesa |

La selección GIO usa `GIO_MODULE_DIR` y `GIO_EXTRA_MODULES` apuntando al directorio
incluido: conserva el módulo TLS incluido en lugar de vaciar todos los módulos.
Son controles de diagnóstico descritos por [GIO](https://docs.gtk.org/gio/overview.html#running-gio-applications),
**no una configuración de producción validada**. El control de software usa
[`LIBGL_ALWAYS_SOFTWARE`](https://docs.mesa3d.org/envvars.html#envvar-LIBGL_ALWAYS_SOFTWARE);
no garantiza desactivar aceleración de un driver propietario.

En todos los casos se eliminan los overrides gráficos/GIO enumerados por el
script, se desactiva el relay mediante una variable sólo del proceso y se usan
directorios XDG y registros GStreamer temporales. Es una comparación controlada
de renderizado, **no una prueba de emparejamiento, keyring o sincronización**.
Puede detectarse la instalación local de Codex. No pulses Pair, Disconnect,
Sign in ni cambies ajustes durante las pruebas.

El script crea un grupo de procesos exclusivo por caso y termina sólo ese grupo
al vencer el tiempo o al interrumpir el diagnóstico. No mata otras apps por
nombre, borra configuraciones ni modifica bibliotecas. Mantiene el sandbox de
WebKit; no lo desactives si aparece un error distinto.

## Qué compartir e interpretación

Al terminar imprime la ubicación de una carpeta temporal privada (permiso 700).
Conserva la copia extraída, perfiles temporales, `environment.txt`, el hook del
lanzador y los logs de cada caso. Comparte primero **`summary.tsv`** y qué viste
en pantalla; no sube información automáticamente.

- `exit_code=124` significa que venció el tiempo. No demuestra éxito ni caída del
  renderizador.
- Si desaparece el símbolo indefinido al aislar GIO, pero continúa EGL, hemos
  separado ambos fallos: falta estudiar las bibliotecas gráficas realmente
  cargadas y los procesos WebKit.
- Si sólo el caso combinado funciona, la prueba apunta a más de un factor; no
  demuestra por sí sola qué biblioteca gráfica es incompatible.
- Si no se reproduce el fallo en baseline, detente: los controles temporales
  pueden haber cambiado una condición relevante. No atribuyas la mejora a GIO.
- Un log sin errores no sustituye la observación visual. Un problema de display,
  sandbox o lanzamiento se debe clasificar aparte.

Los archivos `startup.log` y `loader.*` son diagnósticos **privados**. Revisa y
redacta rutas personales, correos, tokens, enlaces/QR y datos de cuenta antes de
compartir un fragmento relevante. No adjuntes los perfiles temporales completos,
credenciales, volcados de memoria ni el directorio completo como ZIP. La limpieza
posterior de la carpeta temporal es manual para no perder evidencia.

## Segunda prueba: bibliotecas Wayland del bundle frente al host

La [respuesta con la primera matriz](https://github.com/arvivares/statusline/issues/18#issuecomment-5560216983)
confirma que aislar GIO elimina el símbolo indefinido, pero **EGL y la ventana
vacía persisten en los cuatro casos**. Los fragmentos del loader muestran
bibliotecas EGL/GBM del host junto con Wayland incluido. Eso justifica una prueba
de aislamiento; todavía no demuestra que quitar Wayland solucione el renderizado.

El mismo script actualizado incorpora un modo de **dos casos**:

```bash
bash apps/desktop/scripts/diagnose-appimage-linux.sh \
  "/ruta/Statusline.Companion_0.1.12_amd64.AppImage" \
  --sha256 df454ae27a48cf2028b6bea45a3c3464ceb76a75d50052c0e3007c2fd2b866f3 \
  --wayland-comparison --seconds 20
```

Este modo exige checksum explícito y activa automáticamente los traces del
loader. Mantiene los controles de seguridad y privacidad descritos arriba.
Necesita `ldconfig` y espacio para **dos copias extraídas**; no instala nada.

| Caso                | GIO                    | Wayland                      | Renderizado    |
| ------------------- | ---------------------- | ---------------------------- | -------------- |
| gio-bundled-wayland | Sólo módulos incluidos | Bibliotecas incluidas        | Predeterminado |
| gio-host-wayland    | Sólo módulos incluidos | Se permite resolver del host | Predeterminado |

Antes de lanzar la app, comprueba el inventario de Wayland: exactamente cuatro
archivos regulares en `usr/lib`, sin enlaces simbólicos ni copias/alias adicionales:

- `libwayland-client.so.0`
- `libwayland-server.so.0`
- `libwayland-egl.so.1`
- `libwayland-cursor.so.0`

También comprueba que el cache de `ldconfig` tenga un candidato x86-64 ELF
legible para cada biblioteca. Si no coincide la estructura inspeccionada, se
detiene **sin mover archivos**. No intenta adaptar a ciegas otra distribución.

Conserva la extracción de control intacta y crea una segunda copia independiente
en `host-wayland-appdir`. Mueve **sólo esos cuatro archivos de la segunda copia**
a `wayland-quarantine`, fuera de las rutas de búsqueda del AppDir, guardando sus
checksums. No los borra: siguen disponibles para inspección. Los lanzadores,
GTK, GLib, GIO, WebKit y las bibliotecas del sistema no se modifican.

No se reemplaza globalmente `LD_LIBRARY_PATH`, no se fuerza renderizado por
software y no se cambian los hooks GTK. En ambos casos sigue aplicándose X11
desde el hook del AppImage; ésta **no es una comparación de sesiones Wayland/X11**.

Comparte `summary.tsv` y la observación visual de ambos casos. Además revisa
`loader-evidence.txt` de cada caso: filtra las líneas `calling init`, errores de
símbolos y nombres de procesos WebKit/Statusline, conservando el nombre del trace
por PID. Redacta las rutas personales antes de pegar un fragmento en el issue.
`host-wayland-candidates.tsv` sólo describe candidatos: no prueba qué biblioteca
terminó cargando el proceso del renderizador.

Para interpretar el experimento necesitamos comprobar que:

1. El control reproduce EGL y ventana vacía, sin volver a introducir el error GIO.
2. El caso experimental carga realmente Wayland del host en el proceso relevante,
   no sólo que se hayan apartado los archivos incluidos.
3. La interfaz se muestra y responde, o se registra con precisión qué fallo
   persiste o qué nuevo símbolo/dependencia falta.

Si desaparece EGL pero sigue vacía la ventana, el issue sigue abierto y falta
diagnóstico. Si la biblioteca del host no llega a inicializarse, no se puede
atribuir un resultado negativo a esta hipótesis. Si el control ya no falla, la
comparación tampoco valida una corrección.

## Resultado de la segunda prueba

La [segunda respuesta del equipo afectado](https://github.com/arvivares/statusline/issues/18#issuecomment-5560404405)
reporta una comparación controlada en Ubuntu 26.04.1, XFCE/X11, Intel Haswell y
Mesa 26.0.8:

- GIO aislado + Wayland incluido: EGL falla y la ventana queda vacía.
- GIO aislado + Wayland del host: EGL inicializa y aparece la interfaz.
- Mesa del host requiere `wl_fixes_interface`; el Wayland incluido no lo exporta
  y el del host sí. Los traces muestran la inicialización de las bibliotecas del
  host en el caso experimental.

Es evidencia causal en **ese equipo**, no una certificación de todos los sistemas.
El informe menciona un detector automático de capturas que no existe en el script
versionado: éste sólo pide observación manual. La captura por ID de ventana es una
verificación adicional del informante, no una prueba automatizada nuestra. El número
de colores de una imagen tampoco demuestra interacción o sincronización correcta.
Los otros mensajes de símbolos del loader requieren contexto antes de clasificarlos
como fallos fatales o búsquedas opcionales.

## Corrección candidata de empaquetado

[`prepare-appimage-linux.mjs`](../../apps/desktop/scripts/prepare-appimage-linux.mjs)
se ejecuta después de Tauri, tanto con `npm run bundle:linux` como en CI:

1. Acepta un único AppImage recién construido en `bundle/appimage`, sin firmas
   `.asc`/`.sig`. No se usa sobre descargas publicadas.
2. Extrae a un directorio temporal exclusivo y valida lanzador, ejecutable, módulo
   TLS y las cuatro bibliotecas Wayland exactas. Un alias, enlace inesperado,
   archivo faltante o cambio de estructura detiene el proceso antes del ajuste.
3. Excluye sólo esos cuatro archivos de la copia de trabajo y añade
   [`statusline-gio.sh`](../../packaging/linux/statusline-gio.sh) después del hook GTK.
   El hook fija ambos directorios GIO al módulo incluido, conserva `libgiognutls.so`
   y no cambia variables globales del sistema. Se registra la política en
   `statusline-appimage-policy.json` dentro del paquete.
4. Reutiliza el runtime Type 2 original y el plugin de salida AppImage que Tauri
   ya descargó. No vuelve a ejecutar linuxdeploy, que podría reintroducir las
   bibliotecas. Si falta el plugin en el cache Tauri, se detiene sin descargar otro.
5. Extrae el resultado y compara contenido, permisos de archivos y enlaces de
   **todo** el payload con la copia validada. Sólo entonces reemplaza la salida
   local todavía sin firmar; ante un error, conserva el instalador de entrada.

La base de construcción continúa siendo Ubuntu 22.04. No se eliminan GLib,
WebKit, GStreamer ni bibliotecas del sistema; no se desactiva el sandbox ni se
fuerza software rendering en el producto. La política del hook GTK sigue siendo
X11, por lo que una sesión Wayland necesita XWayland.

El host debe proporcionar las cuatro bibliotecas Wayland compatibles con su Mesa,
además del entorno gráfico requerido por AppImage. No es un paquete para Linux
headless ni una garantía de compatibilidad con cualquier distribución.
Los controles `GIO_MODULE_DIR`/`GIO_EXTRA_MODULES` están documentados por
[GIO como controles de diagnóstico](https://docs.gtk.org/gio/overview.html#running-gio-applications),
no como una API de empaquetado estable: esta adaptación acotada debe revalidarse
al actualizar GLib/Tauri. Al excluir GVFS del host, no se promete acceso a sistemas
de archivos remotos mediante sus módulos; la selección local del ejecutable Codex,
TLS, keyring y sincronización necesitan pruebas de regresión.

### Pruebas y orden de publicación

El smoke de Linux ahora verifica la política extraída y ejecuta **tanto DEB como
AppImage**. Este último arranca mediante su propio runtime con
`APPIMAGE_EXTRACT_AND_RUN=1` (sin requerir FUSE). Ambos deben producir un marcador
nuevo mediante el comando `frontend_ready`: el JavaScript inicializado debe haber
completado una llamada IPC al backend. Un proceso vivo, un archivo viejo, un enlace
simbólico o un log vacío no bastan. Hay un plazo de 30 segundos y una comprobación
adicional de supervivencia/errores; sólo se terminan los grupos de procesos creados
por cada prueba. Los perfiles temporales y logs se conservan privados.

CI utiliza Xvfb y Mesa software **sólo para estas pruebas**, mantiene el sandbox y
desactiva el relay de los procesos de prueba. No realiza emparejamientos. El marcador
demuestra inicialización del frontend/IPC, no pixels correctos ni respuesta a clics.

El flujo preparado es:

`construir → ajustar AppImage → validar payload + arranque Ubuntu 22.04 → firmar/verificar → subir artefactos → revalidar los mismos bytes en Ubuntu 24.04 → publicar release`

La revalidación independiente también cubre 22.04 y 24.04 sin recompilar. Las
releases antiguas, incluida 0.1.12, no incluyen la política ni el marcador Linux y
**no pueden pasar este nuevo smoke**; para reproducirlas se usa el diagnóstico
anterior, no una excepción que omita el control nuevo. Los artefactos de Actions
no equivalen a una release aprobada: debe finalizar todo el workflow correctamente.

## Verificaciones pendientes antes de distribuir

- Ejecutar el pipeline Linux del candidato y confirmar construcción, reempaquetado,
  firma/verificación y ambos runners. Las pruebas locales con herramientas simuladas
  y la inspección estática del AppImage real no sustituyen estas ejecuciones.
- Probar **el AppImage final firmado** en el Ubuntu 26.04 afectado, sin overrides
  de diagnóstico: interfaz visible y botones funcionales; bandeja, ocultar,
  reapertura y Salir; selección del Codex local; emparejamiento y sincronización
  con el móvil; almacenamiento seguro y reinicio. Mantener QR/tokens privados.
- Repetir la comprobación gráfica con Ubuntu 22.04/24.04 y, cuando haya equipos
  disponibles, otra GPU y sesión Wayland/XWayland. No aumentar el soporte declarado
  sólo por pasar un runner headless.
- Elegir una nueva versión antes de publicar. No sobrescribir 0.1.12 ni cerrar el
  issue hasta completar la verificación del candidato en el equipo afectado.
