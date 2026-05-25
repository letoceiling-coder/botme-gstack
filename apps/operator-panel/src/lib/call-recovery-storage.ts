const STORAGE_KEY = 'botme_operator_rtc_recovery';

export interface StoredOperatorRecovery {
  callSessionId: string;
  recoveryToken: string;
  inviteType: 'VOICE' | 'VIDEO';
}

export function storeOperatorRecovery(data: StoredOperatorRecovery): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadOperatorRecovery(): StoredOperatorRecovery | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredOperatorRecovery;
  } catch {
    return null;
  }
}

export function clearOperatorRecovery(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
