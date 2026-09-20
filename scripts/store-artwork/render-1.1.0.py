"""Run with Browser Use's `python --file`, after setting repo_root in its namespace.

No browser is launched here. Uses the existing, isolated Browser Use session.
Source PNGs must already have been captured and visually reviewed.
"""

from pathlib import Path

root = Path(repo_root).resolve()
version = globals().get("artwork_version", "1.1.0")
if version not in ("1.1.0", "1.1.1"):
    raise ValueError("Unsupported verified artwork version")
base_url = "http://127.0.0.1:8766/scripts/store-artwork/1.1.0.html"
names = ["01-quota", "02-gemini", "03-pairing", "04-widget", "05-privacy"]

for lang, locale in [("en", "en-US"), ("es", "es-ES")]:
    for slide, name in enumerate(names, 1):
        browser.goto(f"{base_url}?lang={lang}&slide={slide}&version={version}")
        page = browser._run(browser._session.get_current_page())
        browser._run(page.set_viewport_size(width=1320, height=2868))
        ready = browser._run(page.evaluate("""() => (async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map(i => i.decode()));
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const subtitle = document.querySelector('.subtitle').getBoundingClientRect();
            const visual = document.querySelector('.visual').getBoundingClientRect();
            return document.body.dataset.ready === 'true'
                && innerWidth === 1320 && innerHeight === 2868
                && subtitle.bottom < visual.top;
        })()"""))
        if not ready:
            raise RuntimeError(f"Artwork not ready: {locale}/{name}")
        destination = root / "apps/apple/store/assets" / version / locale / f"{name}.png"
        browser._run(browser._session.take_screenshot(
            path=str(destination), full_page=True, format="png",
            clip={"x": 0, "y": 0, "width": 1320, "height": 2868},
        ))
        print(f"Rendered {locale}/{name}.png")
