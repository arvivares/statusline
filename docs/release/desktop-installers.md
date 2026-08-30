# Instaladores de Statusline Companion

El companion multiplataforma se empaqueta de forma nativa en GitHub Actions. El workflow evita cross-compilation y genera los artefactos desde el sistema operativo correspondiente.

## Artefactos

| Plataforma  | Formato       | Uso recomendado                                                                                                            |
| ----------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Windows x64 | NSIS `.exe`   | Instalador principal. Se instala para el usuario actual, incluye inglés y español y no requiere permisos de administrador. |
| Windows x64 | WiX `.msi`    | Despliegues administrados. El asistente se genera en español y la instalación puede solicitar elevación.                   |
| Linux x64   | Debian `.deb` | Ubuntu, Debian y distribuciones derivadas.                                                                                 |
| Linux x64   | RPM `.rpm`    | Fedora, RHEL y distribuciones derivadas.                                                                                   |
| Linux x64   | `.AppImage`   | Distribución portátil; después de descargarla hay que ejecutar `chmod +x`.                                                 |

El instalador NSIS incorpora el bootstrapper Evergreen de WebView2. El AppImage no incluye GStreamer porque Statusline no reproduce audio ni vídeo.

Windows y Linux muestran la ventana en el primer inicio. Después funciona como companion de bandeja: cerrar la ventana la oculta sin finalizar el proceso. En Linux también se conserva el comportamiento de ocultarla al perder foco para escritorios sin soporte de bandeja.

## Validación local económica

Desde `StatuslineDesktop`:

```shell
npm ci
npm run release:check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
```

`release:check` no crea instaladores. Comprueba versiones, metadatos, targets, acciones fijadas por commit, scripts de firma y smoke test, Prettier, tests TypeScript y tipos estrictos.

Para compilar localmente, usa el comando correspondiente únicamente dentro del sistema operativo destino:

```shell
npm run bundle:windows
npm run bundle:linux
```

## Workflow y retención

[`desktop-installers.yml`](../../.github/workflows/desktop-installers.yml) admite dos flujos:

1. **Actions → Desktop installers → Run workflow** crea artefactos temporales para beta privada. Estos builds no necesitan certificado y permanecen sin firma.
2. Un tag `desktop-v<versión>` crea una GitHub Release duradera en estado borrador. Los tags exigen firma Authenticode de Windows antes de compilar.

Para la versión actual:

```shell
git tag desktop-v0.1.2
git push origin desktop-v0.1.2
```

El preflight rechaza un tag que no coincide exactamente con la versión de npm, Cargo y Tauri. No se debe crear el tag público hasta completar la configuración de firma y la checklist de beta.

Después de compilar, el pipeline:

- instala, abre durante cuatro segundos y desinstala NSIS y MSI en el runner de Windows;
- inspecciona RPM y AppImage, instala, abre y elimina el paquete Debian en Linux;
- genera `SHA256SUMS.txt` sobre los cinco instaladores;
- conserva el manifiesto como artefacto y lo adjunta a la release borrador cuando el build proviene de un tag.

Si cambia únicamente un smoke test, [`desktop-installer-smoke.yml`](../../.github/workflows/desktop-installer-smoke.yml) puede volver a validar los artefactos de un run anterior sin recompilar. Recibe el ID del run y la plataforma:

```shell
gh workflow run desktop-installer-smoke.yml \
  -f artifacts_run_id=<run-id> \
  -f platform=windows
```

La validación reutilizable descarga los instaladores originales, aplica los scripts de `main` y limita cada proceso de instalación a tres minutos. El job completo expira en diez minutos para evitar runners bloqueados.

## Codex en el equipo del usuario

Los instaladores no incluyen Codex ni credenciales. Cada usuario instala la CLI oficial, ejecuta `codex` y completa **Sign in with ChatGPT**. Statusline inicia `codex app-server` por `stdio` y sólo procesa metadatos de cuota.

**Source Settings** detecta las ubicaciones del instalador standalone, npm, Homebrew, Volta, NVM, FNM, asdf, mise y el `PATH` del sistema. También permite seleccionar `codex.exe`, `codex.cmd` o el ejecutable Unix. La ruta se guarda sólo después de que `codex --version` la valide.

En Windows, los launchers npm `.cmd` no se ejecutan mediante una cadena de shell arbitraria: Statusline comprueba el paquete oficial adyacente `@openai/codex` y lo inicia con Node.js. `STATUSLINE_CODEX_PATH` continúa disponible como override de administración.

## Firma de Windows

Las releases por tag requieren:

- secret `WINDOWS_CERTIFICATE`: PFX de code signing codificado en base64;
- secret `WINDOWS_CERTIFICATE_PASSWORD`: contraseña del PFX;
- variable `WINDOWS_TIMESTAMP_URL`: endpoint de timestamp recomendado por el proveedor.

El runner importa temporalmente el certificado en `CurrentUser\My` y genera un overlay de configuración Tauri con thumbprint, SHA-256 y timestamp. Tras el bundle verifica la aplicación, el NSIS y el MSI con `Get-AuthenticodeSignature`. El certificado importado, el PFX y el overlay se eliminan incluso cuando falla un paso posterior.

Un run manual permanece sin firma. Esto mantiene disponible el circuito de prueba sin rebajar el gate de una release etiquetada.

## Publicación

La [checklist de beta pública](public-beta-checklist.md) cubre máquinas limpias, SmartScreen, checksums, privacidad, soporte y licencia. La licencia de distribución todavía requiere una decisión del propietario y sigue siendo un blocker explícito para publicar.

El updater de Tauri no está integrado: el workflow no genera `latest.json` ni firmas de actualización. La beta se actualiza instalando manualmente una versión posterior.
