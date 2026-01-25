import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import ts from 'typescript';
import { describe, it } from 'vitest';

const CONTRACT_ENTRYPOINTS = [
  path.resolve('src/pm/contracts/http.ts'),
  path.resolve('src/pm/contracts/ws.ts'),
];

const BUILTIN_SET = new Set(
  builtinModules.map((name) => name.replace(/^node:/, ''))
);

function isBuiltinImport(specifier: string): boolean {
  const normalized = specifier.replace(/^node:/, '');
  return BUILTIN_SET.has(normalized);
}

function getModuleSpecifiers(filePath: string): string[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const specifiers: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        specifiers.push(moduleSpecifier.text);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

function resolveLocalImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return null;
  }

  const base = specifier.startsWith('/')
    ? path.resolve(specifier)
    : path.resolve(path.dirname(fromFile), specifier);
  const ext = path.extname(base);
  const candidates: string[] = [];

  if (ext) {
    candidates.push(base);
    if (ext === '.js') {
      candidates.push(base.slice(0, -3) + '.ts');
      candidates.push(base.slice(0, -3) + '.tsx');
    }
  } else {
    candidates.push(
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.mjs`,
      path.join(base, 'index.ts'),
      path.join(base, 'index.js')
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

describe('pm contracts', () => {
  it('load without node-only side effects', () => {
    const queue = [...CONTRACT_ENTRYPOINTS];
    const visited = new Set<string>();
    const violations: Array<{ from: string; specifier: string }> = [];

    while (queue.length > 0) {
      const filePath = queue.pop();
      if (!filePath || visited.has(filePath)) {
        continue;
      }
      visited.add(filePath);

      const specifiers = getModuleSpecifiers(filePath);
      for (const specifier of specifiers) {
        if (isBuiltinImport(specifier)) {
          violations.push({ from: filePath, specifier });
          continue;
        }

        const resolved = resolveLocalImport(filePath, specifier);
        if (resolved) {
          queue.push(resolved);
        }
      }
    }

    if (violations.length > 0) {
      const details = violations
        .map(({ from, specifier }) => `${from} -> ${specifier}`)
        .join('\n');
      throw new Error(
        `Contracts must be browser-safe. Node builtin imports found:\n${details}`
      );
    }
  });
});
