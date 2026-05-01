(() => {
  'use strict';

  const COLS = 8;
  const ROWS = 8;
  const START_MOVES = 30;
  const GOAL = 1500;
  const BEST_KEY = 'match3dogs:best';

  // 6 dog breeds. Beagle and Doge required by spec; rest add variety.
  // Order: 0 beagle, 1 doge, 2 dalmatian, 3 husky, 4 poodle, 5 pug.
  const DOG_CONFIGS = [
    { head: '#f4d4a8', muzzle: '#fff5e0', eyeKind: 'round', eyeColor: '#222',
      ear: 'droopy', earColor: '#8b5a2b' },
    { head: '#e8a44c', muzzle: '#fbe6c4', eyeKind: 'smug',  eyeColor: '#222',
      ear: 'pointy', earColor: '#c97f24' },
    { head: '#ffffff', muzzle: '#ffffff', eyeKind: 'round', eyeColor: '#222',
      ear: 'medium', earColor: '#1c1c1c', spots: true },
    { head: '#a8b8c4', muzzle: '#ffffff', eyeKind: 'round', eyeColor: '#5ac8fa',
      ear: 'pointy', earColor: '#5a6a78' },
    { head: '#f8c0d6', muzzle: '#ffffff', eyeKind: 'round', eyeColor: '#222',
      ear: 'curly',  earColor: '#e89bb9' },
    { head: '#d6a878', muzzle: '#3a2614', eyeKind: 'round', eyeColor: '#222',
      ear: 'small',  earColor: '#5a3a20', wrinkle: true },
  ];
  const KIND_COUNT = DOG_CONFIGS.length;

  // Distinct glyphs per kind for color-blind mode (placed inside dogSVG when enabled)
  const KIND_GLYPHS = ['★', '▲', '●', '■', '◆', '✚'];

  // --- Accessibility prefs ---
  const PREFS_KEY = 'match3dogs:prefs';
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prefs = (() => {
    let parsed = {};
    try { parsed = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch {}
    return {
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : prefersReducedMotion,
      shapes: !!parsed.shapes,
    };
  })();
  function savePrefs() { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }
  function applyPrefs() {
    const root = document.documentElement;
    root.toggleAttribute('data-reduced-motion', prefs.reducedMotion);
    root.toggleAttribute('data-shapes', prefs.shapes);
  }
  applyPrefs();

  // --- Seedable RNG (mulberry32) for daily challenge & level boards ---
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Stable string -> 32-bit hash for date-based seeding
  function fnv1a(str) {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  // Default RNG; newGame() reassigns this based on mode.
  let rng = Math.random;

  // --- Game mode state ---
  // mode = { kind: 'classic' } | { kind: 'daily', dateKey } | { kind: 'level', n }
  let mode = { kind: 'classic' };

  const EAR_PATHS = {
    droopy: { l: 'M 14,22 Q 4,40 14,48 Q 19,42 19,30 Z',
              r: 'M 46,22 Q 56,40 46,48 Q 41,42 41,30 Z' },
    pointy: { l: 'M 12,16 L 6,30 L 22,26 Z',
              r: 'M 48,16 L 54,30 L 38,26 Z' },
    medium: { l: 'M 14,18 Q 6,32 14,36 Q 20,30 20,22 Z',
              r: 'M 46,18 Q 54,32 46,36 Q 40,30 40,22 Z' },
    small:  { l: 'M 18,18 L 14,28 L 22,26 Z',
              r: 'M 42,18 L 46,28 L 38,26 Z' },
  };

  function earSVG(kind, color) {
    if (kind === 'curly') {
      return `<g class="ear ear-l" fill="${color}">
          <circle cx="14" cy="22" r="5"/><circle cx="11" cy="18" r="4"/><circle cx="18" cy="26" r="4"/>
        </g>
        <g class="ear ear-r" fill="${color}">
          <circle cx="46" cy="22" r="5"/><circle cx="49" cy="18" r="4"/><circle cx="42" cy="26" r="4"/>
        </g>`;
    }
    const p = EAR_PATHS[kind];
    return `<path class="ear ear-l" d="${p.l}" fill="${color}"/>
            <path class="ear ear-r" d="${p.r}" fill="${color}"/>`;
  }

  function dogSVG(kind) {
    const c = DOG_CONFIGS[kind];
    const eyes = c.eyeKind === 'smug'
      ? `<path class="eye eye-l" d="M 19,28 Q 22,25 25,28" stroke="${c.eyeColor}" stroke-width="2" fill="none" stroke-linecap="round"/>
         <path class="eye eye-r" d="M 35,28 Q 38,25 41,28" stroke="${c.eyeColor}" stroke-width="2" fill="none" stroke-linecap="round"/>`
      : `<circle class="eye eye-l" cx="22" cy="27" r="2.3" fill="${c.eyeColor}"/>
         <circle class="eye eye-r" cx="38" cy="27" r="2.3" fill="${c.eyeColor}"/>`;
    const spots = c.spots
      ? `<g class="spots" fill="#1c1c1c">
           <circle cx="20" cy="22" r="2.4"/><circle cx="40" cy="20" r="1.8"/>
           <circle cx="44" cy="32" r="1.6"/><circle cx="16" cy="36" r="1.8"/>
         </g>` : '';
    const wrinkle = c.wrinkle
      ? `<path d="M 24,34 Q 30,32 36,34" stroke="#5a3a20" stroke-width="1.2" fill="none" stroke-linecap="round"/>` : '';
    const glyph = prefs.shapes
      ? `<text class="glyph" x="52" y="14" text-anchor="middle">${KIND_GLYPHS[kind]}</text>`
      : '';
    return `<svg class="dog" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${earSVG(c.ear, c.earColor)}
      <ellipse class="head" cx="30" cy="33" rx="20" ry="18" fill="${c.head}"/>
      ${spots}
      <ellipse class="muzzle" cx="30" cy="40" rx="11" ry="8" fill="${c.muzzle}"/>
      ${wrinkle}
      <ellipse class="nose" cx="30" cy="35" rx="2.6" ry="2" fill="#222"/>
      ${eyes}
      <path class="mouth" d="M 26,42 Q 30,45 34,42" stroke="#222" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <ellipse class="tongue" cx="30" cy="44" rx="3.5" ry="2.4" fill="#ff6b9d"/>
      ${glyph}
    </svg>`;
  }

  const boardEl = document.getElementById('board');
  const scoreEl = document.getElementById('score');
  const movesEl = document.getElementById('moves');
  const bestEl  = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText  = document.getElementById('overlay-text');
  const restartBtn = document.getElementById('restart');
  const newGameBtn = document.getElementById('newGame');
  const muteBtn = document.getElementById('mute');
  const goalEl = document.getElementById('goal');
  const comboEl = document.getElementById('combo');
  const overlayStarsEl = document.getElementById('overlay-stars');
  goalEl.textContent = String(GOAL);

  // --- Sound (WebAudio, no external assets) ---
  const MUTE_KEY = 'match3dogs:muted';
  let muted = localStorage.getItem(MUTE_KEY) === '1';
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.08, when = 0) {
    if (muted) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  const sfx = {
    swap:    () => tone(520, 0.08, 'square', 0.06),
    bad:     () => { tone(180, 0.10, 'square', 0.06); tone(140, 0.10, 'square', 0.06, 0.05); },
    match:   () => { tone(523, 0.12, 'triangle'); tone(659, 0.12, 'triangle', 0.08, 0.05); tone(784, 0.14, 'triangle', 0.08, 0.10); },
    special: () => { tone(659, 0.10, 'sawtooth'); tone(880, 0.12, 'sawtooth', 0.08, 0.05); tone(1175, 0.18, 'sawtooth', 0.08, 0.12); },
    bonus:   () => tone(988, 0.14, 'triangle', 0.09),
    end:     () => { tone(392, 0.18, 'sine', 0.08); tone(523, 0.20, 'sine', 0.08, 0.10); tone(659, 0.24, 'sine', 0.08, 0.22); tone(784, 0.32, 'sine', 0.08, 0.36); },
  };
  function setMuted(next) {
    muted = next;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', String(muted));
  }
  setMuted(muted); // initialize button label
  muteBtn.addEventListener('click', () => setMuted(!muted));

  // --- Settings dropdown ---
  const settingsBtn = document.getElementById('settings');
  const settingsPanel = document.getElementById('settings-panel');
  const reducedInput = document.getElementById('pref-reduced');
  const shapesInput = document.getElementById('pref-shapes');
  reducedInput.checked = prefs.reducedMotion;
  shapesInput.checked = prefs.shapes;

  function setSettingsOpen(open) {
    settingsPanel.classList.toggle('hidden', !open);
    settingsBtn.setAttribute('aria-expanded', String(open));
  }
  settingsBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setSettingsOpen(settingsPanel.classList.contains('hidden'));
  });
  document.addEventListener('click', (ev) => {
    if (!settingsPanel.contains(ev.target) && ev.target !== settingsBtn) {
      setSettingsOpen(false);
    }
  });

  reducedInput.addEventListener('change', () => {
    prefs.reducedMotion = reducedInput.checked;
    savePrefs(); applyPrefs();
  });
  shapesInput.addEventListener('change', () => {
    prefs.shapes = shapesInput.checked;
    savePrefs(); applyPrefs();
    // Re-render tiles so glyphs appear/disappear immediately
    if (cells && cells.length) {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (cells[r][c]) updateTile(r, c);
    }
  });

  boardEl.style.setProperty('--cols', COLS);
  boardEl.style.setProperty('--rows', ROWS);

  /** @type {number[][]} grid[r][c] = kind */
  let grid = [];
  /** @type {(null|'h'|'v'|'bomb'|'rainbow')[][]} */
  let powers = [];
  /** @type {HTMLDivElement[][]} */
  let cells = [];
  let score = 0;
  let moves = START_MOVES;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let busy = false;
  let selected = null; // {r,c}
  let lastSwap = null; // {a:{r,c}, b:{r,c}} - to bias power-up placement
  let bestAtStart = best;

  const POWER_CLASS = { h: 'power-h', v: 'power-v', bomb: 'power-bomb', rainbow: 'power-rainbow' };

  function emptyPowers() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }
  function emptyBoolGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  }

  bestEl.textContent = String(best);

  function randKind(exclude = []) {
    let k;
    let safety = 0;
    do {
      k = Math.floor(rng() * KIND_COUNT);
      safety++;
    } while (exclude.includes(k) && safety < 20);
    return k;
  }

  function buildInitialGrid() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const exclude = [];
        if (c >= 2 && grid[r][c - 1] === grid[r][c - 2]) exclude.push(grid[r][c - 1]);
        if (r >= 2 && grid[r - 1][c] === grid[r - 2][c]) exclude.push(grid[r - 1][c]);
        grid[r][c] = randKind(exclude);
      }
    }
    if (!hasAnyMove()) buildInitialGrid();
  }

  function render() {
    boardEl.innerHTML = '';
    cells = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.setAttribute('role', 'gridcell');
        tile.dataset.r = String(r);
        tile.dataset.c = String(c);
        tile.dataset.kind = String(grid[r][c]);
        tile.innerHTML = dogSVG(grid[r][c]);
        if (powers[r][c]) tile.classList.add(POWER_CLASS[powers[r][c]]);
        cells[r][c] = tile;
        boardEl.appendChild(tile);
      }
    }
  }

  function updateTile(r, c, { animate } = {}) {
    const t = cells[r][c];
    if (!t) return;
    t.dataset.kind = String(grid[r][c]);
    t.innerHTML = dogSVG(grid[r][c]);
    // Reset power classes, then re-apply current
    t.classList.remove('power-h', 'power-v', 'power-bomb', 'power-rainbow');
    if (powers[r][c]) t.classList.add(POWER_CLASS[powers[r][c]]);
    if (animate === 'fall') {
      t.classList.remove('fall');
      // force reflow so animation restarts
      void t.offsetWidth;
      t.classList.add('fall');
    }
  }

  function setScore(v) {
    const grew = v > score;
    score = v;
    scoreEl.textContent = String(score);
    if (grew) {
      const stat = scoreEl.parentElement;
      stat.classList.remove('pulse');
      void stat.offsetWidth;
      stat.classList.add('pulse');
      setTimeout(() => stat.classList.remove('pulse'), 460);
    }
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      localStorage.setItem(BEST_KEY, String(best));
    }
  }

  function setMoves(v) {
    const grew = v > moves;
    moves = v;
    movesEl.textContent = String(moves);
    movesEl.classList.toggle('low', moves > 0 && moves <= 5);
    if (grew) {
      movesEl.classList.remove('bonus');
      void movesEl.offsetWidth;
      movesEl.classList.add('bonus');
      setTimeout(() => movesEl.classList.remove('bonus'), 460);
    }
  }

  function neighbors(r, c) {
    return [
      [r - 1, c], [r + 1, c],
      [r, c - 1], [r, c + 1],
    ].filter(([nr, nc]) => nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS);
  }

  function isAdjacent(a, b) {
    return (Math.abs(a.r - b.r) + Math.abs(a.c - b.c)) === 1;
  }

  function findRuns() {
    const hRuns = [], vRuns = [];
    for (let r = 0; r < ROWS; r++) {
      let runStart = 0;
      for (let c = 1; c <= COLS; c++) {
        if (c === COLS || grid[r][c] !== grid[r][runStart]) {
          const len = c - runStart;
          if (len >= 3) hRuns.push({ kind: grid[r][runStart], r, c0: runStart, c1: c - 1, len, dir: 'h' });
          runStart = c;
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      let runStart = 0;
      for (let r = 1; r <= ROWS; r++) {
        if (r === ROWS || grid[r][c] !== grid[runStart][c]) {
          const len = r - runStart;
          if (len >= 3) vRuns.push({ kind: grid[runStart][c], c, r0: runStart, r1: r - 1, len, dir: 'v' });
          runStart = r;
        }
      }
    }
    return { hRuns, vRuns };
  }

  function findMatches() {
    const matched = emptyBoolGrid();
    const { hRuns, vRuns } = findRuns();
    for (const run of hRuns)
      for (let c = run.c0; c <= run.c1; c++) matched[run.r][c] = true;
    for (const run of vRuns)
      for (let r = run.r0; r <= run.r1; r++) matched[r][run.c] = true;
    return matched;
  }

  function pickRunCell(run) {
    const cells = [];
    if (run.dir === 'h') for (let c = run.c0; c <= run.c1; c++) cells.push({ r: run.r, c });
    else for (let r = run.r0; r <= run.r1; r++) cells.push({ r, c: run.c });
    if (lastSwap) {
      for (const sc of [lastSwap.a, lastSwap.b]) {
        const hit = cells.find(p => p.r === sc.r && p.c === sc.c);
        if (hit) return hit;
      }
    }
    return cells[Math.floor(cells.length / 2)];
  }

  function classifyMatches() {
    const { hRuns, vRuns } = findRuns();
    const newPowers = []; // {r, c, type, kind}
    const used = new Set(); // "r,c" of cells now reserved as power-ups
    const key = (r, c) => `${r},${c}`;

    // 1. Bombs at intersections (cell in both an h-run and v-run of same kind)
    const hCellSet = new Map(); // key -> hRun
    for (const h of hRuns)
      for (let c = h.c0; c <= h.c1; c++) hCellSet.set(key(h.r, c), h);
    for (const v of vRuns) {
      for (let r = v.r0; r <= v.r1; r++) {
        const k = key(r, v.c);
        const h = hCellSet.get(k);
        if (h && h.kind === v.kind && !used.has(k)) {
          newPowers.push({ r, c: v.c, type: 'bomb', kind: v.kind });
          used.add(k);
        }
      }
    }

    // 2. Rainbow for runs of 5+
    for (const run of [...hRuns, ...vRuns]) {
      if (run.len < 5) continue;
      const cell = pickRunCell(run);
      const k = key(cell.r, cell.c);
      if (used.has(k)) continue;
      newPowers.push({ r: cell.r, c: cell.c, type: 'rainbow', kind: run.kind });
      used.add(k);
    }

    // 3. Stripes for runs of length 4
    for (const run of [...hRuns, ...vRuns]) {
      if (run.len !== 4) continue;
      // Skip if any cell already became a power-up
      let claimed = false;
      if (run.dir === 'h') {
        for (let c = run.c0; c <= run.c1; c++) if (used.has(key(run.r, c))) { claimed = true; break; }
      } else {
        for (let r = run.r0; r <= run.r1; r++) if (used.has(key(r, run.c))) { claimed = true; break; }
      }
      if (claimed) continue;
      const cell = pickRunCell(run);
      const type = run.dir === 'h' ? 'h' : 'v';
      newPowers.push({ r: cell.r, c: cell.c, type, kind: run.kind });
      used.add(key(cell.r, cell.c));
    }

    return { newPowers, spared: used };
  }

  function applyPower(r, c, rainbowTargetKind) {
    // Returns array of {r,c} cells to additionally clear (excluding self).
    const out = [];
    const type = powers[r][c];
    if (!type) return out;
    if (type === 'h') {
      for (let cc = 0; cc < COLS; cc++) if (cc !== c) out.push({ r, c: cc });
    } else if (type === 'v') {
      for (let rr = 0; rr < ROWS; rr++) if (rr !== r) out.push({ r: rr, c });
    } else if (type === 'bomb') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr === r && nc === c) continue;
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push({ r: nr, c: nc });
        }
      }
    } else if (type === 'rainbow') {
      const target = rainbowTargetKind != null ? rainbowTargetKind : grid[r][c];
      for (let rr = 0; rr < ROWS; rr++) {
        for (let cc = 0; cc < COLS; cc++) {
          if (rr === r && cc === c) continue;
          if (grid[rr][cc] === target) out.push({ r: rr, c: cc });
        }
      }
    }
    return out;
  }

  function countMatches(matched) {
    let n = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (matched[r][c]) n++;
    return n;
  }

  function swap(a, b) {
    const t = grid[a.r][a.c];
    grid[a.r][a.c] = grid[b.r][b.c];
    grid[b.r][b.c] = t;
  }

  function wouldMatch(a, b) {
    swap(a, b);
    const m = findMatches();
    const yes = countMatches(m) > 0;
    swap(a, b);
    return yes;
  }

  function hasAnyMove() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c + 1 < COLS && wouldMatch({r, c}, {r, c: c + 1})) return true;
        if (r + 1 < ROWS && wouldMatch({r, c}, {r: r + 1, c})) return true;
      }
    }
    return false;
  }

  function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

  function showFloater(text, r, c) {
    const tile = cells[r][c];
    if (!tile) return;
    const f = document.createElement('div');
    f.className = 'floater';
    f.textContent = text;
    const rect = tile.getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();
    f.style.left = `${rect.left - boardRect.left + rect.width / 2 - 10}px`;
    f.style.top  = `${rect.top - boardRect.top + rect.height / 2 - 10}px`;
    boardEl.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  // Combo banner shown for chains of 2+
  const COMBO_TEXTS = { 2: 'Nice!', 3: 'Great!', 4: 'Pawesome!' };
  function showCombo(chain) {
    if (chain < 2) return;
    comboEl.textContent = chain >= 5 ? 'Wow!' : (COMBO_TEXTS[chain] || 'Combo!');
    comboEl.classList.remove('hidden');
    comboEl.style.animation = 'none';
    void comboEl.offsetWidth;
    comboEl.style.animation = '';
    clearTimeout(showCombo._t);
    showCombo._t = setTimeout(() => comboEl.classList.add('hidden'), 900);
  }

  const PARTICLE_SYMBOLS = ['❤', '🐾', '✨'];
  function spawnParticles(r, c, count = 3) {
    const tile = cells[r][c];
    if (!tile) return;
    const rect = tile.getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();
    const baseX = rect.left - boardRect.left + rect.width / 2;
    const baseY = rect.top - boardRect.top + rect.height / 2;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'particle';
      p.textContent = PARTICLE_SYMBOLS[Math.floor(Math.random() * PARTICLE_SYMBOLS.length)];
      p.style.left = `${baseX - 8}px`;
      p.style.top  = `${baseY - 8}px`;
      const angle = Math.random() * Math.PI * 2;
      const dist = 28 + Math.random() * 28;
      p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(angle) * dist - 12}px`);
      p.style.setProperty('--rot', `${Math.random() * 90 - 45}deg`);
      boardEl.appendChild(p);
      setTimeout(() => p.remove(), 820);
    }
  }

  function renderStars() {
    const stars = score >= GOAL ? 3 : (score >= GOAL / 2 ? 2 : (score > 0 ? 1 : 0));
    overlayStarsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      s.className = 'star ' + (i < stars ? 'on' : 'off');
      s.textContent = '★';
      overlayStarsEl.appendChild(s);
    }
    return stars;
  }

  async function tweenSwap(a, b) {
    const tileA = cells[a.r][a.c];
    const tileB = cells[b.r][b.c];
    const rectA = tileA.getBoundingClientRect();
    const rectB = tileB.getBoundingClientRect();
    const dx = rectB.left - rectA.left;
    const dy = rectB.top - rectA.top;
    tileA.classList.add('swapping');
    tileB.classList.add('swapping');
    void tileA.offsetWidth; // commit base state with transition active
    tileA.style.transform = `translate(${dx}px, ${dy}px)`;
    tileB.style.transform = `translate(${-dx}px, ${-dy}px)`;
    await delay(200);
    tileA.classList.remove('swapping');
    tileB.classList.remove('swapping');
    tileA.style.transform = '';
    tileB.style.transform = '';
  }

  async function clearAndRefill(initialTriggers = []) {
    let chain = 0;
    let totalGained = 0;
    let pending = initialTriggers.slice(); // [{r,c,target?}]

    while (true) {
      const matched = findMatches();
      const matchCount = countMatches(matched);
      if (matchCount === 0 && pending.length === 0) break;
      chain++;

      // 1. Classify natural matches into power-up creations (so spared cells survive)
      const { newPowers, spared } = matchCount > 0 ? classifyMatches() : { newPowers: [], spared: new Set() };
      const powerCells = new Set(newPowers.map(p => `${p.r},${p.c}`));
      if (matchCount > 0) sfx.match();
      if (newPowers.length > 0 || pending.length > 0) sfx.special();

      // 2. Compute clears: matched (minus spared) + expansions from triggered power-ups
      const clearGrid = emptyBoolGrid();
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (matched[r][c] && !spared.has(`${r},${c}`)) clearGrid[r][c] = true;
        }
      }

      // Process triggered power-ups (BFS — chaining)
      const queue = pending.slice();
      pending = [];
      const queued = new Set(queue.map(t => `${t.r},${t.c}`));
      // Also auto-trigger any matched cells that already hold a power-up (and weren't spared)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (clearGrid[r][c] && powers[r][c] && !queued.has(`${r},${c}`)) {
            queue.push({ r, c });
            queued.add(`${r},${c}`);
          }
        }
      }

      while (queue.length) {
        const t = queue.shift();
        if (!powers[t.r][t.c]) continue;
        clearGrid[t.r][t.c] = true;
        const expanded = applyPower(t.r, t.c, t.target);
        for (const cell of expanded) {
          if (!clearGrid[cell.r][cell.c]) {
            clearGrid[cell.r][cell.c] = true;
            // Chain: another power-up in the affected zone fires too
            if (powers[cell.r][cell.c] && !queued.has(`${cell.r},${cell.c}`)) {
              queue.push({ r: cell.r, c: cell.c });
              queued.add(`${cell.r},${cell.c}`);
            }
          }
        }
      }

      // 3. Apply animations + score
      const matchedCoords = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (clearGrid[r][c]) {
            matchedCoords.push([r, c]);
            cells[r][c].classList.add('match');
            // Heart/paw particles on a subset of cleared cells (cap to avoid DOM thrash)
            if (matchedCoords.length <= 8) spawnParticles(r, c, 2);
          }
        }
      }
      const cleared = matchedCoords.length;
      const gained = cleared * 10 * chain;
      totalGained += gained;
      setScore(score + gained);
      if (cleared > 0) {
        const [r0, c0] = matchedCoords[0];
        showFloater(`+${gained}`, r0, c0);
      }
      showCombo(chain);
      // Streak bonus: every chain >= 3 grants +1 move
      if (chain >= 3) {
        setMoves(moves + 1);
        sfx.bonus();
      }

      await delay(280);

      // 4. Remove cleared cells
      for (const [r, c] of matchedCoords) {
        grid[r][c] = -1;
        powers[r][c] = null;
      }

      // 5. Apply newPowers to grid (overwriting kind + setting power)
      for (const p of newPowers) {
        // Only apply if cell wasn't somehow swept by an expansion (shouldn't happen since spared)
        grid[p.r][p.c] = p.kind;
        powers[p.r][p.c] = p.type;
      }

      // 6. Gravity: drop tiles + their powers per column
      for (let c = 0; c < COLS; c++) {
        let writeRow = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) {
          if (grid[r][c] !== -1) {
            if (writeRow !== r) {
              grid[writeRow][c] = grid[r][c];
              powers[writeRow][c] = powers[r][c];
              grid[r][c] = -1;
              powers[r][c] = null;
            }
            writeRow--;
          }
        }
        for (let r = writeRow; r >= 0; r--) {
          grid[r][c] = Math.floor(rng() * KIND_COUNT);
          powers[r][c] = null;
        }
      }

      // 7. Re-render
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          updateTile(r, c, { animate: 'fall' });
        }
      }

      // After the first pass, no more swap-driven biasing for power placement
      lastSwap = null;

      await delay(260);
    }

    return { chain, totalGained };
  }

  // --- Hint system ---
  const HINT_DELAY_MS = 5000;
  let hintTimer = null;
  let hintTiles = [];
  function clearHint() {
    for (const t of hintTiles) t && t.classList.remove('hint');
    hintTiles = [];
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  }
  function scheduleHint() {
    clearHint();
    hintTimer = setTimeout(showHint, HINT_DELAY_MS);
  }
  function showHint() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        // Power-ups always have a useful swap, suggest one
        if (powers[r][c]) {
          const ns = neighbors(r, c);
          if (ns.length) {
            const [nr, nc] = ns[0];
            hintTiles = [cells[r][c], cells[nr][nc]];
            hintTiles.forEach(t => t.classList.add('hint'));
            return;
          }
        }
        if (c + 1 < COLS && wouldMatch({ r, c }, { r, c: c + 1 })) {
          hintTiles = [cells[r][c], cells[r][c + 1]];
          hintTiles.forEach(t => t.classList.add('hint'));
          return;
        }
        if (r + 1 < ROWS && wouldMatch({ r, c }, { r: r + 1, c })) {
          hintTiles = [cells[r][c], cells[r + 1][c]];
          hintTiles.forEach(t => t.classList.add('hint'));
          return;
        }
      }
    }
  }

  function swapPowers(a, b) {
    const t = powers[a.r][a.c];
    powers[a.r][a.c] = powers[b.r][b.c];
    powers[b.r][b.c] = t;
  }

  async function attemptSwap(a, b) {
    if (busy) return;
    if (!isAdjacent(a, b)) return;
    busy = true;

    const tileA = cells[a.r][a.c];
    const tileB = cells[b.r][b.c];

    const aIsPower = !!powers[a.r][a.c];
    const bIsPower = !!powers[b.r][b.c];
    const isPowerSwap = aIsPower || bIsPower;

    // Validate without committing the swap so invalid swaps don't tween
    const valid = isPowerSwap || wouldMatch(a, b);
    if (!valid) {
      sfx.bad();
      tileA.classList.add('swap-bad');
      tileB.classList.add('swap-bad');
      await delay(280);
      tileA.classList.remove('swap-bad');
      tileB.classList.remove('swap-bad');
      busy = false;
      return;
    }

    // Tween the visual swap, then commit grid + powers
    sfx.swap();
    await tweenSwap(a, b);
    swap(a, b);
    swapPowers(a, b);

    // Build trigger list for any power-ups now at the swap sites
    const triggers = [];
    if (aIsPower) {
      // Power that was at a is now at b. For rainbow, target = kind of the OTHER tile
      // which is now at a (or random if both sides were powers).
      const isRainbow = powers[b.r][b.c] === 'rainbow';
      const target = isRainbow ? (bIsPower ? Math.floor(rng() * KIND_COUNT) : grid[a.r][a.c]) : undefined;
      triggers.push({ r: b.r, c: b.c, target });
    }
    if (bIsPower) {
      const isRainbow = powers[a.r][a.c] === 'rainbow';
      const target = isRainbow ? (aIsPower ? Math.floor(rng() * KIND_COUNT) : grid[b.r][b.c]) : undefined;
      triggers.push({ r: a.r, c: a.c, target });
    }
    if (triggers.length) sfx.special();

    updateTile(a.r, a.c);
    updateTile(b.r, b.c);
    setMoves(moves - 1);
    lastSwap = { a: { r: a.r, c: a.c }, b: { r: b.r, c: b.c } };

    await clearAndRefill(triggers);

    if (!hasAnyMove()) {
      await delay(120);
      reshuffleInPlace();
    }

    busy = false;
    if (moves <= 0) endGame();
    else scheduleHint();
  }

  function reshuffleInPlace() {
    // Collect (kind, power) pairs and shuffle them together so power-ups stay assigned to their tile
    const flat = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) flat.push({ k: grid[r][c], p: powers[r][c] });
    let attempts = 0;
    while (attempts < 50) {
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [flat[i], flat[j]] = [flat[j], flat[i]];
      }
      let i = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        grid[r][c] = flat[i].k;
        powers[r][c] = flat[i].p;
        i++;
      }
      if (countMatches(findMatches()) === 0 && hasAnyMove()) break;
      attempts++;
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) updateTile(r, c, { animate: 'fall' });
  }

  function endGame() {
    clearHint();
    sfx.end();
    const stars = renderStars();
    overlayTitle.textContent = stars >= 3 ? 'Pawesome!' : stars === 2 ? 'Good run!' : stars === 1 ? 'So close!' : 'Game over';
    overlayText.textContent = `Score ${score} / ${GOAL}${score > bestAtStart ? ' · New best!' : ''}`;
    overlay.classList.remove('hidden');
  }

  function newGame(nextMode) {
    if (nextMode) mode = nextMode;
    // Set RNG and per-mode score targets
    if (mode.kind === 'classic') {
      rng = Math.random;
    } else if (mode.kind === 'daily') {
      rng = mulberry32(fnv1a('daily:' + mode.dateKey));
    } else if (mode.kind === 'level') {
      // Per-level deterministic seed; consistent across reloads
      rng = mulberry32((mode.n * 0x9e3779b1) >>> 0);
    } else {
      rng = Math.random;
    }
    setScore(0);
    setMoves(START_MOVES);
    overlay.classList.add('hidden');
    selected = null;
    lastSwap = null;
    bestAtStart = best;
    powers = emptyPowers();
    buildInitialGrid();
    render();
    // Staggered reveal: each row falls in slightly later than the one above it
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = cells[r][c];
        if (!t) continue;
        t.style.animation = 'none';
        void t.offsetWidth;
        t.style.animation = '';
        t.classList.remove('fall');
        t.style.animationDelay = `${r * 35}ms`;
        t.classList.add('fall');
        setTimeout(((tile) => () => { tile.style.animationDelay = ''; tile.classList.remove('fall'); })(t), 320 + r * 35 + 50);
      }
    }
    busy = true;
    clearAndRefill().then(() => { busy = false; scheduleHint(); });
  }

  function selectTile(r, c) {
    if (busy) return;
    const cell = cells[r][c];
    if (!selected) {
      selected = { r, c };
      cell.classList.add('selected');
      return;
    }
    if (selected.r === r && selected.c === c) {
      cell.classList.remove('selected');
      selected = null;
      return;
    }
    if (isAdjacent(selected, { r, c })) {
      const prev = cells[selected.r][selected.c];
      prev.classList.remove('selected');
      const a = selected;
      selected = null;
      attemptSwap(a, { r, c });
    } else {
      // change selection
      const prev = cells[selected.r][selected.c];
      prev.classList.remove('selected');
      selected = { r, c };
      cell.classList.add('selected');
    }
  }

  // ----- Input: clicks for desktop, drag/swipe for touch -----
  function getCellFromEvent(ev) {
    const point = ev.touches ? ev.touches[0] : ev;
    const el = document.elementFromPoint(point.clientX, point.clientY);
    if (!el || !el.classList.contains('tile')) return null;
    return { r: Number(el.dataset.r), c: Number(el.dataset.c), el };
  }

  let dragStart = null; // {r,c, x,y}

  boardEl.addEventListener('pointerdown', (ev) => {
    if (busy) return;
    clearHint();
    ensureAudio();
    // The dog SVG sits inside the tile and may be the actual event.target;
    // walk up to the tile container.
    const t = ev.target && ev.target.closest && ev.target.closest('.tile');
    if (!t) return;
    const r = Number(t.dataset.r), c = Number(t.dataset.c);
    dragStart = { r, c, x: ev.clientX, y: ev.clientY, moved: false };
    try { boardEl.setPointerCapture(ev.pointerId); } catch {}
  });

  boardEl.addEventListener('pointermove', (ev) => {
    if (!dragStart || busy) return;
    const dx = ev.clientX - dragStart.x;
    const dy = ev.clientY - dragStart.y;
    const threshold = 18;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    dragStart.moved = true;
    let dr = 0, dc = 0;
    if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1;
    else dr = dy > 0 ? 1 : -1;
    const target = { r: dragStart.r + dr, c: dragStart.c + dc };
    if (target.r < 0 || target.r >= ROWS || target.c < 0 || target.c >= COLS) {
      dragStart = null;
      return;
    }
    const a = { r: dragStart.r, c: dragStart.c };
    dragStart = null;
    if (selected) {
      cells[selected.r][selected.c].classList.remove('selected');
      selected = null;
    }
    attemptSwap(a, target);
  });

  function endDrag(ev) {
    if (!dragStart) return;
    if (!dragStart.moved) {
      // treat as tap/click
      selectTile(dragStart.r, dragStart.c);
    }
    dragStart = null;
  }

  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);

  // Buttons
  restartBtn.addEventListener('click', newGame);
  newGameBtn.addEventListener('click', newGame);

  // Prevent context menu on long-press
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

  // Kick off
  newGame();
})();
