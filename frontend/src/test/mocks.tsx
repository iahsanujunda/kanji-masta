import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import type { ReactElement, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AuthContext } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { appTheme } from "@/theme";

export const mockUser = {
  id: "test-user",
  email: "test@example.com",
  app_metadata: {},
  user_metadata: { display_name: "Test User" },
  aud: "authenticated",
  created_at: "",
} as unknown as User;

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  {
    route = "/",
    authUser = mockUser,
    queryClient = createTestQueryClient(),
    ...options
  }: RenderOptions & { route?: string; authUser?: User | null; queryClient?: QueryClient } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={appTheme}>
          <AuthContext.Provider value={{
            session: authUser ? ({ access_token: "test-token", user: authUser } as Session) : null,
            user: authUser,
            status: authUser ? "authenticated" : "anonymous",
            isLoading: false,
            signOut: async () => { await supabase.auth.signOut(); },
          }}>
            <MemoryRouter initialEntries={[route]}>
              {children}
            </MemoryRouter>
          </AuthContext.Provider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}
