// Authored public copy, shared at build time. The site needs no running relay.
export interface PublicPage {
  readonly title: string;
  readonly eyebrow: string;
  readonly summary: string;
  readonly content: string;
}

export const englishPages: Readonly<Record<string, PublicPage>> = {
  "/": {
    title: "Statusline",
    eyebrow: "STL / DATA PLANE",
    summary: "Private, cross-platform Codex quota telemetry.",
    content: `
      <section>
        <h2>One status line. Every device.</h2>
        <p>Statusline reads quota metadata from your local Codex session and can relay an end-to-end encrypted snapshot to your phone. The relay never receives your Codex credentials or encryption key.</p>
      </section>
      <nav class="action-grid" aria-label="Public information">
        <a class="action" href="/privacy"><span>PRIVACY</span><strong>How data is handled</strong></a>
        <a class="action" href="/support"><span>SUPPORT</span><strong>Setup and troubleshooting</strong></a>
        <a class="action" href="/delete-data"><span>DATA CONTROL</span><strong>Delete Statusline data</strong></a>
      </nav>
    `,
  },
  "/privacy": {
    title: "Privacy Policy",
    eyebrow: "STL / PRIVACY",
    summary: "Effective 9 September 2026",
    content: `
      <section>
        <h2>Data processed locally</h2>
        <p>The desktop companion starts the locally installed Codex App Server and reads only the fields needed to show usage windows, reset times, account type and plan. It does not read, copy or store Codex access tokens, API keys, prompts, source code or conversation content.</p>
        <p>A manually selected Codex executable path stays in the computer's local application configuration and can be cleared from Source Settings.</p>
      </section>
      <section>
        <h2>Universal encrypted relay</h2>
        <p>Sync is optional. Pairing creates an AES-256 encryption key on the desktop and transfers it directly to the mobile device with a short-lived, single-use credential. Publisher and reader credentials are role-separated and stored in the operating system secure store.</p>
        <p>The relay receives a random channel identifier, SHA-256 hashes of random credentials, an opaque AES-256-GCM ciphertext and timestamps required for expiration and replay protection. It cannot decrypt the quota snapshot and never receives Codex credentials, email addresses, prompts or source code.</p>
      </section>
      <section>
        <h2>QR scanning on Android</h2>
        <p>Camera frames and decoded QR contents are processed on-device. Statusline does not store or transmit them. The bundled ML Kit barcode component may collect device and app information, an installation identifier, API configuration, feature events, performance measurements and error diagnostics for Google's diagnostics and usage analytics. Statusline does not receive that telemetry.</p>
        <p><a href="https://developers.google.com/ml-kit/android-data-disclosure" rel="noreferrer">Read Google's ML Kit data disclosure</a>.</p>
      </section>
      <section>
        <h2>Hosting, abuse prevention and logs</h2>
        <p>The Cloudflare deployment applies abuse limits using a SHA-256 digest of the source IP address. Neither the source IP nor that digest is written to the Statusline D1 database.</p>
        <p>Persistent Worker invocation logs are disabled. Cloudflare may still process IP addresses and request metadata at its edge for delivery, security, abuse prevention, aggregate metrics and billing. The Statusline desktop and mobile applications contain no advertising SDK and no first-party product analytics SDK.</p>
      </section>
      <section>
        <h2>Website analytics</h2>
        <p>The public website at statusline.inmerzion.io uses Plausible at plausible.inmerzion.io to understand visits, referral sources, page engagement and clicks on external links and downloads. The integration does not set analytics cookies or persistent visitor identifiers. Browser requests include page and referrer URLs, IP addresses and browser information; Plausible uses this information to produce aggregate statistics. Do not put private information in website URLs.</p>
        <p>This measurement applies only to the public marketing website, not to the desktop or mobile applications, their widgets, pairing flows, privacy/support/data-deletion pages or the relay's public pages. No Codex credentials, quota snapshots, pairing keys or conversation content are sent by Statusline to Plausible. Blocking analytics does not prevent use of the website.</p>
        <p>See <a href="https://plausible.io/data-policy" rel="noreferrer">Plausible's data policy</a> for its analytics processing model; hosting and operational logs of the Inmerzion instance are managed separately from the encrypted relay.</p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>Pairing links expire after ten minutes. Channels expire after thirty days without a successful publication, and a daily task removes expired rows. Rate-limit state is scoped to 60-second windows and is not stored in the relay database.</p>
        <p>Disconnecting the desktop attempts to delete the remote channel and removes its local credential. Disconnecting the mobile reader removes its local credential and encryption key.</p>
        <p>See <a href="/delete-data">Delete Statusline data</a> for step-by-step instructions and the complete retention details.</p>
      </section>
      <section>
        <h2>Questions</h2>
        <p>Email <a href="mailto:founder@inmerzion.io">founder@inmerzion.io</a> or use the <a href="/support">Statusline support page</a> for privacy questions or reports. Never include pairing links, QR codes, API keys, access tokens or private Codex configuration.</p>
      </section>
    `,
  },
  "/support": {
    title: "Support",
    eyebrow: "STL / SUPPORT",
    summary: "Setup, pairing and diagnostics",
    content: `
      <section>
        <h2>Request support</h2>
        <p>Email <a href="mailto:founder@inmerzion.io">founder@inmerzion.io</a> for reproducible bugs, installation problems and privacy questions. Remove account identifiers, pairing links, QR codes, API keys, access tokens and private paths before submitting anything.</p>
      </section>
      <section>
        <h2>Codex source not found</h2>
        <p>On macOS, Statusline can use the runtime bundled with the official Codex desktop app; a separate CLI installation is not required. Open Codex and sign in with ChatGPT first. On Windows and Linux, install or update the official Codex CLI and verify <code>codex --version</code>. Then use Connections → Codex Source → Scan again in Statusline Companion.</p>
        <p>If automatic detection fails, choose Select executable. Statusline validates the selected launcher with <code>codex --version</code> before saving it.</p>
      </section>
      <section>
        <h2>Phone does not receive a sample</h2>
        <ol>
          <li>Confirm Universal Relay shows a public HTTPS endpoint.</li>
          <li>Create a new pairing and scan it within ten minutes.</li>
          <li>Confirm the desktop changes from Pairing to Connected.</li>
          <li>Refresh while Codex is authenticated, then refresh the phone.</li>
          <li>Verify desktop and mobile builds use the same relay origin.</li>
        </ol>
      </section>
      <section>
        <h2>Useful diagnostic details</h2>
        <ul>
          <li>Operating system and Statusline version.</li>
          <li>Installer format and output of <code>codex --version</code>.</li>
          <li>Codex Source origin, version and state.</li>
          <li>Relay hostname and state, never the full pairing URL.</li>
        </ul>
      </section>
      <section>
        <h2>Delete your data</h2>
        <p>Statusline has no user account. Follow the steps on the <a href="/delete-data">Statusline data deletion page</a> to remove local credentials and encrypted relay data, or email support for a deletion request.</p>
      </section>
    `,
  },
  "/delete-data": {
    title: "Delete Statusline Data",
    eyebrow: "STL / DATA CONTROL",
    summary: "Remove local credentials and encrypted relay data",
    content: `
      <section>
        <h2>No Statusline account</h2>
        <p>Statusline does not create a user account and does not receive your Codex credentials, email address, prompts, source code or conversation history. A paired device stores only local relay credentials, an encryption key and the latest decrypted quota snapshot.</p>
      </section>
      <section>
        <h2>Delete data from Android</h2>
        <ol>
          <li>Open Statusline and scroll to <strong>Relay Control</strong>.</li>
          <li>Select <strong>Disconnect</strong> and confirm.</li>
          <li>Statusline removes the reader credential, encryption key and cached quota snapshot from the device. You can also clear the local demo with <strong>Clear Demo</strong>.</li>
        </ol>
        <p>Uninstalling Statusline removes its normal local application data according to Android's application-storage behavior.</p>
      </section>
      <section>
        <h2>Disconnect an iPhone</h2>
        <p>Open Statusline and select Disconnect in the relay controls before uninstalling it. The app removes the reader credential, encryption key and its local sample. Disconnecting the phone alone does not delete the remote channel.</p>
      </section>
      <section>
        <h2>Delete the encrypted relay channel</h2>
        <ol>
          <li>Open Statusline Companion on the paired Windows, Linux or macOS computer.</li>
          <li>Open <strong>Universal Relay</strong> and select <strong>Disconnect</strong>.</li>
          <li>The Companion attempts to delete the remote channel immediately, then removes its local publisher credential.</li>
        </ol>
        <p>If the publisher is unavailable, stop using the channel. Pairing links expire after ten minutes and channels expire after thirty days without a successful publication; the daily cleanup task removes expired rows.</p>
      </section>
      <section>
        <h2>Request deletion or assistance</h2>
        <p>Email <a href="mailto:founder@inmerzion.io">founder@inmerzion.io</a> with the subject <strong>Statusline data deletion</strong>. State which device or relay channel you can no longer disconnect, but never send a pairing link, QR code, API key, access token, encryption key or Codex authentication file.</p>
        <p>Statusline support can explain local removal and retention. Because the relay stores only random identifiers, hashed random credentials and opaque ciphertext, support cannot identify a channel from your name or email and cannot decrypt its contents. Channel access expires thirty days after its last successful publication; the daily cleanup then removes expired data.</p>
      </section>
    `,
  },
};

