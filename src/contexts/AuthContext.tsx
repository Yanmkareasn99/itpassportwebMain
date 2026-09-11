import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { isSupabaseEnabled, supabase } from '../lib/supabase';
import { claimDailyLoginPoints } from '../lib/points';
import { Profile } from '../types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;

  signIn: (email: string, password: string) => Promise<void>;

  signInWithGoogle: () => Promise<void>;

  signUp: (email: string, password: string, name: string, studentId?: string) => Promise<boolean>;

  resetPassword: (email: string) => Promise<void>;

  updatePassword: (password: string) => Promise<void>;

  signOut: () => Promise<void>;

  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const LOCAL_AUTH_KEY = 'manabi-local-auth';

function makeLocalProfile(email: string, name?: string, studentId?: string | null): Profile {
  return {
    id: `local-${email.toLowerCase()}`,
    name: name?.trim() || email.split('@')[0] || 'Demo User',
    student_id: studentId || null,
    role: 'student',
    class_name: null,
    avatar_url: null,
    is_admin: false,
    created_at: new Date().toISOString(),
  };
}

function makeLocalUser(profile: Profile, email = 'demo@example.com') {
  return {
    id: profile.id,
    email,
    app_metadata: {},
    user_metadata: { name: profile.name },
    aud: 'authenticated',
    created_at: profile.created_at,
  } as User;
}

function readLocalAuth() {
  const raw = localStorage.getItem(LOCAL_AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { email: string; profile: Profile };
  } catch {
    localStorage.removeItem(LOCAL_AUTH_KEY);
    return null;
  }
}

function saveLocalAuth(email: string, profile: Profile) {
  localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify({ email, profile }));
}

function claimDailyPointsQuietly(userId: string) {
  claimDailyLoginPoints(userId).catch(error => {
    console.warn('Failed to claim daily login points:', error instanceof Error ? error.message : error);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string) {
    if (!isSupabaseEnabled) {
      const local = readLocalAuth();
      setProfile(local?.profile ?? null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Failed to fetch profile. Has the Supabase schema been created?', error.message);
      setProfile(null);
      return;
    }

    setProfile(data);
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  useEffect(() => {
    if (!isSupabaseEnabled) {
      const local = readLocalAuth();
      if (local) {
        setProfile(local.profile);
        setUser(makeLocalUser(local.profile, local.email));
        claimDailyPointsQuietly(local.profile.id);
      }
      setSession(null);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) throw error;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        claimDailyPointsQuietly(session.user.id);
        fetchProfile(session.user.id).finally(() => setLoading(false));
      }
      else setLoading(false);
    }).catch(error => {
      console.error('Failed to restore Supabase session:', error);
      setSession(null);
      setUser(null);
      setProfile(null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        claimDailyPointsQuietly(session.user.id);
        fetchProfile(session.user.id);
      }
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    if (!isSupabaseEnabled) {
      if (!email.trim() || !password.trim()) {
        throw new Error('Email and password are required.');
      }
      const existing = readLocalAuth();
      const profile = existing?.email === email ? existing.profile : makeLocalProfile(email);
      saveLocalAuth(email, profile);
      setProfile(profile);
      setUser(makeLocalUser(profile, email));
      setSession(null);
      claimDailyPointsQuietly(profile.id);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string, name: string, studentId?: string) {
    if (!isSupabaseEnabled) {
      if (!email.trim() || !password.trim()) {
        throw new Error('Email and password are required.');
      }
      const profile = makeLocalProfile(email, name, studentId ?? null);
      saveLocalAuth(email, profile);
      setProfile(profile);
      setUser(makeLocalUser(profile, email));
      setSession(null);
      claimDailyPointsQuietly(profile.id);
      return false;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          student_id: studentId ?? null,
        },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Failed to create user');

    // A database trigger creates the profile for email/password and OAuth users.
    // A null session means email confirmation is required before sign-in.
    return data.session === null;
  }

  async function signOut() {
    if (!isSupabaseEnabled) {
      localStorage.removeItem(LOCAL_AUTH_KEY);
      setProfile(null);
      setUser(null);
      setSession(null);
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function resetPassword(email: string) {
    if (!isSupabaseEnabled) {
      throw new Error('Password reset requires Supabase to be enabled.');
    }

    const redirectTo = new URL('/login?recovery=1', window.location.origin).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function updatePassword(password: string) {
    if (!isSupabaseEnabled) {
      throw new Error('Password reset requires Supabase to be enabled.');
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }

  async function signInWithGoogle() {
    if (!isSupabaseEnabled) {
      throw new Error('Supabase is not enabled.');
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/userinfo.email',
        queryParams: { prompt: 'select_account' },
      },
    });

    if (error) throw error;

    // If Supabase returned a redirect URL, navigate there to start the OAuth flow.
    const redirectUrl = data.url;
    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  }

  const isAdmin = profile?.is_admin === true;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isAdmin,
        signIn,
        signInWithGoogle,
        signUp,
        resetPassword,
        updatePassword,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Hooks intentionally share this module with their provider component.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
