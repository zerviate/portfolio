import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./site_files.mjs";
import { strip_image_metadata } from "./image_metadata.mjs";

const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
// Include tracked files even when a later .gitignore rule would hide them.
const files = [...new Set(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))];
assert(files.length > 0, "No publishable repository files found");
for (const entry of git(["ls-files", "--stage", "-z"]).split("\0").filter(Boolean)) {
  assert(/^100644 |^100755 /.test(entry), `Unexpected Git entry (symlink/submodule): ${entry.split("\t")[1]}`);
}

const forbidden = /(?:^|\/)(?:node_modules|dist|\.git|\.venv|venv|__pycache__|\.ssh|\.aws|\.azure|\.wrangler|playwright-report|test-results)(?:\/|$)|(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.private-terms|\.npmrc|\.?netrc|_netrc|\.pypirc|credentials\.json|id_rsa.*|id_ed25519.*)$|\.(?:pem|key|p12|pfx|pdf|pyc|log|tmp)$/i;
const secrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,
  /https?:\/\/[^\s/:"<>]+:[^\s/@"<>]+@/,
];
const checked_directories = new Set();
for (const filename of files) {
  assert(!forbidden.test(filename) || filename === ".env.example", `Private/build artifact in repository: ${filename}`);
  const absolute = path.join(root, filename);
  for (let parent = path.dirname(absolute); parent !== path.resolve(root); parent = path.dirname(parent)) {
    if (checked_directories.has(parent)) break;
    assert(!(await lstat(parent)).isSymbolicLink(), `Symlink directory: ${filename}`);
    checked_directories.add(parent);
  }
  assert((await lstat(absolute)).isFile(), `Not a regular repository file: ${filename}`);
  const bytes = await readFile(absolute);
  assert(!secrets.some(pattern => pattern.test(bytes.toString("utf8"))), `Possible credential in ${filename}`);
  const extension = path.extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    assert(bytes.equals(strip_image_metadata(bytes, extension)), `Source image contains metadata: ${filename}`);
  }
  if (extension === ".svg") {
    assert(!/<script|<foreignObject|\son\w+=|javascript:|(?:href|src)=["']https?:/i.test(bytes.toString()), `Active SVG content: ${filename}`);
  }
}
console.log(`Repository checks passed: ${files.length} publishable files, credential patterns, file types and source-image metadata.`);
