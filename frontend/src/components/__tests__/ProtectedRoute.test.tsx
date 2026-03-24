import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import ProtectedRoute from "../ProtectedRoute";
import { renderWithProviders, mockUser } from "@/test/mocks";

describe("ProtectedRoute", () => {
  it("shows loading spinner when isLoading is true", () => {
    renderWithProviders(
      <ProtectedRoute user={null} isLoading={true}>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(document.querySelector("[role='progressbar']")).toBeInTheDocument();
  });

  it("renders children when user is authenticated", () => {
    renderWithProviders(
      <ProtectedRoute user={mockUser} isLoading={false}>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects to /login when user is null and not loading", () => {
    renderWithProviders(
      <ProtectedRoute user={null} isLoading={false}>
        <div>Protected Content</div>
      </ProtectedRoute>,
    );
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });
});
