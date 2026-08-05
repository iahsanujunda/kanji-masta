import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext, type AuthContextValue, type AuthStatus } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  clearPersistedQueryCache,
  restoreUserQueryCache,
  subscribeToUserQueryPersistence,
} from "@/lib/queryPersistence";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const currentUserId = useRef<string | null>(null);
  const stopPersistence = useRef<(() => void) | null>(null);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  useEffect(() => {
    let active = true;
    let transition = 0;
    const applySession = async (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (nextUserId && nextUserId === currentUserId.current) {
        if (!active) return;
        setSession(nextSession);
        setStatus("authenticated");
        return;
      }

      const transitionId = ++transition;
      const previousUserId = currentUserId.current;
      setStatus("initializing");
      stopPersistence.current?.();
      stopPersistence.current = null;
      currentUserId.current = null;
      queryClient.clear();

      if (previousUserId && previousUserId !== nextUserId) {
        await clearPersistedQueryCache(previousUserId);
      }
      if (nextUserId) {
        await restoreUserQueryCache(queryClient, nextUserId).catch(() => false);
      }
      if (!active || transitionId !== transition) return;

      currentUserId.current = nextUserId;
      if (nextUserId) {
        stopPersistence.current = subscribeToUserQueryPersistence(queryClient, nextUserId);
      }
      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "anonymous");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    void supabase.auth.getSession()
      .then(({ data }) => void applySession(data.session))
      .catch(() => void applySession(null));

    return () => {
      active = false;
      transition += 1;
      stopPersistence.current?.();
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    status,
    isLoading: status === "initializing",
    signOut,
  }), [session, signOut, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
