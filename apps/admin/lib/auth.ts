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
  setAuth: (user: AdminUser, token: string) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, accessToken) => set({ user, accessToken }),
      clearAuth: () => set({ user: null, accessToken: null }),
    }),
    { name: 'inspiro-admin-auth' },
  ),
);
