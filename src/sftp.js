/**
 * sftp.js — SFTP file browser
 */

const SFTPManager = (() => {
  const fileStates = {}; // tabId -> state

  function getInitialState(tabId) {
    return {
      currentPath: '/',
      files: [],
      loading: false,
      error: null
    };
  }

  async function renderSFTP(tabId, container) {
    let state = fileStates[tabId];
    if (!state) {
      state = getInitialState(tabId);
      fileStates[tabId] = state;
    }

    container.innerHTML = `
      <div class="sftp-toolbar">
        <span class="sftp-title">SFTP Files</span>
        <button class="sftp-btn" data-action="upload">Upload</button>
        <button class="sftp-btn" data-action="refresh">Refresh</button>
      </div>
      <div class="sftp-breadcrumb"></div>
      <div class="sftp-files"></div>
      <div class="sftp-drop-zone">Drop files to upload</div>
    `;

    const filesEl = container.querySelector('.sftp-files');
    const breadcrumbEl = container.querySelector('.sftp-breadcrumb');
    const dropZone = container.querySelector('.sftp-drop-zone');

    await refresh(tabId, container);

    container.querySelector('[data-action="upload"]').onclick = () => upload(tabId, container);
    container.querySelector('[data-action="refresh"]').onclick = () => refresh(tabId, container);

    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); };
    dropZone.ondragleave = () => { dropZone.classList.remove('drag-over'); };
    dropZone.ondrop = async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      // Drag & drop needs filesystem access which Electron handle via dialog for simplicity
      showToast('Click Upload to select files', 'info');
    };
  }

  async function refresh(tabId, container) {
    const state = fileStates[tabId];
    const filesEl = container.querySelector('.sftp-files');
    const breadcrumbEl = container.querySelector('.sftp-breadcrumb');

    state.loading = true;
    filesEl.innerHTML = '<div class="sftp-loading"><div class="connecting-spinner"></div>Listing files...</div>';

    try {
      state.files = await window.api.sftp.list(tabId, state.currentPath);
      renderFiles(tabId, container);
      renderBreadcrumb(tabId, container);
    } catch (e) {
      filesEl.innerHTML = `<div class="error-overlay"><span class="error-msg">${e.message}</span></div>`;
    } finally {
      state.loading = false;
    }
  }

  function renderBreadcrumb(tabId, container) {
    const state = fileStates[tabId];
    const el = container.querySelector('.sftp-breadcrumb');
    const parts = state.currentPath.split('/').filter(p => p);

    let html = `<button class="breadcrumb-item" data-path="/">/</button>`;
    let path = '';
    parts.forEach(p => {
      path += '/' + p;
      html += `<span class="breadcrumb-sep">/</span><button class="breadcrumb-item" data-path="${path}">${escHtml(p)}</button>`;
    });

    el.innerHTML = html;
    el.querySelectorAll('.breadcrumb-item').forEach(btn => {
      btn.onclick = () => {
        state.currentPath = btn.dataset.path;
        refresh(tabId, container);
      };
    });
  }

  function renderFiles(tabId, container) {
    const state = fileStates[tabId];
    const el = container.querySelector('.sftp-files');

    if (state.files.length === 0) {
      el.innerHTML = '<div class="empty-state">No files here</div>';
      return;
    }

    el.innerHTML = '';
    // Sort directories first
    state.files.sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name)).forEach(file => {
      if (file.name === '.' || file.name === '..') return;

      const card = document.createElement('div');
      card.className = 'sftp-file';
      card.innerHTML = `
        <span class="sftp-icon">${file.isDir ? '📁' : '📄'}</span>
        <span class="sftp-name">${escHtml(file.name)}</span>
        <span class="sftp-size">${file.isDir ? '--' : formatBytes(file.size)}</span>
      `;

      card.onclick = () => {
        if (file.isDir) {
          state.currentPath = (state.currentPath === '/' ? '' : state.currentPath) + '/' + file.name;
          refresh(tabId, container);
        } else {
          download(tabId, file.name);
        }
      };

      card.oncontextmenu = (e) => {
        e.preventDefault();
        if (confirm(`Delete ${file.name}?`)) {
          deleteFile(tabId, file.name, file.isDir, container);
        }
      };

      el.appendChild(card);
    });
  }

  async function upload(tabId, container) {
    const state = fileStates[tabId];
    try {
      const res = await window.api.sftp.upload(tabId, state.currentPath);
      if (res.success) {
        showToast('Upload complete!', 'success');
        refresh(tabId, container);
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function download(tabId, fileName) {
    const state = fileStates[tabId];
    const remotePath = (state.currentPath === '/' ? '' : state.currentPath) + '/' + fileName;
    try {
      const res = await window.api.sftp.download(tabId, remotePath);
      if (res.success) showToast('Download complete!', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function deleteFile(tabId, fileName, isDir, container) {
    const state = fileStates[tabId];
    const remotePath = (state.currentPath === '/' ? '' : state.currentPath) + '/' + fileName;
    try {
      await window.api.sftp.delete(tabId, remotePath, isDir);
      showToast('Deleted', 'info');
      refresh(tabId, container);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  return { renderSFTP };
})();
