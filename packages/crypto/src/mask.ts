/** Mask API keys for safe display — never log or return plaintext. */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return '••••••••';
  }
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  const prefix = trimmed.startsWith('sk-') ? 'sk-' : trimmed.slice(0, 3);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••${suffix}`;
}
