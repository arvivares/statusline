# Instaladores de Statusline Companion

El companion se empaqueta de forma nativa en GitHub Actions. No se usa cross-compilation.

## Artefactos

| Plataforma      | Formato     | Uso recomendado                                              |
| --------------- | ----------- | ------------------------------------------------------------ |
| Windows x64     | NSIS .exe   | Instalador principal por usuario; incluye inglés y español   |
| Windows x64     | WiX .msi    | Despliegues administrados                                    |
| Linux x64       | Debian .deb | Ubuntu, Debian y derivadas                                   |
| Linux x64       | RPM .rpm    | Fedora, RHEL y derivadas                                     |
| Linux x64       | .AppImage   | Distribución portátil; requiere chmod +x                     |
| macOS universal | .dmg        | Apple Silicon e Intel; instalación mediante arrastrar a Apps |
| macOS universal | .pkg        | Instalador guiado y despliegues administrados                |

NSIS incorpora el bootstrapper Evergreen de WebView2. El AppImage no incluye GStreamer porque Statusline no reproduce multimedia. DMG y PKG contienen la misma app universal con arquitecturas arm64 y x86_64; no requieren una segunda compilación.

MSI no inicia Statusline desde Windows Installer y NSIS deja desmarcada por defecto la opción de abrirlo al finalizar. El usuario debe hacer el primer arranque desde Inicio o el acceso directo; esto garantiza que la detección de Codex reciba el entorno de su sesión y que WebView2 complete su inicialización antes de mostrar la ventana.

## Validación local económica

Desde `apps/desktop`:

```shell
npm ci
npm run release:check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
```

Desde `services/relay`:

```shell
npm ci
npm test
npm run check
```

Estas comprobaciones no crean instaladores. Para compilar, ejecuta sólo en el sistema destino:

```shell
npm run bundle:windows
npm run bundle:linux
npm run bundle:macos
```

## Endpoint universal en los instaladores

Configura una repository variable pública:

```text
STATUSLINE_RELAY_BASE_URL=https://statusline-relay.inmerzion.workers.dev
```

El workflow rechaza valores vacíos, con espacios o que no comiencen con https://. La misma URL debe configurarse en los builds Release de iOS y macOS. No se necesitan credenciales de servicios Apple ni secretos compartidos de aplicación.

La URL se incorpora al binario, pero no concede acceso a ningún canal. Cada instalación obtiene credenciales aleatorias durante el emparejamiento y las conserva en el almacén seguro del sistema operativo.

## Workflows y retención

[desktop-installers.yml](../../.github/workflows/desktop-installers.yml) es un workflow
reutilizable y de QA dirigido. Admite:

1. Actions → Desktop artifacts → Run workflow para elegir `all`, `unix`, `windows`, `linux` o `macos` y crear sólo los artefactos necesarios.
2. Un build manual de `windows` con `sign_windows` para probar el flujo SignPath sin compilar Linux, macOS o Android ni crear una release.
3. Un build manual de `macos` con `sign_macos` para validar Developer ID y notarización sin recompilar las demás plataformas.
4. Un build manual de `linux` con `sign_linux` para generar y validar firmas OpenPGP sin recompilar las demás plataformas.

Los artefactos manuales caducan y nunca se publican como GitHub Releases. El único flujo
de distribución es [release.yml](../../.github/workflows/release.yml), activado por un tag
firmado `v<versión>` que debe coincidir con [`release.json`](../../release.json):

```shell
git tag -s v0.1.10 -m "Statusline 0.1.10 beta"
git push origin v0.1.10
```

El preflight comprueba que el tag anotado está verificado y coincide con npm, Cargo,
Tauri y Gradle; también registra la versión de App Store de iOS. Valida frontend,
contrato Rust, servicio relay y las configuraciones de firma exigidas por el perfil de
plataformas antes de reservar runners nativos.

Después de compilar, el pipeline:

- cuando Windows está habilitado, instala, abre y desinstala NSIS y MSI;
- inspecciona RPM/AppImage, instala y elimina Debian, y verifica las firmas OpenPGP detached de los tres instaladores Linux;
- monta el DMG, inspecciona el payload del PKG y verifica arm64 + x86_64, icono y detección de Codex en macOS;
- para builds macOS firmados, verifica Developer ID, Hardened Runtime, timestamps, tickets grapados y aceptación de Gatekeeper en la app, el DMG y el PKG;
- reúne también el APK y AAB firmados por Android;
- para `v0.1.10`, exige exactamente siete binarios públicos —tres Linux, dos macOS y dos Android— más las tres firmas Linux;
- genera `RELEASE-MANIFEST.json`, `SHA256SUMS.txt` y `SHA256SUMS.txt.asc`;
- crea una attestation de procedencia firmada por GitHub para cada binario y el manifest;
- adjunta el conjunto completo y publica automáticamente la entrada con la marca **Pre-release**.

