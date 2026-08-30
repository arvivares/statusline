# Instaladores de Statusline Companion

El companion se empaqueta de forma nativa en GitHub Actions. No se usa cross-compilation.

## Artefactos

| Plataforma  | Formato     | Uso recomendado                                            |
| ----------- | ----------- | ---------------------------------------------------------- |
| Windows x64 | NSIS .exe   | Instalador principal por usuario; incluye inglés y español |
| Windows x64 | WiX .msi    | Despliegues administrados                                  |
| Linux x64   | Debian .deb | Ubuntu, Debian y derivadas                                 |
| Linux x64   | RPM .rpm    | Fedora, RHEL y derivadas                                   |
| Linux x64   | .AppImage   | Distribución portátil; requiere chmod +x                   |

NSIS incorpora el bootstrapper Evergreen de WebView2. El AppImage no incluye GStreamer porque Statusline no reproduce multimedia.

## Validación local económica

Desde StatuslineDesktop:

```shell
npm ci
npm run release:check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
```

Desde StatuslineRelay:

```shell
npm ci
npm test
npm run check
```

Estas comprobaciones no crean instaladores. Para compilar, ejecuta sólo en el sistema destino:

```shell
npm run bundle:windows
npm run bundle:linux
```

## Endpoint universal en los instaladores

Configura una repository variable pública:

```text
STATUSLINE_RELAY_BASE_URL=https://statusline-relay.inmerzion.workers.dev
```

El workflow rechaza valores vacíos, con espacios o que no comiencen con https://. La misma URL debe configurarse en los builds Release de iOS y macOS. No se necesitan credenciales de servicios Apple ni secretos compartidos de aplicación.

La URL se incorpora al binario, pero no concede acceso a ningún canal. Cada instalación obtiene credenciales aleatorias durante el emparejamiento y las conserva en el almacén seguro del sistema operativo.

## Workflow y retención

[desktop-installers.yml](../../.github/workflows/desktop-installers.yml) admite:

1. Actions → Desktop installers → Run workflow para artefactos temporales, sin firma, de beta privada.
2. Un tag desktop-v<versión> para una GitHub Release duradera en estado borrador. Los tags exigen firma Authenticode de Windows.

Ejemplo:

```shell
git tag desktop-v0.1.2
git push origin desktop-v0.1.2
```

El preflight comprueba que el tag coincide con npm, Cargo y Tauri, valida frontend, contrato Rust y servicio relay, y falla antes del bundle si falta el endpoint universal.

Después de compilar, el pipeline:

- instala, abre y desinstala NSIS y MSI en Windows;
- inspecciona RPM/AppImage e instala y elimina Debian en Linux;
- genera SHA256SUMS.txt;
- adjunta los artefactos a una release borrador para builds por tag.

Si cambia sólo un smoke test, [desktop-installer-smoke.yml](../../.github/workflows/desktop-installer-smoke.yml) revalida artefactos existentes sin recompilar.

## Codex en el equipo del usuario

Los instaladores no incluyen Codex ni credenciales. Cada usuario instala la CLI oficial, ejecuta codex y completa Sign in with ChatGPT. Statusline inicia codex app-server por entrada/salida estándar y sólo procesa metadatos de cuota.

Source Settings detecta standalone, npm, Homebrew, Volta, NVM, FNM, asdf, mise y PATH. En Windows también inspecciona ubicaciones relativas a LOCALAPPDATA y APPDATA; ninguna ruta de usuario está hardcodeada.

## Firma de Windows

Las releases por tag requieren:

- secret WINDOWS_CERTIFICATE: PFX de code signing codificado en base64;
- secret WINDOWS_CERTIFICATE_PASSWORD;
- variable WINDOWS_TIMESTAMP_URL.

El runner importa temporalmente el certificado, firma aplicación/NSIS/MSI y valida cada archivo con Get-AuthenticodeSignature. El material temporal se elimina incluso si falla un paso posterior. Los runs manuales permanecen sin firma.

## Publicación

La [checklist de beta pública](public-beta-checklist.md) cubre máquinas limpias, relay, SmartScreen, checksums, privacidad, soporte y licencia. El updater de Tauri todavía no está integrado.
