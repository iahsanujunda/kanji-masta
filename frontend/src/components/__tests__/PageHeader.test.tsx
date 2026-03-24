import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import PageHeader from "../PageHeader";
import { renderWithProviders } from "@/test/mocks";

describe("PageHeader", () => {
  it("renders title", () => {
    renderWithProviders(<PageHeader title="Test Title" />);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    renderWithProviders(<PageHeader title="Title" subtitle="Subtitle" />);
    expect(screen.getByText("Subtitle")).toBeInTheDocument();
  });

  it("does not render subtitle when not provided", () => {
    renderWithProviders(<PageHeader title="Title" />);
    expect(screen.queryByText("Subtitle")).not.toBeInTheDocument();
  });

  it("renders back button when backTo is provided", () => {
    renderWithProviders(<PageHeader title="Title" backTo="/" />);
    expect(document.querySelector("button")).toBeInTheDocument();
  });

  it("does not render back button when backTo is not provided", () => {
    const { container } = renderWithProviders(<PageHeader title="Title" />);
    // Should have no icon buttons (back button uses IconButton)
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  it("renders right slot content", () => {
    renderWithProviders(
      <PageHeader title="Title" right={<span data-testid="right-slot">Right</span>} />,
    );
    expect(screen.getByTestId("right-slot")).toBeInTheDocument();
  });
});
