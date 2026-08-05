import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { AuthProvider } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabase";

vi.mock("@/hooks/useCaptureQueue", () => ({ useCaptureQueue: vi.fn() }));
vi.mock("@/pages/Home", () => ({ default: () => <h1>Authenticated home</h1> }));
vi.mock("@/pages/Landing", () => ({ default: () => <h1>Public landing</h1> }));
vi.mock("@/pages/Login", () => ({ default: () => <h1>Login</h1> }));

import App from "@/App";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("application auth bootstrap", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("goes from a neutral launch screen directly to Home for a restored session", async () => {
    const lookup = deferred<Awaited<ReturnType<typeof supabase.auth.getSession>>>();
    vi.spyOn(supabase.auth, "getSession").mockReturnValue(lookup.promise);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Opening Shuukan…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Public landing" })).not.toBeInTheDocument();

    lookup.resolve({
      data: { session: { access_token: "token", user: { id: "user-one", email: "one@example.com" } } as Session },
      error: null,
    });

    expect(await screen.findByRole("heading", { name: "Authenticated home" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Public landing" })).not.toBeInTheDocument();
  });
});
