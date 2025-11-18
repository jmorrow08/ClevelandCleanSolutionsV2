import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const projectId = "ccs-rbac-test";
  const firestoreRules = readFileSync("firestore.rules", "utf8");
  const storageRules = readFileSync("storage.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

function authedContext(uid: string, role?: string) {
  const claims: Record<string, any> = {};
  if (role) {
    claims.role = role;
    claims[role] = true;
  }
  return { uid, token: claims };
}

describe("RBAC basics", () => {
  it("super_admin can write settings; owner cannot", async () => {
    const superDb = testEnv.authenticatedContext(
      "super",
      authedContext("super", "super_admin").token
    ).firestore();
    const ownerDb = testEnv.authenticatedContext(
      "owner",
      authedContext("owner", "owner").token
    ).firestore();
    await assertSucceeds(
      superDb.collection("settings").doc("org").set({ name: "ok" })
    );
    await assertFails(
      ownerDb.collection("settings").doc("org").set({ name: "nope" })
    );
  });

  it("owner/admin can read jobs; employees can read", async () => {
    const adminDb = testEnv
      .authenticatedContext("admin", authedContext("admin", "admin").token)
      .firestore();
    const empDb = testEnv
      .authenticatedContext("e1", authedContext("e1", "employee").token)
      .firestore();
    // Seed as admin
    await assertSucceeds(
      adminDb.collection("jobs").doc("j1").set({ createdAt: new Date() })
    );
    await assertSucceeds(adminDb.collection("jobs").doc("j1").get());
    await assertSucceeds(empDb.collection("jobs").doc("j1").get());
  });

  it("owner cannot directly change users.role (must use callable)", async () => {
    const ownerDb = testEnv
      .authenticatedContext("owner", authedContext("owner", "owner").token)
      .firestore();
    // Seed user doc (as admin via withSecurityRulesDisabled)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.collection("users").doc("u1").set({ role: "employee" });
    });
    await assertFails(
      ownerDb.collection("users").doc("u1").update({ role: "owner" })
    );
  });
});

describe("Storage basics", () => {
  it("employee can write own users path but not others", async () => {
    const e1 = testEnv.storage().bucket().file("users/e1/photo.png");
    const e2 = testEnv.storage().bucket().file("users/e2/photo.png");
    const ctxE1 = testEnv.storage().bucket().file("users/e1/photo2.png");

    const e1Ctx = testEnv.authenticatedContext(
      "e1",
      authedContext("e1", "employee").token
    ).storage().bucket();

    await assertSucceeds(
      e1Ctx.file("users/e1/photo.png").save(Buffer.from("123"))
    );
    await assertFails(
      e1Ctx.file("users/e2/photo.png").save(Buffer.from("123"))
    );
  });
});


