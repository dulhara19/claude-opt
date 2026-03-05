import { describe, it, expect } from 'vitest';
import { PythonParser } from '../../src/scanner/parsers/python.js';

const parser = new PythonParser();

describe('PythonParser', () => {
  describe('extensions', () => {
    it('should handle .py extension', () => {
      expect(parser.extensions).toContain('.py');
    });
  });

  describe('parseImports', () => {
    it('should parse simple import statements', () => {
      const content = `import os`;
      const imports = parser.parseImports('main.py', content, '/project');
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('os');
      expect(imports[0].isExternal).toBe(true);
    });

    it('should parse from...import statements', () => {
      const content = `from pathlib import Path`;
      const imports = parser.parseImports('main.py', content, '/project');
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('pathlib');
      expect(imports[0].isExternal).toBe(true);
    });

    it('should parse relative imports', () => {
      const content = `from .utils import helper`;
      const imports = parser.parseImports('src/main.py', content, '/project');
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('.utils');
      expect(imports[0].isExternal).toBe(false);
    });

    it('should parse parent-relative imports', () => {
      const content = `from ..config import settings`;
      const imports = parser.parseImports('src/sub/main.py', content, '/project');
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('..config');
      expect(imports[0].isExternal).toBe(false);
    });

    it('should identify external package imports', () => {
      const content = `import numpy\nfrom flask import Flask`;
      const imports = parser.parseImports('main.py', content, '/project');
      expect(imports).toHaveLength(2);
      expect(imports.every((i) => i.isExternal)).toBe(true);
    });

    it('should deduplicate imports', () => {
      const content = `import os\nimport os`;
      const imports = parser.parseImports('main.py', content, '/project');
      expect(imports).toHaveLength(1);
    });
  });

  describe('extractKeywords', () => {
    it('should extract function definitions', () => {
      const content = `def calculate_total():\n    pass`;
      const keywords = parser.extractKeywords('utils.py', content);
      expect(keywords).toContain('calculate_total');
    });

    it('should extract class definitions', () => {
      const content = `class UserManager:\n    pass`;
      const keywords = parser.extractKeywords('models.py', content);
      expect(keywords).toContain('usermanager');
    });

    it('should extract both functions and classes', () => {
      const content = [
        `class DataProcessor:`,
        `    def process(self):`,
        `        pass`,
        `def run_pipeline():`,
        `    pass`,
      ].join('\n');
      const keywords = parser.extractKeywords('pipeline.py', content);
      expect(keywords).toContain('dataprocessor');
      expect(keywords).toContain('process');
      expect(keywords).toContain('run_pipeline');
    });
  });
});
