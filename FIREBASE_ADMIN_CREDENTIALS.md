## Firebase Admin Credential Rotation

The previous service-account key (`cleveland-clean-portal-firebase-adminsdk-fbsvc-5fdf0c2694.json`) has been removed from the repository. Follow the steps below to rotate the secret and prevent new leaks:

1. **Delete the leaked key**
   - Visit [Firebase Console → Project Settings → Service Accounts](https://console.firebase.google.com/project/_/settings/serviceaccounts/adminsdk).
   - Locate the `firebase-adminsdk-fbsvc` key that matches the leaked file and delete it.
   - Confirm deletion so the old JSON can no longer be used.

2. **Create a replacement key (only if needed for local development)**
   - Still in the Service Accounts tab, generate a new private key.
   - Store the downloaded JSON in a secure local path that is **not** committed to git.

3. **Use Application Default Credentials**
   - Set the environment variable `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/new-key.json` before running any local admin scripts or the Firebase emulator.
   - The Cloud Functions runtime already uses Google-managed service accounts; no embedded JSON is required in the codebase.

4. **Git hygiene**
   - `.gitignore` now blocks `*firebase-adminsdk-*.json`. Do not add service-account files back into the repo.
   - Prefer secrets managers or CI/CD environment variables when deploying.

Following these steps ensures the Admin SDK relies on environment-based credentials only, matching Firebase security best practices.
