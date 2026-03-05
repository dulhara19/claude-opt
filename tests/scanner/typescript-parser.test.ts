import { describe, it, expect } from 'vitest';
import { TypeScriptParser } from '../../src/scanner/parsers/typescript.js';
import path from 'node:path';

const parser = new TypeScriptParser();
const fixtureRoot = path.resolve('tests/fixtures/sample-project');

describe('TypeScriptParser', () => {
  describe('extensions', () => {
    it('should handle TS/JS extensions', () => {
      expect(parser.extensions).toContain('.ts');
      expect(parser.extensions).toContain('.tsx');
      expect(parser.extensions).toContain('.js');
      expect(parser.extensions).toContain('.jsx');
      expect(parser.extensions).toContain('.mjs');
      expect(parser.extensions).toContain('.cjs');
    });
  });

  describe('parseImports', () => {
    it('should parse named imports', () => {
      const content = `import { foo } from './utils';`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('./utils');
      expect(imports[0].isExternal).toBe(false);
    });

    it('should parse default imports', () => {
      const content = `import path from 'node:path';`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('node:path');
      expect(imports[0].isExternal).toBe(true);
    });

    it('should parse namespace imports', () => {
      const content = `import * as utils from './utils';`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('./utils');
    });

    it('should parse side-effect imports', () => {
      const content = `import './styles.css';`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('./styles.css');
    });

    it('should parse dynamic imports', () => {
      const content = `const mod = import('./lazy');`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('./lazy');
      expect(imports[0].type).toBe('import');
    });

    it('should parse CommonJS require', () => {
      const content = `const fs = require('fs');`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('fs');
      expect(imports[0].isExternal).toBe(true);
      expect(imports[0].type).toBe('require');
    });

    it('should parse re-exports', () => {
      const content = `export { foo } from './utils';`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('./utils');
    });

    it('should parse export * from', () => {
      const content = `export * from './utils';`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('./utils');
    });

    it('should resolve relative imports to existing files', () => {
      const content = `import { add } from './utils';`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports[0].resolved).toBe('src/utils.ts');
    });

    it('should identify external package imports', () => {
      const content = `import express from 'express';\nimport path from 'node:path';`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(2);
      expect(imports.every((i) => i.isExternal)).toBe(true);
      expect(imports.every((i) => i.resolved === null)).toBe(true);
    });

    it('should deduplicate imports', () => {
      const content = `import { a } from './utils';\nimport { b } from './utils';`;
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(1);
    });

    it('should handle mixed import styles', () => {
      const content = [
        `import { add } from './utils';`,
        `import path from 'node:path';`,
        `const lodash = require('lodash');`,
      ].join('\n');
      const imports = parser.parseImports('src/index.ts', content, fixtureRoot);
      expect(imports).toHaveLength(3);
    });
  });

  describe('extractKeywords', () => {
    it('should extract exported function names', () => {
      const content = `export function handleAuth() {}`;
      const keywords = parser.extractKeywords('src/auth.ts', content);
      expect(keywords).toContain('handleauth');
    });

    it('should extract exported class names', () => {
      const content = `export class UserService {}`;
      const keywords = parser.extractKeywords('src/user.ts', content);
      expect(keywords).toContain('userservice');
    });

    it('should extract exported interface names', () => {
      const content = `export interface Config {}`;
      const keywords = parser.extractKeywords('src/types.ts', content);
      expect(keywords).toContain('config');
    });

    it('should extract default exports', () => {
      const content = `export default function main() {}`;
      const keywords = parser.extractKeywords('src/index.ts', content);
      expect(keywords).toContain('main');
    });

    it('should extract exported const/let/var/enum', () => {
      const content = [
        `export const VERSION = '1.0';`,
        `export let counter = 0;`,
        `export var legacy = true;`,
        `export enum Status { Active, Inactive }`,
      ].join('\n');
      const keywords = parser.extractKeywords('src/constants.ts', content);
      expect(keywords).toContain('version');
      expect(keywords).toContain('counter');
      expect(keywords).toContain('legacy');
      expect(keywords).toContain('status');
    });
  });
});