Windows está diferido explícitamente en `release.json` mientras termina el onboarding de
SignPath. Al habilitarlo en una versión posterior, el mismo inventario pasará a exigir
nueve binarios y el flujo fallará si NSIS o MSI no están firmados.

Si cambia sólo un smoke test, [desktop-installer-smoke.yml](../../.github/workflows/desktop-installer-smoke.yml) revalida artefactos existentes sin recompilar. Indica tanto el run ID como el número de intento exitoso para no mezclar artefactos de una reejecución. `require_windows_trust`, `require_linux_signatures` y `require_macos_trust` deben permanecer activadas para releases públicas; sólo se desactivan al inspeccionar un build manual deliberadamente no firmado.

## Codex en el equipo del usuario

Los instaladores no incluyen Codex ni credenciales. Cada usuario instala la CLI oficial, ejecuta codex y completa Sign in with ChatGPT. Statusline inicia codex app-server por entrada/salida estándar y sólo procesa metadatos de cuota.

Source Settings detecta standalone, npm, Homebrew, Volta, NVM, FNM, asdf, mise y PATH. En Windows también inspecciona ubicaciones relativas a LOCALAPPDATA y APPDATA; ninguna ruta de usuario está hardcodeada.

En una instalación por usuario de Windows, Statusline también recupera LOCALAPPDATA a partir de la ubicación de su propio ejecutable. Esto mantiene la detección estable aunque MSI, el shell o una herramienta corporativa entreguen variables o PATH incompletos.

## Firma de Linux

Las distribuciones públicas incluyen firmas OpenPGP detached ASCII-armored para DEB, RPM y AppImage, más una firma para `SHA256SUMS.txt`. Este esquema autentica exactamente los archivos descargados sin modificarlos y funciona de la misma manera para los tres formatos. La firma de metadatos de un futuro repositorio APT o RPM sería una capa adicional y no se reemplaza con estas firmas detached.

La clave pública oficial está versionada en [`packaging/linux/statusline-release-signing-key.asc`](../../packaging/linux/statusline-release-signing-key.asc). Su fingerprint es:

```text
7076 AFAF 1090 C370 9D1F 080C 5D77 9E12 FC11 30DB
```

GitHub Actions usa exclusivamente:

- secret `LINUX_GPG_PRIVATE_KEY_BASE64`: exportación ASCII-armored de la clave privada, codificada completa en base64;
- secret `LINUX_GPG_PASSPHRASE`: contraseña de la clave privada.

La clave privada se importa en un keyring efímero, se comprueba contra la clave pública versionada y se prueba antes de comenzar la compilación. Después de firmar, el pipeline verifica las firmas desde un segundo keyring que sólo contiene la clave pública y elimina el material privado temporal. Los tags fallan en preflight si falta cualquiera de los dos secrets. Los runs manuales sólo se firman al activar `sign_linux`.

Para configurar otra identidad en un fork:

```shell
gpg --quick-generate-key "Statusline Release Signing <release@example.com>" rsa4096 sign 3y
gpg --armor --export <FINGERPRINT> > packaging/linux/statusline-release-signing-key.asc
gpg --armor --export-secret-keys <FINGERPRINT> \
  | base64 \
  | tr -d '\n' \
  | gh secret set LINUX_GPG_PRIVATE_KEY_BASE64
gh secret set LINUX_GPG_PASSPHRASE
```

Conserva además una copia cifrada de la clave privada fuera del repositorio. Para verificar una descarga oficial:

```shell
gpg --import statusline-release-signing-key.asc
gpg --fingerprint founder@inmerzion.io
gpg --verify "Statusline Companion.deb.asc" "Statusline Companion.deb"
gpg --verify SHA256SUMS.txt.asc SHA256SUMS.txt
sha256sum --check --ignore-missing SHA256SUMS.txt
```

La salida de `gpg --fingerprint` debe coincidir exactamente con el fingerprint publicado arriba. Sustituye el nombre del DEB por el archivo RPM o AppImage para validar esos formatos.

## Firma de Windows

Statusline ha seleccionado SignPath Foundation para la firma Authenticode pública de Windows. La política y los responsables están documentados en [Statusline Code Signing Policy](../security/code-signing-policy.md). La incorporación del proyecto todavía está pendiente; hasta completarla, los artefactos de Windows generados manualmente son exclusivamente builds de QA sin firma.

El backend PFX anterior fue retirado. Después de la aprobación, copia desde el proyecto
real de SignPath un secret:

- `SIGNPATH_API_TOKEN`

