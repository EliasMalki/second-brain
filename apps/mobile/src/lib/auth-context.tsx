import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getOrgIdForUser } from "@second-brain/shared/db/memberships";
import { supabase } from "./supabase";

type AuthState = {
  /** Current auth session, or null when signed out. */
  session: Session | null;
  /** The user's resolved org (tenancy root), or null until resolved. */
  orgId: string | null;
  /** True until the first session restore resolves — gates the splash. */
  loading: boolean;
  /** Set when org resolution failed (offline, etc.); retry with retryOrg. */
  orgError: string | null;
  signOut: () => Promise<void>;
  retryOrg: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

/**
 * Owns the Supabase session lifecycle for the app: silent restore on launch,
 * live updates via onAuthStateChange, and one org resolution per signed-in user
 * (the tenancy root every shared query needs). Org is keyed by user id, so a
 * token refresh — same id, new session object — does not refetch it.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);

  useEffect(() => {
    // Silent restore from encrypted storage, then keep in sync.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const resolveOrg = useCallback(async (userId: string) => {
    setOrgError(null);
    try {
      setOrgId(await getOrgIdForUser(supabase, userId));
    } catch (e) {
      setOrgId(null);
      setOrgError(
        e instanceof Error ? e.message : "Couldn't load your workspace.",
      );
    }
  }, []);

  // Resolve org whenever the signed-in user changes (id is the dependency, so a
  // token refresh doesn't retrigger it).
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      setOrgId(null);
      setOrgError(null);
      return;
    }
    resolveOrg(userId);
  }, [userId, resolveOrg]);

  const signOut = useCallback(async () => {
    // Local scope only: signing out the phone must not revoke the user's web
    // sessions (the default 'global' scope would).
    await supabase.auth.signOut({ scope: "local" });
    setOrgId(null);
  }, []);

  const retryOrg = useCallback(() => {
    if (userId) resolveOrg(userId);
  }, [userId, resolveOrg]);

  return (
    <AuthContext.Provider
      value={{ session, orgId, loading, orgError, signOut, retryOrg }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
