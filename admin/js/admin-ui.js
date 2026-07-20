/* ==========================================================================
   ADMIN UI CONTROLLER
   ==========================================================================
   Builds and drives the entire admin panel: the login screen, the
   dashboard shell (sidebar + tabs), and every tab's list + form.

   Security model: nothing in the dashboard is ever added to the DOM
   until admin-auth.js reports a real signed-in Firebase user. The
   login screen and the dashboard shell are two separate render paths —
   there is no "dashboard hidden with CSS" state that a logged-out
   visitor could reveal via devtools. See boot() at the bottom.

   Depends on:
     - admin-auth.js        (Firebase Authentication)
     - admin-data.js        (Firestore CRUD)
     - admin-cloudinary.js  (image uploads)
   ========================================================================== */

import { isAuthAvailable, signIn, signOutUser, onAuthChange } from './admin-auth.js';
import { uploadSingleImage, uploadMultipleImages } from './admin-cloudinary.js';
import {
  getProfileDoc, saveProfileDoc,
  listProjects, createProject, updateProject, deleteProject,
  listSkillGroups, createSkillGroup, updateSkillGroup, deleteSkillGroup,
  listExperience, createExperience, updateExperience, deleteExperience,
  listBlogPosts, createBlogPost, updateBlogPost, deleteBlogPost,
} from './admin-data.js';

const root = document.getElementById('admin-root');

/* ------------------------------------------------------------------ */
/* 1. TOASTS — shared success/error feedback                           */
/* ------------------------------------------------------------------ */

function ensureToastStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(message, isError) {
  const stack = ensureToastStack();
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

/* ------------------------------------------------------------------ */
/* 2. SMALL DOM HELPERS                                                */
/* ------------------------------------------------------------------ */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (value !== false && value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function setBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.dataset.label || button.textContent;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> ' + (busyLabel || 'Working\u2026');
  } else {
    button.disabled = false;
    button.textContent = button.dataset.label || button.textContent;
  }
}

/* ------------------------------------------------------------------ */
/* 3. LOGIN SCREEN                                                     */
/* ------------------------------------------------------------------ */

async function renderLogin() {
  root.innerHTML = '';

  const available = await isAuthAvailable();

  const errorLine = el('p', { class: 'form-error' }, '');

  if (!available) {
    root.appendChild(
      el('div', { class: 'screen-center' }, [
        el('div', { class: 'login-card' }, [
          el('h1', { class: 'brand' }, 'Admin'),
          el('p', { class: 'brand-sub' }, 'Firebase isn\u2019t configured yet.'),
          el('p', { class: 'field-hint' }, 'Fill in js/firebase-config.js with your Firebase project settings, then reload this page.'),
        ]),
      ])
    );
    return;
  }

  const emailInput = el('input', { type: 'email', id: 'login-email', autocomplete: 'username', required: 'required' });
  const passwordInput = el('input', { type: 'password', id: 'login-password', autocomplete: 'current-password', required: 'required' });
  const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Sign in');

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorLine.textContent = '';
      setBusy(submitBtn, true, 'Signing in\u2026');

      const result = await signIn(emailInput.value.trim(), passwordInput.value);

      setBusy(submitBtn, false);
      if (!result.ok) {
        errorLine.textContent = result.message;
      }
      // On success, onAuthChange (subscribed in boot()) takes over and
      // renders the dashboard — nothing else to do here.
    },
  }, [
    el('div', { class: 'field' }, [
      el('label', { for: 'login-email' }, 'Email'),
      emailInput,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'login-password' }, 'Password'),
      passwordInput,
    ]),
    submitBtn,
    errorLine,
  ]);

  root.appendChild(
    el('div', { class: 'screen-center' }, [
      el('div', { class: 'login-card' }, [
        el('h1', { class: 'brand' }, 'Admin'),
        el('p', { class: 'brand-sub' }, 'Sign in to manage your portfolio content.'),
        form,
      ]),
    ])
  );

  emailInput.focus();
}

