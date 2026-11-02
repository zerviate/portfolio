// Module scope is bundled into a classic IIFE; no application functions are public globals.
export {};

const root = document.documentElement;
const reduce_motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const sections = [...document.querySelectorAll<HTMLElement>("[data-section]")];
const theme_toggles = [...document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")];
const copy_button = document.querySelector<HTMLButtonElement>("[data-copy-email]");
const copy_status = document.querySelector<HTMLElement>("[data-copy-status]");
const contact_email = document.querySelector<HTMLAnchorElement>("[data-contact-email]");
let copy_status_timer: number | undefined;

function set_theme(theme: "dark" | "light", persist = true): void {
  root.dataset.theme = theme;
  // The toggle names the theme it switches to.
  const label = theme === "dark" ? "[L]light" : "[D]dark";
  theme_toggles.forEach((toggle) => {
    toggle.textContent = label;
    toggle.setAttribute("aria-label", `${label}: switch theme`);
  });
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0d0e0f" : "#e9e7df");

  if (persist) {
    try {
      localStorage.setItem("jr-portfolio:theme", theme);
    } catch {
      // Theme switching remains functional when file-origin storage is unavailable.
    }
  }
}

// Sections reveal in document order as they scroll in: the command types itself,
// then the output fades in, then the next due section starts. The untyped rest of
// a command stays in the DOM (visibility: hidden) so typing never shifts layout.
const commands = sections.flatMap((section) => [...section.querySelectorAll<HTMLElement>("[data-type]")]);
const due = new Set<HTMLElement>();
let revealing = false;

function reveal_all(): void {
  commands.forEach((command) => { command.textContent = command.dataset.command ?? command.textContent; });
  sections.forEach((section) => section.classList.add("is-revealed"));
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function type_command(command: HTMLElement): Promise<void> {
  const text = command.dataset.command ?? "";
  const typed = document.createElement("span");
  const untyped = document.createElement("span");
  untyped.className = "untyped";
  untyped.textContent = text;
  command.replaceChildren(typed, untyped);
  await wait(120);
  for (let index = 1; index <= text.length; index++) {
    if (reduce_motion.matches) break;
    typed.textContent = text.slice(0, index);
    untyped.textContent = text.slice(index);
    await wait(38 + Math.random() * 40);
  }
  command.textContent = text;
  await wait(160);
}

async function run_reveals(): Promise<void> {
  if (revealing) return;
  revealing = true;
  for (let next; (next = sections.find((section) => due.has(section)));) {
    due.delete(next);
    for (const command of next.querySelectorAll<HTMLElement>("[data-type]")) await type_command(command);
    next.classList.add("is-revealed");
    await wait(260);
  }
  revealing = false;
}

function setup_reveals(): void {
  commands.forEach((command) => { command.dataset.command = command.textContent ?? ""; });
  if (reduce_motion.matches || !("IntersectionObserver" in window)) {
    reveal_all();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      // Also queue anything above that fast scrolling or an anchor jump skipped.
      sections.slice(0, sections.indexOf(entry.target as HTMLElement) + 1).forEach((section) => {
        if (!section.classList.contains("is-revealed")) due.add(section);
        observer.unobserve(section);
      });
    }
    void run_reveals();
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });
  sections.forEach((section) => observer.observe(section));
}

async function copy_text(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const previous_focus = document.activeElement;
  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.className = "clipboard-fallback";
  document.body.appendChild(fallback);
  try {
    fallback.select();
    if (!document.execCommand("copy")) throw new Error("Copy failed");
  } finally {
    fallback.remove();
    if (previous_focus instanceof HTMLElement) previous_focus.focus({ preventScroll: true });
  }
}

theme_toggles.forEach((toggle) => toggle.addEventListener("click", () => set_theme(root.dataset.theme === "light" ? "dark" : "light")));

copy_button?.addEventListener("click", async () => {
  const email = contact_email?.textContent?.trim();
  if (!email || copy_button.disabled) return;
  window.clearTimeout(copy_status_timer);
  copy_button.disabled = true;
  try {
    await copy_text(email);
    copy_button.textContent = "[copied]";
    if (copy_status) copy_status.textContent = "Email copied to clipboard.";
  } catch {
    if (copy_status) copy_status.textContent = "Copy unavailable. Select the email address manually.";
  } finally {
    copy_button.disabled = false;
  }

  copy_status_timer = window.setTimeout(() => {
    copy_button.textContent = "[copy email]";
    if (copy_status) copy_status.textContent = "";
  }, 2_400);
});

reduce_motion.addEventListener("change", () => {
  if (reduce_motion.matches) reveal_all();
});

set_theme(root.dataset.theme === "light" ? "light" : "dark", false);
setup_reveals();
root.dataset.appReady = "true";

