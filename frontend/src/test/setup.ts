import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: "test-token", user: { id: "test-user", email: "test@example.com" } } } }),
      getUser: () => Promise.resolve({ data: { user: { id: "test-user", email: "test@example.com" } } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      updateUser: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    },
    storage: {
      from: () => ({
        upload: vi.fn(() => Promise.resolve({ data: { path: "test/photo.jpg" }, error: null })),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.com/photo.jpg" } }),
      }),
    },
  },
}));

// Mock IntersectionObserver (for Dictionary infinite scroll)
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
