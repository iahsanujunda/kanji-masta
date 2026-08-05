import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/auth/AuthProvider";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { clearPersistedQueryCache, persistUserQueryCache, restoreUserQueryCache } from "@/lib/queryPersistence";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function AuthState({ label }: { label: string }) {
  const { status, user } = useAuth();
  return <div>{label}:{status}:{user?.id ?? "none"}</div>;
}

function renderAuth(children: ReactNode, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return { ...render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>,
  ), queryClient };
}

function CachedSummary() {
  const { status, user } = useAuth();
  const summary = useQuery({
    queryKey: ["user-summary", user?.id],
    queryFn: () => new Promise<never>(() => {}),
    enabled: status === "authenticated",
    staleTime: Infinity,
  });
  if (status === "initializing") return <div>restoring</div>;
  return <div>streak:{(summary.data as { streak?: number } | undefined)?.streak ?? "none"}</div>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shares one initializing session lookup across every auth consumer", async () => {
    const sessionLookup = deferred<Awaited<ReturnType<typeof supabase.auth.getSession>>>();
    const getSession = vi.spyOn(supabase.auth, "getSession").mockReturnValue(sessionLookup.promise);
    const onAuthStateChange = vi.spyOn(supabase.auth, "onAuthStateChange");

    renderAuth(<><AuthState label="first" /><AuthState label="second" /></>);

    expect(screen.getByText("first:initializing:none")).toBeInTheDocument();
    expect(screen.getByText("second:initializing:none")).toBeInTheDocument();
    expect(getSession).toHaveBeenCalledOnce();
    expect(onAuthStateChange).toHaveBeenCalledOnce();

    sessionLookup.resolve({
      data: { session: { access_token: "token", user: { id: "user-one", email: "one@example.com" } } as Session },
      error: null,
    });

    expect(await screen.findByText("first:authenticated:user-one")).toBeInTheDocument();
    expect(screen.getByText("second:authenticated:user-one")).toBeInTheDocument();
  });

  it("restores the authenticated user's cache before protected content mounts", async () => {
    const source = new QueryClient();
    source.setQueryData(["user-summary", "user-one"], { streak: 12 });
    await persistUserQueryCache(source, "user-one");
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "token", user: { id: "user-one", email: "one@example.com" } } as Session },
      error: null,
    });

    renderAuth(<CachedSummary />);

    expect(screen.getByText("restoring")).toBeInTheDocument();
    expect(await screen.findByText("streak:12")).toBeInTheDocument();
    await clearPersistedQueryCache("user-one");
  });

  it("removes private memory and persistence when the user signs out", async () => {
    let authChange: ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
    vi.spyOn(supabase.auth, "onAuthStateChange").mockImplementation((callback) => {
      authChange = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } } as ReturnType<typeof supabase.auth.onAuthStateChange>;
    });
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "token", user: { id: "user-one", email: "one@example.com" } } as Session },
      error: null,
    });
    const queryClient = new QueryClient();
    renderAuth(<AuthState label="owner" />, queryClient);
    expect(await screen.findByText("owner:authenticated:user-one")).toBeInTheDocument();
    queryClient.setQueryData(["user-summary", "user-one"], { streak: 12 });
    await persistUserQueryCache(queryClient, "user-one");

    await act(async () => { authChange?.("SIGNED_OUT", null); });

    expect(await screen.findByText("owner:anonymous:none")).toBeInTheDocument();
    expect(queryClient.getQueryData(["user-summary", "user-one"])).toBeUndefined();
    expect(await restoreUserQueryCache(new QueryClient(), "user-one")).toBe(false);
  });
});
