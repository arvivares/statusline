# Relay: opciones de despliegue y capacidad

**Estado:** Cloudflare Workers + D1 está implementado; el adaptador Linux autohospedado está diseñado pero todavía no se distribuye

**Revisión de cuotas:** 2026-08-30

Statusline Relay Protocol v1 no depende del proveedor. Los clientes sólo necesitan un origen HTTPS que implemente el [contrato v1](../../protocol/statusline-relay-v1.md). El QR no contiene el origen: todos los clientes emparejados deben haber sido compilados o configurados con el mismo `STATUSLINE_RELAY_BASE_URL`.

| Opción                               | Estado      | Operación                            | Uso recomendado                            |
| ------------------------------------ | ----------- | ------------------------------------ | ------------------------------------------ |
| Cloudflare Workers + D1              | Disponible  | Administrada por Cloudflare          | Beta, despliegue rápido y carga moderada   |
| Contenedor Linux + SQLite            | Planificada | A cargo del propietario del servidor | Control de costes, datos e infraestructura |
| Contenedor Linux + PostgreSQL/Valkey | Planificada | A cargo del propietario del servidor | Varias instancias o carga sostenida alta   |

## Opción A: Cloudflare Workers + D1

Es el adaptador incluido y validado actualmente. Puede desplegarse con el plan gratuito de Cloudflare:

```shell
cd StatuslineRelay
npm ci
npm test
npm run check
npx wrangler d1 create statusline-relay
```

1. Copia el `database_id` devuelto en `StatuslineRelay/wrangler.jsonc`.
2. Sustituye los dos `namespace_id` de rate limiting si `41001` o `41002` ya están ocupados en la cuenta.
3. Aplica la migración y publica el Worker:

```shell
npm run db:migrate:remote
npm run deploy
```

4. Comprueba `GET https://<tu-worker>/health`.
5. Usa ese origen, sin rutas adicionales, como `STATUSLINE_RELAY_BASE_URL` en desktop, iOS y futuros clientes Android.

El ejemplo mantenido por el proyecto es `https://statusline-relay.inmerzion.workers.dev`. Para producción conviene usar un dominio propio estable, por ejemplo `https://relay.example.com`, y apuntarlo al proveedor actual. Así se puede cambiar de infraestructura sin cambiar el origen que guardan los clientes; para conservar emparejamientos también habría que migrar los registros del relay.

Consulta también la guía general en [SETUP.md](../../SETUP.md).

### Límites gratuitos relevantes

