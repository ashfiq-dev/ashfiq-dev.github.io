/* ==========================================================================
   FIREBASE CONFIG — EDIT ME
   ==========================================================================

   This file holds the connection settings for YOUR Firebase project.
   It uses the Firebase v9+ modular SDK, loaded directly from a CDN
   (no npm, no build step) so it runs as-is on GitHub Pages.

   --------------------------------------------------------------------------
   HOW TO GET YOUR OWN VALUES
   --------------------------------------------------------------------------
   1. Go to https://console.firebase.google.com/ and create a project
      (or open an existing one).
   2. In the left sidebar, click the gear icon → "Project settings".
   3. Scroll down to the "Your apps" section.
   4. Click the "</>" (Web) icon to register a new web app
      (nickname can be anything, e.g. "portfolio-site").
      You do NOT need to enable Firebase Hosting — you're using GitHub Pages.
   5. Firebase will show you a `firebaseConfig` object exactly like the
      shape below. Copy each value into the matching field here.
   6. Enable Firestore: left sidebar → "Build" → "Firestore Database" →
      "Create database" → start in production mode (we provide our own
      security rules in firestore.rules) → pick a location close to you.

   --------------------------------------------------------------------------
   IS IT SAFE TO COMMIT THIS FILE (WITH REAL VALUES) TO A PUBLIC REPO?
   --------------------------------------------------------------------------
   Yes. These values identify your Firebase project publicly — they are
   not secret credentials. Real security comes from Firestore Security
   Rules (see firestore.rules) and from restricting this API key to your
   domain (see SECURITY.md). Read SECURITY.md before deploying.
   ========================================================================== */

// Replace every value below with the values from your Firebase Console.
// Keep the keys (left side) exactly as they are — only change the
// placeholder strings on the right side.
export const firebaseConfig = {
  apiKey: 'AIzaSyBzKkofFdJyfPP0jI-ZYHxJvn5fYQO_5lU',
  authDomain: 'my-portfolio-2ead0.firebaseapp.com',
  projectId: 'my-portfolio-2ead0',
  storageBucket: 'my-portfolio-2ead0.firebasestorage.app',
  messagingSenderId: '720921956124',
  appId: '1:720921956124:web:37377bf8cf2204ef9434d9',
};

/* --------------------------------------------------------------------------
   HAS THE CONFIG BEEN FILLED IN YET?
   --------------------------------------------------------------------------
   firebase-data.js checks this before attempting to talk to Firestore.
   While any placeholder value is still present, the site will skip
   Firestore entirely and use the built-in static/dummy content instead —
   so the site never crashes or shows a blank page while you're setting
   things up.
   ========================================================================== */
export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every(
    (value) => typeof value === 'string' && !value.startsWith('YOUR_')
  );
}
