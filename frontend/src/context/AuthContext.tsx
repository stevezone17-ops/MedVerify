import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, AuthResponse } from '../types';
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getStoredUser,
  isAuthenticated as checkIsAuthenticated,
  fetchCurrentProfile,
} from '../api/client';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  profileError: string | null;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (name: string, email: string, password: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  retryProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => checkIsAuthenticated());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Synchronize and verify current user profile on boot or session change
  const loadProfile = useCallback(async () => {
    const hasToken = checkIsAuthenticated();
    if (!hasToken) {
      setUser(null);
      setIsAuthenticated(false);
      setProfileError(null);
      setIsLoading(false);
      return;
    }

    try {
      setProfileError(null);
      console.log('[MedVerify Auth] Validating session and retrieving user profile...');
      const profile = await fetchCurrentProfile();
      console.log('[MedVerify Auth] Profile successfully retrieved:', {
        userId: profile.id,
        role: profile.role,
        email: profile.email,
      });
      setUser(profile);
      setIsAuthenticated(true);
    } catch (err: any) {
      console.error('[MedVerify Auth] Profile verification failed:', err);
      // If 401 Unauthorized, token has expired or is invalid -> clear session
      if (err?.status === 401 || err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
        console.warn('[MedVerify Auth] Session expired. Clearing credentials.');
        await apiLogout();
        setUser(null);
        setIsAuthenticated(false);
        setProfileError(null);
      } else {
        // If server or network error, check if we have a cached user
        const cached = getStoredUser();
        if (cached) {
          console.warn('[MedVerify Auth] Server unreachable, using persisted profile for:', cached.email);
          setUser(cached);
          setIsAuthenticated(true);
        } else {
          setProfileError(
            err?.message || 'Unable to retrieve user verification profile. Please check connection.',
          );
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial session verification & Supabase onAuthStateChange listener
  useEffect(() => {
    loadProfile();

    if (isSupabaseConfigured() && supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[MedVerify Auth] Supabase auth state change event:', event);
        if (event === 'SIGNED_IN' && session) {
          localStorage.setItem('medverify_token', session.access_token);
          await loadProfile();
        } else if (event === 'SIGNED_OUT') {
          localStorage.removeItem('medverify_token');
          localStorage.removeItem('medverify_user');
          setUser(null);
          setIsAuthenticated(false);
          setProfileError(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [loadProfile]);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResponse> => {
      setIsLoading(true);
      setProfileError(null);
      try {
        console.log('[MedVerify Auth] Submitting authentication request for:', email);
        const resp = await apiLogin(email, password);
        console.log('[MedVerify Auth] Authentication succeeded. User ID:', resp.user.id, 'Role:', resp.user.role);
        setUser(resp.user);
        setIsAuthenticated(true);
        setIsLoading(false);
        return resp;
      } catch (err) {
        setIsLoading(false);
        console.error('[MedVerify Auth] Authentication failed for:', email);
        throw err;
      }
    },
    [],
  );

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<AuthResponse> => {
      setIsLoading(true);
      setProfileError(null);
      try {
        console.log('[MedVerify Auth] Submitting registration request for:', email);
        const resp = await apiRegister(name, email, password);
        console.log('[MedVerify Auth] Registration succeeded. User ID:', resp.user.id, 'Role:', resp.user.role);
        setUser(resp.user);
        setIsAuthenticated(true);
        setIsLoading(false);
        return resp;
      } catch (err) {
        setIsLoading(false);
        console.error('[MedVerify Auth] Registration failed for:', email);
        throw err;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    console.log('[MedVerify Auth] Logging out user:', user?.id);
    await apiLogout();
    setUser(null);
    setIsAuthenticated(false);
    setProfileError(null);
  }, [user]);

  const retryProfile = useCallback(async () => {
    setIsLoading(true);
    await loadProfile();
  }, [loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        profileError,
        login,
        register,
        logout,
        retryProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
