"""Render the maintained social-card HTML with an existing Playwright install.

This is an optional authoring tool, not a build or runtime dependency. Run with
`python scripts/render-social-cards.py --out-dir /tmp/statusline-social-preview`
after installing Playwright and its Chromium browser in an isolated environment.
Omit --out-dir to update public/assets/social-card-en.png and social-card.png.
"""

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path)
    args = parser.parse_args()
    script_dir = Path(__file__).resolve().parent
    output_dir = args.out_dir or script_dir.parent / "public" / "assets"
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(
                viewport={"width": 1200, "height": 630}, device_scale_factor=1
            )
            for language, filename in [
                ("en", "social-card-en.png"),
                ("es", "social-card.png"),
            ]:
                source = script_dir / "templates" / f"social-card-{language}.html"
                page.goto(source.as_uri(), wait_until="networkidle")
                page.evaluate("document.fonts.ready")
                assert page.evaluate(
                    """() => [...document.fonts].every(font => font.status === 'loaded')
                      && [...document.images].every(image => image.complete
                        && image.naturalWidth > 0)"""
                ), f"Missing fonts or logo in {source}"
                assert page.locator(".card").bounding_box() == {
                    "x": 0,
                    "y": 0,
                    "width": 1200,
                    "height": 630,
                }
                output = output_dir / filename
                page.screenshot(path=str(output), animations="disabled")
                print(f"Rendered {language}: {output} (1200x630)")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
