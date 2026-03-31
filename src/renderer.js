/**
 * renderer.js — Main UI logic and tab management
 */

const TabManager = (() => {
  const tabs = []; // { id, profile, active, connected, element, contentEl }
  let activeTabId = null;

  async function openTab(profile) {
    // Check if profile already has an open tab
    const existing = tabs.find(t => t.profile.id === profile.id);
    if (existing) {
      switchTab(existing.id);
      return;
    }

    const tabId = Date.now().toString();
    const tabEl = document.createElement('div');
    tabEl.className = 'tab active';
    tabEl.dataset.id = tabId;
    tabEl.innerHTML = `
      <span class="tab-status connecting"></span>
      <span class="tab-label">${escHtml(profile.name)}</span>
      <button class="tab-close">✕</button>
    `;

    const contentEl = document.createElement('div');
    contentEl.className = 'tab-panel active';
    contentEl.dataset.id = tabId;
    contentEl.innerHTML = `
      <div class="terminal-pane">
        <div class="terminal-toolbar">
          <div class="terminal-info">
            <span class="host-label">${escHtml(profile.username)}@${escHtml(profile.host)}:${profile.port}</span>
          </div>
          <button class="tab-toggle-btn active" id="toggle-term-${tabId}">Terminal</button>
          <button class="tab-toggle-btn" id="toggle-sftp-${tabId}">SFTP</button>
        </div>
        <div class="terminal-container" id="term-container-${tabId}"></div>
        <div class="connecting-overlay">
          <div class="connecting-spinner"></div>
          <div class="connecting-text">Connecting to <span class="connecting-host">${escHtml(profile.host)}</span>...</div>
        </div>
      </div>
      <div class="sftp-pane hidden" id="sftp-container-${tabId}"></div>
    `;

    document.getElementById('tabs-container').appendChild(tabEl);
    document.getElementById('tabs-content').appendChild(contentEl);

    const tab = { id: tabId, profile, connected: false, element: tabEl, contentEl };
    tabs.push(tab);

    tabEl.onclick = () => switchTab(tabId);
    tabEl.querySelector('.tab-close').onclick = (e) => {
      e.stopPropagation();
      closeTab(tabId);
    };

    switchTab(tabId);

    // Initial switch to xterm.js tab
    setupTabSwitchHandlers(tabId, contentEl);

    // Connect SSH
    try {
      const termContainer = contentEl.querySelector(`#term-container-${tabId}`);
      TerminalManager.createTerminal(tabId, termContainer, (data) => {
        window.api.ssh.send(tabId, data);
      });

      const res = await window.api.ssh.connect(tabId, profile);
      if (res.success) {
        tab.connected = true;
        tabEl.querySelector('.tab-status').className = 'tab-status connected';
        contentEl.querySelector('.connecting-overlay').classList.add('hidden');
        ProfilesManager.markConnected(profile.id, true);
        showToast(`Connected to ${profile.name} 🌸`, 'success');
      }
    } catch (e) {
      const errMsg = (e && e.message) ? e.message : String(e);
      showToast(errMsg, 'error');
      contentEl.querySelector('.connecting-overlay').innerHTML = `
        <div class="error-overlay">
          <span class="error-icon">❌</span>
          <span class="error-title">Connection Failed</span>
          <p class="error-msg">${escHtml(errMsg)}</p>
          <button class="tab-close-btn btn-primary" onclick="TabManager.closeTab('${tabId}')">Close Tab</button>
        </div>
      `;
      tabEl.querySelector('.tab-status').className = 'tab-status error';
    }
  }

  function setupTabSwitchHandlers(tabId, contentEl) {
    const btnTerm = contentEl.querySelector(`#toggle-term-${tabId}`);
    const btnSftp = contentEl.querySelector(`#toggle-sftp-${tabId}`);
    const termPane = contentEl.querySelector('.terminal-container');
    const sftpPane = contentEl.querySelector('.sftp-pane');

    btnTerm.onclick = () => {
      btnTerm.classList.add('active');
      btnSftp.classList.remove('active');
      termPane.classList.remove('hidden');
      sftpPane.classList.add('hidden');
    };

    btnSftp.onclick = () => {
      btnTerm.classList.remove('active');
      btnSftp.classList.add('active');
      termPane.classList.add('hidden');
      sftpPane.classList.remove('hidden');
      SFTPManager.renderSFTP(tabId, sftpPane);
    };
  }

  function switchTab(tabId) {
    activeTabId = tabId;
    tabs.forEach(t => {
      const isActive = t.id === tabId;
      t.element.classList.toggle('active', isActive);
      t.contentEl.classList.toggle('active', isActive);
    });
    document.getElementById('welcome-screen').style.display = tabs.length > 0 ? 'none' : 'flex';
  }

  async function closeTab(tabId) {
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    const tab = tabs[idx];
    await window.api.ssh.disconnect(tabId);
    TerminalManager.destroyTerminal(tabId);

    tab.element.remove();
    tab.contentEl.remove();
    tabs.splice(idx, 1);

    if (activeTabId === tabId) {
      if (tabs.length > 0) switchTab(tabs[tabs.length - 1].id);
      else switchTab(null);
    }
    ProfilesManager.markConnected(tab.profile.id, false);
  }

  return { openTab, isConnected: (pid) => tabs.some(t => t.profile.id === pid && t.connected) };
})();

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  await ProfilesManager.init();
  await SettingsManager.init();
  initSakuraParticles();
});

// Particles logic
function initSakuraParticles() {
  const canvas = document.getElementById('particles-canvas');
  const ctx = canvas.getContext('2d');
  let petals = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.onresize = resize;
  resize();

  class Petal {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = -20;
      this.w = 5 + Math.random() * 10;
      this.h = 5 + Math.random() * 10;
      this.opacity = 0.5 + Math.random() * 0.5;
      this.flip = Math.random();
      this.speedX = -1 + Math.random() * 2;
      this.speedY = 1 + Math.random() * 2;
      this.angle = Math.random() * Math.PI * 2;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      this.angle += 0.01;
      if (this.y > canvas.height) this.reset();
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, this.w, this.h, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 183, 197, ${this.opacity})`;
      ctx.fill();
      ctx.restore();
    }
  }

  for (let i = 0; i < 30; i++) petals.push(new Petal());

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    petals.forEach(p => {
      p.update();
      p.draw();
    });
    requestAnimationFrame(animate);
  }
  animate();
}
