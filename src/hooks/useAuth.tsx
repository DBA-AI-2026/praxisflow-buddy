import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let currentUserId: string | null = null;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        console.log("Auth state changed:", event, currentSession?.user?.email);

        const nextUser = currentSession?.user ?? null;
        const nextUserId = nextUser?.id ?? null;

        // Only mutate React state on events that actually change identity.
        // TOKEN_REFRESHED must NOT re-set session/user — it triggers a full
        // consumer re-render (dialogs close, forms reset) on every tab refocus.
        // The supabase-js client keeps the refreshed token internally, so
        // SDK calls (Edge Functions, DB queries) continue to use fresh tokens.
        const isIdentityEvent =
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT" ||
          event === "USER_UPDATED" ||
          event === "INITIAL_SESSION";

        if (isIdentityEvent) {
          const identityChanged = nextUserId !== currentUserId;
          currentUserId = nextUserId;

          setSession(currentSession);
          setUser(nextUser);

          if (nextUser) {
            // Defer profile fetch with setTimeout to prevent deadlock
            setTimeout(() => { fetchProfile(nextUser.id); }, 0);
          } else if (identityChanged) {
            setProfile(null);
          }
        }

        // Mark as initialized on the very first event (any type) so the
        // loading gate releases even if getSession() below hasn't resolved.
        if (!isInitialized) {
          setIsInitialized(true);
          setIsLoading(false);
        }

        // last_seen_at heartbeat: fire-and-forget, no React state involved.
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && nextUser) {
          setTimeout(() => {
            supabase.from("profiles")
              .update({ last_seen_at: new Date().toISOString() })
              .eq("user_id", nextUser.id)
              .then(() => {});
          }, 500);
        }
      }
    );

    // THEN check for existing session (belt-and-braces for the initial load;
    // supabase-js also fires INITIAL_SESSION, but this guarantees hydration
    // even if that event were ever missed).
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      console.log("Initial session check:", existingSession?.user?.email ?? "No session");

      const existingUser = existingSession?.user ?? null;
      const existingId = existingUser?.id ?? null;

      if (existingId !== currentUserId) {
        currentUserId = existingId;
        setSession(existingSession);
        setUser(existingUser);
        if (existingUser) {
          fetchProfile(existingUser.id);
        }
      }

      if (!isInitialized) {
        setIsInitialized(true);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
    // Intentionally empty deps: listener must be registered exactly once for
    // the lifetime of the provider. Re-subscribing on isInitialized flip
    // would tear down and rebuild the listener on first event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    
    if (!error && data) {
      setProfile(data);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