/* ------------------------------------------------------------------ */
/* 4. DASHBOARD SHELL                                                   */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'skills', label: 'Skills' },
  { id: 'projects', label: 'Projects' },
  { id: 'experience', label: 'Experience' },
  { id: 'blog', label: 'Blog' },
];

function renderDashboard(user) {
  root.innerHTML = '';

  const content = el('div', { class: 'content', id: 'tab-content' });

  const navButtons = TABS.map((tab) =>
    el('button', {
      class: 'nav-tab',
      'data-tab': tab.id,
      onclick: () => activateTab(tab.id, navButtons, content),
    }, [el('span', { class: 'dot' }), tab.label])
  );

  const shell = el('div', { class: 'app-shell' }, [
    el('div', { class: 'sidebar' }, [
      el('div', { class: 'brand' }, 'Admin'),
      ...navButtons,
      el('div', { class: 'sidebar-footer' }, [
        el('div', { class: 'user-email' }, user.email || 'Signed in'),
        el('button', {
          class: 'btn btn-block',
          onclick: async () => { await signOutUser(); },
        }, 'Sign out'),
      ]),
    ]),
    content,
  ]);

  root.appendChild(shell);
  activateTab('profile', navButtons, content);
}

function activateTab(tabId, navButtons, content) {
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));

  const renderers = {
    profile: renderProfileTab,
    skills: () => renderSimpleCollectionTab(content, skillsTabConfig),
    projects: renderProjectsTab,
    experience: () => renderSimpleCollectionTab(content, experienceTabConfig),
    blog: () => renderSimpleCollectionTab(content, blogTabConfig),
  };

  content.innerHTML = '<div class="empty-state"><span class="spinner"></span> Loading\u2026</div>';
  const run = renderers[tabId];
  if (run) run(content);
}

/* ------------------------------------------------------------------ */
/* 5. PROFILE TAB                                                       */
/* ------------------------------------------------------------------ */

async function renderProfileTab(content) {
  const result = await getProfileDoc();
  content.innerHTML = '';

  if (!result.ok) {
    content.appendChild(el('div', { class: 'empty-state' }, result.message));
    return;
  }

  const data = result.data || {};
  const contact = data.contact || {};

  const nameInput = el('input', { type: 'text', value: data.name || '' });
  const bioInput = el('textarea', { rows: 6 }, data.bio || '');
  const emailInput = el('input', { type: 'email', value: contact.email || '' });
  const githubInput = el('input', { type: 'url', value: contact.github || '' });
  const linkedinInput = el('input', { type: 'url', value: contact.linkedin || '' });

  let currentPhotoUrl = data.photoUrl || '';
  const photoPreview = el('img', {
    class: 'profile-photo-preview',
    src: currentPhotoUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"%3E%3C/svg%3E',
    style: currentPhotoUrl ? '' : 'visibility:hidden',
  });
  const photoFileInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const photoStatus = el('span', { class: 'field-hint' }, '');

  photoFileInput.addEventListener('change', async () => {
    const file = photoFileInput.files[0];
    if (!file) return;
    photoStatus.textContent = 'Uploading\u2026';
    const uploadResult = await uploadSingleImage(file);
    if (!uploadResult.ok) {
      photoStatus.textContent = uploadResult.message;
      showToast(uploadResult.message, true);
      return;
    }
    currentPhotoUrl = uploadResult.url;
    photoPreview.src = currentPhotoUrl;
    photoPreview.style.visibility = 'visible';
    photoStatus.textContent = 'Uploaded \u2014 remember to click Save.';
  });

  const errorLine = el('p', { class: 'form-error' }, '');
  const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save profile');

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorLine.textContent = '';
      setBusy(saveBtn, true, 'Saving\u2026');

      const saveResult = await saveProfileDoc({
        name: nameInput.value.trim(),
        bio: bioInput.value.trim(),
        photoUrl: currentPhotoUrl,
        contact: {
          email: emailInput.value.trim(),
          github: githubInput.value.trim(),
          linkedin: linkedinInput.value.trim(),
        },
      });

      setBusy(saveBtn, false);
      if (saveResult.ok) {
        showToast('Saved');
      } else {
        errorLine.textContent = saveResult.message;
        showToast(saveResult.message, true);
      }
    },
  }, [
    el('div', { class: 'panel' }, [
      el('h2', { class: 'panel-title' }, 'Profile photo'),
      photoPreview,
      el('div', { class: 'field', style: 'margin-top:12px' }, [
        el('label', { class: 'upload-zone', onclick: () => photoFileInput.click() }, [
          'Click to choose a JPG, PNG, or WEBP image (max 5 MB)',
          photoFileInput,
        ]),
        photoStatus,
      ]),
    ]),
    el('div', { class: 'panel' }, [
      el('h2', { class: 'panel-title' }, 'About'),
      el('div', { class: 'field' }, [el('label', {}, 'Name'), nameInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Bio'), bioInput]),
    ]),
    el('div', { class: 'panel' }, [
      el('h2', { class: 'panel-title' }, 'Contact links'),
      el('div', { class: 'field' }, [el('label', {}, 'Email'), emailInput]),
      el('div', { class: 'field' }, [el('label', {}, 'GitHub URL'), githubInput]),
      el('div', { class: 'field' }, [el('label', {}, 'LinkedIn URL'), linkedinInput]),
    ]),
    saveBtn,
    errorLine,
  ]);

  content.appendChild(el('h1', {}, 'Profile'));
  content.appendChild(el('p', { class: 'content-sub' }, 'Shown on the main site\u2019s hero and contact sections.'));
  content.appendChild(form);
}

