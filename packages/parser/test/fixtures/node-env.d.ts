/**
 * Minimal ambient types for the Node built-ins used by the fixture harness.
 *
 * The parser package ships zero runtime dependencies and `@types/node` is NOT
 * installed (01-01 installed only typescript + vitest; plan 01-03 threat
 * T-03-SC forbids further installs). Without these declarations, `tsc --noEmit`
 * fails on `node:fs` / `node:path` / `node:url` imports and `import.meta.url`.
 *
 * This file declares exactly the surface `loadFixture.ts` / `manifest.ts`
 * consume. Scoped to the fixtures directory; the production `src/` tree
 * remains node-type-free (headless + worker-ready invariant intact).
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
  export function readFileSync(path: string): Buffer;
}
declare module 'node:path' {
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}
interface ImportMeta {
  readonly url: string;
}