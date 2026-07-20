/* ==========================================================================
   FIREBASE DATA LAYER
   ==========================================================================

   This module is the ONLY place that talks to Firestore. It fetches:
     - profile      (single doc)
     - projects     (collection)
     - skills       (collection)
     - experience   (collection, rendered as a commit log)
     - blogPosts    (collection, rendered as stdout.log)

   Design goal: script.js should never crash, even before any content
   has been added. Every exported getter below ALWAYS resolves — either
   with real Firestore data, or with an empty result ([] for
   collections, an empty profile object for the profile) — and never
   rejects. Callers don't need try/catch. There is no dummy/placeholder
   content anywhere in this file; every field visitors see comes from
   Firestore.

   Uses the Firebase v9+ modular SDK via CDN imports (no npm, no bundler),
   so this runs as-is on GitHub Pages.
   ========================================================================== */

import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

/* ------------------------------------------------------------------ */
/* 1. FIRESTORE COLLECTION SCHEMA (for reference)                      */
/* ------------------------------------------------------------------ */
/*
  profile (collection "profile", single doc — any doc ID, we just read
           the first one; recommended doc ID: "main")
    - name: string
    - bio: string
    - photoUrl: string
    - contact: { email, github, linkedin } (map)

  projects (collection "projects")
    - title: string
    - shortDescription: string
    - fullDescription: string
    - tags: array<string>          // e.g. ["scrape","automate"] — first tag
                                    // used as the "stage" for pipeline filter
    - techStack: array<string>
    - images: array<string>        // URLs or short captions
    - githubUrl: string
    - liveUrl: string
    - downloadUrl: string
    - featured: boolean
    - order: number (optional, for sorting)

  skills (collection "skills")
    - group: string                // "Scrape" | "Analyze" | "Automate" | "Ship"
    - stage: string                // "scrape" | "analyze" | "automate" | "ship"
    - color: string                // hex color, e.g. "#00E5FF"
    - tags: array<string>
    - order: number (optional)

  experience (collection "experience") — rendered as a git commit log
    - hash: string
    - date: string
    - title: string
    - role: string
    - desc: string
    - branch: string
    - stage: string                // used to pick the accent color
    - order: number (optional)

  blogPosts (collection "blogPosts") — rendered as stdout.log
    - timestamp: string
    - level: string                // "INFO" | "OK"
    - title: string
    - desc: string
    - order: number (optional)
*/

/* ------------------------------------------------------------------ */
/* 2. EMPTY DEFAULTS                                                   */
/* ------------------------------------------------------------------ */
/* No dummy/placeholder content ships with this site anymore. Every
   getter below returns real Firestore data only. If a collection has
   no documents yet (or Firestore isn't reachable), the getter simply
   returns an empty result — script.js renders an "empty state" for
   that section instead of any built-in dummy content. */

const EMPTY_PROFILE = {
  name: '',
  bio: '',
  photoUrl: '',
  contact: {
    email: '',
    github: '',
    linkedin: '',
  },
};

/* ------------------------------------------------------------------ */
/* 3. FIREBASE APP / FIRESTORE INITIALIZATION (lazy, safe)             */
/* ------------------------------------------------------------------ */

let firestoreDbPromise = null;

/**
 * Lazily loads the Firebase SDK from CDN and initializes Firestore.
 * Returns null (never throws) if config isn't filled in or the SDK/
 * network fails to load, so callers can fall back to static data.
 */
function getFirestoreDb() {
  if (firestoreDbPromise) return firestoreDbPromise;

  firestoreDbPromise = (async () => {
    if (!isFirebaseConfigured()) {
      // Config still has placeholder values — don't even try to load
      // the SDK. This is the expected state until the user sets up
      // their own Firebase project.
      return null;
    }

    try {
      const [{ initializeApp }, firestoreModule] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js'),
      ]);

      const app = initializeApp(firebaseConfig);
      const db = firestoreModule.getFirestore(app);
      return { db, firestoreModule };
    } catch (err) {
      console.warn('[firebase-data] Could not initialize Firebase — falling back to static content.', err);
      return null;
    }
  })();

  return firestoreDbPromise;
}

/**
 * Generic collection fetch helper. Always resolves — returns `null`
 * on any failure (never throws) so callers can fall back cleanly.
 */
