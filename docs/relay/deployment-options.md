# Relay: opciones de despliegue y capacidad

**Estado:** Cloudflare Workers + D1 está implementado; el adaptador Linux autohospedado está diseñado pero todavía no se distribuye

**Revisión de cuotas y telemetría:** 2026-09-01

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
2. Sustituye los tres `namespace_id` de rate limiting si `41001`, `41002` o `41003` ya están ocupados en la cuenta.
3. Aplica la migración y publica el Worker:

```shell
npm run db:migrate:remote
npm run deploy
```

4. Comprueba `GET https://<tu-worker>/health`.
5. Usa ese origen, sin rutas adicionales, como `STATUSLINE_RELAY_BASE_URL` en desktop, iOS y futuros clientes Android.

El ejemplo mantenido por el proyecto es `https://statusline-relay.inmerzion.workers.dev`. Para producción conviene usar un dominio propio estable, por ejemplo `https://relay.example.com`, y apuntarlo al proveedor actual. Así se puede cambiar de infraestructura sin cambiar el origen que guardan los clientes; para conservar emparejamientos también habría que migrar los registros del relay.

El adaptador Cloudflare aplica tres capas de límite:

- 60 solicitudes por minuto y origen, antes de parsear canal o credencial y usando un hash SHA-256 de la IP;
- 10 canales nuevos por minuto y origen;
- 120 operaciones por minuto y credencial.

La primera capa evita que la rotación de tokens falsos fuerce consultas ilimitadas a D1. Como los límites se evalúan dentro del Worker, una solicitud rechazada sigue siendo una invocación de Workers. Un dominio propio permite añadir reglas edge/WAF para proteger también esa cuota.

`wrangler.jsonc` desactiva la persistencia de invocation logs. Cloudflare mantiene métricas agregadas; si un despliegue decide habilitar logs debe definir muestreo y retención, verificar que no se conserven cabeceras sensibles y actualizar su política de privacidad.

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

### Telemetría observada y sondeo de emparejamiento

El 1 de septiembre de 2026, una captura parcial del día realizada aproximadamente a las 17:27 UTC mostró:

```text
Solicitudes:       3.099 / 100.000 = 3,099 % de la cuota diaria
Tiempo de CPU:     5.626 ms
CPU media:         5.626 / 3.099 = 1,82 ms por solicitud
Proyección lineal: 3.099 / 17,45 h × 24 h ≈ 4.262 solicitudes/día
Margen proyectado: 100.000 / 4.262 ≈ 23,5 veces
```

La cuota no es una bolsa acumulativa: se reinicia cada día. Si esa tasa diaria se mantuviera, el relay podría operar indefinidamente dentro del límite gratuito de solicitudes. La CPU media observada también está por debajo del [límite de 10 ms por invocación de Workers Free](https://developers.cloudflare.com/workers/platform/limits/#cpu-time), aunque el promedio no descarta invocaciones individuales excedidas; hay que revisar `Errors > Invocation Statuses` para detectar `exceededCpu`.

La mayor parte de esa captura era coherente con las pruebas prolongadas del QR. La versión anterior consultaba el estado cada tres segundos mientras la pantalla de emparejamiento permaneciera abierta y no se detenía al vencer:

```text
20 solicitudes/minuto = 1.200 solicitudes/hora
3.099 / 1.200 = 2,58 horas equivalentes de sondeo continuo
1.200 × 24 = 28.800 solicitudes/día por una pantalla abierta
```

El publisher ahora consulta cada tres segundos durante los primeros 30 segundos, después cada 15 segundos, fusiona intentos simultáneos y se detiene localmente al vencer el QR. Para una ventana completa de diez minutos son como máximo 47 lecturas automáticas, frente a 200 anteriormente: una reducción del 76,5 %, además de eliminar el sondeo indefinido. Cerrar el panel o cambiar de pestaña pausa el temporizador; volver a la pestaña hace una única comprobación actualizada.

Los `0` eventos de observabilidad de esa captura son esperables: el despliegue mantenido tiene `observability.enabled: false` para no persistir invocation logs. Las métricas agregadas de solicitudes y CPU siguen disponibles.

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