export const publicSiteOrigin = "https://statusline.inmerzion.io";
export const publicPageIDs = ["privacy", "support", "delete-data"] as const;
export type PublicPageID = (typeof publicPageIDs)[number];
export type PublicLanguage = "en" | "es";

const spanishPages: Readonly<Record<PublicPageID, PublicPage>> = {
  privacy: {
    title: "Política de privacidad",
    eyebrow: "STL / PRIVACIDAD",
    summary: "En vigor desde el 9 de septiembre de 2026",
    content: `
      <section>
        <h2>Datos procesados localmente</h2>
        <p>El companion de escritorio inicia el Codex App Server instalado localmente y lee únicamente los campos necesarios para mostrar los periodos de uso, sus reinicios, el tipo de cuenta y el plan. No lee, copia ni almacena tokens de acceso de Codex, claves API, instrucciones, código fuente ni conversaciones.</p>
        <p>Si seleccionas manualmente un ejecutable de Codex, su ruta permanece en la configuración local del ordenador y se puede borrar desde los ajustes del origen.</p>
      </section>
      <section>
        <h2>Relay universal cifrado</h2>
        <p>La sincronización es opcional. El emparejamiento genera una clave AES-256 en el ordenador y la transfiere directamente al móvil mediante una credencial de corta duración y un solo uso. Las credenciales de publicación y lectura tienen funciones separadas y se guardan en el almacenamiento seguro del sistema operativo.</p>
        <p>El relay recibe un identificador aleatorio de canal, hashes SHA-256 de credenciales aleatorias, un contenido opaco cifrado con AES-256-GCM y las marcas de tiempo necesarias para la caducidad y la protección contra repeticiones. No puede descifrar la muestra de cuota y nunca recibe credenciales de Codex, direcciones de correo, instrucciones ni código fuente.</p>
      </section>
      <section>
        <h2>Escaneo de QR en Android</h2>
        <p>Las imágenes de la cámara y el contenido del QR se procesan en el dispositivo. Statusline no los almacena ni transmite. El componente de códigos de barras de ML Kit incluido en la app puede recopilar información del dispositivo y la aplicación, un identificador de instalación, la configuración de la API, eventos de funciones, mediciones de rendimiento y diagnósticos de errores para las estadísticas y el diagnóstico de Google. Statusline no recibe esa telemetría.</p>
        <p><a href="https://developers.google.com/ml-kit/android-data-disclosure" rel="noreferrer">Consulta la información de Google sobre los datos de ML Kit</a>.</p>
      </section>
      <section>
        <h2>Alojamiento, prevención de abusos y registros</h2>
        <p>El despliegue de Cloudflare limita los abusos usando un hash SHA-256 de la dirección IP de origen. Ni la IP ni ese hash se escriben en la base de datos D1 de Statusline.</p>
        <p>Los registros persistentes de invocaciones del Worker están desactivados. Cloudflare puede procesar direcciones IP y metadatos de las peticiones para la entrega, la seguridad, la prevención de abusos, las métricas agregadas y la facturación. Las aplicaciones de escritorio y móviles de Statusline no incluyen SDK de publicidad ni de analítica propia del producto.</p>
      </section>
      <section>
        <h2>Analítica del sitio web</h2>
        <p>El sitio público statusline.inmerzion.io utiliza Plausible en plausible.inmerzion.io para conocer las visitas, las referencias, la interacción con las páginas y los clics en enlaces externos y descargas. La integración no utiliza cookies analíticas ni identificadores persistentes de visitantes. Las peticiones del navegador incluyen las URLs de la página y de referencia, direcciones IP e información del navegador; Plausible usa esa información para elaborar estadísticas agregadas. No incluyas información privada en las URLs del sitio.</p>
        <p>Esta medición se aplica únicamente al sitio de presentación, no a las apps de escritorio o móviles, sus widgets, el emparejamiento, las páginas de privacidad, soporte y eliminación de datos ni las páginas públicas del relay. Statusline no envía a Plausible credenciales de Codex, muestras de cuota, claves de emparejamiento ni conversaciones. Bloquear la analítica no impide utilizar el sitio.</p>
        <p>Consulta la <a href="https://plausible.io/data-policy" rel="noreferrer">política de datos de Plausible</a>; el alojamiento y los registros operativos de la instancia de Inmerzion se gestionan de forma separada del relay cifrado.</p>
      </section>
      <section>
        <h2>Conservación y eliminación</h2>
        <p>Los vínculos de emparejamiento caducan a los diez minutos. Los canales caducan tras treinta días sin una publicación correcta, y una tarea diaria elimina las filas caducadas. El estado de los límites de peticiones se acota a periodos de 60 segundos y no se almacena en la base de datos del relay.</p>
        <p>Desconectar el escritorio intenta eliminar el canal remoto y elimina su credencial local. Desconectar el lector móvil elimina su credencial local y la clave de cifrado.</p>
        <p>Consulta <a href="/delete-data">Eliminar datos de Statusline</a> para ver los pasos y los detalles de conservación.</p>
      </section>
      <section>
        <h2>Consultas</h2>
        <p>Escribe a <a href="mailto:founder@inmerzion.io">founder@inmerzion.io</a> o visita la <a href="/support">página de soporte de Statusline</a> para consultas de privacidad. Nunca incluyas vínculos de emparejamiento, códigos QR, claves API, tokens de acceso ni configuración privada de Codex.</p>
      </section>
    `,
  },
  support: {
    title: "Soporte",
    eyebrow: "STL / SOPORTE",
    summary: "Configuración, emparejamiento y diagnóstico",
    content: `
      <section>
        <h2>Solicitar ayuda</h2>
        <p>Escribe a <a href="mailto:founder@inmerzion.io">founder@inmerzion.io</a> para comunicar errores reproducibles, problemas de instalación o consultas de privacidad. Elimina identificadores de cuenta, vínculos de emparejamiento, códigos QR, claves API, tokens de acceso y rutas privadas antes de enviar información.</p>
      </section>
      <section>
        <h2>No se encuentra el origen de Codex</h2>
        <p>En macOS, Statusline puede utilizar el ejecutable incluido en la aplicación oficial de escritorio de Codex; no necesitas instalar la CLI por separado. Abre Codex e inicia sesión con ChatGPT primero. En Windows y Linux, instala o actualiza la CLI oficial de Codex y comprueba <code>codex --version</code>. Después utiliza Conexiones → Origen de Codex → Buscar de nuevo en Statusline Companion.</p>
        <p>Si la detección automática falla, utiliza Seleccionar ejecutable. Statusline lo valida con <code>codex --version</code> antes de guardar la ruta.</p>
      </section>
      <section>
        <h2>El teléfono no recibe una muestra</h2>
        <ol>
          <li>Comprueba que Relay universal muestra un servidor HTTPS público.</li>
          <li>Crea un emparejamiento nuevo y escanéalo antes de diez minutos.</li>
          <li>Comprueba que el escritorio pasa de Emparejando a Conectado.</li>
          <li>Actualiza con la sesión de Codex iniciada y después actualiza el teléfono.</li>
          <li>Verifica que las versiones de escritorio y móvil utilizan el mismo origen del relay.</li>
        </ol>
      </section>
      <section>
        <h2>Datos útiles para el diagnóstico</h2>
        <ul>
          <li>Sistema operativo y versión de Statusline.</li>
          <li>Formato del instalador y salida de <code>codex --version</code>, si utilizas la CLI.</li>
          <li>Origen, versión y estado de Codex.</li>
          <li>Dominio y estado del relay, nunca el vínculo completo de emparejamiento.</li>
        </ul>
      </section>
      <section>
        <h2>Eliminar tus datos</h2>
        <p>Statusline no crea una cuenta de usuario. Sigue los pasos de la <a href="/delete-data">página de eliminación de datos</a> para borrar las credenciales locales y los datos cifrados del relay, o escribe a soporte.</p>
      </section>
    `,
  },
  "delete-data": {
    title: "Eliminar datos de Statusline",
    eyebrow: "STL / CONTROL DE DATOS",
    summary: "Elimina las credenciales locales y los datos cifrados del relay",
    content: `
      <section>
        <h2>Sin cuenta de Statusline</h2>
        <p>Statusline no crea una cuenta de usuario ni recibe tus credenciales de Codex, correo electrónico, instrucciones, código fuente o historial de conversaciones. Un dispositivo emparejado guarda únicamente las credenciales locales del relay, una clave de cifrado y la última muestra de cuota descifrada.</p>
      </section>
      <section>
        <h2>Eliminar datos de Android</h2>
        <ol>
          <li>Abre Statusline y ve a Control del relay.</li>
          <li>Selecciona Desconectar y confirma.</li>
          <li>Statusline elimina la credencial de lectura, la clave de cifrado y la muestra de cuota de la app. También puedes borrar la demostración local con Borrar demo.</li>
        </ol>
        <p>Desinstalar Statusline elimina sus datos de aplicación habituales según el comportamiento del almacenamiento de Android.</p>
      </section>
      <section>
        <h2>Desconectar un iPhone</h2>
        <p>Abre Statusline y selecciona Desconectar en los controles del relay antes de desinstalarla. La app elimina la credencial de lectura, la clave y su muestra local. Desconectar el teléfono no elimina por sí solo el canal remoto.</p>
      </section>
      <section>
        <h2>Eliminar el canal cifrado del relay</h2>
        <ol>
          <li>Abre Statusline Companion en el ordenador Windows, Linux o macOS emparejado.</li>
          <li>Abre Relay universal y selecciona Desconectar.</li>
          <li>El companion intenta eliminar el canal remoto inmediatamente y después elimina su credencial de publicación local.</li>
        </ol>
        <p>Si el escritorio no está disponible, deja de utilizar el canal. Los vínculos de emparejamiento caducan a los diez minutos y los canales caducan tras treinta días sin una publicación correcta; la tarea diaria elimina los registros caducados.</p>
      </section>
      <section>
        <h2>Solicitar eliminación o ayuda</h2>
        <p>Escribe a <a href="mailto:founder@inmerzion.io">founder@inmerzion.io</a> con el asunto <strong>Eliminación de datos de Statusline</strong>. Indica qué dispositivo o canal ya no puedes desconectar, pero nunca envíes un vínculo de emparejamiento, QR, clave API, token de acceso, clave de cifrado ni archivo de autenticación de Codex.</p>
        <p>Soporte puede explicar la eliminación local y la conservación. Como el relay guarda únicamente identificadores aleatorios, hashes de credenciales aleatorias y contenido cifrado opaco, soporte no puede identificar un canal a partir de tu nombre o correo ni descifrarlo. El acceso al canal caduca a los treinta días de su última publicación correcta; después se elimina mediante la limpieza diaria.</p>
      </section>
    `,
  },
};

export function publicPagePath(
  id: PublicPageID,
  language: PublicLanguage,
): string {
  return `${language === "es" ? "/es" : ""}/${id}`;
}

export function publicPageMatch(
  pathname: string,
): { id: PublicPageID; language: PublicLanguage } | null {
  const match = /^\/(es\/)?(privacy|support|delete-data)\/?$/.exec(pathname);
  if (!match) return null;
  return { id: match[2] as PublicPageID, language: match[1] ? "es" : "en" };
}

export function publicPageContent(
  id: PublicPageID,
  language: PublicLanguage,
): PublicPage {
  const page = language === "es" ? spanishPages[id] : englishPages[`/${id}`];
  if (!page) throw new Error(`Missing public page: ${language}/${id}`);
  return {
    ...page,
    content: page.content.replace(
      /href="\/(privacy|support|delete-data)"/g,
      (_, linked: PublicPageID) => `href="${publicPagePath(linked, language)}"`,
    ),
  };
}
