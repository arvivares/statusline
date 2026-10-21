# Statusline Relay

Relay universal y neutral para Statusline. El servicio emite credenciales separadas de publicación, emparejamiento y lectura, guarda hashes SHA-256, snapshots cifrados AES-256-GCM que no puede descifrar y, solo con consentimiento de push, un FID también cifrado en reposo. Este directorio incluye el adaptador operativo para Cloudflare Workers + D1; el núcleo HTTP y `RelayStore` están separados del proveedor.

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

La extensión opcional [services-v1](../../protocol/statusline-services-v1.md)
mantiene el snapshot de Codex para clientes antiguos y añade una lista cifrada de
servicios para móviles actualizados. Aplica las migraciones pendientes **antes**
del nuevo Worker. La `0004_reset_credit_push.sql` añade únicamente registros de
dispositivos y eventos push; no recrea canales ni invalida emparejamientos.
La `0005_quota_alert_preferences.sql` añade preferencias independientes de
créditos Codex y [avisos de cuota](../../docs/architecture/quota-alerts.md).
Los registros anteriores conservan créditos activados y cuota desactivada.

1. Instala dependencias con `npm ci`.
2. Aplica la migración: `npm run db:migrate:local`.
3. Ejecuta `npm run dev`; el endpoint local habitual es `http://127.0.0.1:8787`.
4. Configura desktop e iOS con `STATUSLINE_RELAY_BASE_URL=http://127.0.0.1:8787` sólo para desarrollo local.

Wrangler carga secretos locales desde `.dev.vars`. Para probar push localmente,
copia `.dev.vars.example` a `.dev.vars` y configura sus dos valores; sin ambos,
`/health` no anuncia `reset-push-v1` ni `quota-alerts-v1`. Conserva el archivo fuera de Git. La
autenticación de Cloudflare se gestiona con `npx wrangler login` o con variables
`CLOUDFLARE_*` cargadas desde el `.env` privado de la raíz.

### Seguridad de las herramientas

Wrangler `4.151.0` utiliza Miniflare `5.20261012.0-beta`, que solicita
Sharp `0.35.5` de forma nativa. Se retira el override temporal a `0.35.4`:
esa versión corregía el aviso anterior de libheif, pero no el nuevo
[GHSA-wq5f-xc86-pv6w](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w).
Sharp sigue siendo una dependencia de desarrollo: el Worker de producción no
procesa imágenes ni incorpora Sharp. No uses `npm audit fix --force` ni
reintroduzcas una versión vulnerable mediante overrides.

`npm test` verifica que todas las copias del lockfile y el binario cargado
incluyan Sharp `>=0.35.5`, libheif `>=1.23.2` y librsvg `>=2.63.2`.
También convierte AVIF y SVG benignos generados en memoria, sin imágenes
externas ni datos de usuarios. Tras actualizar dependencias, ejecuta `npm ci`,
`npm audit`, `npm test`, `npm run check`, migraciones locales y un empaquetado
`--dry-run`. La evidencia y los límites están en la
[revisión de seguridad](../../docs/security/security-review.md#12-october-addendum-dependabot-alert-16).

## Despliegue en Cloudflare

1. Crea una base D1: `npx wrangler d1 create statusline-relay`.
2. Sustituye el `database_id` de `wrangler.jsonc` por el identificador devuelto.
3. Verifica que los cuatro `namespace_id` de rate limiting sean únicos en tu cuenta.
4. Antes de desplegar, aplica todas las migraciones: `npm run db:migrate:remote`.
5. Para habilitar alertas, crea un proyecto Firebase con Cloud Messaging activo; registra las apps `inmerzion.statusline` para Android y iOS, y sube a Firebase una clave APNs `.p8` válida para la app iOS. Crea una cuenta de servicio con el rol mínimo **Firebase Cloud Messaging API Admin** y configura los secretos del Worker:

   ```sh
   npx wrangler secret put FCM_SERVICE_ACCOUNT_JSON
   npx wrangler secret put PUSH_TOKEN_ENCRYPTION_KEY
   ```

   El valor de `PUSH_TOKEN_ENCRYPTION_KEY` debe ser 32 bytes aleatorios codificados en base64url sin `=`. No guardes el JSON de servicio ni la clave en Git, en el bundle móvil o en mensajes. Mantén la clave de cifrado estable: cambiarla sin migrar los registros existentes impide descifrarlos, hasta que cada móvil vuelva a abrir la app y registre su instalación.

6. Configura en **GitHub → Settings → Secrets and variables → Actions → Variables** las claves Firebase públicas que usan los builds: `STATUSLINE_FIREBASE_ANDROID_API_KEY`, `STATUSLINE_FIREBASE_IOS_API_KEY`, `STATUSLINE_FIREBASE_PROJECT_ID`, `STATUSLINE_FIREBASE_SENDER_ID`, `STATUSLINE_FIREBASE_ANDROID_APP_ID` y `STATUSLINE_FIREBASE_IOS_APP_ID`. Restringe cada API key a su app y a las APIs Firebase necesarias; estas variables identifican el proyecto y no son credenciales de envío.
7. Despliega con `npm run deploy`. Comprueba que `/health` anuncia `reset-push-v1`; la capacidad solo se publica si ambos secretos Worker están presentes y las claves se pueden importar. Android/iOS no registran una instalación hasta que el usuario activa la opción y concede permiso.
8. Para el plan gratuito, usa `https://statusline-relay.inmerzion.workers.dev` como `STATUSLINE_RELAY_BASE_URL` en todos los clientes. Antes de un lanzamiento crítico puede sustituirse por un dominio propio sin cambiar el protocolo.

Los canales caducan tras 30 días sin publicaciones. El QR inicial sólo puede reclamarse durante 10 minutos. El cron diario elimina datos vencidos y las filas push relacionadas. Antes de parsear credenciales o consultar D1 se aplica un máximo de 60 solicitudes/minuto por origen usando un hash SHA-256 de la IP. Se mantienen límites adicionales de 10 canales nuevos/minuto por origen, 120 operaciones/minuto por credencial y 2 eventos push/minuto por publisher.

La persistencia de invocation logs está desactivada en `wrangler.jsonc`; las métricas agregadas de plataforma siguen disponibles. Si un operador habilita logs persistentes debe revisar su contenido, muestreo, retención y política de privacidad. Los límites ejecutados dentro del Worker protegen D1, pero no evitan que la invocación cuente para la cuota de Workers. Para producción deben complementarse con un dominio propio y protección edge/WAF.

La [guía de opciones y capacidad](../../docs/relay/deployment-options.md) conserva el procedimiento completo de Cloudflare, calcula cuánto rinden sus 100.000 solicitudes diarias y describe el adaptador Linux autohospedado previsto. La opción Linux todavía no se distribuye como imagen o instalador.
