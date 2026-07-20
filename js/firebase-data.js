/* ==========================================================================
   FIREBASE DATA LAYER
   ==========================================================================

   This module is the ONLY place that talks to Firestore. It fetches:
     - profile      (single doc)
     - projects     (collection)
     - skills       (collection)
     - experience   (collection, rendered as a commit log)
     - blogPosts    (collection, rendered as stdout.log)

   Design goal: script.js should never crash or show a blank page.
   Every exported getter below ALWAYS resolves with usable data — either
   live Firestore data, or the built-in static/dummy fallback — and never
   rejects. Callers don't need try/catch.

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
/* 2. STATIC / DUMMY FALLBACK DATA                                     */
/* ------------------------------------------------------------------ */
/* Used whenever Firestore is unreachable OR firebase-config.js still
   has placeholder values. Keeps the exact same placeholder content the
   static site shipped with, so nothing changes until you fill in your
   own Firebase project and add real documents. */

const FALLBACK_PROFILE = {
  name: 'yourname',
  bio:
    "Hi, I'm yourname. I'm a Python developer who lives at the intersection of data and automation — building scrapers that collect it, pipelines that analyze it, scripts that automate it, and apps that ship it to real users. I care about clean code, reliable systems, and turning messy raw data into something useful. Currently open to freelance work and full-time opportunities. This bio is placeholder text — edit me in Firestore or here.",
  photoUrl: '',
  contact: {
    email: 'yourname@example.com',
    github: 'https://github.com/yourname',
    linkedin: 'https://linkedin.com/in/yourname',
  },
};

const FALLBACK_PROJECTS = [
  {
    id: 'price-tracker',
    title: 'E-Commerce Price Tracker',
    shortDesc: 'Scrapes product listings daily and alerts on price drops.',
    fullDesc:
      'A scheduled scraper that polls a set of product pages every day, ' +
      'stores price history in SQLite, and sends an email alert when a ' +
      'tracked item drops below a target price. Built to survive layout ' +
      'changes with resilient CSS selectors and automatic retries.',
    stage: 'scrape',
    tech: ['Python', 'BeautifulSoup', 'Requests', 'SQLite', 'Cron'],
    github: 'https://github.com/yourname/price-tracker',
    live: '',
    download: '',
    featured: true,
    gallery: [
      'Dashboard showing tracked items and price history chart',
      'Email alert sample for a price drop',
    ],
  },
  {
    id: 'sales-dashboard',
    title: 'Regional Sales Dashboard',
    shortDesc: 'Cleans messy CSV exports into a live Pandas-powered dashboard.',
    fullDesc:
      'Ingests weekly CSV exports from a legacy POS system, normalizes ' +
      'inconsistent column names and date formats, then generates a set ' +
      'of interactive charts summarizing revenue by region and product ' +
      'category. Includes a Jupyter notebook for ad-hoc analysis.',
    stage: 'analyze',
    tech: ['Pandas', 'NumPy', 'Matplotlib', 'Jupyter'],
    github: 'https://github.com/yourname/sales-dashboard',
    live: 'https://yourname.github.io/sales-dashboard-demo/',
    download: '',
    featured: true,
    gallery: [
      'Revenue-by-region bar chart',
      'Category breakdown pie chart',
      'Notebook screenshot with cleaning steps',
    ],
  },
  {
    id: 'invoice-bot',
    title: 'Invoice Automation Bot',
    shortDesc: 'Generates and emails monthly invoices from a Google Sheet.',
    fullDesc:
      'A small FastAPI service plus scheduled job that reads client and ' +
      'line-item data from a Google Sheet, renders a PDF invoice from an ' +
      'HTML template, and emails it automatically on the first of every ' +
      'month. Deployed with Docker and triggered by GitHub Actions.',
    stage: 'automate',
    tech: ['FastAPI', 'Docker', 'GitHub Actions', 'REST APIs'],
    github: 'https://github.com/yourname/invoice-bot',
    live: '',
    download: '',
    featured: true,
    gallery: ['Generated invoice PDF sample', 'GitHub Actions run log'],
  },
  {
    id: 'desktop-notes',
    title: 'Offline Notes Desktop App',
    shortDesc: 'A lightweight PyQt notes app with local SQLite storage.',
    fullDesc:
      'A distraction-free notes application for Windows and Linux, built ' +
      'with PyQt for the interface and SQLite for local-only storage. ' +
      'Supports markdown preview, tagging, and full-text search across ' +
      'all notes. Packaged into a standalone executable for distribution.',
    stage: 'ship',
    tech: ['PyQt', 'SQLite', 'Git'],
    github: 'https://github.com/yourname/desktop-notes',
    live: '',
    download: 'https://github.com/yourname/desktop-notes/releases/latest',
    featured: false,
    gallery: [
      'Main notes list view',
      'Markdown preview pane',
      'Full-text search in action',
    ],
  },
  {
    id: 'weather-cli',
    title: 'Weather CLI + API Wrapper',
    shortDesc: 'A tiny CLI and Python package wrapping a public weather API.',
    fullDesc:
      'A pip-installable package that wraps a public weather API with ' +
      'friendly Python bindings, response caching, and a command-line ' +
      'interface for quick lookups from the terminal. Published with a ' +
      'full test suite and continuous integration.',
    stage: 'scrape',
    tech: ['Python', 'Requests', 'Click'],
    github: 'https://github.com/yourname/weather-cli',
    live: '',
    download: '',
    featured: false,
    gallery: ['Terminal output for a sample lookup'],
  },
  {
    id: 'mobile-habit-tracker',
    title: 'Habit Tracker Mobile App',
    shortDesc: 'A cross-platform habit tracker built with React Native.',
    fullDesc:
      'A simple daily habit tracker for iOS and Android, built with React ' +
      'Native and a lightweight local database. Includes streak tracking, ' +
      'daily reminders, and a weekly summary screen. Backend automation ' +
      'handles nightly analytics rollups.',
    stage: 'ship',
    tech: ['React Native', 'SQLite'],
    github: '',
    live: '',
    download: 'https://example.com/habit-tracker.apk',
    featured: false,
    gallery: ['Home screen with streaks', 'Weekly summary screen'],
  },
];

