import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SupportEditForm } from "../SupportDetail";

describe("SupportEditForm", () => {
  it("changes status and assignee then calls onSave", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const loadEmployees = vi.fn().mockResolvedValue([
      { id: "e1", fullName: "Alice" },
      { id: "e2", fullName: "Bob" },
    ]);

    render(
      <MemoryRouter>
        <SupportEditForm
          ticket={{ id: "t1", status: "open", assigneeId: "e1" } as any}
          onSave={onSave}
          loadEmployees={loadEmployees}
        />
      </MemoryRouter>
    );

    const statusSelect = screen.getByLabelText(/Status/i) as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: "in_progress" } });

    const assigneeSelect = screen.getByLabelText(
      /Assignee/i
    ) as HTMLSelectElement;
    await waitFor(() =>
      expect(assigneeSelect.options.length).toBeGreaterThan(1)
    );
    fireEvent.change(assigneeSelect, { target: { value: "e2" } });

    const save = screen.getByText(/Save Changes/i);
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const arg = onSave.mock.calls[0][0];
    expect(arg.status).toBe("in_progress");
    expect(arg.assigneeId).toBe("e2");
  });

  it("adds a comment via writeComment", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const writeComment = vi.fn().mockResolvedValue({ id: "c1" });

    render(
      <MemoryRouter>
        <SupportEditForm
          ticket={{ id: "t2", status: "open" } as any}
          onSave={onSave}
          writeComment={writeComment}
          loadEmployees={async () => []}
        />
      </MemoryRouter>
    );

    const textarea = screen.getByPlaceholderText(/Write a comment/i);
    fireEvent.change(textarea, { target: { value: "Hello support" } });
    const save = screen.getByText(/Save Changes/i);
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(writeComment).toHaveBeenCalled());
    const payload = writeComment.mock.calls[0][0];
    expect(payload.text).toBe("Hello support");
  });
});
