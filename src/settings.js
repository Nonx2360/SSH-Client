/**
 * settings.js — Settings panel
 */

const SettingsManager = (() => {
  let settings = {};

  async function init() {
    settings = await window.api.settings.load();
    applySettings();
    setupEventListeners();
  }

  function applySettings() {
    // Apply background image
    if (settings.backgroundImage) {
      document.body.classList.add('has-bg-image');
      document.getElementById('bg-overlay').style.backgroundImage = `url(${settings.backgroundImage})`;
    } else {
      document.body.classList.remove('has-bg-image');
      document.getElementById('bg-overlay').style.backgroundImage = '';
    }

    // Apply accent color
    const root = document.documentElement;
    root.style.setProperty('--accent', settings.accentColor || '#FF9ECD');
    const rgb = hexToRgb(settings.accentColor || '#FF9ECD');
    root.style.setProperty('--accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);

    // Particles
    const canvas = document.getElementById('particles-canvas');
    canvas.style.display = settings.showParticles ? 'block' : 'none';

    // Font size
    TerminalManager.updateFontSize(settings.fontsize || 14);
  }

  function setupEventListeners() {
    const modal = document.getElementById('modal-settings');
    document.getElementById('btn-settings').onclick = () => {
      openModal();
    };
    document.getElementById('btn-close-settings-modal').onclick = closeModal;
    document.getElementById('btn-cancel-settings').onclick = closeModal;

    document.getElementById('btn-upload-bg').onclick = async () => {
      const data = await window.api.dialog.openImage();
      if (data) {
        settings.backgroundImage = data;
        updatePreview();
      }
    };

    document.getElementById('btn-clear-bg').onclick = () => {
      settings.backgroundImage = null;
      updatePreview();
    };

    document.getElementById('toggle-particles').onchange = (e) => {
      settings.showParticles = e.target.checked;
    };

    document.getElementById('font-size-slider').oninput = (e) => {
      settings.fontsize = parseInt(e.target.value);
      document.getElementById('font-size-value').textContent = settings.fontsize + 'px';
    };

    document.querySelectorAll('.color-preset').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        settings.accentColor = btn.dataset.color;
      };
    });

    document.getElementById('btn-save-settings').onclick = async () => {
      await window.api.settings.save(settings);
      applySettings();
      closeModal();
      showToast('Settings saved! 🌸', 'success');
    };
  }

  function openModal() {
    const modal = document.getElementById('modal-settings');
    modal.classList.remove('hidden');

    document.getElementById('toggle-particles').checked = settings.showParticles;
    document.getElementById('font-size-slider').value = settings.fontsize || 14;
    document.getElementById('font-size-value').textContent = (settings.fontsize || 14) + 'px';

    document.querySelectorAll('.color-preset').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === settings.accentColor);
    });

    updatePreview();
  }

  function closeModal() {
    document.getElementById('modal-settings').classList.add('hidden');
  }

  function updatePreview() {
    const box = document.getElementById('bg-preview-box');
    const img = document.getElementById('bg-preview-img');
    const placeholder = document.getElementById('bg-preview-placeholder');

    if (settings.backgroundImage) {
      img.src = settings.backgroundImage;
      img.classList.remove('hidden');
      placeholder.classList.add('hidden');
    } else {
      img.classList.add('hidden');
      placeholder.classList.remove('hidden');
    }
  }

  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  return { init };
})();