const FALLBACK_SKILLS = [
  { group: 'Scrape', stage: 'scrape', color: '#00E5FF', tags: ['Python', 'BeautifulSoup', 'Scrapy', 'Selenium', 'Playwright', 'Requests'] },
  { group: 'Analyze', stage: 'analyze', color: '#FF3EA5', tags: ['Pandas', 'NumPy', 'SQL', 'Matplotlib', 'Jupyter', 'PostgreSQL'] },
  { group: 'Automate', stage: 'automate', color: '#FFB020', tags: ['FastAPI', 'Flask', 'Cron', 'Docker', 'REST APIs', 'GitHub Actions'] },
  { group: 'Ship', stage: 'ship', color: '#7B5CFF', tags: ['PyQt', 'Electron', 'Kivy', 'React Native', 'SQLite', 'Git'] },
];

const FALLBACK_EXPERIENCE = [
  {
    hash: 'a1b2c3d',
    date: '2024 — Present',
    title: 'Freelance Python Automation Developer',
    role: 'Self-employed',
    desc:
      'Building scrapers, ETL pipelines, and internal tooling for small ' +
      'businesses. Delivered 12+ automation projects covering data ' +
      'collection, reporting, and workflow automation.',
    branch: 'main',
    stage: 'automate',
  },
  {
    hash: 'e4f5a6b',
    date: '2022 — 2024',
    title: 'Data Engineer',
    role: 'Example Analytics Co.',
    desc:
      'Owned ingestion pipelines for third-party data sources, migrated ' +
      'batch jobs to scheduled Airflow DAGs, and cut nightly processing ' +
      'time by roughly 40% through query and pipeline optimization.',
    branch: 'feature/pipelines',
    stage: 'analyze',
  },
  {
    hash: '9c8d7e6',
    date: '2020 — 2022',
    title: 'Junior Backend Developer',
    role: 'Example Startup Inc.',
    desc:
      'Built and maintained REST APIs powering the core product, wrote ' +
      'the first automated test suite for the service, and set up CI/CD ' +
      'with GitHub Actions.',
    branch: 'feature/api-v2',
    stage: 'scrape',
  },
  {
    hash: '5f4e3d2',
    date: '2019 — 2020',
    title: 'Computer Science, B.Sc.',
    role: 'Example University',
    desc:
      'Graduated with a focus on data structures, algorithms, and ' +
      'databases. Capstone project: a web scraper and dashboard for ' +
      'tracking local housing market trends.',
    branch: 'main',
    stage: 'ship',
  },
];