/* ===== LEGACY DESIGN v2 behaviour (commented out on purpose) =====
   The previous src/app.ts (hamburger menu, typed fastfetch intro, card reveals),
   verbatim. It pairs with the legacy markup comment at the end of each page and
   the legacy block at the end of src/styles.css; git tag design-v2 holds the
   complete previous version. To restore: replace the code above with everything
   between the BEGIN/END markers. esbuild drops comments, so none of this ships.
----- BEGIN LEGACY v2 -----
// Module scope is bundled into a classic IIFE; no application functions are public globals.
export {};

const root = document.documentElement;
const reduce_motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const theme_toggle = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
const theme_label = document.querySelector<HTMLElement>("[data-theme-label]");
const theme_glyph = document.querySelector<HTMLElement>("[data-theme-glyph]");
const menu_toggle = document.querySelector<HTMLButtonElement>(".menu-toggle");
const navigation = document.querySelector<HTMLElement>(".site-nav");
const typed_command = document.querySelector<HTMLElement>("[data-typed-command]");
const command_cursor = document.querySelector<HTMLElement>(".command-cursor");
const terminal_output = document.querySelectorAll<HTMLElement>("[data-terminal-output]");
const copy_button = document.querySelector<HTMLButtonElement>("[data-copy-email]");
const copy_status = document.querySelector<HTMLElement>("[data-copy-status]");
const contact_email = document.querySelector<HTMLAnchorElement>("[data-contact-email]");
const command_text = typed_command?.textContent?.trim() || "fastfetch";
let intro_timers: number[] = [];
let copy_status_timer: number | undefined;

function set_theme(theme: "dark" | "light", persist = true): void {
  root.dataset.theme = theme;
  const is_dark = theme === "dark";

  if (theme_toggle && theme_label && theme_glyph) {
    theme_toggle.setAttribute("aria-label", `${is_dark ? "[L]light" : "[D]dark"}: switch theme`);
    theme_label.textContent = is_dark ? "light" : "dark";
    theme_glyph.textContent = is_dark ? "[L]" : "[D]";
  }

  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", is_dark ? "#0d0e0f" : "#e9e7df");

  if (persist) {
    try {
      localStorage.setItem("jr-portfolio:theme", theme);
    } catch {
      // Theme switching remains functional when file-origin storage is unavailable.
    }
  }
}

function close_navigation(return_focus = false): void {
  if (!menu_toggle || !navigation) return;
  menu_toggle.setAttribute("aria-expanded", "false");
  navigation.classList.remove("is-open");
  const symbol = menu_toggle.lastElementChild;
  if (symbol) symbol.textContent = "[+]";
  if (return_focus) menu_toggle.focus();
}

function clear_intro_timers(): void {
  intro_timers.forEach((timer) => window.clearTimeout(timer));
  intro_timers = [];
}

function reveal_intro(): void {
  command_cursor?.classList.remove("is-typing");
  terminal_output.forEach((item) => {
    item.classList.remove("is-pending");
    item.classList.remove("is-printing");
    item.querySelectorAll<HTMLElement>("[data-terminal-line]").forEach((line, index) => {
      line.style.setProperty("--line-delay", `${180 + index * 34}ms`);
    });
    if (reduce_motion.matches) return;
    void item.offsetWidth;
    item.classList.add("is-printing");
  });
}

function play_intro(): void {
  if (!typed_command || terminal_output.length === 0) return;

  clear_intro_timers();
  typed_command.textContent = "";
  command_cursor?.classList.add("is-typing");
  terminal_output.forEach((item) => {
    item.classList.add("is-pending");
    item.classList.remove("is-printing");
  });

  if (reduce_motion.matches) {
    typed_command.textContent = command_text;
    reveal_intro();
    return;
  }

  Array.from(command_text).forEach((character, index) => {
    intro_timers.push(window.setTimeout(() => {
      typed_command.textContent += character;
    }, 160 + index * 55));
  });

  intro_timers.push(window.setTimeout(reveal_intro, 160 + command_text.length * 55 + 220));
}

async function copy_text(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const previous_focus = document.activeElement;
  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "");
  fallback.className = "clipboard-fallback";
  document.body.appendChild(fallback);
  try {
    fallback.select();
    if (!document.execCommand("copy")) throw new Error("Copy failed");
  } finally {
    fallback.remove();
    if (previous_focus instanceof HTMLElement) previous_focus.focus({ preventScroll: true });
  }
}

function setup_reveals(): void {
  const observed_items = document.querySelectorAll<HTMLElement>("[data-observe]");
  if (!("IntersectionObserver" in window) || reduce_motion.matches) {
    observed_items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries, active_observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      active_observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

  observed_items.forEach((item) => observer.observe(item));
}

theme_toggle?.addEventListener("click", () => set_theme(root.dataset.theme === "light" ? "dark" : "light"));

menu_toggle?.addEventListener("click", () => {
  const open = menu_toggle.getAttribute("aria-expanded") !== "true";
  menu_toggle.setAttribute("aria-expanded", String(open));
  navigation?.classList.toggle("is-open", open);
  const symbol = menu_toggle.lastElementChild;
  if (symbol) symbol.textContent = open ? "[-]" : "[+]";
});

document.querySelectorAll<HTMLAnchorElement>("[data-nav-link]").forEach((link) => link.addEventListener("click", () => close_navigation()));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigation?.classList.contains("is-open")) close_navigation(true);
});

copy_button?.addEventListener("click", async () => {
  const email = contact_email?.textContent?.trim();
  if (!email || copy_button.disabled) return;
  window.clearTimeout(copy_status_timer);
  copy_button.disabled = true;
  try {
    await copy_text(email);
    copy_button.textContent = "[ copied ]";
    if (copy_status) copy_status.textContent = "Email copied to clipboard.";
  } catch {
    if (copy_status) copy_status.textContent = "Copy unavailable. Select the email address manually.";
  } finally {
    copy_button.disabled = false;
  }

  copy_status_timer = window.setTimeout(() => {
    copy_button.textContent = "[ copy email ]";
    if (copy_status) copy_status.textContent = "";
  }, 2_400);
});

reduce_motion.addEventListener("change", () => {
  if (reduce_motion.matches) {
    clear_intro_timers();
    if (typed_command) typed_command.textContent = command_text;
    reveal_intro();
    document.querySelectorAll<HTMLElement>("[data-observe]").forEach((item) => item.classList.add("is-visible"));
  }
});

set_theme(root.dataset.theme === "light" ? "light" : "dark", false);
setup_reveals();
root.dataset.appReady = "true";
play_intro();
----- END LEGACY v2 ----- */
