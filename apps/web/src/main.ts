import {
  initializeLanguage,
  onLanguageChange,
  platformContent,
  uiText,
  type Platform,
} from "./i18n";
import { platformLinks } from "./site";

initializeLanguage();
const root = document.documentElement;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
root.classList.add("js");

// Content remains visible if JavaScript or IntersectionObserver is unavailable.
const revealElements = document.querySelectorAll<HTMLElement>(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.08, rootMargin: "0px 0px 25px 0px" },
  );
  revealElements.forEach((element) => observer.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("is-visible"));
}

const menuToggle = document.querySelector<HTMLButtonElement>(".menu-toggle")!;
const mobileNav = document.querySelector<HTMLElement>("#mobile-nav")!;
function setMenu(open: boolean, restoreFocus = false) {
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute(
    "aria-label",
    uiText(open ? "menuClose" : "menuOpen"),
  );
  mobileNav.hidden = !open;
  document.body.classList.toggle("menu-open", open);
  if (restoreFocus) menuToggle.focus();
}
menuToggle.addEventListener("click", () => setMenu(mobileNav.hidden === true));
mobileNav.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
  link.addEventListener("click", () => {
    setMenu(false);
    const target = document.querySelector<HTMLElement>(link.hash);
    if (target) {
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      target.addEventListener(
        "blur",
        () => target.removeAttribute("tabindex"),
        { once: true },
      );
    }
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !mobileNav.hidden) setMenu(false, true);
  if (event.key === "Tab" && !mobileNav.hidden) {
    const controls = [
      ...document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
        ".header-actions button, .header-actions a, #mobile-nav a",
      ),
    ].filter((element) => element.getClientRects().length > 0);
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      controls[0]?.focus();
    }
  }
});
window.matchMedia("(min-width: 761px)").addEventListener("change", (event) => {
  if (event.matches) setMenu(false);
});
document.addEventListener("click", (event) => {
  if (
    !mobileNav.hidden &&
    event.target instanceof Element &&
    !event.target.closest(".site-header")
  )
    setMenu(false);
});

const navLinks = [
  ...document.querySelectorAll<HTMLAnchorElement>(".desktop-nav a"),
];
if ("IntersectionObserver" in window) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        navLinks.forEach((link) => {
          const active = link.hash === `#${entry.target.id}`;
          link.classList.toggle("is-current", active);
          if (active) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      }
    },
    { rootMargin: "-15% 0px -50% 0px" },
  );
  document
    .querySelectorAll<HTMLElement>("main section[id]")
    .forEach((section) => navObserver.observe(section));
}

const demo = document.querySelector<HTMLElement>(".interactive-demo")!;
const slider = document.querySelector<HTMLInputElement>("#quota-slider")!;
const demoValue = document.querySelector<HTMLElement>("#demo-value")!;
const demoStatus = document.querySelector<HTMLElement>("#demo-status")!;
const demoAnnouncement =
  document.querySelector<HTMLElement>("#demo-announcement")!;
const demoSegments = document.querySelector<HTMLElement>("#demo-segments")!;
const demoWindowLabel =
  document.querySelector<HTMLElement>("#demo-window-label")!;
const windowButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-window]"),
];
type QuotaWindow = "weekly" | "short";
let selectedWindow: QuotaWindow = "weekly";
const quotas: Record<QuotaWindow, number> = { weekly: 73, short: 91 };
const segments = Array.from({ length: 30 }, () => {
  const segment = document.createElement("span");
  demoSegments.append(segment);
  return segment;
});
function updateQuota(value: number, announce = false) {
  const bounded = Math.max(0, Math.min(100, value));
  quotas[selectedWindow] = bounded;
  const label =
    bounded === 0
      ? uiText("quotaEmpty")
      : bounded <= 15
        ? uiText("quotaLow")
        : bounded <= 35
          ? uiText("quotaMedium")
          : uiText("quotaAvailable");
  demoValue.textContent = String(bounded);
  slider.value = String(bounded);
  slider.setAttribute(
    "aria-valuetext",
    uiText("quotaValue", {
      value: bounded,
      window: uiText(
        selectedWindow === "weekly" ? "weeklyWindow" : "shortWindow",
      ),
    }),
  );
  demoStatus.textContent = label;
  demoWindowLabel.textContent = uiText(
    selectedWindow === "weekly" ? "weeklyLabel" : "shortLabel",
  );
  demo.style.setProperty("--demo-color", bounded <= 15 ? "#f26856" : "#efc65a");
  segments.forEach((segment, index) =>
    segment.classList.toggle(
      "is-filled",
      index < Math.ceil((bounded / 100) * segments.length),
    ),
  );
  if (announce)
    demoAnnouncement.textContent = uiText("quotaAnnouncement", {
      value: bounded,
      status: label,
    });
}
slider.addEventListener("input", () => updateQuota(Number(slider.value)));
slider.addEventListener("change", () =>
  updateQuota(Number(slider.value), true),
);
windowButtons.forEach((button) =>
  button.addEventListener("click", () => {
    selectedWindow = button.dataset.window as QuotaWindow;
    windowButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    updateQuota(quotas[selectedWindow], true);
  }),
);
updateQuota(73);

