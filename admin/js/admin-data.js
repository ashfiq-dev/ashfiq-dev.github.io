/* ==========================================================================
   ADMIN DATA LAYER
   ==========================================================================
   The ONLY place in /admin that talks to Firestore for reading and writing
   content. Mirrors the field names and collection schema documented in
   js/firebase-data.js (the main site's read-only data layer) exactly, so
   nothing written here ever breaks the public site's rendering.

   Every exported function returns a plain { ok, data?, message? } result
   and never throws — admin-ui.js can always show a clean success/error
   toast without try/catch scattered everywhere.

   Uses the Firebase v9+ modular SDK via CDN imports, matching the rest
   of the project (no npm, no build step, runs as-is on GitHub Pages).
   ========================================================================== */

import { firebaseConfig, isFirebaseConfigured } from '../../js/firebase-config.js';

/* ------------------------------------------------------------------ */
/* 1. COLLECTION SCHEMA (must match js/firebase-data.js exactly)       */
/* ------------------------------------------------------------------ */
/*
  profile (collection "profile", single doc, fixed id "main")
    - name, bio, photoUrl, contact: { email, github, linkedin }

  projects (collection "projects")
    - title, shortDescription, fullDescription, tags: array<string>,
      techStack: array<string>, images: array<string>, githubUrl,
      liveUrl, featured: boolean, order: number

  skills (collection "skills")
    - group, stage, color, tags: array<string>, order: number

  experience (collection "experience")
    - hash, date, title, role, desc, branch, stage, order: number

  blogPosts (collection "blogPosts")
    - timestamp, level, title, desc, order: number
*/

const PROFILE_DOC_ID = 'main';

let firestoreCtxPromise = null;

function getFirestoreCtx() {
  if (firestoreCtxPromise) return firestoreCtxPromise;

  firestoreCtxPromise = (async () => {
    if (!isFirebaseConfigured()) return null;

    try {
      const [{ initializeApp, getApps, getApp }, firestoreModule] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js'),
      ]);

      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const db = firestoreModule.getFirestore(app);
      return { db, firestoreModule };
    } catch (err) {
      console.warn('[admin-data] Failed to initialize Firestore.', err);
      return null;
    }
  })();

  return firestoreCtxPromise;
}

function notConfiguredResult() {
  return { ok: false, message: 'Firebase isn\u2019t configured yet. Check js/firebase-config.js.' };
}

/* ------------------------------------------------------------------ */
/* 2. GENERIC COLLECTION HELPERS (projects, skills, experience, blog)  */
/* ------------------------------------------------------------------ */

/**
 * Fetches every document in a collection, ordered by "order" when present.
 * Returns { ok: true, data: [...] } or { ok: false, message }.
 */
async function listDocs(collectionName) {
  const ctx = await getFirestoreCtx();
  if (!ctx) return notConfiguredResult();

  try {
    const { db, firestoreModule } = ctx;
    const { collection, getDocs, query, orderBy } = firestoreModule;

    let snapshot;
    try {
      snapshot = await getDocs(query(collection(db, collectionName), orderBy('order')));
    } catch {
      // "order" may not exist on older docs — fall back to unordered fetch
      // rather than failing the whole list.
      snapshot = await getDocs(collection(db, collectionName));
    }

    const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { ok: true, data };
  } catch (err) {
    console.warn(`[admin-data] Failed to list "${collectionName}".`, err);
    return { ok: false, message: 'Couldn\u2019t load this list \u2014 try again.' };
  }
}

/**
 * Creates a new document in a collection. If fields.order is not set,
 * it's assigned as (current doc count), so new items sort to the end.
 */
async function createDoc(collectionName, fields) {
  const ctx = await getFirestoreCtx();
  if (!ctx) return notConfiguredResult();

  try {
    const { db, firestoreModule } = ctx;
    const { collection, addDoc, getDocs } = firestoreModule;

    let order = fields.order;
    if (typeof order !== 'number') {
      const snapshot = await getDocs(collection(db, collectionName));
      order = snapshot.size;
    }

    const ref = await addDoc(collection(db, collectionName), { ...fields, order });
    return { ok: true, data: { id: ref.id } };
  } catch (err) {
    console.warn(`[admin-data] Failed to create doc in "${collectionName}".`, err);
    return { ok: false, message: 'Couldn\u2019t save \u2014 try again.' };
  }
}

