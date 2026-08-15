/**
 * Deterministic, hermetic fixture loader (D-09 / plan 01-03).
 *
 * Fixture paths always resolve relative to THIS module's location via
 * `import.meta.url` — never `process.cwd()`. Tests therefore pass no matter
 * which directory the runner is invoked from, and never reach the repo-root
 * `staadSample/` path (hermetic corpus directive).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directory containing this module — resolves to packages/parser/test/fixtures. */
export const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

/** All corpus fixtures, real first, then hand-written. */
export const FIXTURE_NAMES: readonly string[] = [
  'real/HPP_Main_Building_2.std',
  'handwritten/plane-2d.std',
  'handwritten/feet-imperial.std',
  'handwritten/legacy-table.std',
  'handwritten/continuations.std',
  'handwritten/unknown-commands.std',
];

/** Load a fixture's UTF-8 text; throws on unknown names. */
export function loadFixture(name: string): string {
  if (!FIXTURE_NAMES.includes(name)) {
    throw new Error(`Unknown fixture: "${name}" (known: ${FIXTURE_NAMES.join(', ')})`);
  }
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}