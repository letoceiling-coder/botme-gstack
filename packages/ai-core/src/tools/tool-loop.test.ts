import { describe, expect, it } from 'vitest';
import { buildToolSystemAppendix, parseToolCall } from './tool-loop.helpers.js';

describe('parseToolCall', () => {
  it('parses inline JSON tool_call', () => {
    const result = parseToolCall('{"tool_call":{"type":"CALCULATOR","input":{"expression":"2+2"}}}');
    expect(result).toEqual({ type: 'CALCULATOR', input: { expression: '2+2' } });
  });

  it('parses fenced JSON', () => {
    const result = parseToolCall('```json\n{"tool_call":{"type":"LEAD_SAVER","input":{"email":"a@b.c"}}}\n```');
    expect(result?.type).toBe('LEAD_SAVER');
  });

  it('returns null for plain text', () => {
    expect(parseToolCall('Hello world')).toBeNull();
  });
});

describe('buildToolSystemAppendix', () => {
  it('returns empty for no tools', () => {
    expect(buildToolSystemAppendix([])).toBe('');
  });

  it('includes tool types', () => {
    const appendix = buildToolSystemAppendix([
      { id: '1', name: 'Calc', description: 'math', type: 'CALCULATOR' },
    ]);
    expect(appendix).toContain('CALCULATOR');
  });
});
