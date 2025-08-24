import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EmployeeEditModal from "../EmployeeEditModal";
import { ToastProvider } from "../../../context/ToastContext";

vi.mock("firebase/app", () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}));

const updateDocMock = vi.fn().mockResolvedValue(undefined);
vi.mock("firebase/firestore", () => ({
  getFirestore: () => ({} as any),
  doc: (...args: any[]) => args as any,
  updateDoc: (...args: any[]) => updateDocMock(...args),
}));

describe("EmployeeEditModal", () => {
  beforeEach(() => {
    updateDocMock.mockClear();
  });

  it("submits updates to Firestore", async () => {
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <EmployeeEditModal
          employee={{ id: "emp1", fullName: "Old", role: "employee" }}
          onClose={onClose}
        />
      </ToastProvider>
    );

    const name = screen.getByLabelText(/Full name/i) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "New Name" } });
    fireEvent.click(screen.getByText(/Save/i));

    expect(updateDocMock).toHaveBeenCalled();
  });
});
