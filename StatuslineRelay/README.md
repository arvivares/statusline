# Statusline Relay

Relay universal y neutral para Statusline. El servicio emite credenciales separadas de publicación, emparejamiento y lectura, guarda únicamente hashes SHA-256 y conserva el último snapshot como un blob AES-256-GCM que no puede descifrar.

El token del QR caduca a los diez minutos. Al reclamarlo se invalida y se intercambia por una credencial reader distinta y duradera. El contrato normativo está en [../protocol/statusline-relay-v1.md](../protocol/statusline-relay-v1.md).

## Desarrollo local

1. Instala dependencias con `npm ci`.
2. Aplica la migración: `npm run db:migrate:local`.
3. Ejecuta `npm run dev`; el endpoint local habitual es `http://127.0.0.1:8787`.
4. Configura desktop e iOS con `STATUSLINE_RELAY_BASE_URL=http://127.0.0.1:8787` sólo para desarrollo local.

## Despliegue

1. Crea una base D1: `npx wrangler d1 create statusline-relay`.
2. Sustituye el `database_id` de `wrangler.jsonc` por el identificador devuelto.
3. Cambia los dos `namespace_id` de rate limiting si ya están usados en tu cuenta.
4. Ejecuta `npm run db:migrate:remote` y luego `npm run deploy`.
5. Para el plan gratuito, usa `https://statusline-relay.inmerzion.workers.dev` como `STATUSLINE_RELAY_BASE_URL` en todos los clientes. Antes de un lanzamiento crítico puede sustituirse por un dominio propio sin cambiar el protocolo.

Los canales caducan tras 30 días sin publicaciones. El QR inicial sólo puede reclamarse durante 10 minutos. El cron diario elimina datos vencidos. Los límites incluidos son 10 canales nuevos/minuto por origen y 120 operaciones/minuto por credencial; para producción deben complementarse con reglas WAF y observabilidad.