async function fetchCollectionSafe(collectionName, orderField) {
  const ctx = await getFirestoreDb();
  if (!ctx) return null;

  try {
    const { db, firestoreModule } = ctx;
    const { collection, getDocs, query, orderBy } = firestoreModule;

    const colRef = collection(db, collectionName);
    const q = orderField ? query(colRef, orderBy(orderField)) : colRef;
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null; // treat "no documents yet" as "use fallback"

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.warn(`[firebase-data] Failed to fetch "${collectionName}" — falling back to static content.`, err);
    return null;
  }
}

/**
 * Fetches the single "profile" document. Always resolves — returns
 * `null` on any failure so the caller falls back cleanly.
 */
async function fetchProfileSafe() {
  const ctx = await getFirestoreDb();
  if (!ctx) return null;

  try {
    const { db, firestoreModule } = ctx;
    const { collection, getDocs, limit, query } = firestoreModule;

    const colRef = collection(db, 'profile');
    const snapshot = await getDocs(query(colRef, limit(1)));
    if (snapshot.empty) return null;

    return snapshot.docs[0].data();
  } catch (err) {
    console.warn('[firebase-data] Failed to fetch "profile" — falling back to static content.', err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 4. NORMALIZERS — map raw Firestore docs into the shape script.js    */
/*    already expects (same field names the static arrays used)       */
/* ------------------------------------------------------------------ */

function normalizeProject(doc) {
  const tags = Array.isArray(doc.tags) ? doc.tags : [];
  return {
    id: doc.id,
    title: doc.title || 'Untitled project',
    shortDesc: doc.shortDescription || '',
    fullDesc: doc.fullDescription || doc.shortDescription || '',
    stage: tags[0] || 'scrape',
    tech: Array.isArray(doc.techStack) ? doc.techStack : [],
    github: doc.githubUrl || '',
    live: doc.liveUrl || '',
    download: doc.downloadUrl || '',
    featured: Boolean(doc.featured),
    gallery: Array.isArray(doc.images) ? doc.images : [],
  };
}

function normalizeSkillGroup(doc) {
  return {
    group: doc.group || 'Misc',
    stage: doc.stage || 'scrape',
    color: doc.color || '#00E5FF',
    tags: Array.isArray(doc.tags) ? doc.tags : [],
  };
}

function normalizeExperience(doc) {
  return {
    hash: doc.hash || '0000000',
    date: doc.date || '',
    title: doc.title || '',
    role: doc.role || '',
    desc: doc.desc || '',
    branch: doc.branch || 'main',
    stage: doc.stage || 'automate',
  };
}

function normalizeBlogPost(doc) {
  return {
    timestamp: doc.timestamp || '',
    level: doc.level || 'INFO',
    title: doc.title || '',
    desc: doc.desc || '',
  };
}

function normalizeProfile(doc) {
  return {
    name: doc.name || '',
    bio: doc.bio || '',
    photoUrl: doc.photoUrl || '',
    contact: {
      email: (doc.contact && doc.contact.email) || '',
      github: (doc.contact && doc.contact.github) || '',
      linkedin: (doc.contact && doc.contact.linkedin) || '',
    },
  };
}

/* ------------------------------------------------------------------ */
/* 5. PUBLIC GETTERS — used by script.js                               */
/* ------------------------------------------------------------------ */

export async function getProjects() {
  const docs = await fetchCollectionSafe('projects', 'order');
  if (!docs) return [];
  return docs.map(normalizeProject);
}

export async function getSkills() {
  const docs = await fetchCollectionSafe('skills', 'order');
  if (!docs) return [];
  return docs.map(normalizeSkillGroup);
}

export async function getExperience() {
  const docs = await fetchCollectionSafe('experience', 'order');
  if (!docs) return [];
  return docs.map(normalizeExperience);
}

export async function getBlogPosts() {
  const docs = await fetchCollectionSafe('blogPosts', 'order');
  if (!docs) return [];
  return docs.map(normalizeBlogPost);
}

export async function getProfile() {
  const doc = await fetchProfileSafe();
  if (!doc) return EMPTY_PROFILE;
  return normalizeProfile(doc);
}
