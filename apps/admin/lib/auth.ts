'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AdminUser = {
  id: string;
  name: string;
  phone: string;
  role: 'admin' | 'instructor';
  avatarUrl: string | null;
};

type AuthState = {
  user: AdminUser | null;
  accessToken: string | null;
  /** True once the persisted state has been loaded from localStorage.
   *  Guards must NOT redirect to /login before this is true. */
  hydrated: boolean;
  setAuth: (user: AdminUser, token: string) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
  setHydrated: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      hydrated: false,
      setAuth: (user, accessToken) => set({ user, accessToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clearAuth: () => set({ user: null, accessToken: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'inspiro-admin-auth',
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
