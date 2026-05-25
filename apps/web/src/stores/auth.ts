import { create } from 'zustand';
import type { AuthSession } from '@botme/shared';
import { api, refreshAuthSession } from '@/lib/api';

interface AuthState {
  session: AuthSession | null;
  loading: boolean;
  initialized: boolean;
  setSession: (session: AuthSession) => void;
  clear: () => void;
  bootstrap: () => Promise<void>;
}

let bootstrapPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  loading: false,
  initialized: false,

  setSession: (session) => set({ session }),

  clear: () => set({ session: null }),

  bootstrap: async () => {
    if (get().initialized) return;
    if (bootstrapPromise) return bootstrapPromise;

    bootstrapPromise = (async () => {
      set({ loading: true });
      try {
        const session = await api.me();
        set({ session, initialized: true, loading: false });
      } catch {
        try {
          const refreshed = await refreshAuthSession();
          const { expiresIn: _e, ...session } = refreshed;
          set({ session, initialized: true, loading: false });
        } catch {
          set({ session: null, initialized: true, loading: false });
        }
      }
    })().finally(() => {
      bootstrapPromise = null;
    });

    return bootstrapPromise;
  },
}));
