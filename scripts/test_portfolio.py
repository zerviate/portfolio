"""Sequential local checks; no deployment, API credentials or pytest required."""
from playwright.sync_api import sync_playwright

from portfolio_checks.support import ROOT, TEMP, static_site, source_url
from portfolio_checks.site import check_site, check_intro_layout, check_interactions, check_no_js
from portfolio_checks.security import check_hosted


def main() -> None:
    TEMP.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        chromium = playwright.chromium.launch(headless=True)
        try:
            check_site(chromium)
            check_intro_layout(chromium, source_url)
            check_interactions(chromium)
            check_no_js(chromium, source_url)
            with static_site(ROOT / "dist", headers=True) as base:
                check_intro_layout(chromium, lambda filename: f"{base}/{filename}")
                check_hosted(chromium, base)
        finally:
            chromium.close()

        for name, browser_type, options in (
            ("firefox", playwright.firefox, {}),
            ("edge", playwright.chromium, {"channel": "msedge"}),
        ):
            browser = browser_type.launch(headless=True, **options)
            try:
                check_site(browser, screenshots=False, accessibility=False)
                check_intro_layout(browser, source_url)
                with static_site(ROOT / "dist", headers=True) as base:
                    check_intro_layout(browser, lambda filename: f"{base}/{filename}")
                    check_hosted(browser, base, accessibility=False, label=name)
            finally:
                browser.close()
    print("Passed: Chromium, Firefox, Edge; file://, CSP dist; responsive/themes, in-order reveal, No-JS, accessibility.")
    print(f"Review screenshots: {TEMP}")


if __name__ == "__main__":
    main()
