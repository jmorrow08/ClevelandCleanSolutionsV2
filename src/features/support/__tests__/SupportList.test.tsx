import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SupportList from "../SupportList";

describe("SupportList", () => {
  it("renders filters and table skeleton", () => {
    render(<SupportList />);
    expect(screen.getByText(/Support/i)).toBeTruthy();
    expect(screen.getByLabelText(/Status/i)).toBeTruthy();
    expect(screen.getByLabelText(/Priority/i)).toBeTruthy();
    expect(screen.getByLabelText(/Assignee/i)).toBeTruthy();
  });
});
