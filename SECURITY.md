# Security Notes for This Portfolio Site

This site uses Firebase (Firestore) as a public content backend. This
document explains, in plain terms, the three things you need to do to
run it safely, and why the setup is safe in the first place.

---

## 1. Deploying `firestore.rules` in the Firebase Console

You don't need the Firebase CLI or any build tooling — you can paste the
rules directly in the console.

1. Go to [https://console.firebase.google.com/](https://console.firebase.google.com/)
   and open your project.
2. In the left sidebar, click **Build → Firestore Database**.
3. Click the **Rules** tab at the top of the Firestore Database page.
4. You'll see a text editor with the current rules. Select all of the
   existing text and delete it.
5. Open `firestore.rules` from this project folder, copy its entire
   contents, and paste it into the console's rules editor.
6. Click **Publish**. Changes take effect within a minute or two.

**How to verify it worked:** in the Rules tab, use the built-in
**Rules Playground** (usually a "Simulator" button near the top) to
simulate a `get` request on a document in `projects` with
"Authenticated" turned off — it should be **Allowed**. Then simulate a
`write` request the same way — it should be **Denied**. Turn
"Authenticated" on and try the write again — it should be **Allowed**.

### About the admin account

The rules file's default `isAdmin()` check only asks "is this request
signed in to Firebase Authentication at all?" That's enough as long as
you never create additional Firebase Auth users for this project. To
create your one admin account:

1. Firebase Console → **Build → Authentication → Get started**.
2. Enable a sign-in method (Email/Password is simplest).
3. Add yourself as a user under the **Users** tab.
4. Copy your **User UID** from that same Users table.
5. Open `firestore.rules`, uncomment the `isAdminUid()` function, paste
   your UID in place of the placeholder string, and switch the
   collection rules to call `isAdminUid()` instead of `isAdmin()` (the
   file has step-by-step comments for this — look for section 2).
6. Re-publish the rules (repeat steps 4–6 above).

This second step is optional but recommended — it's the difference
between "any signed-in user can edit my content" and "only I can."

---

## 2. Restricting the Firebase API Key by HTTP Referrer

This stops other websites from using your API key to make requests
that look like they're coming from your project, even though your
Firestore rules already control what those requests are allowed to do.

1. Go to [https://console.cloud.google.com/](https://console.cloud.google.com/)
   and make sure the project selector (top bar) shows the **same
   project** as your Firebase project (they share the same underlying
   Google Cloud project — same project ID).
2. In the left sidebar, go to **APIs & Services → Credentials**.
3. Under **API Keys**, find the key that matches the `apiKey` value in
   your `js/firebase-config.js` (it's usually labeled something like
   "Browser key (auto created by Firebase)").
4. Click on the key name to open its settings.
5. Under **Application restrictions**, choose **Websites** (this is
   the option Google Cloud calls "HTTP referrers").
6. Click **Add** and add each pattern you need, for example:
   - `https://yourusername.github.io/*`
   - `https://yourusername.github.io/your-repo-name/*`
   - `http://localhost:*` (optional — only if you want local testing
     against the real Firebase project instead of the fallback data)
7. Click **Save**.

After this, the key will only work when the request's referrer header
matches one of those patterns — so even if someone copies your key out
of your public GitHub repo, it won't function from their own site.

**Note:** it can take a few minutes for a new restriction to propagate.
If your own site briefly shows the fallback content right after saving,
that's expected — wait a few minutes and reload.

---

## 3. Why a Public Firebase Config Isn't a "Secret"

It's natural to feel uneasy about committing `js/firebase-config.js`
(with real values) to a public GitHub repository. Here's why that's
fine for this project:

- **The config identifies your project, it doesn't grant access to it.**
  Values like `apiKey`, `projectId`, and `appId` are more like a
  postal address than a password — they tell the Firebase SDK *which*
  project to talk to. They are visible in the network requests of
  *any* website using Firebase's client SDKs, including large
  production apps, because the browser has to send them somewhere.
- **Real access control lives in two other places, both covered
  above:**
  1. **Firestore Security Rules** (`firestore.rules`) — these run on
     Google's servers, not in the browser, and decide what any given
     request is actually allowed to read or write, regardless of what
     API key was used to get there. This is the layer that actually
     protects your data.
  2. **API key restrictions** (HTTP referrers, step 2 above) — this
     limits *which websites* the key can be used from at all. It's a
     defense-in-depth measure, not the primary one.
- **What would be a real secret** — and must never be committed to a
  public repo — are things like: a Firebase **Admin SDK** service
  account JSON key (used for privileged server-side/backend access,
  not used anywhere in this static site), database passwords, or
  personal API keys for third-party paid services. This project uses
  none of those; it only uses the public, client-side web config.

**Bottom line:** treat `firestore.rules` as your actual lock, and the
API key restriction as your deadbolt. The config values themselves are
just the address on the door — publishing them is normal and expected
for Firebase web apps.