Y seis repository variables:

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`
- `SIGNPATH_EXECUTABLE_ARTIFACT_CONFIGURATION_SLUG`
- `SIGNPATH_INSTALLER_ARTIFACT_CONFIGURATION_SLUG`
- `SIGNPATH_EXPECTED_SIGNER_SUBJECT`

No inventes estos valores: deben proceder de la página CI integration y de los
certificados del proyecto aprobado. El workflow construye primero la aplicación con
`--no-bundle`, sube ese ejecutable a SignPath, restaura el resultado firmado y ejecuta
`tauri bundle` sin recompilar. Después envía NSIS y MSI a una segunda configuración de
artefacto. Cada release requiere aprobación y validación de Authenticode, identidad del
firmante y timestamp en los tres archivos; no existe fallback sin firma.

## Firma de macOS

Los builds públicos usan dos certificados: `Developer ID Application` para la app y el DMG, y `Developer ID Installer` para el PKG. Las claves privadas sólo se utilizan en CI para firmar; no se incluyen en la aplicación ni se entregan a los usuarios.

Configura estas repository variables públicas:

- `APPLE_SIGNING_IDENTITY`: nombre completo de la identidad Developer ID;
- `APPLE_INSTALLER_SIGNING_IDENTITY`: nombre completo de la identidad Developer ID Installer;
- `APPLE_TEAM_ID`: Team ID del Apple Developer Program.

Configura estos repository secrets:

- `APPLE_CERTIFICATE`: `.p12` de Developer ID codificado como base64 sin saltos de línea;
- `APPLE_CERTIFICATE_PASSWORD`: contraseña con la que se exportó el `.p12`;
- `APPLE_INSTALLER_CERTIFICATE`: `.p12` del certificado Installer codificado como base64;
- `APPLE_INSTALLER_CERTIFICATE_PASSWORD`: contraseña del `.p12` Installer.

Para autenticar la notarización elige uno de estos métodos:

1. Apple ID: secrets `APPLE_ID` y `APPLE_PASSWORD`. `APPLE_PASSWORD` debe ser una contraseña específica para apps, nunca la contraseña normal de la cuenta.
2. App Store Connect API: una **Team Key** con rol `Developer` y los secrets `APPLE_API_KEY`, `APPLE_API_ISSUER` y `APPLE_API_PRIVATE_KEY`. No uses una Individual Key porque `notarytool` no las admite. El último secret contiene el texto completo del archivo `AuthKey_<KEY_ID>.p8`, que Apple permite descargar una sola vez.

Si ambos métodos están configurados, el workflow prioriza la Team Key. Antes de invocar Tauri exporta únicamente el conjunto completo seleccionado; no propaga variables vacías del método alternativo porque Tauri podría interpretarlas como una solicitud de autenticación con Apple ID.

El workflow importa ambos `.p12` en una keychain efímera. Tauri firma la app con Hardened Runtime, la envía al servicio notarial, grapa su ticket y crea el DMG. Como Tauri elimina la carpeta `.app` temporal al terminar el DMG, el empaquetador monta ese DMG en modo de sólo lectura y `productbuild` crea el PKG desde la misma app ya firmada y grapada; no realiza una segunda compilación. Finalmente, DMG y PKG se notarizan y grapan de forma independiente, y se validan con `codesign`, `pkgutil`, `stapler` y `spctl`. La keychain, el montaje temporal y los archivos decodificados se eliminan incluso si el job falla.

El bundle macOS declara `LSUIElement=true` y el runtime usa la política `Accessory`: Statusline permanece únicamente en la barra de menú, no aparece en el Dock ni en `⌘ Tab`, y cerrar su ventana sólo la oculta. El comando **Salir** del menú superior es la salida explícita del proceso. El smoke test inspecciona esta propiedad directamente en el `Info.plist` del DMG.

### Keychain durante actualizaciones

Statusline Companion guarda un único registro del publisher del relay en la keychain `login`, con service `inmerzion.statusline.relay` y account `universal-publisher-v1`. Una instalación limpia y las actualizaciones firmadas con la misma identidad Developer ID no deben solicitar repetidamente la contraseña de la keychain.

Al sustituir una build de desarrollo sin firma por la primera build Developer ID, macOS puede considerar que cambió la identidad autorizada para el registro existente. Una autorización administrativa al instalar el PKG es normal; varios avisos de Keychain no lo son. Para conservar el pairing, selecciona **Permitir siempre** una vez. Para reiniciar el estado, usa **Disconnect**; si la build anterior no puede borrar el registro, cierra la app, elimínalo desde Keychain Access y vuelve a emparejar. Este caso de migración debe probarse por separado de una instalación limpia antes de publicar.

Para comprobar las credenciales sin crear una release, ejecuta Actions → Desktop artifacts con:

```text
platform: macos
sign_macos: true
```

Los runs manuales con `sign_macos: false` permanecen sin firma y sólo sirven como artefactos privados. Ningún `.p12`, `.p8` o archivo decodificado debe añadirse al repositorio.

## Publicación

El [runbook de release pública](release-runbook.md) describe el tag único, inventario,
attestations y comandos de verificación. La [checklist de beta pública](public-beta-checklist.md)
cubre máquinas limpias, relay, SmartScreen, checksums, privacidad, soporte y licencia.
El updater de Tauri todavía no está integrado.