Cloudflare documenta para Workers Free [100.000 solicitudes entrantes por cuenta y día, con reinicio a medianoche UTC](https://developers.cloudflare.com/workers/platform/limits/#daily-requests). La cuota se comparte con los demás Workers y Pages Functions de la cuenta.

D1 Free incluye [5 millones de filas leídas al día, 100.000 filas escritas al día y 5 GB de almacenamiento](https://developers.cloudflare.com/d1/platform/pricing/). Sus límites diarios también se reinician a las 00:00 UTC. Cloudflare contabiliza por separado la escritura de una fila de índice; el esquema actual indexa `expires_at`, que se actualiza con cada snapshot.

Las cuotas pueden cambiar. Antes de una publicación hay que revisar la documentación oficial y las métricas reales de Workers y D1.

### Cálculo para la versión actual

El publisher desktop refresca cada cinco minutos mientras está ejecutándose y emparejado. Cada ciclo correcto hace dos solicitudes al Worker:

1. `PUT /v1/channels/:id/snapshot` para publicar el ciphertext.
2. `GET /v1/channels/:id` para actualizar el estado de emparejamiento y expiración.

Por tanto, para un publisher activo las 24 horas:

```text
12 ciclos/hora × 2 solicitudes = 24 solicitudes/hora
24 solicitudes/hora × 24 horas = 576 solicitudes/día
100.000 / 576 = 173,61 publishers teóricos
80.000 / 576 = 138,88 publishers con 20 % de reserva
```

El `PUT` también representa aproximadamente dos filas escritas en D1 —la fila del canal y su índice de expiración—, por lo que el límite de escrituras de D1 queda en un orden similar al límite de solicitudes del Worker. Debe verificarse con `Metrics > Row Metrics`, ya que las operaciones de creación, reclamación, borrado y purga también escriben.

| Actividad por publisher | Solicitudes base/día | Máximo matemático | Máximo con 20 % de reserva |
| ----------------------- | -------------------: | ----------------: | -------------------------: |
| 24 h/día                |                  576 |               173 |                        138 |
| 12 h/día                |                  288 |               347 |                        277 |
| 8 h/día                 |                  192 |               520 |                        416 |

Estas cifras son dispositivos publisher activos, no descargas ni cuentas registradas. Excluyen el arranque, cambios de foco, actualización manual, emparejamiento, `GET /health`, cron, pruebas y otros proyectos de la misma cuenta. Cada lectura de iOS al abrir o pulsar actualizar añade una solicitud. Una estimación operativa es:

```text
solicitudes/día ≈ publishers × horas activas × 24
                 + lecturas móviles
                 + emparejamientos, health checks y pruebas
```

Para una beta gratuita, 138 publishers permanentemente activos es un techo de planificación razonable, no una promesa de capacidad. Configura alertas antes del 80 % y decide entre reducir la frecuencia, pasar a Workers Paid o desplegar el adaptador Linux antes de alcanzarlo.

### Interpretación de 100 solicitudes en dos horas

Tomando “dos horas” literalmente:

```text
100 / 2 = 50 solicitudes/hora
50 × 24 = 1.200 solicitudes/día
1.200 / 100.000 = 1,2 % del límite diario
100.000 / 1.200 = 83,33 días equivalentes si el cupo fuera acumulativo
```

El último valor sólo ayuda a visualizar la tasa: el cupo no es una bolsa acumulativa. A ese ritmo, el proyecto puede funcionar indefinidamente dentro del plan gratuito porque cada día usaría aproximadamente 1.200 solicitudes y dejaría 98.800 disponibles. El tráfico podría crecer unas 83 veces antes de llegar a 100.000 en un solo día. Para agotar el cupo diario haría falta sostener unas 4.167 solicitudes/hora, o 69,4 por minuto, durante 24 horas.

Si el intervalo observado no fue exactamente de dos horas, sustituye los valores en esta fórmula:

```text
proyección diaria = solicitudes observadas / horas observadas × 24
porcentaje diario = proyección diaria / 100.000 × 100
```

## Opción B: relay autohospedado en Linux

El núcleo HTTP ya está separado del proveedor en `StatuslineRelay/src/app.ts` mediante la interfaz `RelayStore`. Falta publicar y validar el adaptador ejecutable para Linux; por eso esta opción todavía no debe anunciarse como instalable.

La implementación prevista conserva exactamente el mismo protocolo y cifrado:

- un contenedor Node que adapte las solicitudes HTTP al núcleo existente;
- SQLite en modo WAL y un volumen persistente para una sola instancia;
- rate limiting dentro del servicio, con límites equivalentes a Cloudflare;
- tarea programada para purgar canales vencidos;
- HTTPS mediante Caddy, Traefik o el proxy administrado por Coolify;
- copias de seguridad cifradas, actualizaciones y monitorización a cargo del operador.

Para varias réplicas, SQLite y un limitador local deben sustituirse por PostgreSQL y un almacén coordinado como Valkey. El protocolo de los clientes no cambia.

[Coolify](https://coolify.io/docs/get-started/introduction) es una plataforma libre y open source para desplegar contenedores en un servidor propio, gestionar dominios, TLS, logs y copias. No reemplaza al relay: alojaría su futura imagen Docker. Su instalación oficial requiere un servidor Linux de 64 bits y recomienda como mínimo [2 CPU, 2 GB de RAM y 30 GB libres](https://coolify.io/docs/get-started/installation/#4-minimum-hardware-requirements). También será posible ejecutar el contenedor directamente con Docker Compose, sin Coolify.

Antes de considerar listo el adaptador Linux deben existir imagen versionada, migraciones, health check, límites persistentes, backups probados, actualización sin pérdida de datos y pruebas de interoperabilidad con Rust y Swift.

## Elección

- Usa Cloudflare ahora si priorizas tener un relay operativo sin administrar un servidor.
- Planifica Linux si quieres coste fijo, control de datos o evitar una cuota compartida por cuenta.
- Usa desde el principio un dominio propio estable si esperas cambiar de proveedor.
- No expongas D1, SQLite o PostgreSQL directamente: los clientes sólo deben acceder a la API HTTPS del relay.
