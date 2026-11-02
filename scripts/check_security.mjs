import assert from "node:assert/strict";
import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { root, pages, site_files, hosted_404 } from "./site_files.mjs";
import { strip_image_metadata } from "./image_metadata.mjs";

const read = filename => readFile(path.join(root, filename), "utf8");
async function walk(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `Unexpected symlink: ${entry.name}`);
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), `${relative}/`));
    else files.push(relative);
  }
  return files.sort();
}

// Identifying terms (legal name, phone, private email) live in a gitignored local
// file, so the guard never publishes what it protects. Whitespace is ignored on
// both sides so "0123 456" also matches "0123456".
const compact = text => text.replace(/\s+/g, "").toLowerCase();
const private_terms = await read(".private-terms")
  .then(text => text.split(/\r?\n/).map(line => compact(line)).filter(term => term && !term.startsWith("#")))
  .catch(error => { if (error.code === "ENOENT") return null; throw error; });

for (const filename of pages) {
  const html = await read(filename);
  assert(html.includes("<title>zerviates</title>"), `Inconsistent title: ${filename}`);
  for (const contact of html.matchAll(/href=["']mailto:([^"']+)["']/gi)) {
    assert.equal(contact[1], "devzerviate@proton.me", `Unexpected contact address: ${filename}`);
  }
  assert(!/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html), `Inline script in ${filename}`);
  assert(!/<style\b|\sstyle=|\son\w+=|javascript:/i.test(html), `Inline executable/style attribute in ${filename}`);
  assert(html.includes('name="referrer" content="no-referrer"'), `Missing referrer policy: ${filename}`);
  for (const tag of html.matchAll(/<a\b[^>]*>/g)) {
    if (tag[0].includes('target="_blank"')) assert(/rel="[^"]*(?:noopener|noreferrer)/.test(tag[0]), `Unprotected popup: ${tag[0]}`);
  }
  assert(!/href="http:\/\//.test(html), `Insecure link in ${filename}`);
}
const app = await read("src/app.ts");
assert(!/fetch\(|innerHTML|CELEBI|data-ascii-rotator|enhance_github_count/.test(app));
for (const filename of ["src/styles.css", "assets/css/styles.css", "assets/js/app.js", "index.html", "package-lock.json"]) {
  assert(!/celebi|glyphcss|api\.github\.com|ascii-rotator/i.test(await read(filename)), `Obsolete runtime in ${filename}`);
}
for (const filename of ["scripts/generate_celebi_frames.mjs", "scripts/capture_assets.py", "assets/images/work"]) {
  assert(!(await lstat(path.join(root, filename)).catch(() => null)), `Obsolete file: ${filename}`);
}

const expected = await site_files();
const actual = await walk(path.join(root, "dist"));
assert.deepEqual(actual, expected, "Deployment output does not match the allowlist");
const secret = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9_]{30,}\b|\bsk-[A-Za-z0-9]{32,}\b/;
for (const filename of actual) {
  assert(!/(?:^|\/)(?:node_modules|src|scripts|docs|\.env|\.git)(?:\/|$)|\.(?:map|pdf)$/.test(filename), `Private artifact in dist: ${filename}`);
  const bytes = await readFile(path.join(root, "dist", filename));
  const source = await readFile(path.join(root, filename));
  const expected_bytes = filename === "404.html" ? Buffer.from(hosted_404(source.toString()))
    : /\.(png|jpe?g|webp)$/.test(filename) ? strip_image_metadata(source, path.extname(filename)) : source;
  assert(bytes.equals(expected_bytes), `Stale deployment file: ${filename}; run npm run build:site`);
  if (private_terms) {
    const published = compact(bytes.toString("latin1"));
    assert(!private_terms.some(term => published.includes(term)), `Private term (see .private-terms) in ${filename}`);
  }
  if (/\.(html|css|js|txt)$/.test(filename)) {
    assert(!secret.test(bytes.toString()), `Possible secret in ${filename}`);
    if (filename.endsWith(".html")) {
      assert(!/(?:href="tel:|\b0(?:15|16|17)\d[\s-]+\d{5,})/.test(bytes.toString()), `Private phone number in ${filename}`);
    }
  }
  if (/\.(?:png|jpe?g|webp)$/.test(filename)) {
    // Reject embedded EXIF/XMP rather than accidentally shipping location metadata.
    assert(!bytes.includes(Buffer.from("Exif\0\0")) && !bytes.includes(Buffer.from("eXIf")) && !bytes.includes(Buffer.from("http://ns.adobe.com/xap/1.0/")), `Image metadata needs review: ${filename}`);
  }
  if (filename.endsWith(".svg")) {
    assert(!/<script|<foreignObject|\son\w+=|javascript:|(?:href|src)=["']https?:/i.test(bytes.toString()), `Active SVG content in ${filename}`);
  }
}
// Strict by default: Cloudflare merges every matching rule, so a second CSP rule or
// a detached ("! Header") one could loosen or silently stack policies per route.
const headers = await read("_headers");
const rules = [];
for (const line of headers.split(/\r?\n/)) {
  if (!line.trim() || line.trimStart().startsWith("#")) continue;
  if (!/^\s/.test(line)) rules.push({ path: line.trim(), headers: [] });
  else rules.at(-1).headers.push(line.trim());
}
assert(!rules.some(rule => rule.headers.some(header => header.startsWith("!"))), "_headers must not detach headers");
const policies = rules.flatMap(rule => rule.headers.filter(header => /^Content-Security-Policy:/i.test(header)).map(header => ({ path: rule.path, header })));
assert.equal(policies.length, 1, "_headers must define exactly one Content-Security-Policy");
assert.equal(policies[0].path, "/*", "The Content-Security-Policy must apply to every route (/*)");
const csp = policies[0].header;
assert(!/unsafe-|\*(?:[;\s]|$)|blob:/.test(csp), `Permissive CSP source: ${csp}`);
for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "frame-ancestors 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'"]) {
  assert(csp.includes(directive), `CSP missing ${directive}`);
}
assert(headers.includes("Referrer-Policy: no-referrer") && headers.includes("X-Content-Type-Options: nosniff"));
console.log(`Security checks passed: source hygiene, SVG/image metadata, ${actual.length}-file allowlist, source/output freshness, `
  + `single strict CSP${private_terms ? `, ${private_terms.length} private terms` : "; private-term check skipped (no .private-terms)"}.`);
