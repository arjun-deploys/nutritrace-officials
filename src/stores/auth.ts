import { create } from 'zustand';
import { can, type Permission, type SessionUser } from '@nt/domain';

interface AuthState {
  accessToken: string | null;
  user: (SessionUser & { mustChangePassword?: boolean }) | null;
  status: 'unknown' | 'authenticated' | 'anonymous';
  setSession: (token: string, user: AuthState['user']) => void;
  clear: () => void;
}

/** The access token lives only in memory; the refresh token is an httpOnly cookie. */
export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  status: 'unknown',
  setSession: (accessToken, user) => set({ accessToken, user, status: 'authenticated' }),
  clear: () => set({ accessToken: null, user: null, status: 'anonymous' }),
}));

export const useUser = () => useAuthStore((s) => s.user!);
export const useCan = (p: Permission) => useAuthStore((s) => can(s.user?.permissions, p));
