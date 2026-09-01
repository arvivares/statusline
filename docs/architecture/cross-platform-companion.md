# Statusline: arquitectura multiplataforma

**Estado:** protocolo universal v1 implementado en Rust, Swift y Kotlin; adaptador Linux del relay pendiente
**Fecha:** 2026-08-31

## Decisión

El transporte anterior deja de formar parte de la arquitectura. Todas las plataformas comparten un único contrato neutral: Statusline Relay Protocol v1.

No es una única biblioteca binaria —Rust, Swift y Kotlin usan primitivas nativas— sino el mismo adaptador lógico, con:

- endpoints y errores idénticos;
- formato de emparejamiento idéntico;
- esquema de snapshot idéntico;
- AES-256-GCM, AAD y base64url idénticos;
- separación estricta entre publisher y reader.

La especificación normativa y el vector de interoperabilidad viven en [../../protocol/statusline-relay-v1.md](../../protocol/statusline-relay-v1.md) y [../../protocol/fixtures/aes-gcm-v1.json](../../protocol/fixtures/aes-gcm-v1.json).

## Flujo

```text
Codex CLI
   │ JSONL local
   ▼
Codex App Server adapter
   │ UsageSnapshot normalizado
   ├──────────────► Data Plane local
   │
   ▼
Universal StatusPublisher
   │ AES-256-GCM; la clave no sale del QR/secure store
   ▼
Relay HTTPS ── blob opaco ──► Universal StatusReader
                                  │
                                  ├──► iOS ─────► caché App Group ──► widget
                                  └──► Android ─► caché privada ────► widget
```

## Fronteras de confianza

El companion puede leer sólo metadatos de cuota desde la sesión local administrada por Codex. Nunca reenvía credenciales, correo, prompts ni código.

Al crear un canal:

1. El relay genera dos tokens aleatorios iniciales: publisher y pairing.
2. El companion genera la clave AES local y conserva publisher + clave en el almacén seguro.
3. El QR transporta channel + pairing + clave. No contiene publisher ni la URL del relay.
4. El móvil acepta el QR sólo si su build está configurado para el mismo origen HTTPS y cambia pairing por un reader nuevo.
5. El relay invalida pairing, guarda hashes de los tokens activos y conserva el ciphertext; nunca recibe la clave.

La credencial pairing sólo puede reclamarse una vez; reader sólo puede leer. La publisher puede escribir, consultar el estado de emparejamiento y borrar el canal. La secuencia monotónica rechaza replay de snapshots anteriores.

## Cobertura por plataforma

| Plataforma     | Codex local | Publisher |           Reader | Estado       |
| -------------- | ----------: | --------: | ---------------: | ------------ |
| macOS SwiftUI  |          Sí |     Swift |                — | Implementado |
| macOS Tauri    |          Sí |      Rust |                — | Implementado |
| Windows Tauri  |          Sí |      Rust |                — | Implementado |
| Linux Tauri    |          Sí |      Rust |                — | Implementado |
| iOS            |           — |         — |            Swift | Implementado |
| Widget iOS     |           — |         — |     Caché de iOS | Implementado |
| Android        |           — |         — |           Kotlin | Implementado |
| Widget Android |           — |         — | Caché de Android | Implementado |

Un futuro companion Android también podría implementar publisher sin cambiar el servidor ni el formato del QR.

## Relay

El relay de `services/relay` separa el núcleo de protocolo y la persistencia. El adaptador desplegado actualmente es un Worker con D1; un contenedor Linux con almacenamiento intercambiable está planificado:

- no mantiene cuentas de usuario;
- almacena un único ciphertext por canal;
- limita creación por origen y operaciones por credencial;
- rechaza cuerpos grandes, tokens mal formados, versiones desconocidas y secuencias obsoletas;
- caduca el QR a los diez minutos y el canal tras treinta días sin publicar;
- purga datos vencidos mediante cron.

HTTPS es obligatorio en producción. HTTP sólo se admite para loopback en builds Debug.

Las opciones de hosting, el estado real de cada adaptador y el cálculo de capacidad están en [../relay/deployment-options.md](../relay/deployment-options.md).

## Actualización móvil

El transporte universal ya resuelve Windows/Linux/macOS → iOS y Android sin una cuenta compartida. En la versión actual cada app móvil obtiene el snapshot al abrir o actualizar manualmente y después recarga su widget desde una caché privada local.

Para refresco casi inmediato en segundo plano se añadirá una capa de señalización:

- APNs para iOS;
- FCM para Android;
- ninguna carga de cuota dentro del push;
- fetch cifrado posterior usando la credencial reader existente.

Push es una optimización de entrega, no otro adaptador de datos.

## Evolución

Los cambios incompatibles requieren una nueva versión de protocolo y un AAD distinto. El relay v1 debe seguir tratando el payload como opaco. Nuevos campos compatibles pueden añadirse dentro del JSON cifrado sólo si los lectores antiguos pueden ignorarlos.
