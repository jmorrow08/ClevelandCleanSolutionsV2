import { describe, it, expect } from "vitest";
import { filterEmployees } from "../EmployeesList";

describe("EmployeesList filtering", () => {
  const list = [
    { id: "1", fullName: "Alice Smith", role: "employee" },
    { id: "2", fullName: "Bob Johnson", role: "owner" },
    { id: "3", fullName: "Charlie", role: "admin" },
  ];

  it("filters by name substring (case-insensitive)", () => {
    const out = filterEmployees(list as any, "ali", "all");
    expect(out.map((x) => x.id)).toEqual(["1"]);
  });

  it("filters by role exact match", () => {
    const out = filterEmployees(list as any, "", "owner");
    expect(out.map((x) => x.id)).toEqual(["2"]);
  });

  it("combines name and role filters", () => {
    const out = filterEmployees(list as any, "bo", "owner");
    expect(out.map((x) => x.id)).toEqual(["2"]);
  });
});
