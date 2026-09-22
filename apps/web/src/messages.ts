import type { Language, Platform } from "./site";

export const interfaceMessages = {
  en: {
    menuOpen: "Open menu",
    menuClose: "Close menu",
    quotaEmpty: "Until the next reset",
    quotaLow: "Time to plan ahead",
    quotaMedium: "Every idea counts",
    quotaAvailable: "Room to create",
    quotaValue: "{value}% available, {window}",
    quotaAnnouncement: "{value}% quota available. {status}. Sample data.",
    weeklyWindow: "weekly window",
    shortWindow: "five-hour window",
    weeklyLabel: "WEEKLY WINDOW",
    shortLabel: "5-HOUR WINDOW",
    motionPaused: "ANIMATION PAUSED",
    motionPause: "PAUSE ANIMATION",
    motionEnable: "Enable decorative animation",
    motionDisable: "Pause decorative animation",
    languageChanged: "Website language changed to English.",
  },
  es: {
    menuOpen: "Abrir menú",
    menuClose: "Cerrar menú",
    quotaEmpty: "Hasta el próximo reinicio",
    quotaLow: "Momento de planificar",
    quotaMedium: "Cada idea cuenta",
    quotaAvailable: "Espacio para crear",
    quotaValue: "{value}% disponible, {window}",
    quotaAnnouncement:
      "{value}% de cuota disponible. {status}. Datos de ejemplo.",
    weeklyWindow: "ventana semanal",
    shortWindow: "ventana de cinco horas",
    weeklyLabel: "VENTANA SEMANAL",
    shortLabel: "VENTANA DE 5 HORAS",
    motionPaused: "ANIMACIÓN PAUSADA",
    motionPause: "PAUSAR ANIMACIÓN",
    motionEnable: "Activar animación decorativa",
    motionDisable: "Pausar animación decorativa",
    languageChanged: "El idioma del sitio ha cambiado a español.",
  },
} as const;

export interface PlatformContent {
  title: string;
  badge: string;
  description: string;
  requirement: string;
  cta: string;
}

export const platformMessages: Record<
  Language,
  Record<Platform, PlatformContent>
> = {
  en: {
    macos: {
      title: "A small companion. Big ideas.",
      badge: "BETA",
      description:
        "A universal companion for Apple Silicon and Intel Macs. Explore the project's releases for DMG and PKG installers.",
      requirement: "SUPPORTED LOCAL PROVIDER · CLAUDE CODE REQUIRES OPT-IN",
      cta: "Explore releases",
    },
    linux: {
      title: "Your terminal has a new companion.",
      badge: "BETA",
      description:
        "A companion for Linux x64, with DEB, RPM and AppImage packages. Explore the test releases and their verification instructions.",
      requirement: "LOCAL PROVIDER SETUP · CLAUDE CODE NATIVE QA PENDING",
      cta: "Explore releases",
    },
    windows: {
      title: "The next step for your desktop.",
      badge: "PREVIEW",
      description:
        "Public NSIS and MSI installers are available without Authenticode signing. SmartScreen may warn or block installation; verify the signed checksums and provenance.",
      requirement:
        "UNSIGNED · LOCAL PROVIDER SETUP · CLAUDE CODE NATIVE QA PENDING",
      cta: "Explore preview releases",
    },
    android: {
      title: "Your quota, on your home screen.",
      badge: "IN TESTING",
      description:
        "A native app and widgets for Android 6.0 and later. Compatible releases show Codex and Antigravity, not Claude Code yet. Explore prerelease APKs; Google Play remains in closed testing.",
      requirement: "COMPATIBLE MOBILE RELEASE · ENCRYPTED COMPANION SYNC",
      cta: "Explore releases",
    },
    ios: {
      title: "A quick glance from your iPhone.",
      badge: "AVAILABLE",
      description:
        "Free on the App Store. Compatible releases show Codex and Antigravity in the native app and widgets, with encrypted companion sync. Claude Code is desktop-only; check the store version.",
      requirement: "IPHONE · IOS 17+ · WIDGETKIT",
      cta: "Download on the App Store",
    },
  },
  es: {
    macos: {
      title: "Un pequeño companion. Grandes ideas.",
      badge: "BETA",
      description:
        "Companion universal para Mac con Apple Silicon e Intel. Consulta los instaladores DMG y PKG en las versiones del proyecto.",
      requirement:
        "PROVEEDOR LOCAL COMPATIBLE · CLAUDE CODE REQUIERE ACTIVACIÓN",
      cta: "Explorar versiones",
    },
    linux: {
      title: "Tu terminal tiene un nuevo compañero.",
      badge: "BETA",
      description:
        "Companion para Linux x64, con paquetes DEB, RPM y AppImage. Revisa las versiones para testers y sus instrucciones de verificación.",
      requirement:
        "PROVEEDOR LOCAL · VALIDACIÓN NATIVA DE CLAUDE CODE PENDIENTE",
      cta: "Explorar versiones",
    },
    windows: {
      title: "El próximo paso para tu escritorio.",
      badge: "PREVIEW",
      description:
        "Los instaladores públicos NSIS y MSI no tienen firma Authenticode. SmartScreen puede advertir o bloquear la instalación; verifica los checksums firmados y la procedencia.",
      requirement:
        "SIN FIRMA · PROVEEDOR LOCAL · VALIDACIÓN NATIVA DE CLAUDE CODE PENDIENTE",
      cta: "Explorar previews",
    },
    android: {
      title: "Tu cuota, en tu pantalla de inicio.",
      badge: "EN PRUEBAS",
      description:
        "App nativa y widgets para Android 6.0 o posterior. Las versiones compatibles muestran Codex y Antigravity, todavía no Claude Code. Consulta los APK de las prereleases; Google Play sigue en pruebas cerradas.",
      requirement:
        "VERSIÓN MÓVIL COMPATIBLE · SINCRONIZACIÓN CIFRADA CON EL COMPANION",
      cta: "Explorar versiones",
    },
    ios: {
      title: "Un vistazo desde tu iPhone.",
      badge: "DISPONIBLE",
      description:
        "Gratis en el App Store. Las versiones compatibles muestran Codex y Antigravity en la app y sus widgets, con sincronización cifrada. Claude Code es solo para escritorio; comprueba la versión de la tienda.",
      requirement: "IPHONE · IOS 17+ · WIDGETKIT",
      cta: "Descargar en el App Store",
    },
  },
};
