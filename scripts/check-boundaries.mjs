import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/domain/", import.meta.url));
const forbidden = [
  { label: "React", pattern: /(?:from\s+["']react(?:\/[^"']*)?["']|import\s*\(["']react(?:\/[^"']*)?["']\))/ },
  { label: "Firebase", pattern: /(?:from\s+["']firebase(?:\/[^"']*)?["']|import\s*\(["']firebase(?:\/[^"']*)?["']\))/ },
  { label: "IndexedDB", pattern: /\bindexedDB\b/ },
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

const violations = [];
for (const file of await walk(root)) {
  const source = await readFile(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) violations.push(`${file}: forbidden ${rule.label} dependency in domain layer`);
  }
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Domain boundary check passed.");
