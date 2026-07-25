# Portfolio Site

A personal portfolio site — "the pipeline" themed around scrape → analyze →
automate → ML → ship. Built as static HTML/CSS/JS (no framework, no build
step) with Firebase Firestore as a content backend, so every section
(projects, skills, experience, blog, reviews) is editable from a private
admin panel instead of hard-coded in the HTML.

Live at: `https://ashfiq-dev.github.io`

## Features

- **Pipeline hero** — animated SVG diagram (Scrape/Analyze/Automate/ML/Ship)
  that doubles as a project filter
- **Projects** — filterable grid with a detail modal (image gallery,
  rich-text description, tech badges, links)
- **Skills, Experience ("git log"), Blog ("stdout.log")** — all
  Firestore-driven
- **Reviews** — visitors can leave a review from the site; it's held as
  "pending" until approved from the admin panel, then shows publicly
- **Contact form** — sends via Web3Forms, no backend required
- **Admin panel** (`/admin`) — Firebase Authentication–gated dashboard to
  manage every collection above (profile, projects, skills, experience,
  blog, reviews) and upload images via Cloudinary
- **Light/dark theme**, fully responsive, accessible (focus traps, ARIA
  labels, reduced-motion support)

## Tech stack

- Vanilla HTML/CSS/JS (ES modules, no bundler)
- Firebase Firestore — content storage
- Firebase Authentication — admin login
- Cloudinary — image uploads from the admin panel
- Web3Forms — contact form email delivery
- Hosted on GitHub Pages

## Project structure

```
index.html              Main site
css/style.css            Main site styles
js/
  firebase-config.js      Your Firebase project settings (see below)
  firebase-data.js         Public, read-only Firestore data layer
  script.js                 All page logic (rendering, filtering, modal, forms)
admin/
  index.html               Admin panel (Firebase Auth–gated)
  css/admin.css
  js/
    admin-auth.js          Firebase Authentication
    admin-data.js            Firestore reads/writes for the admin panel
    admin-cloudinary.js       Image upload helper
    admin-ui.js                Admin dashboard UI (tabs, forms, lists)
    cloudinary-config.js      Your Cloudinary settings (see below)
firestore.rules          Firestore security rules (read js/firebase-data.js
                          and admin-data.js comments for the exact schema)
SECURITY.md              Step-by-step: deploying rules, creating the admin
                          account, and locking rules down to your UID
```

## Setup

1. **Firebase**
   - Create a project at [console.firebase.google.com](https://console.firebase.google.com/)
   - Enable **Firestore Database** and **Authentication** (Email/Password)
   - Add a Web app, copy the config values into `js/firebase-config.js`
   - Create your one admin user under Authentication → Users
   - Paste `firestore.rules` into Firestore → Rules and publish — see
     `SECURITY.md` for the full walkthrough, including locking write
     access to your specific admin UID

2. **Cloudinary** (for image uploads in the admin panel)
   - Create an unsigned upload preset
   - Fill in `admin/js/cloudinary-config.js` with your cloud name and preset

3. **Contact form**
   - Get a free access key from [web3forms.com](https://web3forms.com/)
   - Drop it into the `WEB3FORMS_ACCESS_KEY` constant in `js/script.js`

4. **Run locally** — no build step, just serve the folder statically, e.g.:
   ```bash
   npx serve .
   ```

5. **Deploy** — push to GitHub and enable **Pages** (Settings → Pages).
   Either "Deploy from a branch" (simplest) or a GitHub Actions workflow
   both work since this is a static site.

## Adding content

Everything visitors see (profile, projects, skills, experience, blog
posts, reviews) is added and edited from `/admin`, not by touching the
HTML. New reviews submitted from the public site land as "pending" and
only appear once approved from the Reviews tab in `/admin`.
