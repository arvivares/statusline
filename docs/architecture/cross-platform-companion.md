# Statusline: arquitectura del companion multiplataforma

**Estado:** base local integrada; transporte móvil pendiente
**Fecha:** 2026-08-29

## Decisión

El repositorio mantiene dos companions con una frontera de datos común:

1. `StatuslineCompanion` es la aplicación SwiftUI de macOS. Autentica Codex, obtiene la cuota y publica una muestra mínima en la base privada de CloudKit del usuario para iOS y el widget.
2. `StatuslineDesktop` es el companion Tauri/Rust para Windows, Linux y macOS. Obtiene y normaliza la cuota local, pero por ahora no la publica a un dispositivo móvil.

Los targets SwiftUI siguen siendo la experiencia Apple canónica. El proyecto Tauri reutiliza Data Plane en HTML/CSS sin intentar compartir código de vistas entre SwiftUI y WebView.

## Flujo implementado

```text
Codex CLI
   │  JSONL por stdio
   ▼
Codex App Server adapter (Rust)
   │  UsageResponse sin credenciales
   ▼
Normalización y selección del límite más exigente (Rust)
   │  IPC local de Tauri
   ▼
Data Plane (TypeScript + HTML/CSS)
```

La frontera serializable contiene sólo:

- porcentaje usado y restante;
- duración y reinicio de cada ventana;
- etiqueta del límite, plan y tipo de cuenta;
- fecha de lectura y cantidad de límites encontrados.

El correo, los tokens y los detalles internos de errores no cruzan esta frontera.

## Convivencia por plataforma

| Host | UI local | Lectura de Codex | Relay actual a iOS | Android |
| --- | --- | --- | --- | --- |
| macOS SwiftUI | Sí | Sí | CloudKit privado | No |
| macOS Tauri | Sí | Sí | No | No |
| Windows Tauri | Sí | Sí | No | No |
| Linux Tauri | Sí | Sí | No | No |
| iOS + widget | Sí | No | Consume CloudKit | No aplica |

La variante Tauri para macOS sirve para validar portabilidad y mantener una sola base Rust de escritorio, pero no reemplaza todavía el companion SwiftUI firmado ni su integración con CloudKit.

## Próxima frontera: transporte móvil

Para que Windows y Linux alimenten iOS —y para añadir Android— el núcleo de dominio debe permanecer independiente del proveedor y publicar la misma muestra mediante un `StatusPublisher`. Una implementación futura necesita:

- emparejamiento explícito entre dispositivos;
- identidad de usuario sin reutilizar una API key de OpenAI;
- cifrado en tránsito y, preferentemente, cifrado de extremo a extremo;
- almacenamiento mínimo con expiración y borrado de cuenta;
- notificaciones push para iOS y Android;
- protección contra replay, rate limiting y rotación de credenciales de dispositivo;
- una política de privacidad coherente con App Store y Play Store.

El contrato estable debe ser la muestra normalizada, no CloudKit ni una respuesta cruda de App Server. Así se pueden implementar dos adaptadores sin duplicar la lógica de cuota:

```text
UsageSnapshot ──► CloudKitPublisher (Apple actual)
              └─► CrossPlatformPublisher (Windows/Linux/iOS/Android futuro)
```

## Límites de esta integración

- No se añadió backend, cuenta propia de Statusline ni emparejamiento ficticio.
- No se envían muestras desde Windows o Linux al widget de iPhone.
- No se cambió el esquema de CloudKit ni los targets nativos.
- Cada paquete Tauri debe validarse en el sistema operativo donde se distribuirá.
