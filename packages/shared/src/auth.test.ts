import { describe, expect, it } from 'vitest';
import { LoginSchema, RegisterSchema } from './auth.js';

describe('auth schemas', () => {
  it('validates register input', () => {
    const result = RegisterSchema.safeParse({
      email: 'test@botme.ru',
      password: 'password123',
      name: 'Тест',
      workspaceName: 'Мой workspace',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = RegisterSchema.safeParse({
      email: 'test@botme.ru',
      password: 'short',
      name: 'Тест',
      workspaceName: 'Мой workspace',
    });
    expect(result.success).toBe(false);
  });

  it('validates login input', () => {
    const result = LoginSchema.safeParse({
      email: 'test@botme.ru',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });
});
