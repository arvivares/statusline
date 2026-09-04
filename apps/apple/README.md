# Statusline para Apple

Proyecto Xcode con la app reader de iPhone, su widget WidgetKit y un publisher SwiftUI nativo de macOS. Los tres clientes implementan Statusline Relay Protocol v1 y comparten modelos y lenguaje visual Data Plane.

## Targets

- `statusline`: app para iPhone, emparejamiento y caché privada del snapshot.
- `CodexStatusWidgetExtension`: widget de iOS alimentado desde el App Group.
- `StatuslineCompanion`: companion nativo de barra de menú para macOS.
- `statuslineTests` y `statuslineUITests`: pruebas de la app móvil.

## Desarrollo

Abre `statusline.xcodeproj` con una versión actual de Xcode. En Build Settings, asigna `STATUSLINE_RELAY_BASE_URL` al mismo origen usado por desktop y Android; Debug admite loopback y Release requiere HTTPS.

La distribución de iOS es manual en esta etapa: selecciona un Team válido, archiva el target `statusline` y súbelo a TestFlight/App Store desde Xcode. El pipeline del repositorio no genera un `.ipa` ni almacena credenciales de firma de iOS.

## Estructura

- `statusline/`: app de iPhone.
- `CodexStatusWidget/`: extensión WidgetKit.
- `StatuslineCompanion/`: publisher nativo de macOS.
- `Shared/`: protocolo, repositorio y tokens visuales compartidos.
- `store/`: metadatos, respuestas de cumplimiento, instrucciones de revisión y capturas para App Store Connect.
- `statusline.xcodeproj/`: configuración de targets, firma y builds.

Consulta la [configuración universal](../../SETUP.md), la [arquitectura](../../docs/architecture/cross-platform-companion.md) y la [política de privacidad](../../PRIVACY.md).

La fuente de verdad de la primera publicación iOS está en [`store/README.md`](store/README.md). Antes de cada envío deben actualizarse allí la versión, Review Notes, App Privacy, clasificación por edades, decisión DSA, capturas y resultados de TestFlight.
