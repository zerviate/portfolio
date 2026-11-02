import { copyFile, mkdir, rm, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root, site_files, hosted_404 } from "./site_files.mjs";
import { strip_image_metadata } from "./image_metadata.mjs";

const files = await site_files();
const output = path.join(root, "dist");
// Refuse an unexpected symlink rather than deleting or following its target.
const existing = await lstat(output).catch(error => { if (error.code !== "ENOENT") throw error; });
if (existing?.isSymbolicLink()) throw new Error("dist must not be a symlink");
// Validate the complete input list before replacing a previously usable build.
for (const filename of files) {
  if (!(await lstat(path.join(root, filename))).isFile()) throw new Error(`Not a regular source file: ${filename}`);
}
await rm(output, { recursive: true, force: true });
for (const filename of files) {
  const source = path.join(root, filename);
  const target = path.join(output, filename);
  await mkdir(path.dirname(target), { recursive: true });
  if (filename === "404.html") {
    // A hosted 404 can appear at any nested path; source HTML remains file:// friendly.
    const html = await readFile(source, "utf8");
    await writeFile(target, hosted_404(html));
  } else if (/\.(png|jpe?g|webp)$/.test(filename)) {
    await writeFile(target, strip_image_metadata(await readFile(source), path.extname(filename)));
  } else {
    await copyFile(source, target);
  }
}
console.log(`Built ${files.length} allowlisted files in dist/. No deployment performed.`);
