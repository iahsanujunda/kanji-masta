import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type AuthStatus = "initializing" | "authenticated" | "anonymous";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  status: AuthStatus;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
