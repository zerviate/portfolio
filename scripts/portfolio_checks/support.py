from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit
import tempfile

from playwright.sync_api import Page, expect

ROOT = Path(__file__).resolve().parents[2]
TEMP = Path(tempfile.gettempdir()) / "portfolio-checks"
PAGES = ("index.html", "personal.html", "links.html", "imprint.html", "copyright.html", "404.html")
AXE = ROOT / "node_modules" / "axe-core" / "axe.min.js"


def source_url(filename):
    pathname, separator, query = filename.partition("?")
    return (ROOT / pathname).as_uri() + (f"?{query}" if separator else "")


def header_rules():
    """Parse the project's simple path rules with Cloudflare's cumulative headers."""
    rules, current = [], None
    for line in (ROOT / "_headers").read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith(" "):
            current = (line.strip(), [])
            rules.append(current)
        else:
            name, value = line.strip().split(":", 1)
            current[1].append((name, value.strip()))
    return rules


@contextmanager
def static_site(directory: Path, headers=False):
    rules = header_rules() if headers else []

    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def end_headers(self):
            pathname = getattr(self, "canonical_path", urlsplit(self.path).path)
            combined = {}
            for pattern, values in rules:
                if pattern == "/*" or pattern == pathname:
                    for name, value in values:
                        combined.setdefault(name, []).append(value)
            for name, values in combined.items():
                self.send_header(name, ", ".join(values))
            super().end_headers()

        def do_GET(self):
            pathname = urlsplit(self.path).path
            self.canonical_path = pathname
            # Exercise both .html and Pages' extensionless canonical routes.
            if pathname != "/" and "." not in Path(pathname).name:
                candidate = directory / pathname.lstrip("/")
                if candidate.with_suffix(".html").is_file():
                    self.path = f"{pathname}.html"
                    self.canonical_path = pathname
            super().do_GET()

        def send_error(self, code, message=None, explain=None):
            if code == 404 and (directory / "404.html").is_file():
                content = (directory / "404.html").read_bytes()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(content)
            else:
                super().send_error(code, message, explain)

    class TestServer(ThreadingHTTPServer):
        # Browsers open bursts of parallel asset connections. Python 3.12's
        # default backlog of five can reject these on busy Windows CI runners.
        request_queue_size = 128

    server = TestServer(("127.0.0.1", 0), partial(Handler, directory=str(directory)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def watch(page: Page):
    result = {"errors": [], "failed": [], "requests": []}
    page.on("console", lambda msg: result["errors"].append(
        f"{msg.text} ({msg.location.get('url') or page.url})") if msg.type == "error" else None)
    page.on("pageerror", lambda error: result["errors"].append(str(error)))
    page.on("requestfailed", lambda request: result["failed"].append(request.url))
    page.on("request", lambda request: result["requests"].append(request.url))
    return result


def assert_clean(result):
    assert not result["errors"], result["errors"]
    assert not result["failed"], result["failed"]
    assert not [url for url in result["requests"] if url.startswith("https://")], result["requests"]


def finish_render(page):
    page.evaluate("document.fonts.ready")
    # Scroll every section and image into view: sections reveal in order, lazy images load.
    for item in page.locator("[data-section], img").all():
        if item.is_visible():
            item.scroll_into_view_if_needed()
    page.wait_for_function("() => document.querySelectorAll('[data-section]:not(.is-revealed)').length === 0", timeout=60000)
    page.wait_for_function("() => [...document.querySelectorAll('[data-output]')].every(node => getComputedStyle(node).opacity === '1')")
    for image in page.locator("img").all():
        if image.is_visible():
            expect(image).to_have_js_property("complete", True)
            assert image.evaluate("img => img.naturalWidth > 0"), image.get_attribute("src")
    page.evaluate("window.scrollTo(0, 0)")


def assert_document(page: Page, filename: str):
    assert page.locator("html").get_attribute("lang") == "en"
    assert page.title() == "zerviates"
    expect(page.locator("main")).to_be_visible()
    assert page.locator("main").count() == page.locator("h1").count() == 1, f"Expected one main and h1: {filename}"
    assert not page.locator("[aria-labelledby]").evaluate_all("""nodes => nodes.flatMap(node =>
        node.getAttribute('aria-labelledby').split(/\\s+/).filter(id => !document.getElementById(id)))"""), f"Broken accessible label: {filename}"
    if filename != "index.html":
        expect(page.locator("h1")).to_be_visible()
    assert not page.evaluate("""() => {
        const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
        return ids.filter((id, i) => ids.indexOf(id) !== i);
    }"""), f"Duplicate IDs: {filename}"
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"Overflow: {filename}"
    assert page.evaluate("document.fonts.check('400 12px \"0xProto Nerd Font\"')")
    for target in page.locator('a[href]:not([href^="http"]):not([href^="mailto:"]):not([href^="#"])').evaluate_all(
        "links => links.map(link => link.getAttribute('href').split(/[?#]/)[0])"
    ):
        assert target == "/" or (ROOT / target.lstrip("/")).is_file(), target


def accessibility(page: Page):
    # Inject a test-only local dependency through the DevTools evaluation API;
    # a <script> injection would itself violate the production CSP.
    page.evaluate(AXE.read_text(encoding="utf-8"))
    violations = page.evaluate("""async () => (await axe.run(document)).violations
        .filter(item => ['serious', 'critical'].includes(item.impact))
        .map(item => ({id:item.id, impact:item.impact, nodes:item.nodes.map(node => ({target:node.target, html:node.html, summary:node.failureSummary}))}))""")
    assert not violations, violations


def capture_policies(context):
    violations = []
    context.expose_function("record_policy_violation", lambda value: violations.append(value))
    context.add_init_script("""document.addEventListener('securitypolicyviolation', event => {
        window.record_policy_violation({directive:event.effectiveDirective, uri:event.blockedURI});
    });""")
    return violations