const FALLBACK_BLOG_POSTS = [
  {
    timestamp: '2026-06-02 09:14:03',
    level: 'INFO',
    title: 'Rewriting a scraper to survive site redesigns',
    desc:
      'Notes on moving from brittle CSS selectors to a more resilient, ' +
      'attribute-based scraping strategy after a client site redesign ' +
      'broke a year-old scraper overnight.',
  },
  {
    timestamp: '2026-04-18 14:02:41',
    level: 'OK',
    title: 'Shipped v2.0 of the invoice automation bot',
    desc:
      'Added PDF templating, retry logic for flaky SMTP providers, and a ' +
      'dry-run mode for testing changes without sending real emails.',
  },
  {
    timestamp: '2026-02-27 11:30:10',
    level: 'INFO',
    title: 'Pandas groupby patterns I keep reaching for',
    desc:
      'A running list of groupby + agg patterns that come up constantly ' +
      'in reporting work, collected mostly so future-me stops re-deriving ' +
      'them from scratch.',
  },
  {
    timestamp: '2025-12-05 08:47:55',
    level: 'OK',
    title: 'Cut nightly ETL runtime by 40%',
    desc:
      'A short write-up on profiling a slow nightly job, batching writes, ' +
      'and replacing a Python loop with a vectorized Pandas operation.',
  },
  {
    timestamp: '2025-10-11 16:20:37',
    level: 'INFO',
    title: 'Packaging a PyQt app for distribution',
    desc:
      'Notes on packaging a desktop notes app into standalone executables ' +
      'for Windows and Linux, including the gotchas around bundled fonts ' +
      'and icons.',
  },
];

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
    name: doc.name || FALLBACK_PROFILE.name,
    bio: doc.bio || FALLBACK_PROFILE.bio,
    photoUrl: doc.photoUrl || '',
    contact: {
      email: (doc.contact && doc.contact.email) || FALLBACK_PROFILE.contact.email,
      github: (doc.contact && doc.contact.github) || FALLBACK_PROFILE.contact.github,
      linkedin: (doc.contact && doc.contact.linkedin) || FALLBACK_PROFILE.contact.linkedin,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 5. PUBLIC GETTERS — used by script.js                               */
/* ------------------------------------------------------------------ */

export async function getProjects() {
  const docs = await fetchCollectionSafe('projects', 'order');
  if (!docs) return FALLBACK_PROJECTS;
  return docs.map(normalizeProject);
}

export async function getSkills() {
  const docs = await fetchCollectionSafe('skills', 'order');
  if (!docs) return FALLBACK_SKILLS;
  return docs.map(normalizeSkillGroup);
}

export async function getExperience() {
  const docs = await fetchCollectionSafe('experience', 'order');
  if (!docs) return FALLBACK_EXPERIENCE;
  return docs.map(normalizeExperience);
}

export async function getBlogPosts() {
  const docs = await fetchCollectionSafe('blogPosts', 'order');
  if (!docs) return FALLBACK_BLOG_POSTS;
  return docs.map(normalizeBlogPost);
}

export async function getProfile() {
  const doc = await fetchProfileSafe();
  if (!doc) return FALLBACK_PROFILE;
  return normalizeProfile(doc);
}
