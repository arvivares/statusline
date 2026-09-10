# Statusline Relay

Relay universal y neutral para Statusline. El servicio emite credenciales separadas de publicación, emparejamiento y lectura, guarda únicamente hashes SHA-256 y conserva el último snapshot como un blob AES-256-GCM que no puede descifrar. Este directorio incluye el adaptador operativo para Cloudflare Workers + D1; el núcleo HTTP y `RelayStore` están separados del proveedor.

El token del QR caduca a los diez minutos. Al reclamarlo se invalida y se intercambia por una credencial reader distinta y duradera. El contrato normativo está en [../../protocol/statusline-relay-v1.md](../../protocol/statusline-relay-v1.md).

## Información pública

Privacidad, soporte y eliminación de datos se sirven desde el sitio estático
`https://statusline.inmerzion.io`, sin depender de este servicio. Las rutas
heredadas `/privacy`, `/support` y `/delete-data` (también con prefijo `/es`)
devuelven HTTP 301 al sitio, activas por defecto al desplegar el código. No hay
una variable de activación. GET y HEAD conservan el idioma; los parámetros de
consulta no se reenvían y otros métodos reciben 405. `/health` y `/v1/*` no se
redirigen ni cambian su contrato.

Publica primero el build del sitio, o ambos componentes juntos, para evitar un
404 temporal en el destino. La raíz del relay conserva una página informativa
sin rastreadores. El contenido y el origen público están versionados en
`../../content/public-pages.ts`; en un fork, adapta dominio, identidad y contacto.

## Desarrollo local

1. Instala dependencias con `npm ci`.
2. Aplica la migración: `npm run db:migrate:local`.
3. Ejecuta `npm run dev`; el endpoint local habitual es `http://127.0.0.1:8787`.
4. Configura desktop e iOS con `STATUSLINE_RELAY_BASE_URL=http://127.0.0.1:8787` sólo para desarrollo local.

Wrangler carga secretos locales desde `.dev.vars`. El servicio no necesita ninguno actualmente; si una extensión futura los requiere, copia `.dev.vars.example` a `.dev.vars` y conserva los valores reales fuera de Git. La autenticación de Cloudflare se gestiona con `npx wrangler login` o con variables `CLOUDFLARE_*` cargadas desde el `.env` privado de la raíz.

### Parche temporal de las herramientas

Wrangler `4.129.0` utiliza Miniflare `5.20260903.0-alpha`, que todavía solicita
Sharp `0.35.2`. El override limitado a `miniflare.sharp` fija `0.35.4` para corregir
[GHSA-rgj7-g3m4-5g8c](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c).
Es una dependencia de desarrollo: el Worker de producción no procesa imágenes
ni incorpora Sharp. No añadas un `npm audit fix --force` ni elimines el override
sin validar la dependencia que lo sustituye.

`npm test` verifica el lockfile y el binario nativo corregido, incluida una
conversión AVIF de prueba generada en memoria. No utiliza imágenes externas ni
datos de usuarios. Tras actualizar dependencias, ejecuta `npm ci`, `npm audit`,
`npm test`, `npm run check`, migraciones locales y un empaquetado `--dry-run`.
Retira el override y su comprobación de versión exacta cuando Miniflare incluya
una versión corregida por sí mismo y esas verificaciones vuelvan a pasar.
La evidencia y los límites de la validación están en la
[revisión de seguridad](../../docs/security/security-review.md#10-september-addendum-dependabot-alert-2).

## Despliegue en Cloudflare

1. Crea una base D1: `npx wrangler d1 create statusline-relay`.
2. Sustituye el `database_id` de `wrangler.jsonc` por el identificador devuelto.
3. Cambia los tres `namespace_id` de rate limiting si ya están usados en tu cuenta.
4. Ejecuta `npm run db:migrate:remote` y luego `npm run deploy`.
5. Para el plan gratuito, usa `https://statusline-relay.inmerzion.workers.dev` como `STATUSLINE_RELAY_BASE_URL` en todos los clientes. Antes de un lanzamiento crítico puede sustituirse por un dominio propio sin cambiar el protocolo.

Los canales caducan tras 30 días sin publicaciones. El QR inicial sólo puede reclamarse durante 10 minutos. El cron diario elimina datos vencidos. Antes de parsear credenciales o consultar D1 se aplica un máximo de 60 solicitudes/minuto por origen usando un hash SHA-256 de la IP. Se mantienen límites adicionales de 10 canales nuevos/minuto por origen y 120 operaciones/minuto por credencial.

La persistencia de invocation logs está desactivada en `wrangler.jsonc`; las métricas agregadas de plataforma siguen disponibles. Si un operador habilita logs persistentes debe revisar su contenido, muestreo, retención y política de privacidad. Los límites ejecutados dentro del Worker protegen D1, pero no evitan que la invocación cuente para la cuota de Workers. Para producción deben complementarse con un dominio propio y protección edge/WAF.

La [guía de opciones y capacidad](../../docs/relay/deployment-options.md) conserva el procedimiento completo de Cloudflare, calcula cuánto rinden sus 100.000 solicitudes diarias y describe el adaptador Linux autohospedado previsto. La opción Linux todavía no se distribuye como imagen o instalador.
