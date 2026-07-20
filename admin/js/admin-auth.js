/* ==========================================================================
   ADMIN AUTH
   ==========================================================================
   Handles Firebase Authentication (email/password) for the admin panel.

   This is the ONLY gate for the dashboard: admin-ui.js never renders any
   dashboard content until onAuthReady has resolved with a real signed-in
   user. There is no "hide it with CSS" shortcut here — the dashboard
   markup itself is only built after a successful auth check, so nothing
   sensitive ever touches the DOM for a logged-out visitor.

   Uses the Firebase v9+ modular SDK via CDN imports (no npm, no bundler),
   matching the pattern used by js/firebase-config.js and
   js/firebase-data.js on the main site.
   ========================================================================== */

import { firebaseConfig, isFirebaseConfigured } from '../../js/firebase-config.js';

let authPromise = null;

/**
 * Lazily loads the Firebase SDK and initializes Auth.
 * Returns null if firebase-config.js still has placeholder values, or if
 * the SDK fails to load — callers must handle this by showing a clear
 * "not configured" message instead of a blank/broken login screen.
 */
function getAuthCtx() {
  if (authPromise) return authPromise;

  authPromise = (async () => {
    if (!isFirebaseConfigured()) {
      return null;
    }

    try {
      const [{ initializeApp, getApps, getApp }, authModule] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js'),
      ]);

      // Reuse an existing app instance if one was already initialized
      // (guards against double-init if this module is ever imported twice).
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const auth = authModule.getAuth(app);
      return { auth, authModule };
    } catch (err) {
      console.warn('[admin-auth] Failed to initialize Firebase Auth.', err);
      return null;
    }
  })();

  return authPromise;
}

/**
 * Returns true once js/firebase-config.js has been filled in with real
 * project values. The login screen uses this to show a setup message
 * instead of a login form that can never succeed.
 */
export async function isAuthAvailable() {
  const ctx = await getAuthCtx();
  return ctx !== null;
}

/**
 * Attempts to sign in with email + password.
 * Returns { ok: true } on success, or { ok: false, message } with a
 * plain-language message on failure — never throws, never exposes raw
 * Firebase error codes to the UI.
 */
export async function signIn(email, password) {
  const ctx = await getAuthCtx();
  if (!ctx) {
    return { ok: false, message: 'Firebase isn\u2019t configured yet. Check js/firebase-config.js.' };
  }

  try {
    const { auth, authModule } = ctx;
    await authModule.signInWithEmailAndPassword(auth, email, password);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyAuthError(err) };
  }
}

/**
 * Signs the current user out.
 */
export async function signOutUser() {
  const ctx = await getAuthCtx();
  if (!ctx) return;

  try {
    await ctx.authModule.signOut(ctx.auth);
  } catch (err) {
    console.warn('[admin-auth] Sign-out failed.', err);
  }
}

/**
 * Subscribes to auth state changes. The callback receives either a
 * Firebase User object (signed in) or null (signed out / not yet known).
 * Returns an unsubscribe function, or a no-op function if Firebase Auth
 * could not be initialized.
 */
export async function onAuthChange(callback) {
  const ctx = await getAuthCtx();
  if (!ctx) {
    callback(null);
    return () => {};
  }

  return ctx.authModule.onAuthStateChanged(ctx.auth, (user) => {
    callback(user);
  });
}

/**
 * Maps Firebase Auth error codes to short, plain-language messages.
 * Never surfaces the raw error code or stack trace to the user.
 */
function friendlyAuthError(err) {
  const code = err && err.code ? err.code : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'That email address doesn\u2019t look right.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a bit and try again.';
    case 'auth/network-request-failed':
      return 'Network error \u2014 check your connection and try again.';
    default:
      return 'Couldn\u2019t sign in \u2014 try again.';
  }
}