/* ------------------------------------------------------------------ */
/* 6. PROJECTS TAB (has extra fields: tags, tech, gallery, toggle)      */
/* ------------------------------------------------------------------ */

const PROJECT_TAG_OPTIONS = ['scrape', 'analyze', 'automate', 'ship'];

async function renderProjectsTab(content) {
  const result = await listProjects();
  content.innerHTML = '';
  content.appendChild(el('h1', {}, 'Projects'));
  content.appendChild(el('p', { class: 'content-sub' }, 'Everything shown in the projects grid on the main site.'));

  if (!result.ok) {
    content.appendChild(el('div', { class: 'empty-state' }, result.message));
    return;
  }

  const listWrap = el('div', { class: 'item-list' });
  const formWrap = el('div');
  content.appendChild(listWrap);
  content.appendChild(formWrap);

  function renderList(items) {
    listWrap.innerHTML = '';
    if (!items.length) {
      listWrap.appendChild(el('div', { class: 'empty-state' }, 'No projects yet \u2014 add one below.'));
      return;
    }
    items.forEach((item) => {
      listWrap.appendChild(
        el('div', { class: 'item-row' }, [
          el('div', { class: 'item-main' }, [
            el('div', { class: 'item-title' }, [
              item.title || 'Untitled project',
              item.featured ? el('span', { class: 'badge featured' }, 'Featured') : null,
            ]),
            el('div', { class: 'item-sub' }, item.shortDescription || ''),
          ]),
          el('div', { class: 'item-actions' }, [
            el('button', { class: 'btn btn-sm', onclick: () => renderForm(item) }, 'Edit'),
            el('button', { class: 'btn btn-sm btn-danger', onclick: () => handleDelete(item) }, 'Delete'),
          ]),
        ])
      );
    });
  }

  async function handleDelete(item) {
    if (!confirm(`Delete "${item.title || 'this project'}"? This can\u2019t be undone.`)) return;
    const delResult = await deleteProject(item.id);
    if (delResult.ok) {
      showToast('Deleted');
      refresh();
    } else {
      showToast(delResult.message, true);
    }
  }

  async function refresh() {
    const fresh = await listProjects();
    if (fresh.ok) renderList(fresh.data);
  }

  function renderForm(existing) {
    formWrap.innerHTML = '';
    const isEdit = Boolean(existing);
    const item = existing || {};

    const titleInput = el('input', { type: 'text', value: item.title || '' });
    const shortInput = el('textarea', { rows: 2 }, item.shortDescription || '');
    const fullInput = el('textarea', { rows: 5 }, item.fullDescription || '');
    const techInput = el('input', { type: 'text', value: (item.techStack || []).join(', ') });
    const githubInput = el('input', { type: 'url', value: item.githubUrl || '' });
    const liveInput = el('input', { type: 'url', value: item.liveUrl || '' });
    const featuredInput = el('input', { type: 'checkbox' });
    featuredInput.checked = Boolean(item.featured);

    const existingTags = new Set(item.tags || []);
    const tagPills = PROJECT_TAG_OPTIONS.map((tag) => {
      const checkbox = el('input', { type: 'checkbox', value: tag });
      checkbox.checked = existingTags.has(tag);
      const pill = el('label', { class: 'checkbox-pill' + (checkbox.checked ? ' checked' : '') }, [checkbox, tag]);
      checkbox.addEventListener('change', () => pill.classList.toggle('checked', checkbox.checked));
      pill._checkbox = checkbox;
      return pill;
    });

    let galleryUrls = Array.isArray(item.images) ? [...item.images] : [];
    const imageGrid = el('div', { class: 'image-grid' });
    const galleryFileInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: 'multiple' });
    const galleryStatus = el('span', { class: 'field-hint' }, '');

    function renderGalleryGrid() {
      imageGrid.innerHTML = '';
      galleryUrls.forEach((url, index) => {
        imageGrid.appendChild(
          el('div', { class: 'image-thumb' }, [
            el('img', { src: url }),
            el('button', {
              type: 'button',
              class: 'remove-thumb',
              onclick: () => { galleryUrls.splice(index, 1); renderGalleryGrid(); },
            }, '\u00d7'),
          ])
        );
      });
    }
    renderGalleryGrid();

    galleryFileInput.addEventListener('change', async () => {
      const files = galleryFileInput.files;
      if (!files || !files.length) return;
      galleryStatus.textContent = `Uploading ${files.length} image(s)\u2026`;
      const uploadResult = await uploadMultipleImages(files);
      galleryUrls = galleryUrls.concat(uploadResult.urls);
      renderGalleryGrid();
      galleryStatus.textContent = uploadResult.ok ? 'Uploaded \u2014 remember to click Save.' : uploadResult.message;
      if (!uploadResult.ok) showToast(uploadResult.message, true);
      galleryFileInput.value = '';
    });

    const errorLine = el('p', { class: 'form-error' }, '');
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? 'Save changes' : 'Add project');

    const form = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errorLine.textContent = '';

        const title = titleInput.value.trim();
        if (!title) {
          errorLine.textContent = 'Title is required.';
          return;
        }

        const fields = {
          title,
          shortDescription: shortInput.value.trim(),
          fullDescription: fullInput.value.trim(),
          tags: tagPills.filter((p) => p._checkbox.checked).map((p) => p._checkbox.value),
          techStack: techInput.value.split(',').map((t) => t.trim()).filter(Boolean),
          images: galleryUrls,
          githubUrl: githubInput.value.trim(),
          liveUrl: liveInput.value.trim(),
          featured: featuredInput.checked,
        };

        setBusy(saveBtn, true, 'Saving\u2026');
        const saveResult = isEdit ? await updateProject(item.id, fields) : await createProject(fields);
        setBusy(saveBtn, false);

        if (saveResult.ok) {
          showToast('Saved');
          formWrap.innerHTML = '';
          refresh();
        } else {
          errorLine.textContent = saveResult.message;
          showToast(saveResult.message, true);
        }
      },
    }, [
      el('div', { class: 'panel' }, [
        el('h2', { class: 'panel-title' }, isEdit ? 'Edit project' : 'Add a project'),
        el('div', { class: 'field' }, [el('label', {}, 'Title'), titleInput]),
        el('div', { class: 'field' }, [el('label', {}, 'Short description'), shortInput]),
        el('div', { class: 'field' }, [el('label', {}, 'Full description'), fullInput]),
        el('div', { class: 'field' }, [
          el('label', {}, 'Tags'),
          el('div', { class: 'checkbox-row' }, tagPills),
        ]),
        el('div', { class: 'field' }, [
          el('label', {}, 'Tech stack'),
          techInput,
          el('p', { class: 'field-hint' }, 'Comma-separated, e.g. Python, FastAPI, Docker'),
        ]),
        el('div', { class: 'form-row' }, [
          el('div', { class: 'field' }, [el('label', {}, 'GitHub URL (optional)'), githubInput]),
          el('div', { class: 'field' }, [el('label', {}, 'Live URL (optional)'), liveInput]),
        ]),
        el('div', { class: 'field toggle-row' }, [featuredInput, el('label', {}, 'Feature this project')]),
        el('div', { class: 'field' }, [
          el('label', {}, 'Gallery images'),
          el('label', { class: 'upload-zone', onclick: () => galleryFileInput.click() }, [
            'Click to choose one or more JPG, PNG, or WEBP images',
            galleryFileInput,
          ]),
          galleryStatus,
          imageGrid,
        ]),
      ]),
      saveBtn,
      isEdit ? el('button', { type: 'button', class: 'btn', onclick: () => { formWrap.innerHTML = ''; } }, 'Cancel') : null,
      errorLine,
    ]);

    formWrap.appendChild(form);
    formWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderList(result.data);
  formWrap.appendChild(el('button', { class: 'btn btn-primary', onclick: () => renderForm(null) }, '+ Add project'));
}

