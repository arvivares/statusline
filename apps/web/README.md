# Statusline website

Sitio de presentación en inglés y español para [Statusline](https://statusline.inmerzion.io).
Conserva la identidad Data Plane del producto: superficies oscuras, señal ámbar,
medidores segmentados y tipografía técnica.

La web es una aplicación estática independiente construida con Vite 8.2.2,
TypeScript 7.0.2, HTML y CSS. No necesita Codex, credenciales ni un backend de relay.
Las demostraciones interactivas usan datos de ejemplo identificados como tales;
no representan la cuota de quien visita la página.

## Idiomas

La URL determina el idioma: `/` sirve inglés y `/es/` sirve español. El build
genera HTML completo en ambos idiomas, disponible también sin JavaScript.
El selector EN / ES del encabezado utiliza enlaces a esas rutas. Con JavaScript,
actualiza la URL y el contenido sin recargar la página; sin JavaScript, los enlaces
navegan a la versión estática correspondiente.

La elección se guarda en `localStorage` con la clave `statusline-language`, pero
una preferencia anterior nunca cambia el idioma de la URL ni provoca una
redirección automática. Tampoco se utiliza el idioma del navegador. Si el
almacenamiento no está disponible, el selector sigue funcionando.

El cambio incluye navegación, preguntas frecuentes, metadatos, textos accesibles
y estados de las demos. Conserva la ventana y cuota de ejemplo, la plataforma
seleccionada y la preferencia de animación. Los errores dentro de `/es/` reciben
una página 404 estática en español, incluso sin JavaScript. En otras rutas, el 404
parte del inglés y puede aplicar la preferencia guardada al cargar JavaScript.
Su selector y enlace de vuelta mantienen el idioma elegido. Ambos documentos
llevan `noindex`; las rutas inexistentes conservan el código HTTP 404.

Los mensajes estáticos se mantienen en `src/static-messages.ts` y los dinámicos,
en `src/messages.ts`; el motor de idioma está en `src/i18n.ts`. Las rutas, los
metadatos por idioma y los datos estructurados se definen en `src/site.ts`.
El catálogo puro del 404 está en
`public/not-found-messages.js` y lo comparten el build y el módulo del navegador.
Los valores con marcado HTML proceden exclusivamente del catálogo local.
Al añadir contenido, actualiza ambos idiomas.

## Desarrollo

Se recomienda Node.js 24 y npm 11. El build también admite Node.js 22.13 o posterior
mediante `--experimental-strip-types`, incluido en el comando del proyecto.
Desde este directorio:

```shell
npm ci
npm run dev -- --port 4173
```

Abre `http://localhost:4173`. Para comprobar y generar la versión estática:

```shell
npm run check
npm run format:check
npm run build
npm run test:seo
```

`npm run format` aplica el formato del proyecto. `npm run build` comprueba los tipos
y ejecuta `scripts/build.mjs`: compila con Vite y renderiza el HTML de cada idioma
con parse5 a partir de `index.html` y los catálogos locales. El resultado incluye
`dist/index.html`, `dist/es/index.html` y ambos 404. `npm run test:seo` valida los
artefactos generados.

`dist/` está excluido de Git. `npm run preview -- --port 4173` permite revisar ese
resultado localmente después del build. Para generar una versión de revisión
sin modificar el directorio servido, indica una carpeta temporal nueva de salida
(Vite no vacía las carpetas externas al proyecto):

```shell
npm run build -- --outDir /tmp/statusline-web-review
```

### Integración continua y dependencias

El workflow [Website](../../.github/workflows/website.yml) se inicia en todos los PR
hacia `main`, sin filtros de rutas a nivel del evento. Su primer job comprueba la
lógica de CI y detecta cambios en `apps/web/`, el workflow, su detector, Dependabot
o la configuración compartida de Node y formato. Solo en esos casos instala desde
el lockfile, comprueba TypeScript y formato, genera el build y valida sus artefactos
SEO con Node.js 24. Los pushes relevantes a `main` y las ejecuciones manuales
también validan la web. Ninguno de estos eventos despliega el sitio.

El check obligatorio de `main` es **Website validation**. Siempre informa un
resultado, incluso cuando no es necesario compilar: solo acepta una validación
correcta o una omisión deliberada tras detectar que no hay cambios relevantes.
Un fallo al leer el historial, una cancelación o un build fallido no se convierten
en aprobación. No marques como obligatorio el job condicional de compilación ni
añadas filtros de rutas al evento `pull_request`.

Las pruebas del detector y del resultado obligatorio no necesitan dependencias
npm. Desde la raíz del repositorio:

```shell
node --test scripts/website-ci.test.mjs
```

[Dependabot](../../.github/dependabot.yml) revisa las dependencias npm de esta web
cada lunes a las 06:15 (`Europe/Madrid`). Agrupa cambios minor y patch; las versiones
major se revisan por separado. Las propuestas deben pasar los mismos controles
del PR y no se fusionan automáticamente.

## Contenido y recursos

- `index.html`: contenido, navegación, metadatos y demostraciones.
- `src/`: interacciones TypeScript y estilos adaptables a escritorio y móvil.
- `public/assets/`: marca, capturas del producto y tarjetas sociales EN / ES.
- `public/fonts/`: Manrope e IBM Plex Mono alojadas localmente, con sus licencias OFL.
- `public/404.html` y `public/not-found*.js`: plantilla, catálogo y selector del 404.
- `public/robots.txt`, `sitemap.xml` y `llms.txt`: recursos de descubrimiento.
- `deploy/`: configuración del servidor estático y del proxy público.

Los recursos se sirven desde el mismo origen, sin cargar fuentes remotas. La web
no consulta cuotas ni crea canales de sincronización. El enlace de privacidad
lleva a la página pública del relay; las descargas y el código enlazan a GitHub.

Mantén las funciones disponibles y el roadmap diferenciados. El estado de las
distribuciones debe revisarse antes de modificar los botones de plataforma;
una integración implementada no implica disponibilidad pública en una tienda.

## Descubrimiento e indexación

Las páginas `/` y `/es/` tienen canonical propio y alternates `en`, `es` y
`x-default`; este último apunta a `/`. El sitemap incluye ambas URLs y las mismas
relaciones recíprocas. `robots.txt` publica su ubicación. `llms.txt` ofrece un índice
breve de enlaces al proyecto, documentación, descargas, soporte y privacidad;
no garantiza que un buscador o asistente lo utilice.

Después de publicar, una persona con acceso a la propiedad puede:

1. Verificar `statusline.inmerzion.io` en Google Search Console y enviar
   `https://statusline.inmerzion.io/sitemap.xml` desde el informe Sitemaps.
   Consultar el estado del envío y usar Inspección de URLs para revisar `/` y `/es/`.
2. Añadir y verificar el sitio en Bing Webmaster Tools, o importar una propiedad
   verificada de Search Console, y enviar la misma URL del sitemap.
3. Comprobar los informes de rastreo e indexación después del envío; la respuesta
   HTTP correcta y un sitemap válido no prueban que las páginas estén indexadas.

Referencias oficiales: [sitemaps de Google](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
[informe Sitemaps de Search Console](https://support.google.com/webmasters/answer/7451001),
[verificación en Bing](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b)
y [sitemaps en Bing](https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed).
Estos pasos son manuales: el build y el despliegue no verifican propiedades,
no envían sitemaps a esas cuentas y no confirman indexación real.

## Despliegue en Docker y Nginx

### Requisitos y adaptación a otro servidor

La configuración incluida refleja la infraestructura de Inmerzion; **no es un
stack autónomo** y no instala Mattermost, un proxy TLS ni Certbot. Mattermost no es
una dependencia funcional de la web: es el nombre de la red compartida existente.

Antes de usar los comandos de esta sección, prepara:

- Docker Engine y Docker Compose, además de Node/npm para generar `dist/`.
- Una red Docker externa `mattermost`, compartida por `statusline-web` y el proxy
  `nginx_server`. El servicio web no publica puertos directamente al host.
- Un proxy Nginx con TLS/HTTP2, acceso a los puertos públicos 80/443, los montajes
  de certificados y el webroot ACME compartido con el renovador de certificados.
- DNS de ambos dominios, certificados válidos y un mecanismo de renovación y
  recarga del proxy. El timer mencionado más abajo ya existe en el servidor de
  Inmerzion; este repositorio no lo crea.
- El formato de log `inmerzion_session` definido en el bloque `http` del proxy.
  Las dos plantillas públicas lo referencian, pero no incluyen su definición.
  En otro servidor, usa tu formato existente o sustituye ese nombre por `combined`
  en `deploy/statusline.conf` y `deploy/statusline-http.conf` antes de instalarlas.

Para otro host, adapta el nombre de red en `compose.yml` y conecta tu proxy a ella;
reemplaza nombres de dominio, rutas del host, certificados y mecanismo de
renovación en las plantillas y comandos siguientes. Si cambia el dominio público,
actualiza también `src/site.ts`, `public/robots.txt`, `public/sitemap.xml`,
`public/llms.txt` y las referencias del sitio, y repite el build y `test:seo`.
No copies las rutas `/opt/mattermost` a un servidor que no use esa distribución.
Valida siempre `nginx -t` antes de recargar el proxy.

### Instalación en la infraestructura de Inmerzion

El dominio de publicación es `https://statusline.inmerzion.io`. La configuración
versionada utiliza dos servicios:

- [compose.yml](compose.yml) inicia `statusline-web` con la imagen Nginx fijada por
  digest. Monta `dist/` y `deploy/static.conf` en modo de solo lectura, no publica
  puertos del host y se conecta a la red Docker externa `mattermost`.
- El proxy existente `nginx_server` termina HTTPS y envía las peticiones a
  `statusline-web:80`. Su configuración persistente reside en
  `/opt/mattermost/nginx/conf.d/statusline.conf`, instalada desde
  [deploy/statusline.conf](deploy/statusline.conf).

El proxy usa el certificado dedicado
`/etc/letsencrypt/live/statusline.inmerzion.io/fullchain.pem` y su `privkey.pem`.
El certificado cubre `statusline.inmerzion.io` y `www.statusline.inmerzion.io`.
La variante `www` redirige por HTTPS al dominio principal, conservando la ruta y
los parámetros. Ambas direcciones HTTP también redirigen al dominio principal.
En el host, el directorio de certificados se encuentra en
`/opt/mattermost/volumes/web/cert/letsencrypt`. El renovador existente
`mattermost-certbot-renew.timer` comprueba los certificados de ese directorio y
recarga Nginx después de validar su configuración.

Antes de instalar el bloque HTTPS, el certificado debe existir. Para la emisión
inicial, [deploy/statusline-http.conf](deploy/statusline-http.conf) proporciona el
vhost HTTP y el acceso ACME al volumen compartido `shared-webroot`; no sustituye
la configuración HTTPS final.

La emisión o ampliación del certificado debe incluir ambos nombres mediante
`--cert-name statusline.inmerzion.io -d statusline.inmerzion.io -d www.statusline.inmerzion.io`.
Los dos nombres deben resolver al servidor para validar los desafíos HTTP.

Con la red y el certificado preparados, desde `apps/web`:

```shell
npm ci
npm run check
npm run format:check
npm run build
npm run test:seo
docker compose up -d
```

Instala el vhost y valida el proxy antes de recargarlo, con permisos para operar
la configuración del host:

```shell
install -m 0644 deploy/statusline.conf /opt/mattermost/nginx/conf.d/statusline.conf
docker exec nginx_server nginx -t
docker exec nginx_server nginx -s reload
```

El servidor estático ofrece `/healthz` para el healthcheck interno. El proxy
público devuelve 404 para esa ruta. Los archivos CSS y JavaScript con hash llevan
caché inmutable; el HTML exige revalidación.

## Actualizar una instalación

Desde `apps/web`, tras actualizar el código:

```shell
npm ci
npm run check
npm run format:check
npm run build
npm run test:seo
```

El contenido nuevo de `dist/` queda disponible mediante el montaje existente, sin
reconstruir una imagen Docker. Si cambia `deploy/static.conf`, aplica la nueva
configuración con `docker compose restart web`. Si cambia `compose.yml`, ejecuta
`docker compose up -d`. Para cambios del proxy, repite la instalación del vhost,
`nginx -t` y la recarga mostradas arriba.

Comprueba cada publicación:

```shell
docker compose ps
curl -I https://statusline.inmerzion.io
curl -I https://statusline.inmerzion.io/es/
curl -I https://statusline.inmerzion.io/sitemap.xml
curl -I https://statusline.inmerzion.io/llms.txt
curl -I https://statusline.inmerzion.io/assets/statusline-mark.svg
```

Revisa también la página en móvil y escritorio: navegación, selector de plataforma,
demostración de cuota, preguntas frecuentes y preferencia de movimiento reducido.
Estos comandos describen el procedimiento; el estado real del despliegue debe
comprobarse en el servidor.
