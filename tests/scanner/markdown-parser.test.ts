import { describe, it, expect } from 'vitest';
import { MarkdownParser } from '../../src/scanner/parsers/markdown.js';
import path from 'node:path';

const parser = new MarkdownParser();
const fixtureRoot = path.resolve('tests/fixtures/research-project');

describe('MarkdownParser', () => {
  describe('extensions', () => {
    it('should handle markdown extensions', () => {
      expect(parser.extensions).toContain('.md');
      expect(parser.extensions).toContain('.mdx');
    });
  });

  describe('parseImports', () => {
    it('should parse inline internal links', () => {
      const content = `See [Chapter 2](chapter-2.md) for details.`;
      const imports = parser.parseImports('chapter-1.md', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('chapter-2.md');
      expect(imports[0].type).toBe('link');
      expect(imports[0].isExternal).toBe(false);
    });

    it('should resolve internal links to existing files', () => {
      const content = `See [Chapter 2](chapter-2.md) for details.`;
      const imports = parser.parseImports('chapter-1.md', content, fixtureRoot);
      expect(imports[0].resolved).toBe('chapter-2.md');
    });

    it('should skip external URLs', () => {
      const content = `Visit [Google](https://google.com) and [Chapter 2](chapter-2.md).`;
      const imports = parser.parseImports('chapter-1.md', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('chapter-2.md');
    });

    it('should parse reference-style links', () => {
      const content = `[methods]: chapter-2.md`;
      const imports = parser.parseImports('chapter-1.md', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('chapter-2.md');
      expect(imports[0].type).toBe('reference');
    });

    it('should skip external reference-style links', () => {
      const content = `[wiki]: https://example.com/wiki`;
      const imports = parser.parseImports('chapter-1.md', content, fixtureRoot);
      expect(imports).toHaveLength(0);
    });

    it('should deduplicate links', () => {
      const content = [
        `See [here](chapter-2.md).`,
        `And also [there](chapter-2.md).`,
      ].join('\n');
      const imports = parser.parseImports('chapter-1.md', content, fixtureRoot);
      expect(imports).toHaveLength(1);
    });

    it('should handle links with anchor fragments', () => {
      const content = `See [section](chapter-2.md#methods) for details.`;
      const imports = parser.parseImports('chapter-1.md', content, fixtureRoot);
      expect(imports).toHaveLength(1);
      expect(imports[0].raw).toBe('chapter-2.md#methods');
      expect(imports[0].resolved).toBe('chapter-2.md');
    });
  });

  describe('extractKeywords', () => {
    it('should extract keywords from H1 headings', () => {
      const content = `# Introduction\n\nSome text.`;
      const keywords = parser.extractKeywords('chapter-1.md', content);
      expect(keywords).toContain('introduction');
    });

    it('should extract keywords from H2+ headings', () => {
      const content = `## Research Methodology\n### Data Collection`;
      const keywords = parser.extractKeywords('chapter-1.md', content);
      expect(keywords).toContain('research');
      expect(keywords).toContain('methodology');
      expect(keywords).toContain('data');
      expect(keywords).toContain('collection');
    });

    it('should extract keywords from bold text', () => {
      const content = `This discusses **coral bleaching** in depth.`;
      const keywords = parser.extractKeywords('chapter-1.md', content);
      expect(keywords).toContain('coral');
      expect(keywords).toContain('bleaching');
    });

    it('should skip short words in headings', () => {
      const content = `## A To Do`;
      const keywords = parser.extractKeywords('test.md', content);
      // 'A' and 'To' are 1-2 chars, should be skipped
      expect(keywords).not.toContain('a');
      expect(keywords).not.toContain('to');
    });

    it('should deduplicate keywords', () => {
      const content = `# Data\n## Data Analysis`;
      const keywords = parser.extractKeywords('test.md', content);
      const dataCount = keywords.filter((k) => k === 'data').length;
      expect(dataCount).toBe(1);
    });
  });
});
