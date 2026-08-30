# Instaladores de Statusline Companion

El companion multiplataforma se empaqueta de forma nativa en GitHub Actions. El workflow evita cross-compilation y genera los artefactos desde el sistema operativo correspondiente.

## Artefactos preparados

| Plataforma  | Formato       | Uso recomendado                                                                                                            |
| ----------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Windows x64 | NSIS `.exe`   | Instalador principal. Se instala para el usuario actual, incluye inglés y español y no requiere permisos de administrador. |
| Windows x64 | WiX `.msi`    | Despliegues administrados. El asistente se genera en español y la instalación puede solicitar elevación.                   |
| Linux x64   | Debian `.deb` | Ubuntu, Debian y distribuciones derivadas.                                                                                 |
| Linux x64   | RPM `.rpm`    | Fedora, RHEL y distribuciones derivadas.                                                                                   |
| Linux x64   | `.AppImage`   | Distribución portátil cuando no se desea usar el gestor de paquetes; antes de abrirla hay que ejecutar `chmod +x`.         |

El instalador NSIS incorpora el bootstrapper Evergreen de WebView2. Añade aproximadamente 1,8 MB y sólo necesita descargar el runtime cuando Windows no lo tiene instalado. El AppImage no incluye GStreamer porque Statusline no reproduce audio ni vídeo.

Windows y Linux muestran la ventana en el primer inicio. Después funciona como companion de bandeja: cerrar la ventana la oculta sin finalizar el proceso. En Linux también se conserva el comportamiento de ocultarla al perder foco para escritorios sin soporte de bandeja.

## Validación rápida

Desde `StatuslineDesktop`:

```shell
npm ci
npm run release:check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
```

`release:check` comprueba que la versión coincide en npm, Cargo y Tauri; valida los targets de bundle; ejecuta Prettier, los tests TypeScript y el chequeo estricto de tipos. No compila Rust ni crea instaladores.

Para una compilación local, usa el comando correspondiente únicamente dentro del sistema operativo destino:

```shell
npm run bundle:windows
npm run bundle:linux
```

## Ejecutar el workflow

El archivo [`desktop-installers.yml`](../../.github/workflows/desktop-installers.yml) admite dos flujos:

1. **Actions > Desktop installers > Run workflow** crea artefactos temporales descargables, sin crear una release.
2. Un tag `desktop-v<versión>` crea una release borrador y adjunta todos los instaladores.

Por ejemplo, para la versión actual:

```shell
git tag desktop-v0.1.1
git push origin desktop-v0.1.1
```

El preflight rechazará el build si el tag no coincide exactamente con la versión `0.1.1` de los manifiestos. Este repositorio local todavía no tiene un remote configurado: antes de ejecutar el workflow hay que crear o elegir el repositorio GitHub y añadir `origin`.

## Requisito de Codex

Los instaladores no incluyen Codex ni credenciales. Cada usuario debe instalar la CLI oficial, ejecutar `codex login` y conservar esa sesión local. Statusline inicia `codex app-server` por `stdio` y sólo procesa metadatos de cuota.

Si la aplicación no encuentra la CLI, se puede iniciar con `STATUSLINE_CODEX_PATH` apuntando al ejecutable. En Linux se reconoce además `~/.local/bin/codex`; en Windows se comprueba la instalación habitual de la aplicación oficial. Antes de una publicación general conviene añadir una selección de ejecutable dentro de la UI para instalaciones gestionadas por NVM, Volta o rutas no estándar.

## Firma y publicación pública

El pipeline está deliberadamente sin secretos y las releases creadas por tag quedan en borrador. Antes de publicar a usuarios finales faltan estos gates:

- firmar ejecutable e instaladores de Windows con Authenticode para evitar advertencias de editor desconocido y mejorar la reputación de SmartScreen;
- probar cada formato en una máquina limpia, incluyendo instalación, primer inicio, bandeja, actualización manual y desinstalación;
- definir licencia, política de privacidad y canal de soporte;
- firmar AppImage o repositorios Linux si los paquetes pasan a distribuirse fuera de GitHub Releases.

El updater de Tauri no está integrado: el workflow no genera `latest.json` ni firmas de actualización. La primera entrega se actualiza instalando manualmente una versión posterior.
