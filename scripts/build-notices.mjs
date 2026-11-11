// `npm run notices` (SPEC-app-shell.md I2; dev-time only, no network): writes
// build/THIRD-PARTY-NOTICES.txt from the licence files of the packages bundled into the app.
// Bundled set: the runtime `dependencies` (immer, openchemlib, zod: the renderer bundle includes
// all three, the main process requires zod from node_modules) plus react, react-dom and
// scheduler (react-dom's only dependency). No other package is imported by src/. The output is
// deterministic (fixed order, LF, no dates), so a second run leaves the file byte-identical.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGES = ['immer', 'openchemlib', 'react', 'react-dom', 'scheduler', 'zod'];

const RULE = '='.repeat(72);

/** Text of build/THIRD-PARTY-NOTICES.txt for the packages installed under `root`. */
export function buildNotices(root) {
  const parts = [
    'Chalkbond: third-party notices',
    '',
    'Chalkbond includes the software below. Each entry gives the package, its version, its',
    'licence identifier and the full licence text shipped with the package.',
    '',
  ];
  for (const name of PACKAGES) {
    const dir = join(root, 'node_modules', name);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const licence = readFileSync(join(dir, 'LICENSE'), 'utf8').replace(/\r\n?/g, '\n').trim();
    parts.push(RULE, `${name} ${pkg.version}`, `Licence: ${pkg.license}`, RULE, '', licence, '');
  }
  parts.push(
    RULE,
    'Data sources',
    RULE,
    '',
    'The built-in compound dictionary (names, SMILES, molecular formulas, molecular weights and',
    'PubChem CIDs) was compiled at development time from PubChem (https://pubchem.ncbi.nlm.nih.gov),',
    'National Center for Biotechnology Information, using the PUG-REST service, with names curated',
    'by the Chalkbond author. Chalkbond makes no network request at run time. This notice makes no',
    "claim about the licence of PubChem's data; see PubChem's own policies for its terms.",
    '',
    RULE,
    'Electron and Chromium',
    RULE,
    '',
    "Electron's own licence and the licences of Chromium's components are in LICENSE.electron.txt and",
    'LICENSES.chromium.html, installed with Chalkbond.',
    '',
  );
  return parts.join('\n');
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  writeFileSync(join(root, 'build', 'THIRD-PARTY-NOTICES.txt'), buildNotices(root));
  console.log('wrote build/THIRD-PARTY-NOTICES.txt');
}
