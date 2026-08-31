# Statusline Desktop

Companion de bandeja para consultar la cuota de Codex en Windows, Linux y macOS. Está construido con Tauri 2, Rust y TypeScript, y comparte el lenguaje visual Data Plane de las apps SwiftUI.

## Integración

- Consulta la sesión local mediante Codex App Server y muestra límite semanal, reinicio, ventana corta y plan.
- No copia ni persiste tokens de Codex, API keys o correo.
- Source Settings detecta la CLI, valida codex --version y permite guardar una ruta local.
- Universal Relay publica sólo el snapshot mínimo cifrado de extremo a extremo para iOS y futuros clientes Android.
- La credencial publisher y la clave AES permanecen en Keychain, Windows Credential Manager o Secret Service.
- El frontend recibe estado operacional y el vínculo de emparejamiento mientras está vigente; nunca recibe la credencial publisher.

Codex App Server continúa marcado como experimental. Una ruptura de su protocolo puede requerir actualizar el companion.

## Data Plane

La interfaz conserva canvas #0D0E0B, surface #14150F, texto #ECE9DC, señal #EFC65A, grilla de 24 px, medidor de 20 segmentos y estados explícitos LIVE, READING, OFFLINE y ERROR. Las animaciones respetan prefers-reduced-motion.

## Requisitos

1. Node.js 24 o posterior.
2. Rust 1.98 mediante rustup, con rustfmt y clippy.
3. Codex CLI instalado y autenticado mediante Sign in with ChatGPT.
4. Los [prerrequisitos de Tauri](https://v2.tauri.app/start/prerequisites/) del sistema.
5. Un Statusline Relay local o un origen HTTPS desplegado según [SETUP.md](../SETUP.md).

Statusline busca standalone, npm, Homebrew, Volta, NVM, FNM, asdf, mise y PATH. Si la aplicación gráfica hereda un PATH incompleto, abre Source Settings y selecciona el ejecutable. STATUSLINE_CODEX_PATH permanece como override de administración.

## Desarrollo

```shell
. "$HOME/.cargo/env"
export STATUSLINE_RELAY_BASE_URL="http://127.0.0.1:8787"
npm ci
npm test
npm run check
npm run tauri dev
```

HTTP sólo se admite para localhost en Debug. Para builds públicos:

```shell
export STATUSLINE_RELAY_BASE_URL="https://statusline-relay.inmerzion.workers.dev"
```

En macOS funciona como agente de barra de menú: no aparece en el Dock ni en `⌘ Tab`, la ventana comienza oculta y se abre desde el icono superior. Windows espera una confirmación explícita del frontend antes de revelar y enfocar la ventana; Linux la muestra en el primer inicio. Cerrar oculta el companion sin finalizarlo; sólo **Salir** desde su menú termina el proceso. Los instaladores de Windows no inician la aplicación por defecto: el primer arranque normal debe hacerse desde Inicio o el acceso directo para no heredar el contexto transitorio del instalador.

### Preview visual sin Rust

```shell
npm run dev
```

Abre http://127.0.0.1:1420/?preview=ready. También existen preview=loading, preview=empty y preview=error. Añade &panel=source o &panel=relay para abrir una superficie concreta.

## Verificación y build

Comprobaciones rápidas:

```shell
npm test
npm run check
npm run build
npm run release:check
```

Núcleo nativo:

```shell
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
```

Bundles nativos:

```shell
npm run bundle:windows
npm run bundle:linux
npm run bundle:macos
```

Windows produce NSIS y MSI; Linux produce DEB, RPM y AppImage; macOS produce un DMG universal para Apple Silicon e Intel. Consulta [docs/release/desktop-installers.md](../docs/release/desktop-installers.md).

## Estructura

- src/usage.ts: validación del contrato Rust → TypeScript.
- src/codex.ts: diagnóstico de instalación.
- src/controller.ts: concurrencia y estados de UI.
- src/relay.ts: validación del estado del relay y del vínculo v1.
- src/main.ts: binding Data Plane, QR y previews.
- src-tauri/src/app_server.rs: proceso codex app-server, JSONL y timeouts.
- src-tauri/src/codex_installation.rs: detección y validación multiplataforma.
- src-tauri/src/relay_protocol.rs: snapshot, AES-256-GCM, AAD y pairing URI.
- src-tauri/src/universal_relay.rs: cliente HTTPS, secure storage y StatusPublisher.
- src-tauri/src/usage.rs: normalización de cuota.
- src-tauri/src/lib.rs: bandeja, ventana, instancia única y comandos Tauri.
- scripts/check-release.mjs: preflight de release sin bundle.

Las carpetas node_modules, dist y src-tauri/target no forman parte del repositorio.
