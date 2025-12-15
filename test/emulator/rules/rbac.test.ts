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

  it("treats legacy Owner casing in users doc as owner for write checks", async () => {
    const legacyOwnerUid = "owner-legacy";
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.collection("users").doc(legacyOwnerUid).set({ role: "Owner" });
    });

    const legacyOwnerDb = testEnv
      .authenticatedContext(
        legacyOwnerUid,
        authedContext(legacyOwnerUid).token
      )
      .firestore();

    await assertSucceeds(
      legacyOwnerDb.collection("employeeMasterList").doc("emp-legacy").set({
        fullName: "Legacy Owner Added",
        status: true,
      })
    );
  });
});

describe("Storage basics", () => {
  it("employee can write own users path but not others", async () => {
    const e1Ctx = testEnv
      .authenticatedContext("e1", authedContext("e1", "employee").token)
      .storage();

    await assertSucceeds(
      e1Ctx.ref("users/e1/photo.png").put(Buffer.from("123"))
    );
    await assertFails(
      e1Ctx.ref("users/e2/photo.png").put(Buffer.from("123"))
    );
  });
});

describe("Owner dual-mode permissions", () => {
  it("allows owner with linked profile to upload photos and notes", async () => {
    const ownerUid = "owner-profiled";
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.collection("users").doc(ownerUid).set({
        profileId: "emp123",
        role: "owner",
      });
    });

    const ownerDb = testEnv
      .authenticatedContext(ownerUid, authedContext(ownerUid, "owner").token)
      .firestore();

    await assertSucceeds(
      ownerDb.collection("servicePhotos").doc("photo-1").set({
        employeeProfileId: "emp123",
        employeeName: "Owner User",
        photoUrl:
          "https://firebasestorage.googleapis.com/v0/b/demo/o/photo.jpg",
        locationId: "loc-1",
        locationName: "HQ",
        uploadedAt: new Date(),
        timeEntryId: null,
        notes: "Owner upload",
        serviceHistoryId: null,
      })
    );

    await assertSucceeds(
      ownerDb.collection("generalJobNotes").doc("note-1").set({
        employeeProfileId: "emp123",
        employeeName: "Owner User",
        locationId: "loc-1",
        locationName: "HQ",
        notes: "Owner working this shift",
        createdAt: new Date(),
        timeEntryId: null,
      })
    );
  });

  it("rejects owner uploads when no employee profile is linked", async () => {
    const ownerUid = "owner-missing-profile";
    const ownerDb = testEnv
      .authenticatedContext(ownerUid, authedContext(ownerUid, "owner").token)
      .firestore();

    await assertFails(
      ownerDb.collection("servicePhotos").doc("invalid-photo").set({
        employeeProfileId: "emp123",
        employeeName: "Owner User",
        photoUrl:
          "https://firebasestorage.googleapis.com/v0/b/demo/o/missing.jpg",
        locationId: "loc-1",
        locationName: "HQ",
        uploadedAt: new Date(),
        timeEntryId: null,
        notes: "Should fail without profile link",
      })
    );

    await assertFails(
      ownerDb.collection("generalJobNotes").doc("invalid-note").set({
        employeeProfileId: "emp123",
        employeeName: "Owner User",
        locationId: "loc-1",
        locationName: "HQ",
        notes: "Cannot write without linked profile",
        createdAt: new Date(),
        timeEntryId: null,
      })
    );
  });
});

describe("Admin field access with employee profile", () => {
  it("allows admin with linked profile to create service photos and notes", async () => {
    const adminUid = "admin-profiled";
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.collection("users").doc(adminUid).set({
        profileId: "adm123",
        role: "admin",
      });
    });

    const adminDb = testEnv
      .authenticatedContext(adminUid, authedContext(adminUid, "admin").token)
      .firestore();

    await assertSucceeds(
      adminDb.collection("servicePhotos").doc("admin-photo").set({
        employeeProfileId: "adm123",
        employeeName: "Admin User",
        photoUrl:
          "https://firebasestorage.googleapis.com/v0/b/demo/o/admin-photo.jpg",
        locationId: "loc-2",
        locationName: "HQ",
        uploadedAt: new Date(),
        timeEntryId: null,
        notes: "Admin upload",
        serviceHistoryId: null,
      })
    );

    await assertSucceeds(
      adminDb.collection("generalJobNotes").doc("admin-note").set({
        employeeProfileId: "adm123",
        employeeName: "Admin User",
        locationId: "loc-2",
        locationName: "HQ",
        notes: "Admin covering this shift",
        createdAt: new Date(),
        timeEntryId: null,
      })
    );
  });

  it("still rejects admin uploads without a linked profile", async () => {
    const adminUid = "admin-missing-profile";
    const adminDb = testEnv
      .authenticatedContext(adminUid, authedContext(adminUid, "admin").token)
      .firestore();

    await assertFails(
      adminDb.collection("servicePhotos").doc("bad-photo").set({
        employeeProfileId: "adm123",
        employeeName: "Admin User",
        photoUrl:
          "https://firebasestorage.googleapis.com/v0/b/demo/o/bad-photo.jpg",
        locationId: "loc-2",
        locationName: "HQ",
        uploadedAt: new Date(),
        timeEntryId: null,
        notes: "Missing profile link",
      })
    );
  });
});

describe("Client roster management", () => {
  it("allows super_admin to delete client documents", async () => {
    const clientId = "client-delete-test";
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.collection("clientMasterList").doc(clientId).set({
        email: "client@example.com",
        contactName: "Client",
        phone: "555-0000",
        updatedAt: new Date(),
      });
    });

    const superDb = testEnv
      .authenticatedContext("super", authedContext("super", "super_admin").token)
      .firestore();

    await assertSucceeds(
      superDb.collection("clientMasterList").doc(clientId).delete()
    );
  });
});
