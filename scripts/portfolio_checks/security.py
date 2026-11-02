from urllib.request import urlopen
from playwright.sync_api import expect
from .support import PAGES, assert_clean, assert_document, accessibility as scan_accessibility, capture_policies, finish_render, watch
from .site import check_no_js


def check_hosted(browser, base, accessibility=True, label=None):
    label = label or browser.browser_type.name
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="no-preference")
    policies = capture_policies(context)
    page = context.new_page()
    result = watch(page)
    for filename in PAGES:
        # Both paths must receive the policy; Cloudflare canonicalizes .html URLs.
        routes = (filename, filename[:-5]) if filename != "404.html" else (filename,)
        for route in routes:
            response = page.goto(f"{base}/{route}", wait_until="load")
            assert response.status == 200
            headers = response.all_headers()
            assert headers["x-content-type-options"] == "nosniff"
            assert headers["x-frame-options"] == "DENY"
            assert headers["referrer-policy"] == "no-referrer"
            assert "frame-ancestors 'none'" in headers["content-security-policy"]
            assert "connect-src 'none'" in headers["content-security-policy"]
            if filename == "index.html":
                page.wait_for_function("() => document.querySelector('[data-section]').classList.contains('is-revealed')", timeout=10000)
            finish_render(page)
            assert_document(page, filename)
            if accessibility:
                scan_accessibility(page)
            assert_clean(result)
    assert not policies, policies
    context.close()
    check_no_js(browser, lambda filename: f"{base}/{filename}")

    with urlopen(f"{base}/assets/js/app.js") as response:
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["Cross-Origin-Resource-Policy"] == "same-origin"
    context = browser.new_context()
    page = context.new_page()
    response = page.goto(f"{base}/unknown/nested/path", wait_until="load")
    assert response.status == 404
    expect(page.locator("h1")).to_contain_text("not found")
    for filename in ("imprint.html", "copyright.html"):
        assert page.locator(f'a[href="/{filename}"]').count() == 1
    # Every link survives the nested path: the nav's profile/ and the return link both go home.
    assert page.locator('a[href="/"]').count() == 2
    page.get_by_role("link", name="return to the profile").click()
    page.wait_for_function("() => document.querySelector('[data-section]').classList.contains('is-revealed')", timeout=10000)
    expect(page.locator(".p-cmd[data-type]").first).to_have_text("fastfetch", timeout=10000)
    context.close()
    check_policy_enforcement(browser, base)
    print(f"{label}: exact _headers policies, extensionless routes, 404 and No-JS passed")


def check_policy_enforcement(browser, base):
    context = browser.new_context(reduced_motion="reduce")
    policies = capture_policies(context)
    page = context.new_page()
    page.goto(f"{base}/links.html", wait_until="load")
    page.evaluate("""() => {
        const injected = document.createElement('script');
        injected.textContent = 'window.inlineInjectionExecuted = true';
        document.body.appendChild(injected);
        void fetch('https://example.invalid/blocked').catch(() => {});
    }""")
    page.wait_for_timeout(100)
    assert page.evaluate("window.inlineInjectionExecuted === undefined")
    assert {"script-src-elem", "connect-src"} <= {item["directive"] for item in policies}, policies
    context.close()

    # A controlled route intercepts external navigation; no real third party is contacted.
    context = browser.new_context()
    received = []

    def external(route):
        received.append(route.request.headers)
        route.fulfill(status=200, content_type="text/html", body="<html><title>Referrer probe</title></html>")

    context.route("https://github.com/zerviate", external)
    page = context.new_page()
    page.goto(f"{base}/links.html", wait_until="load")
    # Every authored external link also sets rel="noreferrer"; navigate without it
    # so the probe exercises the response and meta Referrer-Policy alone.
    page.evaluate("location.href = 'https://github.com/zerviate'")
    expect(page).to_have_title("Referrer probe")
    assert received and "referer" not in received[0], received
    context.close()
