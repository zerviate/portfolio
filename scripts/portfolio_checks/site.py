from playwright.sync_api import expect
from .support import PAGES, ROOT, TEMP, assert_clean, assert_document, finish_render, watch, accessibility as scan_accessibility

COMMANDS = {
    "index.html": ["fastfetch", "cat about.md", "ls -la", "tree", "git log --showcase", "cat client-work.md", "contact"],
    "personal.html": ["cat index.md", "ls ~/setup", "ls --favorites", "ls --favorites", "ls --favorites"],
    "links.html": ["cat links.txt"],
    "imprint.html": ["cat imprint.txt", "cat privacy.txt"],
    "copyright.html": ["cat credits.txt", "cat licenses.txt"],
    "404.html": ["cd unknown_path"],
}
FAVORITES = {
    "games": ["SIGNALIS", "Dishonored", "NieR:Automata", "Destiny"],
    "movies": ["Alien", "Ghost in the Shell", "Synecdoche, New York", "Cure"],
    "series": ["Mr. Robot", "Fooly Cooly", "Vinland Saga", "Slam Dunk"],
}


def commands(page):
    # Typed text may still be split into typed/untyped spans; textContent joins them.
    return page.locator("[data-section] .p-cmd[data-type]").evaluate_all("nodes => nodes.map(node => node.textContent)")


def section(page, command):
    return page.locator("[data-section]").filter(has=page.locator(f'.p-cmd[data-type]:text-is("{command}")'))


def check_profile(page, mobile=False):
    assert page.locator(".sh-stats dt").count() == 23
    assert page.locator(".sh-palette span").count() == 16
    expect(page.locator(".sh-portrait img")).to_be_visible()
    assert page.locator(".sh-portrait figcaption").text_content().strip() == "i like slam dunk"
    portrait, stats = (page.locator(selector).bounding_box() for selector in (".sh-portrait", ".sh-stats"))
    if mobile:
        assert portrait["y"] + portrait["height"] <= stats["y"], (portrait, stats)
    else:
        assert portrait["x"] + portrait["width"] <= stats["x"] and abs(portrait["y"] - stats["y"]) < 80, (portrait, stats)

    about = section(page, "cat about.md")
    assert about.locator(".sh-facts dt").all_text_contents() == ["role", "languages", "interests", "principles"]
    workbench = section(page, "ls -la")
    assert workbench.locator("h3.chip").all_text_contents() == ["programming languages", "frameworks", "tools", "systems"]
    assert workbench.locator(".sh-ls li").count() == workbench.locator(".sh-ls img.icon").count() == 14

    for command, names in (
        ("git log --showcase", ["Arbeitszeiterfassung", "Art Trainer", "Pomodoro Timer", "Svelte Mastery Tracker"]),
        ("cat client-work.md", ["LAUSITZ.online", "Digitalwerbung Lausitz", "Kita Freundschaft", "Tierpark Cottbus"]),
    ):
        items = section(page, command).locator(".sh-item")
        assert items.locator("h3 .chip").all_text_contents() == names
        assert items.locator('a[target="_blank"][rel="noreferrer"]').count() == (8 if "git log" in command else 4)
        lefts = items.evaluate_all("nodes => nodes.map(node => Math.round(node.getBoundingClientRect().left))")
        assert len(set(lefts)) == 1, lefts

    contact = section(page, "contact")
    expect(contact.locator("[data-contact-email]")).to_have_text("devzerviate@proton.me")
    expect(contact.locator("[data-copy-email]")).to_be_visible()


def check_personal(page):
    expect(page.locator("h1.chip")).to_have_text("about")
    assert section(page, "ls ~/setup").locator("h3.chip").all_text_contents() == ["workstation", "peripherals", "environment"]
    for shelf, titles in FAVORITES.items():
        grid = page.locator(f'.sh-favorites[data-shelf="{shelf}"]')
        assert grid.locator("li").count() == 4
        assert grid.locator("figcaption strong").evaluate_all("nodes => nodes.map(node => node.textContent.replace(/\\u200b/g, ''))") == titles
        assert all(year.isdigit() for year in grid.locator("figcaption span").all_text_contents())
        metrics = grid.evaluate("""grid => {
            const items = [...grid.children].map(item => item.getBoundingClientRect());
            const image = grid.querySelector('img').getBoundingClientRect();
            return {columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
                    rows: new Set(items.map(item => Math.round(item.top))).size,
                    ratio: image.width / image.height,
                    captionsBelow: [...grid.querySelectorAll('figure')].every(figure =>
                        figure.querySelector('figcaption').getBoundingClientRect().top >= figure.querySelector('img').getBoundingClientRect().bottom - 1)};
        }""")
        assert metrics["columns"] == 4 and metrics["rows"] == 1, metrics
        assert abs(metrics["ratio"] - (3 / 4 if shelf == "games" else 2 / 3)) < .01, metrics
        assert metrics["captionsBelow"], metrics


