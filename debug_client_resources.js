// Debug script to check mediaAssets collection for Client Portal Tutorial.mp4
// Requires GOOGLE_APPLICATION_CREDENTIALS (or other ADC source) to be configured before running locally.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Firebase config - copy from your environment
const firebaseConfig = {
  apiKey: "AIzaSyAJEuOcNLg8dYtzhMEyhMZtidfIXNALcgU",
  authDomain: "cleveland-clean-portal.firebaseapp.com",
  projectId: "cleveland-clean-portal",
  storageBucket: "cleveland-clean-portal.firebasestorage.app",
  messagingSenderId: "938625547862",
  appId: "1:938625547862:web:3655b2b380b858702705f7",
  measurementId: "G-7KZMMKZ1XW",
};

async function debugClientResources() {
  try {
    console.log("Initializing Firebase Admin using application default credentials...");
    const app = initializeApp({
      credential: applicationDefault(),
      projectId: "cleveland-clean-portal",
    });

    const db = getFirestore(app);
    const storage = getStorage(app);

    console.log("\n=== Checking mediaAssets collection ===");

    // Query for client resources
    const mediaAssetsRef = db.collection("mediaAssets");
    const clientResourceQuery = mediaAssetsRef
      .where("category", "==", "client_resource")
      .where("audience", "==", "clients")
      .orderBy("uploadedAt", "desc");

    const snapshot = await clientResourceQuery.get();
    console.log(
      `Found ${snapshot.docs.length} documents matching client_resource + clients query`
    );

    // Look for the specific video file
    const allDocsQuery = mediaAssetsRef.orderBy("uploadedAt", "desc");
    const allSnapshot = await allDocsQuery.get();
    console.log(`\nTotal documents in mediaAssets: ${allSnapshot.docs.length}`);

    let foundVideo = false;
    for (const doc of allSnapshot.docs) {
      const data = doc.data();
      if (
        data.filename &&
        (data.filename.includes(
          "3ea41eca-a063-40e8-a537-c3a6765e1457-Client Portal Tutorial"
        ) ||
          data.filename === "Client Portal Tutorial.mp4" ||
          (data.path &&
            data.path.includes(
              "3ea41eca-a063-40e8-a537-c3a6765e1457-Client Portal Tutorial"
            )))
      ) {
        console.log("\n=== FOUND CLIENT PORTAL TUTORIAL VIDEO ===");
        console.log("Document ID:", doc.id);
        console.log("Data:", {
          filename: data.filename,
          category: data.category,
          audience: data.audience,
          path: data.path,
          type: data.type,
          uploadedAt: data.uploadedAt?.toDate?.() || data.uploadedAt,
          uploadedBy: data.uploadedBy,
          relatedEntities: data.relatedEntities,
          tags: data.tags,
        });
        foundVideo = true;

        // Try to get download URL
        if (data.path) {
          try {
            console.log(
              "\nAttempting to get download URL for path:",
              data.path
            );
            const file = storage.bucket().file(data.path);
            const [url] = await file.getSignedUrl({
              action: "read",
              expires: Date.now() + 60 * 60 * 1000, // 1 hour
            });
            console.log("✅ Download URL generated successfully");
            console.log("URL length:", url.length, "characters");
          } catch (error) {
            console.error("❌ Failed to get download URL:", error.message);
            console.error("Error code:", error.code);
          }
        } else {
          console.error("❌ No path found in document");
        }
        break;
      }
    }

    if (!foundVideo) {
      console.log(
        "\n❌ Client Portal Tutorial video not found in mediaAssets collection"
      );
      console.log("\nSearching for any files with 'Client' in filename...");

      for (const doc of allSnapshot.docs) {
        const data = doc.data();
        if (data.filename && data.filename.toLowerCase().includes("client")) {
          console.log("Found potential match:", {
            id: doc.id,
            filename: data.filename,
            category: data.category,
            audience: data.audience,
            path: data.path,
          });
        }
      }
    }

    // Also check if there are any documents with "tutorial" in the name
    console.log("\nSearching for files with 'tutorial' in filename...");
    for (const doc of allSnapshot.docs) {
      const data = doc.data();
      if (data.filename && data.filename.toLowerCase().includes("tutorial")) {
        console.log("Found tutorial file:", {
          id: doc.id,
          filename: data.filename,
          category: data.category,
          audience: data.audience,
          path: data.path,
        });
      }
    }

    // Search specifically for the UUID pattern in path
    console.log("\nSearching for files with the specific UUID pattern...");
    const targetPath =
      "media/client/shared/3ea41eca-a063-40e8-a537-c3a6765e1457-Client Portal Tutorial.mp4";
    for (const doc of allSnapshot.docs) {
      const data = doc.data();
      if (
        data.path === targetPath ||
        (data.path &&
          data.path.includes("3ea41eca-a063-40e8-a537-c3a6765e1457"))
      ) {
        console.log("Found file with matching UUID pattern:", {
          id: doc.id,
          filename: data.filename,
          category: data.category,
          audience: data.audience,
          path: data.path,
        });

        // Try to get download URL for this specific path
        try {
          console.log(
            "\nAttempting to get download URL for target path:",
            targetPath
          );
          const file = storage.bucket().file(targetPath);
          const [url] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 60 * 60 * 1000, // 1 hour
          });
          console.log("✅ Download URL generated successfully for target path");
          console.log("URL length:", url.length, "characters");
        } catch (error) {
          console.error(
            "❌ Failed to get download URL for target path:",
            error.message
          );
          console.error("Error code:", error.code);
        }
      }
    }
  } catch (error) {
    console.error("Debug script failed:", error);
  }
}

debugClientResources();