/* ------------------------------------------------------------------ */
/* 7. SKILLS / EXPERIENCE / BLOG — shared simple list+form pattern      */
/* ------------------------------------------------------------------ */

const skillsTabConfig = {
  title: 'Skills',
  sub: 'Grouped skill tags shown in the main site\u2019s skills section.',
  list: listSkillGroups, create: createSkillGroup, update: updateSkillGroup, remove: deleteSkillGroup,
  itemTitle: (item) => item.group || 'Untitled group',
  itemSub: (item) => (item.tags || []).join(', '),
  fields: [
    { key: 'group', label: 'Group name', type: 'text', placeholder: 'e.g. Scrape' },
    { key: 'stage', label: 'Stage', type: 'text', placeholder: 'scrape / analyze / automate / ship' },
    { key: 'color', label: 'Accent color (hex)', type: 'text', placeholder: '#00E5FF' },
    { key: 'tags', label: 'Tags', type: 'list', placeholder: 'Python, BeautifulSoup, Requests', hint: 'Comma-separated' },
  ],
};

const experienceTabConfig = {
  title: 'Experience',
  sub: 'Rendered as a commit log on the main site.',
  list: listExperience, create: createExperience, update: updateExperience, remove: deleteExperience,
  itemTitle: (item) => item.title || 'Untitled entry',
  itemSub: (item) => [item.role, item.date].filter(Boolean).join(' \u00b7 '),
  fields: [
    { key: 'hash', label: 'Commit hash', type: 'text', placeholder: 'e.g. a1b2c3d' },
    { key: 'date', label: 'Date', type: 'text', placeholder: 'YYYY-MM-DD' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'role', label: 'Role', type: 'text' },
    { key: 'desc', label: 'Description', type: 'textarea' },
    { key: 'branch', label: 'Branch', type: 'text', placeholder: 'main' },
    { key: 'stage', label: 'Stage (for accent color)', type: 'text', placeholder: 'scrape / analyze / automate / ship' },
  ],
};

