# Statusline para Apple

Proyecto Xcode con la app reader de iPhone, su widget WidgetKit y un publisher SwiftUI nativo de macOS. Los tres clientes implementan Statusline Relay Protocol v1 y comparten modelos y lenguaje visual Data Plane.

## Targets

- `statusline`: app para iPhone, emparejamiento y caché privada del snapshot.
- `CodexStatusWidgetExtension`: reader independiente del relay, con caché de respaldo.
- `StatuslineCompanion`: companion nativo de barra de menú para macOS.
- `statuslineTests` y `statuslineUITests`: pruebas de la app móvil.

## Desarrollo

Abre `statusline.xcodeproj` con una versión actual de Xcode. En **Project → Build Settings** (no en un target individual), asigna `STATUSLINE_RELAY_BASE_URL` al mismo origen usado por desktop y Android. App, widget y companion SwiftUI heredan ese valor para Debug y Release; Debug admite loopback y Release requiere HTTPS. Para una compilación puntual también puedes pasar `STATUSLINE_RELAY_BASE_URL=https://tu-relay.example` a `xcodebuild`.

La fase **Validate app and widget relay** comprueba los `Info.plist` procesados de la app y del widget incluido. Falla si falta el endpoint, difiere entre ambos, no es un origen permitido o las versiones no coinciden. No requiere Node ni acceso a red durante la compilación.

Antes de subir un IPA, extráelo en una carpeta privada y repite la validación sobre el contenido exportado:

```sh
sh scripts/validate-relay-bundle.sh \
  /ruta/Payload/statusline.app/Info.plist \
  /ruta/Payload/statusline.app/PlugIns/CodexStatusWidgetExtension.appex/Info.plist \
  Release
```

Desde la raíz del repositorio, `node --test apps/apple/scripts/validate-relay-bundle.test.mjs` ejecuta las comprobaciones ligeras en macOS sin compilar iOS. `BundleConfigurationTests` comprueba además el bundle real usando el lector de configuración de producción.

La distribución de iOS es manual en esta etapa: selecciona un Team válido, archiva el target `statusline` y súbelo a TestFlight/App Store desde Xcode. El pipeline del repositorio no genera un `.ipa` ni almacena credenciales de firma de iOS.

## Estructura

- `statusline/`: app de iPhone.
- `CodexStatusWidget/`: extensión WidgetKit.
- `StatuslineCompanion/`: publisher nativo de macOS.
- `Shared/`: protocolo, repositorio y tokens visuales compartidos.
- `store/`: metadatos, respuestas de cumplimiento, instrucciones de revisión y capturas para App Store Connect.
- `statusline.xcodeproj/`: configuración de targets, firma y builds.

Consulta la [configuración universal](../../SETUP.md), la [arquitectura](../../docs/architecture/cross-platform-companion.md) y la [política de privacidad](../../PRIVACY.md).

La app consulta al activarse y aproximadamente cada minuto mientras está visible.
El widget solicita nuevas oportunidades de lectura cada 30 minutos, sujetas a iOS,
sin necesitar abrir la app. Tras actualizar, abre la app una vez para migrar el
emparejamiento existente al Keychain compartido. Consulta los límites y las pruebas
en [sincronización](../../docs/architecture/synchronization.md).

La fuente de verdad de la primera publicación iOS está en [`store/README.md`](store/README.md). Antes de cada envío deben actualizarse allí la versión, Review Notes, App Privacy, clasificación por edades, decisión DSA, capturas y resultados de TestFlight.
