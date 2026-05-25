export class UnsupportedProviderError extends Error {
  constructor(public readonly provider: string) {
    super(`Провайдер ${provider} пока не поддерживается`);
    this.name = 'UnsupportedProviderError';
  }
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly providerCode?: string,
  ) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

/** Safe message for API clients — no raw provider payloads. */
export function sanitizeProviderError(err: unknown): string {
  if (err instanceof ProviderRequestError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return 'Неверный API-ключ провайдера';
    }
    if (err.statusCode === 429) {
      return 'Превышен лимит запросов провайдера';
    }
    if (err.statusCode >= 500) {
      return 'Провайдер временно недоступен';
    }
    return 'Ошибка запроса к провайдеру';
  }
  if (err instanceof UnsupportedProviderError) {
    return err.message;
  }
  return 'Ошибка провайдера AI';
}
