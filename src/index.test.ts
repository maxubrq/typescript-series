import { describe, expect, it } from 'vitest';
import { greet } from './index';

describe('greet', () => {
  it('returns a greeting with the given name', () => {
    expect(greet('World')).toBe('Hello, World!');
  });

  it('works with any string', () => {
    expect(greet('TypeScript')).toBe('Hello, TypeScript!');
  });
});
