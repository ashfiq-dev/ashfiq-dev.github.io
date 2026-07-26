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
    - tags: array<string>          // e.g. ["scrape","automate"] — a project
                                    // can belong to more than one stage; it
                                    // matches every stage filter it's tagged
                                    // with (first tag is still used as the
                                    // single "primary" accent color)
    - techStack: array<string>
    - images: array<string>        // URLs or short captions
    - githubUrl: string
    - liveUrl: string
    - downloadUrl: string
    - featured: boolean
    - order: number (optional, for sorting)

  skills (collection "skills")
    - group: string                // "Scrape" | "Analyze" | "Automate" | "ML" | "Ship"
    - stage: string                // "scrape" | "analyze" | "automate" | "ml" | "ship"
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

  reviews (collection "reviews") — client reviews, moderated before
           they're publicly visible
    - name: string
    - role: string                 // role/company, optional
    - rating: number                // 1-5
    - text: string
    - status: string                // "pending" | "approved" — only
                                     // "approved" docs are shown on the
                                     // public site (see getReviews())
    - createdAt: Firestore Timestamp (server-generated on submit)
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
    const { collection, getDocs, getDocsFromServer, query, orderBy } = firestoreModule;
    // getDocsFromServer forces a real network read from Firestore and
    // skips its local IndexedDB/memory cache, so admin-panel edits show
    // up immediately for visitors instead of a stale cached snapshot.
    const fetchDocs = getDocsFromServer || getDocs;

    const colRef = collection(db, collectionName);
    const q = orderField ? query(colRef, orderBy(orderField)) : colRef;
    const snapshot = await fetchDocs(q);

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
    const { collection, getDocs, getDocsFromServer, limit, query } = firestoreModule;
    const fetchDocs = getDocsFromServer || getDocs;

    const colRef = collection(db, 'profile');
    const snapshot = await fetchDocs(query(colRef, limit(1)));
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
  const rawTags = Array.isArray(doc.tags) ? doc.tags : [];
  const tags = rawTags.length ? rawTags : ['scrape'];
  return {
    id: doc.id,
    title: doc.title || 'Untitled project',
    shortDesc: doc.shortDescription || '',
    fullDesc: doc.fullDescription || doc.shortDescription || '',
    // `stage` stays as the primary (first) tag — used wherever a single
    // accent color is needed. `tags` carries the full list so a project
    // that spans multiple categories can be filtered/matched under all
    // of them instead of only its first tag.
    stage: tags[0],
    tags,
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

function normalizeReview(doc) {
  return {
    id: doc.id,
    name: doc.name || 'Anonymous',
    role: doc.role || '',
    rating: Math.min(5, Math.max(1, Number(doc.rating) || 5)),
    text: doc.text || '',
    createdAtMs: doc.createdAt && typeof doc.createdAt.toMillis === 'function'
      ? doc.createdAt.toMillis()
      : 0,
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

/**
 * Fetches only APPROVED reviews for public display. Filtered with a
 * Firestore `where`, not `orderBy` — combining where+orderBy on
 * different fields needs a composite index set up in the Firebase
 * console, which we'd rather not require just to ship a reviews
 * section. Sorting newest-first happens here instead, client-side.
 */
export async function getReviews() {
  const ctx = await getFirestoreDb();
  if (!ctx) return [];

  try {
    const { db, firestoreModule } = ctx;
    const { collection, getDocs, getDocsFromServer, query, where } = firestoreModule;
    const fetchDocs = getDocsFromServer || getDocs;

    const colRef = collection(db, 'reviews');
    const snapshot = await fetchDocs(query(colRef, where('status', '==', 'approved')));
    if (snapshot.empty) return [];

    return snapshot.docs
      .map((doc) => normalizeReview({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  } catch (err) {
    console.warn('[firebase-data] Failed to fetch "reviews" — showing none.', err);
    return [];
  }
}

/**
 * Public "leave a review" submission. Always lands as status:"pending"
 * — see firestore.rules, which enforces that server-side too so this
 * can't be bypassed from devtools. Never shows up on the site until
 * the admin approves it from /admin.
 */
export async function submitReview({ name, role, rating, text }) {
  const ctx = await getFirestoreDb();
  if (!ctx) {
    return { ok: false, message: 'Reviews aren\u2019t available right now \u2014 please try again later.' };
  }

  try {
    const { db, firestoreModule } = ctx;
    const { collection, addDoc, serverTimestamp } = firestoreModule;

    const docRef = await addDoc(collection(db, 'reviews'), {
      name: (name || '').trim().slice(0, 80),
      role: (role || '').trim().slice(0, 100),
      rating: Math.min(5, Math.max(1, Math.round(Number(rating)) || 5)),
      text: (text || '').trim().slice(0, 1000),
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return { ok: true, id: docRef.id };
  } catch (err) {
    console.warn('[firebase-data] Failed to submit review.', err);
    return { ok: false, message: 'Couldn\u2019t submit your review \u2014 please try again.' };
  }
}