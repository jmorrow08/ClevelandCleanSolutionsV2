#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Get all TypeScript files that contain Firebase initialization
const files = execSync(
  'find src -name "*.ts" -o -name "*.tsx" | xargs grep -l "initializeApp|getApps"',
  { encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter(
    (f) =>
      f &&
      f !== "src/services/firebase.ts" &&
      f !== "src/context/AuthContext.tsx"
  );

console.log("Files to fix:", files);

let totalFixed = 0;

const projectRoot = path.resolve(__dirname);
const firebaseServicePath = path.join(projectRoot, "src/services/firebase");

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveFirebaseImportPath(filePath) {
  const relative = path
    .relative(path.dirname(filePath), firebaseServicePath)
    .replace(/\\/g, "/");
  if (!relative) return "./services/firebase";
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function hasGetFirestoreInstanceImport(content) {
  const importRegex =
    /import\s*{[^}]*\bgetFirestoreInstance\b[^}]*}\s*from\s*['"][^'"]+['"];?/;
  return importRegex.test(content);
}

files.forEach((file) => {
  const filePath = path.join(__dirname, file);
  let content = fs.readFileSync(filePath, "utf8");

  let modified = false;

  // Remove initializeApp and getApps imports
  const importRegex =
    /import\s*{\s*[^}]*\b(initializeApp|getApps)\b[^}]*}\s*from\s*['"]firebase\/app['"];?\s*/g;
  if (importRegex.test(content)) {
    content = content.replace(importRegex, "");
    modified = true;
  }

  // Remove firebaseConfig imports from firebase.ts
  const configImportRegex =
    /import\s*{\s*[^}]*\bfirebaseConfig\b[^}]*}\s*from\s*['"]\.\.?\/[^'"]*firebase['"];?\s*/g;
  if (configImportRegex.test(content)) {
    content = content.replace(configImportRegex, "");
    modified = true;
  }

  // Remove firebaseConfig imports with different paths
  const configImportRegex2 =
    /import\s*{\s*[^}]*\bfirebaseConfig\b[^}]*}\s*from\s*['"][^'"]*firebase['"];?\s*/g;
  if (configImportRegex2.test(content)) {
    content = content.replace(configImportRegex2, "");
    modified = true;
  }

  // Replace direct Firebase initialization functions
  const initRegex = /function\s+ensureApp\s*\(\s*\)\s*{\s*[^}]*}/g;
  if (initRegex.test(content)) {
    content = content.replace(initRegex, "");
    modified = true;
  }

  // Replace getApps() checks with direct app usage
  const getAppsRegex =
    /if\s*\(\s*!\s*getApps\(\)\s*\.length\s*\)\s*initializeApp\(\s*firebaseConfig\s*\)\s*;/g;
  if (getAppsRegex.test(content)) {
    content = content.replace(getAppsRegex, "");
    modified = true;
  }

  // Replace ensureApp() calls
  const ensureAppCallRegex = /ensureApp\(\)\s*;/g;
  if (ensureAppCallRegex.test(content)) {
    content = content.replace(ensureAppCallRegex, "");
    modified = true;
  }

  // Replace getFirestore() calls with getFirestoreInstance()
  const firestoreRegex = /\bgetFirestore\(\s*\)/g;
  if (firestoreRegex.test(content)) {
    content = content.replace(firestoreRegex, "getFirestoreInstance()");
    modified = true;
  }

  // Add the centralized Firebase import if needed
  if (modified && !hasGetFirestoreInstanceImport(content)) {
    // Find the first import line and add our import after it
    const lines = content.split("\n");
    let firstImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("import")) {
        firstImportIndex = i;
        break;
      }
    }

    const importPath = resolveFirebaseImportPath(filePath);
    const firebaseImport = `import { getFirestoreInstance } from '${importPath}';`;
    const existingImportRegex = new RegExp(
      `import\\s*{[^}]*\\bgetFirestoreInstance\\b[^}]*}\\s*from\\s*['"]${escapeRegExp(
        importPath
      )}['"];?`
    );

    if (!existingImportRegex.test(content)) {
      if (firstImportIndex !== -1) {
        lines.splice(firstImportIndex + 1, 0, firebaseImport);
      } else {
        lines.unshift(firebaseImport);
      }
      content = lines.join("\n");
    }
  }

  // Clean up extra blank lines produced by removals
  content = content.replace(/\n{3,}/g, "\n\n");

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed ${file}`);
    totalFixed++;
  }
});

console.log(`\n🎉 Fixed ${totalFixed} files total`);
console.log("\nNext steps:");
console.log("1. Run: npm run build");
console.log("2. If successful, run: npm run dev");
console.log("3. Test the application to ensure Firebase works correctly");