let selectedPlatform: Platform = "macos";
const platformTabs = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-platform]"),
];
const platformPanel = document.querySelector<HTMLElement>("#platform-panel")!;
const platformLink =
  document.querySelector<HTMLAnchorElement>("#platform-link")!;
function selectPlatform(platform: Platform, focus = false) {
  selectedPlatform = platform;
  const details = platformContent(platform);
  platformTabs.forEach((tab) => {
    const active = tab.dataset.platform === platform;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
  platformPanel.setAttribute("aria-labelledby", `tab-${platform}`);
  const content: Record<string, string> = {
    "platform-title": details.title,
    "platform-badge": details.badge,
    "platform-description": details.description,
    "platform-requirement": details.requirement,
    "platform-link-label": details.cta,
  };
  Object.entries(content).forEach(([id, value]) => {
    document.getElementById(id)!.textContent = value;
  });
  platformLink.href = platformLinks[platform];
}
platformTabs.forEach((tab, index) => {
  tab.addEventListener("click", () =>
    selectPlatform(tab.dataset.platform as Platform),
  );
  tab.addEventListener("keydown", (event) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % platformTabs.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + platformTabs.length) % platformTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = platformTabs.length - 1;
    else return;
    event.preventDefault();
    selectPlatform(platformTabs[next].dataset.platform as Platform, true);
  });
});
// Use detection only for a helpful initial selection; every platform stays available.
const userAgent = navigator.userAgent.toLowerCase();
if (userAgent.includes("android")) selectPlatform("android");
else if (/iphone|ipad|ipod/.test(userAgent)) selectPlatform("ios");
else if (userAgent.includes("windows")) selectPlatform("windows");
else if (userAgent.includes("linux")) selectPlatform("linux");
else selectPlatform("macos");

const motionToggle =
  document.querySelector<HTMLButtonElement>(".motion-toggle")!;
let motionPreference: boolean | null = null;
try {
  const saved = localStorage.getItem("statusline-reduced-motion");
  if (saved !== null) motionPreference = saved === "true";
} catch {
  /* Storage is optional, including in private browsing. */
}
function updateMotion(paused: boolean) {
  root.classList.toggle("motion-paused", paused);
  motionToggle.setAttribute("aria-pressed", String(paused));
  document.querySelector("#motion-label")!.textContent = uiText(
    paused ? "motionPaused" : "motionPause",
  );
  motionToggle.setAttribute(
    "aria-label",
    uiText(paused ? "motionEnable" : "motionDisable"),
  );
}
updateMotion(motionPreference ?? reducedMotion.matches);
motionToggle.addEventListener("click", () => {
  motionPreference = !root.classList.contains("motion-paused");
  updateMotion(motionPreference);
  try {
    localStorage.setItem("statusline-reduced-motion", String(motionPreference));
  } catch {
    /* Optional persistence. */
  }
});
reducedMotion.addEventListener("change", (event) => {
  if (motionPreference === null) updateMotion(event.matches);
});

onLanguageChange(() => {
  updateQuota(quotas[selectedWindow]);
  demoAnnouncement.textContent = "";
  selectPlatform(selectedPlatform);
  setMenu(mobileNav.hidden === false);
  updateMotion(root.classList.contains("motion-paused"));
});
setMenu(false);

const heroScene = document.querySelector<HTMLElement>(".hero-scene")!;
if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
  heroScene.addEventListener("pointermove", (event) => {
    if (reducedMotion.matches || root.classList.contains("motion-paused"))
      return;
    const bounds = heroScene.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    heroScene.style.setProperty("--scene-rx", `${-y * 4}deg`);
    heroScene.style.setProperty("--scene-ry", `${x * 6}deg`);
  });
  heroScene.addEventListener("pointerleave", () => {
    heroScene.style.setProperty("--scene-rx", "0deg");
    heroScene.style.setProperty("--scene-ry", "0deg");
  });
}
