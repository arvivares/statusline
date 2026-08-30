# Statusline: configuración universal

Statusline usa el mismo contrato de sincronización en Windows, Linux, macOS, iOS y futuros clientes Android. No depende de una cuenta compartida entre dispositivos.

## Flujo

1. Statusline Companion ejecuta el Codex App Server instalado en el equipo por entrada/salida estándar.
2. La sesión de ChatGPT/Codex permanece bajo control de Codex. Statusline sólo normaliza porcentaje restante, reinicio y fecha de lectura.
3. El companion crea un canal y genera localmente una clave AES-256.
4. El QR contiene un identificador de canal, un token de emparejamiento efímero y la clave de cifrado. Nunca contiene las credenciales permanentes de publicación o lectura.
5. iOS reclama el canal, intercambia el token efímero por una credencial reader, guarda reader + clave en Keychain y descarga snapshots cifrados.
6. El relay conserva hashes de credenciales y el último ciphertext; no conoce la cuenta de Codex ni puede descifrar la cuota.
7. La app iOS copia el último valor validado al App Group y recarga el widget.

La especificación estable está en [protocol/statusline-relay-v1.md](protocol/statusline-relay-v1.md).

## Componentes

| Componente                 | Plataformas              | Función                                            |
| -------------------------- | ------------------------ | -------------------------------------------------- |
| StatuslineDesktop          | Windows, Linux, macOS    | Lector local de Codex y publisher Rust             |
| StatuslineCompanion        | macOS                    | Lector local de Codex y publisher Swift            |
| statusline                 | iOS                      | Reader Swift, emparejamiento y caché del widget    |
| CodexStatusWidgetExtension | iOS                      | Presenta la última muestra validada del App Group  |
| StatuslineRelay            | HTTPS; proveedor neutral | Transporta blobs cifrados y aplica TTL/rate limits |

El widget no realiza networking por su cuenta. En esta versión iOS actualiza al abrirse o al pulsar actualizar; APNs/FCM queda como una mejora posterior para sincronización en segundo plano.

## Elegir y desplegar Statusline Relay

El adaptador disponible actualmente es Cloudflare Workers + D1. La arquitectura para un contenedor Linux está definida, pero todavía no se distribuye. Las alternativas, responsabilidades operativas y el cálculo de capacidad están en [docs/relay/deployment-options.md](docs/relay/deployment-options.md).

### Opción A: Cloudflare Workers + D1

Desde StatuslineRelay:

```shell
npm ci
npm test
npm run check
npx wrangler d1 create statusline-relay
```

1. Copia el identificador de D1 devuelto por Wrangler en database_id dentro de StatuslineRelay/wrangler.jsonc.
2. Si tu cuenta ya usa los namespace_id 41001 o 41002, reemplázalos por valores libres.
3. Aplica la migración y despliega:

```shell
npm run db:migrate:remote
npm run deploy
```

4. El despliegue gratuito actual usa https://statusline-relay.inmerzion.workers.dev.
5. Verifica GET /health antes de compilar clientes públicos.

Para desarrollo local:

```shell
npm run db:migrate:local
npm run dev
```

Los builds Debug aceptan http://127.0.0.1:8787. Los builds de producción sólo aceptan HTTPS.

Cloudflare Workers Free incluye actualmente 100.000 solicitudes por cuenta y día. Con el refresco desktop de cinco minutos, un publisher activo 24 horas consume aproximadamente 576 solicitudes diarias; el techo matemático es 173 publishers y el techo recomendado con 20 % de reserva es 138. Consulta las fórmulas, el impacto de D1 y la interpretación de las métricas en la [guía de capacidad](docs/relay/deployment-options.md#cálculo-para-la-versión-actual).

### Opción B: Linux autohospedado

El protocolo y el núcleo HTTP ya son neutrales, pero la imagen Docker y el adaptador de persistencia Linux todavía están pendientes. La arquitectura objetivo usa SQLite WAL para una instancia, PostgreSQL/Valkey para varias réplicas y HTTPS mediante Caddy, Traefik o Coolify. No configures clientes de producción con esta opción hasta que aparezca como implementada y validada en la [guía de despliegue](docs/relay/deployment-options.md#opción-b-relay-autohospedado-en-linux).

## Configurar los clientes

Usa exactamente el mismo origen, sin rutas adicionales:

```shell
export STATUSLINE_RELAY_BASE_URL="https://statusline-relay.inmerzion.workers.dev"
```

- En GitHub, crea la repository variable STATUSLINE_RELAY_BASE_URL. El workflow la incorpora a los instaladores de Windows y Linux.
- En Xcode, busca STATUSLINE_RELAY_BASE_URL en Build Settings de statusline y StatuslineCompanion y asigna el mismo origen para Release.
- Para Tauri local, exporta la variable antes de iniciar la app.
- Para Xcode, asigna el valor en Build Settings o pásalo explícitamente a xcodebuild como STATUSLINE_RELAY_BASE_URL=https://statusline-relay.inmerzion.workers.dev.

La URL no es un secreto. Los secretos por dispositivo se generan después de instalar la aplicación y se guardan en Keychain, Windows Credential Manager o Secret Service.

## Probar de extremo a extremo

1. Instala Codex CLI en el escritorio, ejecuta codex y completa Sign in with ChatGPT.
2. Abre Statusline Companion y confirma que Source Settings detecta y valida la CLI.
3. En Universal Relay, pulsa Create pairing. Debe aparecer un QR con caducidad de diez minutos.
4. En iOS, abre Pair device y escanea o pega el vínculo.
5. Actualiza la cuota en el companion. iOS debe mostrar el mismo porcentaje después de sincronizar.
6. Añade el widget y comprueba que refleja la caché compartida.
7. Desconecta el publisher y confirma que el canal remoto deja de estar disponible.

Desde StatuslineDesktop, las comprobaciones rápidas son:

```shell
npm ci
npm test
npm run check
npm run release:check
```

Desde StatuslineRelay:

```shell
npm ci
npm test
npm run check
```

## Antes de publicar

- Despliega un relay de producción soportado con dominio HTTPS, persistencia, límites de uso y observabilidad.
- Revisa la [capacidad del relay](docs/relay/deployment-options.md#cálculo-para-la-versión-actual) y configura alertas antes del 80 %.
- Configura STATUSLINE_RELAY_BASE_URL en Xcode y como repository variable de GitHub.
- Valida emparejamiento y borrado desde máquinas limpias de Windows, Linux y macOS.
- Añade APNs/FCM si el producto exige actualización móvil en segundo plano; el contrato cifrado no cambia.
- Completa firma/notarización, ficha de tiendas, política de privacidad, soporte y licencia.

## Seguridad

- No añadas API keys de OpenAI al proyecto, Info.plist, variables de CI ni al relay.
- Revoca cualquier clave que se haya compartido por chat o haya quedado expuesta, aunque tenga permisos de sólo lectura.
- El QR es una credencial sensible durante diez minutos: no debe registrarse, enviarse a analytics ni aparecer en capturas de soporte.
- El relay almacena sólo hashes SHA-256 de tokens, ciphertext AES-256-GCM y metadatos operativos mínimos.