/**
 * Updates an existing document by id with the given fields (merge, not
 * overwrite — only the passed fields are touched).
 */
async function updateDocById(collectionName, id, fields) {
  const ctx = await getFirestoreCtx();
  if (!ctx) return notConfiguredResult();

  try {
    const { db, firestoreModule } = ctx;
    const { doc, updateDoc } = firestoreModule;

    await updateDoc(doc(db, collectionName, id), fields);
    return { ok: true };
  } catch (err) {
    console.warn(`[admin-data] Failed to update doc "${id}" in "${collectionName}".`, err);
    return { ok: false, message: 'Couldn\u2019t save \u2014 try again.' };
  }
}

/**
 * Deletes a document by id.
 */
async function deleteDocById(collectionName, id) {
  const ctx = await getFirestoreCtx();
  if (!ctx) return notConfiguredResult();

  try {
    const { db, firestoreModule } = ctx;
    const { doc, deleteDoc } = firestoreModule;

    await deleteDoc(doc(db, collectionName, id));
    return { ok: true };
  } catch (err) {
    console.warn(`[admin-data] Failed to delete doc "${id}" in "${collectionName}".`, err);
    return { ok: false, message: 'Couldn\u2019t delete \u2014 try again.' };
  }
}

/* ------------------------------------------------------------------ */
/* 3. PROFILE (single document, fixed id)                              */
/* ------------------------------------------------------------------ */

export async function getProfileDoc() {
  const ctx = await getFirestoreCtx();
  if (!ctx) return notConfiguredResult();

  try {
    const { db, firestoreModule } = ctx;
    const { doc, getDoc } = firestoreModule;

    const snap = await getDoc(doc(db, 'profile', PROFILE_DOC_ID));
    return { ok: true, data: snap.exists() ? snap.data() : null };
  } catch (err) {
    console.warn('[admin-data] Failed to load profile.', err);
    return { ok: false, message: 'Couldn\u2019t load your profile \u2014 try again.' };
  }
}

export async function saveProfileDoc(fields) {
  const ctx = await getFirestoreCtx();
  if (!ctx) return notConfiguredResult();

  try {
    const { db, firestoreModule } = ctx;
    const { doc, setDoc } = firestoreModule;

    await setDoc(doc(db, 'profile', PROFILE_DOC_ID), fields, { merge: true });
    return { ok: true };
  } catch (err) {
    console.warn('[admin-data] Failed to save profile.', err);
    return { ok: false, message: 'Couldn\u2019t save \u2014 try again.' };
  }
}

/* ------------------------------------------------------------------ */
/* 4. PROJECTS                                                         */
/* ------------------------------------------------------------------ */

export const listProjects = () => listDocs('projects');
export const createProject = (fields) => createDoc('projects', fields);
export const updateProject = (id, fields) => updateDocById('projects', id, fields);
export const deleteProject = (id) => deleteDocById('projects', id);

/* ------------------------------------------------------------------ */
/* 5. SKILLS                                                           */
/* ------------------------------------------------------------------ */

export const listSkillGroups = () => listDocs('skills');
export const createSkillGroup = (fields) => createDoc('skills', fields);
export const updateSkillGroup = (id, fields) => updateDocById('skills', id, fields);
export const deleteSkillGroup = (id) => deleteDocById('skills', id);

/* ------------------------------------------------------------------ */
/* 6. EXPERIENCE                                                       */
/* ------------------------------------------------------------------ */

export const listExperience = () => listDocs('experience');
export const createExperience = (fields) => createDoc('experience', fields);
export const updateExperience = (id, fields) => updateDocById('experience', id, fields);
export const deleteExperience = (id) => deleteDocById('experience', id);

/* ------------------------------------------------------------------ */
/* 7. BLOG POSTS                                                       */
/* ------------------------------------------------------------------ */

export const listBlogPosts = () => listDocs('blogPosts');
export const createBlogPost = (fields) => createDoc('blogPosts', fields);
export const updateBlogPost = (id, fields) => updateDocById('blogPosts', id, fields);
export const deleteBlogPost = (id) => deleteDocById('blogPosts', id);
