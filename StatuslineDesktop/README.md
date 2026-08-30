# Statusline Desktop

Companion de bandeja multiplataforma para consultar la cuota de Codex en Windows, Linux y macOS. Está construido con Tauri 2, Rust y TypeScript, y comparte el lenguaje visual **Data Plane** de las apps SwiftUI de Statusline.

## Estado de la integración

- `StatuslineDesktop` convive como proyecto hermano con la app iOS, el widget y el companion nativo de macOS; no modifica sus targets ni su UI.
- Consulta la sesión local mediante el [Codex App Server oficial](https://learn.chatgpt.com/docs/app-server) y muestra límite semanal, reinicio, ventana corta y plan.
- No copia, persiste ni transmite tokens, API keys o correo. El contrato Rust → TypeScript contiene únicamente metadatos de cuota.
- **Source Settings** detecta la CLI, valida `codex --version` y permite guardar una ruta local sin guardar credenciales.
- El relay privado por CloudKit continúa en `StatuslineCompanion`, la implementación SwiftUI de macOS.
- Windows y Linux todavía no publican muestras al iPhone: hace falta implementar el transporte multiplataforma descrito en [`docs/architecture/cross-platform-companion.md`](../docs/architecture/cross-platform-companion.md).

Codex App Server continúa marcado como experimental. El parser admite campos nuevos, pero una ruptura del protocolo puede requerir actualizar el companion.

## Data Plane

La interfaz usa los mismos tokens de las superficies Apple:

- canvas `#0D0E0B` y surface `#14150F`;
- texto principal `#ECE9DC` y secundario `#9D9B89`;
- líneas `#3B3929`, señal ámbar `#EFC65A` y crítico `#F26856`;
- grilla de 24 px, medidor de 20 segmentos y estados explícitos `LIVE`, `READING`, `OFFLINE` y `ERROR`.

Los estados conservan la posición de la cuota y reemplazan solamente el contexto operacional. Las animaciones respetan `prefers-reduced-motion`.

## Requisitos

1. Node.js 24 o posterior.
2. Rust estable mediante `rustup`, con `rustfmt` y `clippy`.
3. La CLI de Codex instalada; ejecuta `codex` y completa **Sign in with ChatGPT** la primera vez.
4. Los [prerrequisitos de Tauri](https://v2.tauri.app/start/prerequisites/) del sistema operativo.

Statusline busca instalaciones standalone, npm, Homebrew, Volta, NVM, FNM, asdf, mise y el `PATH`. Si la aplicación gráfica hereda un `PATH` incompleto, abre **Source Settings** y selecciona el ejecutable. `STATUSLINE_CODEX_PATH` permanece disponible como override de administración.

## Desarrollo

```shell
. "$HOME/.cargo/env"
npm ci
npm test
npm run check
npm run tauri dev
```

Durante el desarrollo en macOS, la ventana comienza oculta y se abre desde el icono de bandeja. Los bundles de Windows y Linux la muestran en el primer inicio para que la aplicación instalada sea descubrible. Al cerrarla, vuelve a ocultarse. En Linux también se oculta al perder foco y algunos escritorios requieren usar el menú de bandeja en lugar del clic izquierdo.

### Preview visual sin Rust

El frontend se puede revisar sin iniciar Tauri ni consultar una cuenta real:

```shell
npm run dev
```

Abre `http://127.0.0.1:1420/?preview=ready`. También existen `preview=loading`, `preview=empty` y `preview=error`. Este modo sólo se habilita en hosts locales.

## Verificación y build

Ejecuta primero las comprobaciones rápidas:

```shell
npm test
npm run check
npm run build
```

Después valida el núcleo nativo:

```shell
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
```

Antes de empaquetar una release, ejecuta el preflight sin compilación nativa:

```shell
npm run release:check
```

Los instaladores se generan de forma nativa con:

```shell
npm run bundle:windows
npm run bundle:linux
```

Windows produce NSIS `.exe` y WiX `.msi`; Linux produce `.deb`, `.rpm` y `.AppImage`. Cada comando debe ejecutarse dentro de su sistema operativo destino. El workflow, los smoke tests y los gates de firma están documentados en [`docs/release/desktop-installers.md`](../docs/release/desktop-installers.md). La política factual actual está en [`PRIVACY.md`](../PRIVACY.md) y el flujo de incidencias en [`SUPPORT.md`](../SUPPORT.md).

## Última validación local

Validado en macOS arm64 con Rust 1.98.0:

- 15 tests TypeScript y 23 tests Rust aprobados;
- TypeScript estricto, Prettier, `cargo fmt` y Clippy sin advertencias;
- build Vite de producción correcto;
- bundle `.app` debug abierto con una sesión real y Data Plane verificado a 400 × 600.

El bundle de prueba y su `target` se generan en una carpeta temporal para no dejar varios gigabytes de artefactos en el repositorio.

## Estructura

- `src/usage.ts`: validación en runtime del contrato Rust → TypeScript.
- `src/codex.ts`: validación del diagnóstico de instalación y etiquetas de origen.
- `src/controller.ts`: refresco, concurrencia y estados seguros de UI.
- `src/main.ts`: binding de Data Plane y previews locales.
- `src-tauri/src/app_server.rs`: proceso `codex app-server`, handshake JSONL y timeouts.
- `src-tauri/src/codex_installation.rs`: detección multiplataforma, configuración persistente y validación de launchers.
- `src-tauri/src/usage.rs`: selección y normalización de ventanas de cuota.
- `src-tauri/src/lib.rs`: bandeja, ventana, instancia única y comandos Tauri.
- `src-tauri/tauri.windows.conf.json`: NSIS, MSI y primer inicio en Windows.
- `src-tauri/tauri.linux.conf.json`: DEB, RPM, AppImage y primer inicio en Linux.
- `scripts/check-release.mjs`: consistencia de versión y configuración antes del bundle.
- `scripts/generate-checksums.mjs`: manifiesto SHA-256 determinista.
- `scripts/smoke-installers-*`: instalación, arranque y desinstalación en CI.
- `.github/workflows/desktop-installer-smoke.yml`: revalida artefactos existentes sin recompilar.

Las carpetas `node_modules`, `dist`, `src-tauri/target` y los esquemas generados no forman parte del repositorio.
