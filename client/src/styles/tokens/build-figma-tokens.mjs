/**
 * Splits a Figma CSS export into committed token files:
 * - figma-primitives.css
 * - figma-theme-semantic.css  (Light on :root, Dark on html.dark)
 * - figma-platform-laptop.css (Laptop only; other platform modes dropped)
 * - figma-tokens.css, figma-tailwind-colors.cjs
 *
 * The generated CSS files in this folder are the default source of truth; Figma
 * exports are not kept in the repo. When the design system updates, save the new
 * export (any path) and run:
 *
 *   cd client && node ./src/styles/tokens/build-figma-tokens.mjs <path-to-export.css>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, isAbsolute } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const raw = process.argv[2];
if (!raw) {
  console.log(
    'Figma token rebuild — pass a Figma CSS export (not stored in the repo):\n' +
      '  npm run build:figma-tokens -- <path-to-figma-export.css>\n' +
      '  node ./src/styles/tokens/build-figma-tokens.mjs <path-to-figma-export.css>\n' +
      'Generates figma-*.css and figma-tailwind-colors.cjs in this directory.'
  );
  process.exit(0);
}

const inputPath = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
if (!existsSync(inputPath)) {
  console.error('File not found:', inputPath);
  process.exit(1);
}

const src = readFileSync(inputPath, 'utf8');
const lines = src.split(/\r?\n/);

const slice = (start1, end1) => lines.slice(start1 - 1, end1).join('\n');

const primitives = slice(1, 306);
const lightBody = slice(311, 612);
const darkBody = slice(615, 916);
let platformLaptop = slice(1517, 1681);

// Theme semantic stroke is a colour; platform "Stroke-standard" is thickness—keep theme, drop this line.
platformLaptop = platformLaptop
  .split('\n')
  .filter((line) => !/^\s*--Stroke-standard:\s*var\(--Dimensions-Thickness-xs\);/.test(line))
  .join('\n');

const themeSemantic = `/* Collection: Theme — from Figma; Light = :root, Dark = html.dark / .dark */
:root {
${lightBody}
}

html.dark,
.dark {
${darkBody}
}
`;

const platform = `/* Collection: Platform — Mode: Laptop only (rebuild drops Mobile / Wide / Tablet) */
/* Use var(--Dimensions-Thickness-xs) for 1px stroke width; --Stroke-* here is not set to avoid clashing with Theme colour tokens. */
:root {
${platformLaptop}
}
`;

const header = (title) => `/* ${title} — auto-generated; do not hand-edit. Rebuild: node build-figma-tokens.mjs <figma-export.css> */

`;

writeFileSync(join(__dirname, 'figma-primitives.css'), header('Figma Primitives') + primitives + '\n', 'utf8');
writeFileSync(join(__dirname, 'figma-theme-semantic.css'), header('Figma Theme (light + dark)') + themeSemantic + '\n', 'utf8');
writeFileSync(join(__dirname, 'figma-platform-laptop.css'), header('Figma Platform (laptop)') + platform + '\n', 'utf8');

const index = `/* Figma tokens: import order matters (primitives → theme → platform) */
@import './figma-primitives.css';
@import './figma-theme-semantic.css';
@import './figma-platform-laptop.css';
`;
writeFileSync(join(__dirname, 'figma-tokens.css'), index, 'utf8');

const varNames = [
  ...new Set(
    lightBody
      .split('\n')
      .map((l) => l.match(/^\s*--([^:]+):/))
      .filter(Boolean)
      .map((m) => m[1])
  ),
].sort();
const cjs = `// Auto-generated with build-figma-tokens.mjs (theme semantic var names from Light mode)
module.exports = ${JSON.stringify(
    Object.fromEntries(varNames.map((n) => [n, `var(--${n})`]))
  )};
`;
writeFileSync(join(__dirname, 'figma-tailwind-colors.cjs'), cjs, 'utf8');

console.log('Wrote figma-primitives.css, figma-theme-semantic.css, figma-platform-laptop.css, figma-tokens.css, figma-tailwind-colors.cjs');
