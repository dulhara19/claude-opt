import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/pipeline.js';
import { TaskType, Complexity } from '../../src/types/index.js';

describe('runPipeline', () => {
  it('initializes PipelineContext with user prompt', async () => {
    const ctx = await runPipeline('fix the login bug', '/tmp/test-project', true);
    expect(ctx.taskText).toBe('fix the login bug');
    expect(ctx.workingDir).toBe('/tmp/test-project');
    expect(ctx.isDryRun).toBe(true);
    expect(ctx.startedAt).toBeGreaterThan(0);
  });

  it('produces a classification result', async () => {
    const ctx = await runPipeline('fix the login bug', '/tmp/test-project', true);
    expect(ctx.classification).toBeDefined();
    expect(ctx.classification!.type).toBe(TaskType.BugFix);
    expect(ctx.classification!.confidence).toBeGreaterThan(0);
  });

  it('classifies feature tasks through pipeline', async () => {
    const ctx = await runPipeline('add dark mode to settings', '/tmp/test-project', true);
    expect(ctx.classification).toBeDefined();
    expect(ctx.classification!.type).toBe(TaskType.Feature);
  });

  it('uses fail-open default when analyzer would error', async () => {
    // Empty prompt should still not crash the pipeline
    const ctx = await runPipeline('', '/tmp/test-project', true);
    // Pipeline should complete successfully regardless
    expect(ctx.taskText).toBe('');
  });

  it('sets dry-run flag correctly', async () => {
    const ctx = await runPipeline('test task', '/tmp/test-project', true);
    expect(ctx.isDryRun).toBe(true);

    const ctx2 = await runPipeline('test task', '/tmp/test-project', false);
    expect(ctx2.isDryRun).toBe(false);
  });

  it('returns a fully structured PipelineContext', async () => {
    const ctx = await runPipeline('add a search feature', '/tmp/test-project', true);
    expect(ctx).toHaveProperty('taskText');
    expect(ctx).toHaveProperty('workingDir');
    expect(ctx).toHaveProperty('isDryRun');
    expect(ctx).toHaveProperty('results');
    expect(ctx).toHaveProperty('startedAt');
    expect(ctx).toHaveProperty('classification');
  });

  it('stages execute in order (classification is populated)', async () => {
    const ctx = await runPipeline('refactor the auth module', '/tmp/test-project', true);
    expect(ctx.classification).toBeDefined();
    expect(ctx.classification!.type).toBe(TaskType.Refactor);
    // Prediction is now implemented (Story 2.2)
    expect(ctx.prediction).toBeDefined();
    expect(ctx.prediction!.predictions).toBeInstanceOf(Array);
    expect(ctx.prediction!.threshold).toBeGreaterThan(0);
    // Routing is now implemented (Story 2.3)
    expect(ctx.routing).toBeDefined();
    expect(ctx.routing!.model).toBeDefined();
    expect(ctx.routing!.rationale).toBeDefined();
    // Compression is now implemented (Story 2.4)
    expect(ctx.compression).toBeDefined();
    expect(ctx.compression!.optimizedPrompt).toBeDefined();
    expect(ctx.compression!.sections.length).toBeGreaterThanOrEqual(1);
  });

  it('handles unknown tasks gracefully', async () => {
    const ctx = await runPipeline('xyzzy plugh', '/tmp/test-project', true);
    expect(ctx.classification).toBeDefined();
    expect(ctx.classification!.type).toBe(TaskType.Unknown);
    expect(ctx.classification!.domain).toBe('general');
    expect(ctx.classification!.complexity).toBe(Complexity.Medium);
  });

  it('completes pipeline in reasonable time', async () => {
    const start = performance.now();
    await runPipeline('fix the bug in the component', '/tmp/test-project', true);
    const elapsed = performance.now() - start;
    // Should complete well under 500ms budget
    expect(elapsed).toBeLessThan(500);
  });
});
