import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Firebase
vi.mock("@/lib/firebase", () => ({
  auth: {
    currentUser: { uid: "test-user", getIdToken: () => Promise.resolve("test-token") },
    onAuthStateChanged: vi.fn(),
  },
  storage: {},
}));

// Mock IntersectionObserver (for Dictionary infinite scroll)
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