const blogTabConfig = {
  title: 'Blog',
  sub: 'Rendered as stdout.log on the main site.',
  list: listBlogPosts, create: createBlogPost, update: updateBlogPost, remove: deleteBlogPost,
  itemTitle: (item) => item.title || 'Untitled post',
  itemSub: (item) => [item.level, item.timestamp].filter(Boolean).join(' \u00b7 '),
  fields: [
    { key: 'timestamp', label: 'Timestamp', type: 'text', placeholder: 'YYYY-MM-DD HH:MM:SS' },
    { key: 'level', label: 'Level', type: 'text', placeholder: 'INFO / OK' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'desc', label: 'Description', type: 'textarea' },
  ],
};

async function renderSimpleCollectionTab(content, config) {
  const result = await config.list();
  content.innerHTML = '';
  content.appendChild(el('h1', {}, config.title));
  content.appendChild(el('p', { class: 'content-sub' }, config.sub));

  if (!result.ok) {
    content.appendChild(el('div', { class: 'empty-state' }, result.message));
    return;
  }

  const listWrap = el('div', { class: 'item-list' });
  const formWrap = el('div');
  content.appendChild(listWrap);
  content.appendChild(formWrap);

  function renderList(items) {
    listWrap.innerHTML = '';
    if (!items.length) {
      listWrap.appendChild(el('div', { class: 'empty-state' }, 'Nothing here yet \u2014 add one below.'));
      return;
    }
    items.forEach((item) => {
      listWrap.appendChild(
        el('div', { class: 'item-row' }, [
          el('div', { class: 'item-main' }, [
            el('div', { class: 'item-title' }, config.itemTitle(item)),
            el('div', { class: 'item-sub' }, config.itemSub(item)),
          ]),
          el('div', { class: 'item-actions' }, [
            el('button', { class: 'btn btn-sm', onclick: () => renderForm(item) }, 'Edit'),
            el('button', { class: 'btn btn-sm btn-danger', onclick: () => handleDelete(item) }, 'Delete'),
          ]),
        ])
      );
    });
  }

  async function handleDelete(item) {
    if (!confirm(`Delete "${config.itemTitle(item)}"? This can\u2019t be undone.`)) return;
    const delResult = await config.remove(item.id);
    if (delResult.ok) {
      showToast('Deleted');
      refresh();
    } else {
      showToast(delResult.message, true);
    }
  }

  async function refresh() {
    const fresh = await config.list();
    if (fresh.ok) renderList(fresh.data);
  }

  function renderForm(existing) {
    formWrap.innerHTML = '';
    const isEdit = Boolean(existing);
    const item = existing || {};
    const inputs = {};

    const fieldNodes = config.fields.map((f) => {
      let input;
      if (f.type === 'textarea') {
        input = el('textarea', { rows: 4, placeholder: f.placeholder || '' }, item[f.key] || '');
      } else if (f.type === 'list') {
        input = el('input', { type: 'text', placeholder: f.placeholder || '', value: (item[f.key] || []).join(', ') });
      } else {
        input = el('input', { type: 'text', placeholder: f.placeholder || '', value: item[f.key] || '' });
      }
      inputs[f.key] = { input, type: f.type };
      return el('div', { class: 'field' }, [
        el('label', {}, f.label),
        input,
        f.hint ? el('p', { class: 'field-hint' }, f.hint) : null,
      ]);
    });

    const errorLine = el('p', { class: 'form-error' }, '');
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary' }, isEdit ? 'Save changes' : 'Add');

    const form = el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errorLine.textContent = '';

        const fields = {};
        for (const [key, { input, type }] of Object.entries(inputs)) {
          if (type === 'list') {
            fields[key] = input.value.split(',').map((v) => v.trim()).filter(Boolean);
          } else {
            fields[key] = input.value.trim();
          }
        }

        setBusy(saveBtn, true, 'Saving\u2026');
        const saveResult = isEdit ? await config.update(item.id, fields) : await config.create(fields);
        setBusy(saveBtn, false);

        if (saveResult.ok) {
          showToast('Saved');
          formWrap.innerHTML = '';
          refresh();
        } else {
          errorLine.textContent = saveResult.message;
          showToast(saveResult.message, true);
        }
      },
    }, [
      el('div', { class: 'panel' }, [
        el('h2', { class: 'panel-title' }, isEdit ? 'Edit' : 'Add new'),
        ...fieldNodes,
      ]),
      saveBtn,
      isEdit ? el('button', { type: 'button', class: 'btn', onclick: () => { formWrap.innerHTML = ''; } }, 'Cancel') : null,
      errorLine,
    ]);

    formWrap.appendChild(form);
    formWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderList(result.data);
  formWrap.appendChild(el('button', { class: 'btn btn-primary', onclick: () => renderForm(null) }, '+ Add'));
}

/* ------------------------------------------------------------------ */
/* 8. BOOT — the only place that decides login vs. dashboard            */
/* ------------------------------------------------------------------ */

export async function boot() {
  await onAuthChange((user) => {
    if (user) {
      renderDashboard(user);
    } else {
      renderLogin();
    }
  });
}
