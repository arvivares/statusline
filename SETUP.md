# Statusline: configuración y arquitectura

Statusline sincroniza el límite semanal sin enviar credenciales a un backend propio:

1. **Statusline Companion (macOS)** ejecuta Codex App Server por `stdio`.
2. Cada persona inicia sesión con su propia cuenta de ChatGPT/Codex en el navegador.
3. El companion lee `account/rateLimits/read` y guarda únicamente porcentaje restante, fecha de reinicio y fecha de actualización.
4. Esos tres valores se escriben en la base privada de CloudKit de esa persona.
5. La app iOS los copia al App Group y recarga el widget. Una suscripción privada de CloudKit solicita actualizaciones silenciosas.

La cuenta de iCloud que importa es la de cada usuario: su Mac y su iPhone deben usar la misma cuenta de Apple. Aunque todos usan el contenedor de la app, las bases privadas de CloudKit están aisladas por usuario.

## Dos companions, una misma frontera de datos

- `StatuslineCompanion` es el companion SwiftUI de macOS y continúa siendo el relay Apple: publica en CloudKit privado para la app iOS y el widget.
- `StatuslineDesktop` es el companion Tauri/Rust integrado para Windows, Linux y macOS. Ya consulta la cuota local y usa el mismo UX/UI Data Plane, pero todavía no publica muestras a móviles.

Windows y Linux necesitarán un transporte multiplataforma con emparejamiento de dispositivos; no pueden reutilizar la base privada de CloudKit como solución general para iOS y Android. La frontera y los requisitos están documentados en [`docs/architecture/cross-platform-companion.md`](docs/architecture/cross-platform-companion.md).

## Probar con una cuenta real

1. En Apple Developer, crea el contenedor `iCloud.inmerzion.statusline.f3hrl896hj` si todavía no existe.
2. Asócialo a los identificadores `inmerzion.statusline` y `inmerzion.statusline.companion`.
3. En Xcode, confirma el equipo de firma para estos targets:
   - `statusline`
   - `CodexStatusWidgetExtension`
   - `StatuslineCompanion`
4. Confirma las capacidades ya reflejadas en el proyecto:
   - iCloud + CloudKit para iOS y macOS.
   - App Groups para la app iOS y el widget.
   - Push Notifications y Background Modes > Remote notifications para iOS.
5. Ejecuta `StatuslineCompanion` firmado en el Mac. Durante desarrollo necesita encontrar un ejecutable `codex` instalado.
6. Pulsa **Conectar con Codex**, completa el login y sincroniza.
7. Ejecuta `statusline` en un iPhone que use la misma cuenta de iCloud y añade el widget.

El companion conserva su sesión en `~/Library/Application Support/Statusline Companion/CodexHome`, separada de la sesión habitual de Codex CLI. Codex administra y renueva los tokens; Statusline no recibe ni guarda una API key.

La implementación sigue el protocolo documentado en [Codex App Server](https://learn.chatgpt.com/docs/app-server). Los tipos usados se contrastaron además con el esquema generado por la versión local de Codex CLI.

## Probar el companion multiplataforma

Desde `StatuslineDesktop`:

```shell
. "$HOME/.cargo/env"
npm ci
npm test
npm run check
npm run tauri dev
```

La CLI de Codex debe estar instalada y autenticada con `codex login`. Para revisar sólo Data Plane sin Rust ni una cuenta real, ejecuta `npm run dev` y abre `http://127.0.0.1:1420/?preview=ready`.

Los instaladores nativos de Windows y Linux, el workflow de GitHub Actions y los requisitos pendientes de firma están detallados en [`docs/release/desktop-installers.md`](docs/release/desktop-installers.md).

## Antes de publicar

- Realiza al menos una escritura en el entorno Development de CloudKit y despliega el esquema `CodexUsageStatus` a Production desde CloudKit Console.
- Completa iconos, textos legales, política de privacidad y ficha de App Store Connect.
- El target iOS está preparado para el flujo App Store, sujeto a firma y configuración del contenedor.
- El companion actual es un prototipo de desarrollo: busca un Codex CLI instalado y tiene App Sandbox desactivado. Para distribuirlo públicamente, el camino corto es una app notarizada fuera de Mac App Store. Para Mac App Store habrá que incluir y firmar un helper redistribuible de Codex, activar App Sandbox y revisar sus permisos de red y la licencia de redistribución.

## Seguridad

- No añadas API keys al proyecto ni a `Info.plist`, entitlements o CloudKit.
- Revoca cualquier clave que se haya compartido por chat o haya quedado expuesta, aunque fuera de solo lectura.
- CloudKit solo contiene métricas de uso; el correo y los tokens permanecen en el Mac.