def check_site(browser, screenshots=True, accessibility=True):
    for width, height in ((1440, 1000), (390, 844), (768, 1024)):
        themes = ("dark", "light") if width != 768 else ("dark",)
        for theme in themes:
            context = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce", has_touch=width == 390)
            context.add_init_script(f"try {{ localStorage.setItem('jr-portfolio:theme', '{theme}'); }} catch {{}}")
            page = context.new_page()
            result = watch(page)
            filenames = PAGES if width != 768 else ("index.html", "personal.html")
            for filename in filenames:
                page.goto((ROOT / filename).as_uri(), wait_until="load")
                finish_render(page)
                assert_document(page, filename)
                expect(page.locator("html")).to_have_attribute("data-theme", theme)
                assert commands(page) == COMMANDS[filename], commands(page)
                current = page.locator('.sh-nav-list a[aria-current="page"]')
                assert current.count() == (1 if filename in ("index.html", "personal.html", "links.html") else 0)
                if filename == "index.html":
                    check_profile(page, mobile=width <= 620)
                if filename == "personal.html":
                    check_personal(page)
                assert_clean(result)
                if accessibility and width != 768:
                    scan_accessibility(page)
                    # axe's stylesheet probes are blocked on opaque file origins.
                    result["errors"].clear()
                    result["failed"].clear()
                if screenshots:
                    page.screenshot(path=TEMP / f"{filename}-{width}-{theme}.png", full_page=True)
            context.close()
    print(f"{browser.browser_type.name}: responsive/theme site checks passed")


def check_intro_layout(browser, url):
    """Sections reveal in document order, and typing, fading and a late portrait never move anything."""
    hosted = url("index.html").startswith("http")
    for width in (320, 390, 768, 1440):
        context = browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="no-preference")
        # Record the reveal order and the largest layout movement seen at any moment.
        context.add_init_script("""document.addEventListener('DOMContentLoaded', () => {
            window.revealOrder = [];
            const sections = [...document.querySelectorAll('[data-section]')];
            new MutationObserver(records => records.forEach(record => {
                const index = sections.indexOf(record.target);
                if (record.target.classList.contains('is-revealed') && !window.revealOrder.includes(index)) window.revealOrder.push(index);
            })).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['class']});
            const tops = () => sections.map(section => section.getBoundingClientRect().top + scrollY);
            window.layoutStart = tops();
            window.maxShift = 0;
            setInterval(() => {
                const now = tops();
                window.maxShift = Math.max(window.maxShift, ...now.map((top, index) => Math.abs(top - window.layoutStart[index])));
            }, 25);
        });""")
        pending_images = []
        if hosted:
            # Hold the real image until after the reveal, exercising its intrinsic dimensions.
            context.route("**/terminal-image.png", lambda route: pending_images.append(route))
        page = context.new_page()
        result = watch(page)
        try:
            page.goto(url("index.html"), wait_until="domcontentloaded")
            expect(page.locator("html")).to_have_class("js")
            page.evaluate("document.fonts.ready.then(() => { window.layoutStart = [...document.querySelectorAll('[data-section]')].map(s => s.getBoundingClientRect().top + scrollY); window.maxShift = 0; })")
            page.wait_for_function("() => window.layoutStart && document.fonts.status === 'loaded'")
            first_output = page.locator("[data-section] [data-output]").first
            assert first_output.bounding_box()["height"] > 0, "Pending output must reserve its full layout space"
            height = page.evaluate("document.documentElement.scrollHeight")
            for y in range(0, height + 900, 300):
                page.evaluate(f"window.scrollTo(0, {y})")
                page.wait_for_timeout(60)
            page.wait_for_function("() => document.querySelectorAll('[data-section]:not(.is-revealed)').length === 0", timeout=60000)
            if hosted:
                assert pending_images, "The delayed-image scenario must intercept the portrait"
                for route in pending_images:
                    route.continue_()
            page.wait_for_load_state("load")
            page.wait_for_timeout(150)
            order = page.evaluate("window.revealOrder")
            assert order == sorted(order) and len(order) == page.locator("[data-section]").count(), order
            shift = page.evaluate("window.maxShift")
            assert shift <= 1, {"width": width, "maxShift": shift}
            assert commands(page) == COMMANDS["index.html"]
            assert_clean(result)
        finally:
            context.close()
    print(f"{browser.browser_type.name}: in-order reveal without layout shift ({'delayed HTTP image' if hosted else 'file'})")


