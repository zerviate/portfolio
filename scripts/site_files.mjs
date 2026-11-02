import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const pages = ["index.html", "personal.html", "links.html", "imprint.html", "copyright.html", "404.html"];
const required = [
  "_headers",
  "assets/css/LICENSE-reset.txt",
  "assets/fonts/LICENSE-0xProto-Nerd-Font.txt",
  "assets/fonts/LICENSE-DepartureMono.txt",
  "assets/icons/devicon/LICENSE",
];

function local_asset(reference, parent) {
  if (/^(?:https?:|mailto:|data:|blob:|#)/i.test(reference)) return null;
  const pathname = reference.split(/[?#]/)[0];
  const relative = pathname.startsWith("/") ? pathname.slice(1) : path.posix.join(path.posix.dirname(parent), pathname);
  if (!relative.startsWith("assets/") || relative.includes("..") || !/\.(?:css|js|woff2|ico|svg|png|jpe?g|webp)$/.test(relative)) {
    return null;
  }
  return relative;
}

export function hosted_404(html) {
  // Every internal link must work when this document is served at a nested missing URL.
  return html.replace(/\b(href|src)="(?![a-z]+:|#|\/)([^"]+)"/gi,
    (_, attribute, target) => `${attribute}="${target === "index.html" ? "/" : `/${target}`}"`);
}

// An allowlist derived only from authored HTML/CSS references plus the required
// legal notices. Never copy assets/ wholesale.
export async function site_files() {
  const files = new Set([...pages, ...required]);
  const queue = [...pages];
  for (let index = 0; index < queue.length; index++) {
    const filename = queue[index];
    const source = (await readFile(path.join(root, filename), "utf8")).replace(/<!--[\s\S]*?-->/g, "");
    const references = filename.endsWith(".html")
      ? [...source.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1])
      : [...source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(match => match[1]);
    for (const reference of references) {
      const asset = local_asset(reference, filename);
      if (!asset || files.has(asset)) continue;
      files.add(asset);
      if (asset.endsWith(".css")) queue.push(asset);
    }
  }
  return [...files].sort();
}
