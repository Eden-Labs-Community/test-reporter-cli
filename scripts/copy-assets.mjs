// tsc only emits .ts → .js. The Jest stream reporter is shipped as a hand-
// written .cjs (Jest `require()`s reporters by path; .cjs stays require-able
// from our ESM package). Copy it next to its compiled adapter so both `tsx`
// dev (resolves in src/) and the published package (resolves in dist/) work.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// import.meta.url = <root>/scripts/copy-assets.mjs → "../" is the package root.
const root = fileURLToPath(new URL("..", import.meta.url));
const rel = join("core", "runner", "jest-stream-reporter.cjs");
const dest = join(root, "dist", rel);

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(join(root, "src", rel), dest);
console.error(`copied ${rel} → dist/`);