def check_interactions(browser):
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    result = watch(page)
    page.goto((ROOT / "index.html").as_uri(), wait_until="load")
    page.wait_for_function("() => document.querySelector('[data-section]').classList.contains('is-revealed')")
    expect(page.locator(".p-cmd[data-type]").first).to_have_text("fastfetch")
    toggle = page.locator("[data-theme-toggle]")
    expect(toggle).to_have_text("[L]light")
    toggle.click()
    expect(page.locator("html")).to_have_attribute("data-theme", "light")
    expect(toggle).to_have_text("[D]dark")
    expect(toggle).to_have_attribute("aria-label", "[D]dark: switch theme")
    page.reload(wait_until="load")
    expect(page.locator("html")).to_have_attribute("data-theme", "light")
    page.locator("[data-copy-email]").scroll_into_view_if_needed()
    page.wait_for_function("() => document.querySelectorAll('[data-section]:not(.is-revealed)').length === 0", timeout=60000)
    page.evaluate("""() => {
        Object.defineProperty(navigator, 'clipboard', {configurable:true, value:undefined});
        document.execCommand = command => { window.copied = document.querySelector('textarea').value; return command === 'copy'; };
    }""")
    page.locator("[data-copy-email]").click()
    expect(page.locator("[data-copy-status]")).to_have_text("Email copied to clipboard.")
    expect(page.locator("[data-copy-email]")).to_have_text("[copied]")
    assert page.evaluate("window.copied") == "devzerviate@proton.me"
    assert page.locator("textarea").count() == 0
    page.evaluate("() => { document.execCommand = () => false; }")
    page.locator("[data-copy-email]").click()
    expect(page.locator("[data-copy-status]")).to_contain_text("Copy unavailable")
    assert page.locator("textarea").count() == 0
    page.evaluate("() => { document.execCommand = () => { throw new Error('clipboard denied'); }; }")
    page.locator("[data-copy-email]").click()
    expect(page.locator("[data-copy-status]")).to_contain_text("Copy unavailable")
    assert page.locator("textarea").count() == 0
    assert_clean(result)
    context.close()

    context = browser.new_context(reduced_motion="reduce")
    context.add_init_script("Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('storage unavailable'); };")
    page = context.new_page()
    result = watch(page)
    page.goto((ROOT / "index.html").as_uri(), wait_until="load")
    page.locator("[data-theme-toggle]").click()
    expect(page.locator("html")).to_have_attribute("data-theme", "light")
    assert page.locator("[data-section]:not(.is-revealed)").count() == 0
    assert commands(page) == COMMANDS["index.html"]
    assert page.locator(".cursor").evaluate_all("nodes => nodes.every(node => getComputedStyle(node).animationName === 'none')")
    assert_clean(result)
    context.close()
    print(f"{browser.browser_type.name}: theme, storage failure, copy fallbacks and reduced motion passed")


def check_no_js(browser, url):
    context = browser.new_context(viewport={"width": 390, "height": 844}, java_script_enabled=False)
    page = context.new_page()
    result = watch(page)
    for filename in PAGES:
        page.goto(url(filename), wait_until="load")
        expect(page.locator("main")).to_be_visible()
        expect(page.locator(".sh-nav-list")).to_be_visible()
        assert page.locator("html").evaluate("node => !node.classList.contains('js')")
        assert page.locator("[data-output]").evaluate_all("nodes => nodes.every(node => getComputedStyle(node).opacity === '1')")
        assert commands(page) == COMMANDS[filename], commands(page)
    assert_clean(result)
    context.close()
