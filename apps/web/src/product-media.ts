// Public, synthetic product captures shared with the README. Never add live
// account screenshots or pairing credentials to this allowlist.
export const productViews = [
  "companion",
  "iphone",
  "settings-codex",
  "settings-mobile",
] as const;
export type ProductView = (typeof productViews)[number];
export function productImage(view: string, language: "en" | "es"): string {
  if (!productViews.includes(view as ProductView)) {
    throw new Error(`Unknown product view: ${view}`);
  }
  return `/assets/still-signature-020/${view}-${language}.png`;
}
