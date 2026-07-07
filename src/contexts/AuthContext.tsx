import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { isSupabaseEnabled, supabase } from '../lib/supabase';
import { Profile } from '../types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string, studentId?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
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
      }
      setSession(null);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    if (!isSupabaseEnabled) {
      if (!email.trim() || !password.trim()) {
        return { error: new Error('Email and password are required.') };
      }
      const existing = readLocalAuth();
      const profile = existing?.email === email ? existing.profile : makeLocalProfile(email);
      saveLocalAuth(email, profile);
      setProfile(profile);
      setUser(makeLocalUser(profile, email));
      setSession(null);
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email: string, password: string, name: string, studentId?: string) {
    if (!isSupabaseEnabled) {
      if (!email.trim() || !password.trim()) {
        return { error: new Error('Email and password are required.') };
      }
      const profile = makeLocalProfile(email, name, studentId ?? null);
      saveLocalAuth(email, profile);
      setProfile(profile);
      setUser(makeLocalUser(profile, email));
      setSession(null);
      return { error: null };
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
    if (error || !data.user) return { error };
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      name,
      student_id: studentId ?? null,
      role: 'student',
    });

    if (profileError) {
      console.warn('Signed up auth user, but failed to create profile. Run the Supabase schema SQL.', profileError.message);
    }

    return { error: profileError };
  }

  async function signOut() {
    if (!isSupabaseEnabled) {
      localStorage.removeItem(LOCAL_AUTH_KEY);
      setProfile(null);
      setUser(null);
      setSession(null);
      return;
    }

    await supabase.auth.signOut();
  }

  const isAdmin = profile?.is_admin === true;

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, isAdmin, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
