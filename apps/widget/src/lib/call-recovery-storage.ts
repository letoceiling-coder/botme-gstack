const STORAGE_KEY = 'botme_rtc_recovery';

export interface StoredCallRecovery {
  callSessionId: string;
  recoveryToken: string;
  inviteType: string;
}

export function storeCallRecovery(data: StoredCallRecovery): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadCallRecovery(): StoredCallRecovery | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCallRecovery;
  } catch {
    return null;
  }
}

export function clearCallRecovery(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
