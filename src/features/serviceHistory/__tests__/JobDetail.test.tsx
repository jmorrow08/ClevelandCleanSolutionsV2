import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import JobEditForm from "../JobEditForm";

describe("JobEditForm", () => {
  it("updates assignedEmployees and triggers onSave", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const employees = [
      { id: "e1", fullName: "Alice" },
      { id: "e2", fullName: "Bob" },
    ];
    render(
      <MemoryRouter>
        <JobEditForm
          job={{ id: "j1", assignedEmployees: ["e1"] } as any}
          onSave={onSave}
          loadEmployees={async () => employees}
        />
      </MemoryRouter>
    );
    const bob = await screen.findByLabelText("Bob");
    fireEvent.click(bob);
    const save = screen.getByText(/Save Changes/i);
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const arg = (onSave as any).mock.calls[0][0];
    expect(arg.assignedEmployees.sort()).toEqual(["e1", "e2"]);
  });

  it("adds an optional note via writeNote", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const writeNote = vi.fn().mockResolvedValue({ id: "n1" });
    render(
      <MemoryRouter>
        <JobEditForm
          job={{ id: "j1" } as any}
          onSave={onSave}
          loadEmployees={async () => []}
          writeNote={writeNote}
        />
      </MemoryRouter>
    );
    const textarea = screen.getByPlaceholderText(/Write a note/i);
    fireEvent.change(textarea, { target: { value: "Hello note" } });
    const save = screen.getByText(/Save Changes/i);
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(writeNote).toHaveBeenCalled());
    const payload = (writeNote as any).mock.calls[0][0];
    expect(payload.message).toBe("Hello note");
  });
});
