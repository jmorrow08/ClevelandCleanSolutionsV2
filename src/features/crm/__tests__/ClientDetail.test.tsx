import { describe, it, expect } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import ClientDetail from "../ClientDetail";
import { ToastProvider } from "../../../context/ToastContext";
import { AuthProvider } from "../../../context/AuthContext";

describe("ClientDetail", () => {
  it("renders not found without id", async () => {
    render(
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/crm/clients/"]}>
            <Routes>
              <Route path="/crm/clients/" element={<ClientDetail />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    );
    expect(screen.getByText(/Client not found/i)).toBeInTheDocument();
  });
});
