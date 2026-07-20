/* ==========================================================================
   CLOUDINARY CONFIG — EDIT ME
   ==========================================================================

   This file holds the connection settings the ADMIN PANEL (/admin) uses to
   upload images directly from the browser to Cloudinary, using an
   UNSIGNED upload preset. There is no API secret anywhere in this file
   or anywhere else in this repo — that is intentional. Unsigned uploads
   are designed to be safe to trigger from public, client-side code as
   long as the preset itself is locked down (see steps below).

   --------------------------------------------------------------------------
   HOW TO SET THIS UP (Cloudinary dashboard)
   --------------------------------------------------------------------------
   1. Go to https://cloudinary.com/ and create a free account (or log in
      to an existing one).
   2. On your Cloudinary Dashboard home page, copy your "Cloud name"
      (shown near the top). Paste it into CLOUDINARY_CLOUD_NAME below.
   3. Go to Settings (gear icon) → "Upload" tab → scroll to
      "Upload presets" → click "Add upload preset".
   4. Set the following:
        - Signing Mode:      UNSIGNED   (required — this is what lets the
                              admin panel upload without exposing a secret)
        - Preset name:       choose something like "portfolio-admin"
                              (you'll paste this into
                              CLOUDINARY_UPLOAD_PRESET below)
        - Folder:             "portfolio"   (recommended — keeps all
                              uploads from this site in one place, so you
                              can find/delete them easily later)
   5. Still on the preset's settings page, click into "Upload Manipulations
      and Restrictions" (or the "Upload Control" section, naming varies
      slightly by Cloudinary UI version) and set:
        - Allowed formats:   jpg, png, webp
        - Max file size:     5000000  (5 MB — adjust if you want, but
                              keep a limit so nobody can flood your
                              account with huge files)
        - Max image width:   2000  (optional, but recommended — Cloudinary
                              will downscale anything larger on upload)
   6. Save the preset.
   7. Copy the Cloud name and preset name into the two constants below.

   --------------------------------------------------------------------------
   IS IT SAFE TO COMMIT THIS FILE (WITH REAL VALUES) TO A PUBLIC REPO?
   --------------------------------------------------------------------------
   Yes. Cloud name and unsigned preset name are not secret — they identify
   where uploads go, not who can perform them. Anyone could theoretically
   also upload to this preset directly (not just through your admin panel),
   which is why step 5 above (format allow-list + size cap + folder) matters:
   it's the actual security boundary for an unsigned preset, not secrecy of
   these two values. Never create a SIGNED preset for this project and never
   put a Cloudinary API secret in any file in this repo.

   --------------------------------------------------------------------------
   HAS THIS BEEN FILLED IN YET?
   --------------------------------------------------------------------------
   admin-cloudinary.js checks isCloudinaryConfigured() before attempting
   any upload, and shows a clear "Cloudinary isn't set up yet" message in
   the admin panel instead of a confusing network error if you forget
   this step.
   ========================================================================== */

// Replace both placeholder strings below with your own values from the
// Cloudinary dashboard (steps 2 and 4 above).
export const CLOUDINARY_CLOUD_NAME = 'izg2y7x3';
export const CLOUDINARY_UPLOAD_PRESET = 'portfolio';

/**
 * Returns true once both values above have been replaced with real
 * settings. Used by admin-cloudinary.js to avoid firing upload requests
 * at a placeholder cloud name.
 */
export function isCloudinaryConfigured() {
  return (
    typeof CLOUDINARY_CLOUD_NAME === 'string' &&
    !CLOUDINARY_CLOUD_NAME.startsWith('YOUR_') &&
    typeof CLOUDINARY_UPLOAD_PRESET === 'string' &&
    !CLOUDINARY_UPLOAD_PRESET.startsWith('YOUR_')
  );
}