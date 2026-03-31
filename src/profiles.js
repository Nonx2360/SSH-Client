/**
 * profiles.js — Profile management UI
 */

const ProfilesManager = (() => {
  let profiles = [];
  let filteredProfiles = [];
  let contextTarget = null; // profile id for context menu actions
  let editId = null;
  let currentAuthType = 'password';

  async function init() {
    profiles = await window.api.profiles.load();
    renderList();
    setupEventListeners();
  }

  function renderList(filter = '') {
    const container = document.getElementById('profiles-list');
    const emptyEl = document.getElementById('profiles-empty');

    filteredProfiles = filter
      ? profiles.filter(p =>
          p.name.toLowerCase().includes(filter.toLowerCase()) ||
          p.host.toLowerCase().includes(filter.toLowerCase()))
      : profiles;

    // Remove all profile cards (not the empty state)
    container.querySelectorAll('.profile-card').forEach(c => c.remove());

    if (filteredProfiles.length === 0) {
      emptyEl.style.display = '';
    } else {
      emptyEl.style.display = 'none';
      filteredProfiles.forEach(p => {
        container.appendChild(createProfileCard(p));
      });
    }
  }

  function createProfileCard(profile) {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.dataset.id = profile.id;

    const isConnected = TabManager && TabManager.isConnected(profile.id);

    card.innerHTML = `
      <span class="profile-dot ${isConnected ? 'online' : 'offline'}"></span>
      <div class="profile-info">
        <div class="profile-name">${escHtml(profile.name)}</div>
        <div class="profile-host">${escHtml(profile.username)}@${escHtml(profile.host)}:${profile.port || 22}</div>
      </div>
      <div class="profile-actions">
        <button class="profile-action-btn" data-action="edit" title="Edit">✏️</button>
        <button class="profile-action-btn" data-action="delete" title="Delete">🗑️</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.profile-action-btn')) return;
      TabManager.openTab(profile);
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, profile.id);
    });

    card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(profile);
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteProfile(profile.id);
    });

    return card;
  }

  function openAddModal() {
    editId = null;
    currentAuthType = 'password';
    document.getElementById('modal-profile-title').textContent = 'New Profile';
    document.getElementById('save-btn-text').textContent = 'Save Profile';
    document.getElementById('form-profile').reset();
    document.getElementById('profile-id').value = '';
    document.getElementById('profile-color').value = '#FF9ECD';
    document.getElementById('profile-port').value = '22';
    setAuthType('password');
    document.getElementById('modal-profile').classList.remove('hidden');
    setTimeout(() => document.getElementById('profile-name').focus(), 100);
  }

  function openEditModal(profile) {
    editId = profile.id;
    currentAuthType = profile.authType || 'password';
    document.getElementById('modal-profile-title').textContent = 'Edit Profile';
    document.getElementById('save-btn-text').textContent = 'Update Profile';
    document.getElementById('profile-id').value = profile.id;
    document.getElementById('profile-name').value = profile.name || '';
    document.getElementById('profile-color').value = profile.color || '#FF9ECD';
    document.getElementById('profile-host').value = profile.host || '';
    document.getElementById('profile-port').value = profile.port || 22;
    document.getElementById('profile-username').value = profile.username || '';
    document.getElementById('profile-password').value = ''; // don't pre-fill password
    document.getElementById('profile-keypath').value = profile.keyPath || '';
    document.getElementById('profile-passphrase').value = '';
    document.getElementById('profile-notes').value = profile.notes || '';
    setAuthType(currentAuthType);
    document.getElementById('modal-profile').classList.remove('hidden');
  }

  function closeProfileModal() {
    document.getElementById('modal-profile').classList.add('hidden');
  }

  function setupEventListeners() {
    document.getElementById('btn-add-profile').addEventListener('click', openAddModal);
    document.getElementById('btn-close-profile-modal').addEventListener('click', closeProfileModal);
    document.getElementById('btn-cancel-profile').addEventListener('click', closeProfileModal);

    document.getElementById('form-profile').addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveProfile();
    });

    document.getElementById('btn-browse-key').addEventListener('click', async () => {
      const keyPath = await window.api.dialog.openKey();
      if (keyPath) document.getElementById('profile-keypath').value = keyPath;
    });

    document.getElementById('search-profiles').addEventListener('input', (e) => {
      renderList(e.target.value);
    });

    // Close modal on overlay click
    document.getElementById('modal-profile').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-profile')) closeProfileModal();
    });

    // Context menu
    document.getElementById('ctx-connect').addEventListener('click', () => {
      if (contextTarget) {
        const p = profiles.find(x => x.id === contextTarget);
        if (p) TabManager.openTab(p);
      }
      hideContextMenu();
    });
    document.getElementById('ctx-edit').addEventListener('click', () => {
      if (contextTarget) {
        const p = profiles.find(x => x.id === contextTarget);
        if (p) openEditModal(p);
      }
      hideContextMenu();
    });
    document.getElementById('ctx-duplicate').addEventListener('click', async () => {
      if (contextTarget) {
        const p = profiles.find(x => x.id === contextTarget);
        if (p) {
          const clone = { ...p, id: undefined, name: p.name + ' (copy)' };
          const saved = await window.api.profiles.save(clone);
          profiles.push(saved);
          renderList();
          showToast('Profile duplicated 🌸', 'success');
        }
      }
      hideContextMenu();
    });
    document.getElementById('ctx-delete').addEventListener('click', () => {
      if (contextTarget) deleteProfile(contextTarget);
      hideContextMenu();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#context-menu')) hideContextMenu();
    });
  }

  async function saveProfile() {
    const profile = {
      id: editId || undefined,
      name: document.getElementById('profile-name').value.trim(),
      color: document.getElementById('profile-color').value,
      host: document.getElementById('profile-host').value.trim(),
      port: parseInt(document.getElementById('profile-port').value) || 22,
      username: document.getElementById('profile-username').value.trim(),
      authType: currentAuthType,
      password: currentAuthType === 'password' ? document.getElementById('profile-password').value : '',
      keyPath: currentAuthType === 'key' ? document.getElementById('profile-keypath').value.trim() : '',
      passphrase: currentAuthType === 'key' ? document.getElementById('profile-passphrase').value : '',
      notes: document.getElementById('profile-notes').value.trim(),
    };

    try {
      const saved = await window.api.profiles.save(profile);
      if (editId) {
        const idx = profiles.findIndex(p => p.id === editId);
        if (idx !== -1) profiles[idx] = saved;
      } else {
        profiles.push(saved);
      }
      renderList();
      closeProfileModal();
      showToast(editId ? 'Profile updated ✏️' : 'Profile saved 🌸', 'success');
    } catch (err) {
      showToast('Failed to save profile', 'error');
    }
  }

  async function deleteProfile(id) {
    if (!confirm('Delete this profile?')) return;
    await window.api.profiles.delete(id);
    profiles = profiles.filter(p => p.id !== id);
    renderList();
    showToast('Profile deleted 🗑️', 'info');
  }

  function showContextMenu(x, y, profileId) {
    contextTarget = profileId;
    const menu = document.getElementById('context-menu');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.remove('hidden');
  }

  function hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
    contextTarget = null;
  }

  function markConnected(profileId, connected) {
    const card = document.querySelector(`.profile-card[data-id="${profileId}"]`);
    if (card) {
      const dot = card.querySelector('.profile-dot');
      dot.className = 'profile-dot ' + (connected ? 'online' : 'offline');
    }
  }

  return { init, renderList, markConnected, openAddModal };
})();

// Global helpers accessible from HTML
function setAuthType(type) {
  window._currentAuthType = type;
  document.getElementById('auth-password-btn').classList.toggle('active', type === 'password');
  document.getElementById('auth-key-btn').classList.toggle('active', type === 'key');
  document.getElementById('auth-password-section').classList.toggle('hidden', type !== 'password');
  document.getElementById('auth-key-section').classList.toggle('hidden', type !== 'key');
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'info', duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = type;
  toast.style.display = '';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.classList.add('hidden'); }, duration);
}
