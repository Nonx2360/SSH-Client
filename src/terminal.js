/**
 * terminal.js — xterm.js integration
 */

const TerminalManager = (() => {
  const terminals = {}; // tabId -> { term, fitAddon, onDataCleanup }

  function createTerminal(tabId, container, onData) {
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: parseInt(localStorage.getItem('sakura-font-size')) || 14,
      theme: {
        background: 'transparent',
        foreground: '#F0EBF8',
        cursor: '#FF9ECD',
        selectionBackground: 'rgba(255, 158, 205, 0.3)',
        black: '#080814',
        red: '#FF6B6B',
        green: '#A8FF78',
        yellow: '#FFE66D',
        blue: '#00D4FF',
        magenta: '#C3B1E1',
        cyan: '#00D4FF',
        white: '#F0EBF8',
        brightBlack: '#5D5070',
        brightRed: '#FF8787',
        brightGreen: '#C1FF9E',
        brightYellow: '#FFF0A5',
        brightBlue: '#70E1FF',
        brightMagenta: '#DCCBFF',
        brightCyan: '#70E1FF',
        brightWhite: '#FFFFFF',
      },
      allowProposedApi: true
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon.WebLinksAddon());

    term.open(container);
    fitAddon.fit();

    term.onData(data => onData(data));

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        fitAddon.fit();
        window.api.ssh.resize(tabId, term.cols, term.rows);
      }
    });
    resizeObserver.observe(container);

    const onDataCleanup = window.api.ssh.onData(tabId, (data) => {
      term.write(data);
    });

    terminals[tabId] = { term, fitAddon, onDataCleanup, resizeObserver };
    return term;
  }

  function destroyTerminal(tabId) {
    const t = terminals[tabId];
    if (t) {
      t.onDataCleanup();
      t.resizeObserver.disconnect();
      t.term.dispose();
      delete terminals[tabId];
    }
  }

  function updateFontSize(size) {
    Object.values(terminals).forEach(t => {
      t.term.options.fontSize = size;
      t.fitAddon.fit();
    });
  }

  return { createTerminal, destroyTerminal, updateFontSize };
})();
