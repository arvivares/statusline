# Statusline para Android

Cliente Android nativo del Statusline Relay Protocol v1. La aplicación reclama el QR de Statusline Companion, guarda el reader token y la clave AES en Android Keystore, descarga el último blob cifrado y actualiza la vista y el widget Data Plane desde una caché privada local.

## Requisitos

- JDK 17
- Android SDK Platform 37.0
- Android SDK Build Tools 36.0.0 o posterior

La aplicación compila contra API 37.0 para usar Compose 1.12, pero conserva `targetSdk 36`
y `minSdk 23`; este cambio de toolchain no reduce la compatibilidad con dispositivos. En
línea de comandos, el identificador exacto del paquete es `platforms;android-37.0`.

## Configuración

El build usa por defecto `https://statusline-relay.inmerzion.workers.dev`. Para otro relay compatible, pasa el mismo origen HTTPS usado por el companion:

```shell
./gradlew assembleDebug \
  -PSTATUSLINE_RELAY_BASE_URL=https://relay.example.com
```

También puede usarse la variable de entorno `STATUSLINE_RELAY_BASE_URL`. Release rechaza HTTP; Debug lo admite únicamente para loopback.

## Validación y APK

```shell
./gradlew testDebugUnitTest lintDebug
./gradlew assembleDebug
```

El APK instalable queda en `app/build/outputs/apk/debug/app-debug.apk`. Es un build de pruebas firmado con la clave debug de Android. Para distribución pública hace falta una clave de firma privada y conviene publicar además un Android App Bundle (`.aab`).

## Artefactos de GitHub Actions

El workflow `.github/workflows/android.yml` ejecuta tests, Lint y `assembleDebug` en cada push o pull request que modifica Android, el protocolo compartido o el propio workflow. El APK queda disponible durante 14 días en la sección **Actions → Android artifacts → Artifacts**.

Cada runner crea su propia debug key temporal. Por eso un APK debug descargado de una ejecución puede requerir desinstalar el de otra ejecución antes de instalarlo. Los artefactos de publicación usan siempre la upload key estable y sí admiten actualizaciones.

Un tag `android-v*` —o una ejecución manual con **release** activado— añade un APK y un AAB firmados, `mapping.txt` y `SHA256SUMS.txt`. Google Play recibe el AAB; el APK queda como artefacto instalable para validación directa.

Los textos, declaraciones, instrucciones para revisión y recursos gráficos de Google Play están versionados en [`store/`](store/README.md). El kit actual corresponde a `0.1.10` (`versionCode 6`), enviado a la pista cerrada Alpha como `0.1.10-alpha.1` el 2 de septiembre de 2026.

## Firma de publicación

Genera una upload key fuera del repositorio. `keytool` solicitará las contraseñas de forma interactiva para que no queden en el historial del shell:

```shell
keytool -genkeypair -v \
  -keystore /ruta/segura/statusline-upload.jks \
  -alias statusline-upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

Guarda una copia cifrada del `.jks`, el alias y ambas contraseñas en dos ubicaciones seguras. No uses la debug key ni subas el keystore a Git.

El build Release lee exclusivamente estas variables de entorno:

- `STATUSLINE_ANDROID_KEYSTORE_FILE`
- `STATUSLINE_ANDROID_KEYSTORE_PASSWORD`
- `STATUSLINE_ANDROID_KEY_ALIAS`
- `STATUSLINE_ANDROID_KEY_PASSWORD`

En GitHub configura la variable de repositorio `STATUSLINE_RELAY_BASE_URL` y estos secretos:

- `ANDROID_UPLOAD_KEYSTORE_BASE64`: contenido completo del `.jks` codificado en Base64;
- `ANDROID_UPLOAD_KEYSTORE_PASSWORD`;
- `ANDROID_UPLOAD_KEY_ALIAS`;
- `ANDROID_UPLOAD_KEY_PASSWORD`.

El workflow decodifica el keystore únicamente dentro del directorio temporal del runner, no lo publica y lo elimina al terminar. Para una build local, las cuatro variables pueden cargarse desde el `.env` excluido de Git que documenta la raíz; protege ese archivo con permisos de usuario y prefiere un gestor de secretos. La clave y sus contraseñas nunca deben guardarse en archivos versionados ni logs.

Con las cuatro configuradas, genera el artefacto para Play App Signing:

```shell
./gradlew testDebugUnitTest lintRelease bundleRelease
```

`bundleRelease` y `assembleRelease` fallan si la firma no está completa. Sólo para comprobar localmente R8 y recursos sin producir un artefacto publicable puede usarse `-PSTATUSLINE_ALLOW_UNSIGNED_RELEASE=true`.

Release también ejecuta `scripts/verify-r8-registrars.sh` sobre `mapping.txt`. Este gate exige conservar los constructores públicos sin argumentos de los registrars de ML Kit que Firebase descubre por reflexión; evita que una optimización R8 vuelva a romper el escáner únicamente en builds distribuidos por Google Play.

## Flujo de uso

1. En Statusline Companion crea un pairing nuevo.
2. En Android pulsa `PAIR DEVICE` y escanea el QR. También puedes abrir o pegar el vínculo `statusline://pair?...`.
3. La app reclama el token efímero y lo reemplaza por un reader token.
4. Añade `Codex Data Plane` desde el selector de widgets de Android.

El widget sólo muestra la caché validada por la app y no realiza solicitudes de red por su cuenta. Al tocarlo se abre Statusline y se refresca el snapshot; esto mantiene predecible el consumo del relay.

## Seguridad

- El QR es secreto, de un solo uso y caduca a los diez minutos.
- La clave AES nunca se envía al relay.
- Reader token y clave quedan dentro de un blob AES-GCM protegido por una clave no exportable de Android Keystore.
- Backup y transferencia de datos están desactivados para evitar restaurar ciphertext sin su clave local.
- El cliente rechaza redirects, orígenes con credenciales/query/fragment, respuestas mayores de 64 KiB y snapshots que no autentican.
