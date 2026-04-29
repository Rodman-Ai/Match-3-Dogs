(() => {
  'use strict';

  const COLS = 8;
  const ROWS = 8;
  const START_MOVES = 30;
  const DOGS = ['🐕', '🐩', '🐶', '🦮', '🐕‍🦺', '🌭']; // 6 dog "kinds" (last is hot dog for fun)
  const KIND_COUNT = DOGS.length;
  const BEST_KEY = 'match3dogs:best';

  const boardEl = document.getElementById('board');
  const scoreEl = document.getElementById('score');
  const movesEl = document.getElementById('moves');
  const bestEl  = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText  = document.getElementById('overlay-text');
  const restartBtn = document.getElementById('restart');
  const newGameBtn = document.getElementById('newGame');

  boardEl.style.setProperty('--cols', COLS);
  boardEl.style.setProperty('--rows', ROWS);

  /** @type {number[][]} grid[r][c] = kind */
  let grid = [];
  /** @type {HTMLDivElement[][]} */
  let cells = [];
  let score = 0;
  let moves = START_MOVES;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let busy = false;
  let selected = null; // {r,c}

  bestEl.textContent = String(best);

  function randKind(exclude = []) {
    let k;
    let safety = 0;
    do {
      k = Math.floor(Math.random() * KIND_COUNT);
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
        tile.textContent = DOGS[grid[r][c]];
        cells[r][c] = tile;
        boardEl.appendChild(tile);
      }
    }
  }

  function updateTile(r, c, { animate } = {}) {
    const t = cells[r][c];
    if (!t) return;
    t.dataset.kind = String(grid[r][c]);
    t.textContent = DOGS[grid[r][c]];
    if (animate === 'fall') {
      t.classList.remove('fall');
      // force reflow so animation restarts
      void t.offsetWidth;
      t.classList.add('fall');
    }
  }

  function setScore(v) {
    score = v;
    scoreEl.textContent = String(score);
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      localStorage.setItem(BEST_KEY, String(best));
    }
  }

  function setMoves(v) {
    moves = v;
    movesEl.textContent = String(moves);
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

  function findMatches() {
    const matched = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    // horizontal
    for (let r = 0; r < ROWS; r++) {
      let runStart = 0;
      for (let c = 1; c <= COLS; c++) {
        if (c === COLS || grid[r][c] !== grid[r][runStart]) {
          if (c - runStart >= 3) {
            for (let k = runStart; k < c; k++) matched[r][k] = true;
          }
          runStart = c;
        }
      }
    }
    // vertical
    for (let c = 0; c < COLS; c++) {
      let runStart = 0;
      for (let r = 1; r <= ROWS; r++) {
        if (r === ROWS || grid[r][c] !== grid[runStart][c]) {
          if (r - runStart >= 3) {
            for (let k = runStart; k < r; k++) matched[k][c] = true;
          }
          runStart = r;
        }
      }
    }
    return matched;
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

  async function clearAndRefill() {
    let chain = 0;
    let totalGained = 0;

    while (true) {
      const matched = findMatches();
      const matchCount = countMatches(matched);
      if (matchCount === 0) break;
      chain++;

      // animate matched tiles
      const matchedCoords = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (matched[r][c]) {
            matchedCoords.push([r, c]);
            cells[r][c].classList.add('match');
          }
        }
      }

      const gained = matchCount * 10 * chain;
      totalGained += gained;
      setScore(score + gained);

      // floater on the centroid of the largest cluster - keep it simple and just put on first tile
      if (matchedCoords.length) {
        const [r0, c0] = matchedCoords[0];
        showFloater(`+${gained}`, r0, c0);
      }

      await delay(280);

      // remove matched (mark -1)
      for (const [r, c] of matchedCoords) grid[r][c] = -1;

      // gravity: drop existing tiles down per column
      for (let c = 0; c < COLS; c++) {
        let writeRow = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) {
          if (grid[r][c] !== -1) {
            if (writeRow !== r) {
              grid[writeRow][c] = grid[r][c];
              grid[r][c] = -1;
            }
            writeRow--;
          }
        }
        // fill the rest at the top with new kinds
        for (let r = writeRow; r >= 0; r--) {
          grid[r][c] = Math.floor(Math.random() * KIND_COUNT);
        }
      }

      // re-render with fall animation on changed tiles
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          updateTile(r, c, { animate: 'fall' });
        }
      }

      await delay(260);
    }

    return { chain, totalGained };
  }

  async function attemptSwap(a, b) {
    if (busy) return;
    if (!isAdjacent(a, b)) return;
    busy = true;

    const tileA = cells[a.r][a.c];
    const tileB = cells[b.r][b.c];

    swap(a, b);
    if (countMatches(findMatches()) === 0) {
      // invalid: revert with shake
      swap(a, b);
      tileA.classList.add('swap-bad');
      tileB.classList.add('swap-bad');
      await delay(280);
      tileA.classList.remove('swap-bad');
      tileB.classList.remove('swap-bad');
      busy = false;
      return;
    }

    // commit: update visuals, count move
    updateTile(a.r, a.c);
    updateTile(b.r, b.c);
    setMoves(moves - 1);

    await clearAndRefill();

    // ensure board has moves; if not, reshuffle
    if (!hasAnyMove()) {
      await delay(120);
      reshuffleInPlace();
    }

    busy = false;
    if (moves <= 0) endGame();
  }

  function reshuffleInPlace() {
    // collect all tiles, shuffle until at least one move exists and no immediate matches
    const flat = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) flat.push(grid[r][c]);
    let attempts = 0;
    while (attempts < 50) {
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [flat[i], flat[j]] = [flat[j], flat[i]];
      }
      let i = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid[r][c] = flat[i++];
      if (countMatches(findMatches()) === 0 && hasAnyMove()) break;
      attempts++;
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) updateTile(r, c, { animate: 'fall' });
  }

  function endGame() {
    overlayTitle.textContent = 'Pawesome!';
    overlayText.textContent = `Final score: ${score}${score >= best ? '  ·  New best!' : ''}`;
    overlay.classList.remove('hidden');
  }

  function newGame() {
    setScore(0);
    setMoves(START_MOVES);
    overlay.classList.add('hidden');
    selected = null;
    buildInitialGrid();
    render();
    // resolve any rare initial cascade just in case
    busy = true;
    clearAndRefill().then(() => { busy = false; });
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
    const t = ev.target;
    if (!t || !t.classList || !t.classList.contains('tile')) return;
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
