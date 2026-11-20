import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// apps/web holds no secrets: everything it reads can end up in the browser bundle.
// The secret names come from .env.example, so a variable added there is covered here too.
const repoRoot = resolve(__dirname, '../../..');
const srcDir = resolve(__dirname, '../src');

const serverOnlyNames = readFileSync(join(repoRoot, '.env.example'), 'utf8')
  .split('\n')
  .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
  .filter((name): name is string => name !== undefined && !name.startsWith('NEXT_PUBLIC_'));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) ? [path] : [];
  });
}

describe('apps/web source', () => {
  it('finds the server-only variable names to guard', () => {
    expect(serverOnlyNames).toContain('FIREWORKS_API_KEY');
  });

  it.each(sourceFiles(srcDir))('%s names no server-only variable', (file) => {
    const text = readFileSync(file, 'utf8');
    // Whole names only: SUPABASE_URL is server-only, NEXT_PUBLIC_SUPABASE_URL is not.
    const named = serverOnlyNames.filter((name) =>
      new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(text),
    );
    expect(named).toEqual([]);
  });

  it.each(sourceFiles(srcDir))('%s reads only NEXT_PUBLIC_ variables', (file) => {
    const text = readFileSync(file, 'utf8');
    const read = [...text.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(read.filter((name) => !name?.startsWith('NEXT_PUBLIC_'))).toEqual([]);
  });
});
