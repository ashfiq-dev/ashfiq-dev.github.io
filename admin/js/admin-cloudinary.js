/* ==========================================================================
   ADMIN CLOUDINARY UPLOAD HELPER
   ==========================================================================
   Uploads images directly from the browser to Cloudinary using an
   UNSIGNED upload preset (see js/cloudinary-config.js for setup). No API
   secret is used or stored anywhere — unsigned uploads only need the
   cloud name and preset name, both of which are safe to expose client-side.

   Used by:
     - Profile tab  -> uploadSingleImage()  (profile photo)
     - Projects tab -> uploadSingleImage() in a loop, or uploadMultipleImages()
                       (gallery images)
   ========================================================================== */

import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, isCloudinaryConfigured } from '../../js/cloudinary-config.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB — keep in sync with the preset's own limit

/**
 * Uploads a single File to Cloudinary.
 * Returns { ok: true, url } on success, or { ok: false, message } on
 * failure — never throws.
 */
export async function uploadSingleImage(file) {
  if (!isCloudinaryConfigured()) {
    return { ok: false, message: 'Image uploads aren\u2019t set up yet. Check js/cloudinary-config.js.' };
  }

  const validation = validateFile(file);
  if (!validation.ok) return validation;

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );

    if (!response.ok) {
      console.warn('[admin-cloudinary] Upload failed with status', response.status);
      return { ok: false, message: 'Upload failed \u2014 try again.' };
    }

    const result = await response.json();
    if (!result.secure_url) {
      return { ok: false, message: 'Upload failed \u2014 try again.' };
    }

    return { ok: true, url: result.secure_url };
  } catch (err) {
    console.warn('[admin-cloudinary] Upload error.', err);
    return { ok: false, message: 'Upload failed \u2014 check your connection and try again.' };
  }
}

/**
 * Uploads multiple files in parallel (used for the project gallery).
 * Returns { ok: true, urls: [...] } if every file succeeded, or
 * { ok: false, message, urls: [...] } where `urls` holds whichever
 * uploads DID succeed, so the caller can keep the partial progress
 * instead of losing it.
 */
export async function uploadMultipleImages(files) {
  if (!isCloudinaryConfigured()) {
    return { ok: false, message: 'Image uploads aren\u2019t set up yet. Check js/cloudinary-config.js.', urls: [] };
  }

  const results = await Promise.all(Array.from(files).map((file) => uploadSingleImage(file)));

  const urls = results.filter((r) => r.ok).map((r) => r.url);
  const failedCount = results.length - urls.length;

  if (failedCount === 0) {
    return { ok: true, urls };
  }

  if (urls.length === 0) {
    return { ok: false, message: 'Couldn\u2019t upload those images \u2014 try again.', urls: [] };
  }

  return {
    ok: false,
    message: `${urls.length} of ${results.length} images uploaded \u2014 ${failedCount} failed. Try re-adding the missing one(s).`,
    urls,
  };
}

/**
 * Client-side pre-check so obviously invalid files never even hit the
 * network — mirrors the restrictions configured on the Cloudinary preset
 * (see js/cloudinary-config.js) but this is a convenience check only;
 * the real enforcement happens server-side on the preset itself.
 */
function validateFile(file) {
  if (!file) {
    return { ok: false, message: 'No file selected.' };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, message: 'Only JPG, PNG, or WEBP images are allowed.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: 'That image is too large \u2014 5 MB max.' };
  }
  return { ok: true };
}
