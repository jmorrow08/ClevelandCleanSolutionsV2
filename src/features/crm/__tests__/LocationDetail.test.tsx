import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import LocationDetail from "../LocationDetail";
import { AuthProvider } from "../../../context/AuthContext";

describe("LocationDetail", () => {
  it("renders loading state", async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/crm/locations/abc123"]}>
          <Routes>
            <Route path="/crm/locations/:id" element={<LocationDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});
