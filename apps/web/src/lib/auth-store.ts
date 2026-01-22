import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@democracy-os/shared';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  tenantSlug: string;
  setAuth: (user: User, accessToken: string) => void;
  clearAuth: () => void;
  setTenant: (slug: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      tenantSlug: 'default',
      setAuth: (user, accessToken) => set({ user, accessToken }),
      clearAuth: () => set({ user: null, accessToken: null }),
      setTenant: (slug) => set({ tenantSlug: slug }),
    }),
    {
      name: 'democracy-os-auth',
    }
  )
);
