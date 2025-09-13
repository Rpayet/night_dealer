const T = { ATK: 0, HEX: 1, WARD: 2, ECLIPSE: 3 };
const ICON = ['⚔️', '👁️', '🛡️', '🌙'];
const BEATS = [T.HEX, T.WARD, T.ATK];
const OWN_COL = { 1: '#4da3ff', 2: '#ff4d4d' };
const ISO_COL = { dark: '#040404ff', dark2: '#4E2A1B', hl: '#ffffff' };
const COL_TRAP = '#E2C044';
const COL_CURSE = '#9b59ff';
const P1_LABEL = 'Stray';
const P2_LABEL = 'Ankidu';

function isAdj(a, b) { return ADJ[a]?.includes(b); }

function ankiduHint(msg) {
  if (!Ankidu.elText) { console.warn('[hint]', msg); return; }
  const old = Ankidu.elText.textContent;
  Ankidu.elText.textContent = msg;
  setTimeout(() => {
    if (Ankidu.elText && Ankidu.elText.textContent === msg) {
      Ankidu.elText.textContent = old;
    }
  }, 1400);
}


const MSG = {
  start: {
    body: 'Good night. How can I help you?',
    choices: [
      { label: 'I seek time before dawn.', action: () => seedRound() },
      { label: 'Rules', action: () => Ankidu.showHelp() }
    ]
  },
  rules: {
    body: [
      'Goal: Win 2 out of 3 rounds by controlling the most tiles',
      'Types: ATK ⚔️ > HEX 👁️ > WARD 🛡️ > ATK ⚔️.',
      'Place up to 2 tiles on T1–T2 (adjacent), 1 tile on T3.',
      '🛡️ WARD shields itself (+1) and one adjacent ally.',
      '👁️ HEX: curse an adjacent enemy (delayed flip) or place a trap on an empty adjacent cell (immediate flip on entry).',
      'A curse can be countered by WARD shields',
      '🌙 ECLIPSE: choose type on placement (once per round).',
      'Omen: defender may cancel one flip at start of their turn.'
    ].join('\n'),
    choices: [{ label: 'Close', action: () => Ankidu.closeDialog() }]
  },
  end: (winnerTxt) => ({
    body: winnerTxt + '\nWant to play again?',
    choices: [{ label: 'Rematch', action: () => { gameState.currentRound = 1; gameState.roundWins = { 1: 0, 2: 0 }; seedRound(); } }]
  })
};

// ==== Canvas iso ====
let iso, ictx;
let DPR = 1;
const TILE_W = 128;
const TILE_H = 64;
let ORIGIN_X = 160, ORIGIN_Y = 110;
const POS = Array(9);
const PATH = Array(9);
let hoverCell = -1;
let needsRedraw = true;
let trapByCell = new Uint8Array(9);
let WHEEL_EL = [];
const SCR = {
  atk: Array.from({ length: 9 }, () => ({ p1: 0, p2: 0 })),
};

function initIsoCanvas() {
  iso = document.getElementById('iso');
  if (!iso) { console.warn('Canvas #iso not found'); return; }
  ictx = iso.getContext('2d', { alpha: true });
  ictx.imageSmoothingEnabled = false;
  fitIsoDPI();
  window.addEventListener('resize', fitIsoDPI, { passive: true });
  iso.addEventListener('pointerdown', handleIsoPointer);
  iso.addEventListener('pointermove', handleIsoHover);
  iso.addEventListener('pointerleave', () => { hoverCell = -1; invalidate(); });
  requestAnimationFrame(renderLoop);
}

function fitIsoDPI() {
  DPR = Math.max(1, window.devicePixelRatio || 1);
  const cssW = iso.clientWidth || 320, cssH = iso.clientHeight || 240;
  iso.width = Math.round(cssW * DPR);
  iso.height = Math.round(cssH * DPR);
  ictx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ORIGIN_X = (cssW / 2) | 0;
  ORIGIN_Y = ((cssH / 2) - 20) | 0;
  for (let i = 0; i < 9; i++) {
    const x = i % 3, y = (i / 3) | 0;
    POS[i] = isoPos(x, y);
    const p = new Path2D();
    const { x: cx, y: cy } = POS[i], w = TILE_W, h = TILE_H;
    p.moveTo(cx, cy - h / 2);
    p.lineTo(cx + w / 2, cy);
    p.lineTo(cx, cy + h / 2);
    p.lineTo(cx - w / 2, cy);
    p.closePath();
    PATH[i] = p;
  }
  ictx.font = '16px system-ui, sans-serif';
  ictx.textAlign = 'center';
  ictx.textBaseline = 'middle';
  invalidate();
}

function isoPos(x, y) {
  return { x: ORIGIN_X + (x - y) * (TILE_W / 2), y: ORIGIN_Y + (x + y) * (TILE_H / 2) };
}

function diamondPath(ctx, cx, cy, w = TILE_W, h = TILE_H) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
}

function pointInDiamond(px, py, cx, cy, w = TILE_W, h = TILE_H) {
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);
  return (dx / (w / 2) + dy / (h / 2)) <= 1;
}

// ==== Static adjacency (inline, no helper) ====
const ADJ = [
  [1, 3],
  [0, 2, 4],
  [1, 5],
  [0, 4, 6],
  [1, 3, 5, 7],
  [2, 4, 8],
  [3, 7],
  [4, 6, 8],
  [5, 7]
];

function invalidate() { needsRedraw = true; }
function renderLoop() {
  if (needsRedraw) { drawBoardIso(); needsRedraw = false; }
  requestAnimationFrame(renderLoop);
}

let gameState = {
  currentPlayer: 1,
  currentRound: 1,
  currentTurn: 1,
  roundWins: { 1: 0, 2: 0 },
  roundResults: [],
  board: Array(9).fill(null),
  turnsTaken: { 1: 0, 2: 0 },
  players: [
    {
      wheels: [T.ATK, T.HEX, T.WARD, T.ATK, T.HEX],
      usedWheels: [],
      rerollsUsed: 0,
      eclipseUsed: false,
      isHuman: true
    },
    {
      wheels: [T.ATK, T.HEX, T.WARD, T.ATK, T.HEX],
      usedWheels: [],
      rerollsUsed: 0,
      eclipseUsed: false,
      isHuman: false
    }
  ],
  placementState: {
    selectedWheel: null,
    pendingPlacements: [],
    adjacentHighlighted: [],
    awaitingWardTarget: null,
    awaitingHexChoice: null,
    awaitingEclipseChoice: null
  },
  phase: 'place',
  traps: [],
  gameOver: false
};

gameState.lastFlips = [];
gameState.omen = { 1: 0, 2: 1 };
gameState.rerollsLeft = { 1: 2, 2: 2 };
gameState.rerollUsedThisTurn = false;
gameState.turnSerial = 0;
gameState.firstMoveDone = { 1: false, 2: false };

function armCurse(targetCell, byPlayer) {
  const t = gameState.board[targetCell];
  if (!t) return;
  t.cu = { by: byPlayer, triggerOn: gameState.turnSerial + 1 };
}

let messages = [];

// Initialize the UI
function initializeUI(){
  createBoard();
  createWheels();
  gameState.currentRound = 1;
  gameState.roundWins = {1:0, 2:0};
  gameState.roundResults = [];
  Ankidu.init();
  const n1 = document.getElementById('p1Name'); if (n1) n1.textContent = P1_LABEL;
  const n2 = document.getElementById('p2Name'); if (n2) n2.textContent = P2_LABEL;
  Ankidu.say(
    MSG.start.body, 
    MSG.start.choices.map(c=>({label:c.label, onClick:c.action}))
  );
}



function startGame() {
  seedRound();
}

const Ankidu = {
  elText: null, elChoices: null,
  _stack: [],

  init() {
    this.elText = document.getElementById('bubbleText');
    this.elChoices = document.getElementById('bubbleChoices');
    document.getElementById('btnHelp')?.addEventListener('click', () => this.openRules());
    document.getElementById('bubbleCloseBtn')?.addEventListener('click', () => this.closeDialog());
  },

  say(text, choices = []) {
    if (!this.elText || !this.elChoices) this.init();
    if (!this.elText || !this.elChoices) return;

    this.elText.textContent = text;
    this.elChoices.innerHTML = '';
    for (const c of choices) {
      const b = document.createElement('button');
      b.className = 'choice';
      b.textContent = c.label;
      b.onclick = c.onClick;
      this.elChoices.appendChild(b);
    }
  },

  _snapshot() {
    const text = this.elText?.textContent || '';
    const nodes = Array.from(this.elChoices?.querySelectorAll('button') || []);
    const choices = nodes.map(btn => ({
      label: btn.textContent,
      onClick: btn.onclick
    }));
    return { text, choices };
  },

  openRules() {
    if (!this.elText || !this.elChoices) this.init();
    this._stack.push(this._snapshot());
    this.say(
      MSG.rules.body,
      [
        { label: 'Close', onClick: () => this.closeDialog() }
      ]
    );
  },

  closeDialog() {
    const prev = this._stack.pop();
    if (prev) this.say(prev.text, prev.choices);
    else this.say(MSG.start.body, MSG.start.choices.map(c => ({ label: c.label, onClick: c.action })));
  }
};

function canUseOmenNow() {
  const who = gameState.currentPlayer;
  return gameState.omen[who] && gameState.lastFlips && gameState.lastFlips.length > 0;
}

function applyOmenOn(idx) {
  const who = gameState.currentPlayer;
  if (!canUseOmenNow()) return false;
  const found = gameState.lastFlips.find(f => f.idx === idx);
  //TODO : Make an event on UI to alert the player
  if (!found) { return false; }
  const Tt = gameState.board[idx];
  Tt.p = found.from;
  gameState.omen[who] = 0;
  return true;
}

function createBoard() {
  initIsoCanvas();
}


function createWheels() {
  const p1Wheels = document.getElementById('player1Wheels');
  p1Wheels.innerHTML = '';
  WHEEL_EL = new Array(5);
  for (let i = 0; i < 5; i++) {
    const wheel = document.createElement('div');
    wheel.className = 'wheel';
    wheel.id = `p1-wheel-${i}`;
    wheel.onclick = () => wheelClick(0, i);
    p1Wheels.appendChild(wheel);
    WHEEL_EL[i] = wheel;
  }
}

function updateUI() {
  updateGameInfo();
  updateBoard();
  updateWheels();
  updateControls();
  updateSpecialEffects();
}

function updateGameInfo() {
  const p1s = document.getElementById('p1Score');
  const p2s = document.getElementById('p2Score');
  if (p1s) p1s.textContent = gameState.roundWins[1];
  if (p2s) p2s.textContent = gameState.roundWins[2];

  const bar = document.getElementById('scoreBar');
  if (bar){
    bar.classList.toggle('turn-p1', gameState.currentPlayer === 1);
    bar.classList.toggle('turn-p2', gameState.currentPlayer === 2);
  }
  const n1 = document.getElementById('p1Name');
  const n2 = document.getElementById('p2Name');
  if (n1 && n2) {
    n1.classList.remove('active','p1');
    n2.classList.remove('active','p2');
    if (gameState.currentPlayer === 1) {
      n1.classList.add('active','p1');
    } else {
      n2.classList.add('active','p2');
    }
  }
}

function drawBoardIso() {
  ictx.clearRect(0, 0, iso.width / DPR, iso.height / DPR);

  for (let i = 0; i < 9; i++) {
    const x = i % 3, y = (i / 3) | 0;
    ictx.fillStyle = ((x + y) & 1) ? ISO_COL.dark2 : ISO_COL.dark;
    ictx.fill(PATH[i]);
  }

  if (gameState.placementState.adjacentHighlighted?.length) {
    for (const i of gameState.placementState.adjacentHighlighted) {
      ictx.lineWidth = 2;
      ictx.setLineDash([4, 3]);
      ictx.strokeStyle = ISO_COL.hl;
      ictx.stroke(PATH[i]);
      ictx.setLineDash([]);
    }
  }

  for (let i = 0; i < 9; i++) {
    const t = gameState.board[i]; if (!t) continue;
    const { x: cx, y: cy } = POS[i];
    ictx.fillStyle = '#e6e6e6';
    ictx.fillText(ICON[t.t], cx, cy - 2);

    if (t.sh>0){
      ictx.fillStyle = '#3BA7A9';
      ictx.beginPath();
      ictx.arc(cx + 16, cy - 16, 5, 0, Math.PI*2);
      ictx.fill();
    }

    ictx.lineWidth = 2;
    ictx.strokeStyle = OWN_COL[t.p];
    ictx.stroke(PATH[i]);

    if (t.cu) {
      ictx.save();
      ictx.lineWidth = 2;
      ictx.setLineDash([2, 2]);
      ictx.strokeStyle = COL_CURSE;
      ictx.stroke(PATH[i]);
      ictx.restore();
    }
  }

  for (let i = 0; i < 9; i++) {
    const owner = trapByCell[i];
    if (!owner) continue;
    if (gameState.board[i]) continue;

    ictx.save();
    ictx.lineWidth = 2;
    ictx.setLineDash([4, 2]);
    ictx.strokeStyle = COL_TRAP;
    ictx.stroke(PATH[i]);
    ictx.restore();
  }

  if (gameState.lastFlips?.length) {
    for (const f of gameState.lastFlips) {
      const i = f.idx;
      ictx.lineWidth = 3;
      ictx.globalAlpha = 0.7;
      ictx.strokeStyle = OWN_COL[f.to];
      ictx.stroke(PATH[i]);
      ictx.globalAlpha = 1;
    }
  }

  if (hoverCell >= 0) {
    const i = hoverCell;
    ictx.lineWidth = 2;
    ictx.setLineDash([3, 3]);
    ictx.strokeStyle = ISO_COL.hl;
    ictx.stroke(PATH[i]);
    ictx.setLineDash([]);
  }
}

function updateBoard() { invalidate(); }

function handleIsoPointer(ev) {
  const r = iso.getBoundingClientRect();
  const px = ev.clientX - r.left, py = ev.clientY - r.top;
  for (let i = 0; i < 9; i++) {
    const p = POS[i];
    if (pointInDiamond(px, py, p.x, p.y)) { cellClick(i); invalidate(); return; }
  }
}

function handleIsoHover(ev) {
  const rect = iso.getBoundingClientRect();
  const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
  let found = -1;
  for (let i = 0; i < 9; i++) {
    const p = POS[i];
    if (pointInDiamond(px, py, p.x, p.y)) { found = i; break; }
  }
  const canPlace = (found >= 0) && isCellEmpty(found) &&
    (gameState.currentPlayer === 1) &&
    (gameState.phase === 'place') &&
    (gameState.placementState.selectedWheel !== null) &&
    (gameState.placementState.pendingPlacements.length === 0 ||
      gameState.placementState.adjacentHighlighted.includes(found) ||
      maxTilesAllowedForPlayer(gameState.currentPlayer) === 1);
  iso.style.cursor = canPlace ? 'pointer' : 'default';
  if (hoverCell !== (canPlace ? found : -1)) { hoverCell = canPlace ? found : -1; invalidate(); }
}

function updateWheels() {
  for (let i = 0; i < 5; i++) {
    const wheelEl = WHEEL_EL[i];
    const wheel = gameState.players[0].wheels[i];
    const isUsed = gameState.players[0].usedWheels.includes(i) || wheelPendingUsed(i);
    const isSelected = gameState.placementState.selectedWheel === i;
    wheelEl.textContent = ICON[wheel] || '?';
    wheelEl.className = 'wheel';

    if (isUsed) {
      wheelEl.classList.add('used');
    } else if (isSelected) {
      wheelEl.classList.add('selected');
    }
  }
}

function updateControls() {
  const isHumanTurn = gameState.players[gameState.currentPlayer - 1].isHuman;
  const me = gameState.currentPlayer;
  const canReroll = (me === 1) &&
    (gameState.firstMoveDone?.[me] === true) &&
    (!gameState.rerollUsedThisTurn) &&
    (gameState.rerollsLeft[me] > 0) &&
    (gameState.phase === 'place') &&
    (gameState.placementState.pendingPlacements.length === 0);

  const canValidate = gameState.placementState.pendingPlacements.length > 0 &&
    !gameState.placementState.awaitingWardTarget &&
    !gameState.placementState.awaitingHexChoice &&
    !gameState.placementState.awaitingEclipseChoice;

  const rerollEl = document.getElementById('rerollBtn');
  if (rerollEl) rerollEl.disabled = !isHumanTurn || !canReroll;
  const skipBtn = document.getElementById('skipRerollBtn');
  if (skipBtn) { skipBtn.disabled = true; skipBtn.style.display = 'none'; }
  const validateEl = document.getElementById('validateBtn');
  if (validateEl) validateEl.disabled = !isHumanTurn || !canValidate;
  const cancelEl = document.getElementById('cancelBtn');
  if (cancelEl) cancelEl.disabled = !isHumanTurn || gameState.placementState.pendingPlacements.length === 0;
  const resetEl = document.getElementById('resetBtn');
  if (resetEl) resetEl.disabled = !isHumanTurn || gameState.placementState.pendingPlacements.length === 0;
}

function updateSpecialEffects() {
  if (gameState.currentPlayer === 1 && canUseOmenNow()) {
    const opts = gameState.lastFlips.map(f => ({
      label: `Cancel flip at cell ${f.idx}`,
      onClick: () => {
        const ok = applyOmenOn(f.idx);
        if (ok) {
          Ankidu.say('Omen used. The flip was undone.');
          updateUI();
        } else {
          Ankidu.say('Omen unavailable for that cell.');
        }
      }
    }));
    opts.push({ label: 'Keep all flips', onClick: () => { gameState.omen[1] = 0; updateUI(); } });
    Ankidu.say('🜂 Omen: you may cancel **one** flip that just happened.', opts);
    return;
  }
  if (gameState.placementState.awaitingWardTarget) {
    const { availableTargets } = gameState.placementState.awaitingWardTarget;
    Ankidu.say('🛡️ WARD: click an ADJACENT ALLY to shield.');
    return;
  }
  if (gameState.placementState.awaitingHexChoice) {
    const { curseTargets, trapTargets, tileCell } = gameState.placementState.awaitingHexChoice;
    const choices = [];
    curseTargets.forEach(idx => choices.push({ label: 'Curse ' + idx, onClick: () => handleHexChoice(tileCell, idx, 'curse') }));
    trapTargets.forEach(idx => choices.push({ label: 'Trap ' + idx, onClick: () => handleHexChoice(tileCell, idx, 'trap') }));
    Ankidu.say('🔮 HEX: click an ADJACENT cell — empty=TRAP (yellow outline), enemy=CURSE (purple outline).');
    return;
  }
  if (gameState.placementState.awaitingEclipseChoice) {
    const { tileCell } = gameState.placementState.awaitingEclipseChoice;
    Ankidu.say('🌙 ECLIPSE: choose an affinity.',
      [{ label: `${ICON[T.ATK]} ATK`, onClick: () => handleEclipseChoice(tileCell, T.ATK) },
      { label: `${ICON[T.HEX]} HEX`, onClick: () => handleEclipseChoice(tileCell, T.HEX) },
      { label: `${ICON[T.WARD]} WARD`, onClick: () => handleEclipseChoice(tileCell, T.WARD) }]);
    return;
  }

  const me = gameState.currentPlayer;
  const canRerollInfo = (me === 1) &&
    (gameState.firstMoveDone?.[me] === true) &&
    (!gameState.rerollUsedThisTurn) &&
    (gameState.rerollsLeft[me] > 0) &&
    (gameState.placementState.pendingPlacements.length === 0);
  Ankidu.say(canRerollInfo
    ? 'Select a wheel, then a cell. (You can reroll once before placing.)'
    : 'Select a wheel, then click a cell to place the tile.'
  );
}

function wheelPendingUsed(i) {
  return gameState.placementState.pendingPlacements.some(p => p.wheelIndex === i);
}

function wheelClick(player, wheelIndex) {
  if (player !== 0 || gameState.currentPlayer !== 1 || gameState.phase !== 'place') return;

  const isUsed = gameState.players[0].usedWheels.includes(wheelIndex) || wheelPendingUsed(wheelIndex);
  if (isUsed) return;

  gameState.placementState.selectedWheel = wheelIndex;
  updateAdjacentHighlights();
  updateUI();
}

function cellClick(cellIndex) {
  if (gameState.currentPlayer !== 1 || gameState.phase !== 'place') return;

  // --- Mode WARD: cliquer un allié adjacent pour le bouclier
  if (gameState.placementState.awaitingWardTarget) {
    const { tileCell, availableTargets } = gameState.placementState.awaitingWardTarget;
    if (isAdj(tileCell, cellIndex) && availableTargets.includes(cellIndex) && gameState.board[cellIndex]?.p === 1) {
      handleWardTarget(tileCell, cellIndex);
      gameState.placementState.adjacentHighlighted = [];
      updateUI();
    } else {
      ankiduHint("🛡️ Choisis un ALLIÉ adjacent.");
    }
    return;
  }

  if (gameState.placementState.awaitingHexChoice) {
    const { tileCell } = gameState.placementState.awaitingHexChoice;
    if (!isAdj(tileCell, cellIndex)) {
      ankiduHint("🔮 Choisis une case ADJACENTE (vide=TRAP, ennemie=CURSE).");
      return;
    }
    const t = gameState.board[cellIndex];
    if (!t) {
      handleHexChoice(tileCell, cellIndex, 'trap');
      gameState.placementState.adjacentHighlighted = [];
      updateUI();
    } else if (t.p === 2) {
      handleHexChoice(tileCell, cellIndex, 'curse');
      gameState.placementState.adjacentHighlighted = [];
      updateUI();
    } else {
      ankiduHint("🔮 Impossible sur un allié. Vise un ennemi ou une case vide.");
    }
    return;
  }

  if (gameState.placementState.selectedWheel === null) return;
  if (!isCellEmpty(cellIndex)) return;

  if (gameState.placementState.pendingPlacements.length === 1) {
    const maxTiles = maxTilesAllowedForPlayer(gameState.currentPlayer);
    if (maxTiles === 2) {
      if (!gameState.placementState.adjacentHighlighted.includes(cellIndex)) return;
    }
  }
  if (gameState.placementState.pendingPlacements.length >= maxTilesAllowedForPlayer(gameState.currentPlayer)) return;

  placeTile(cellIndex);
}

function maxTilesAllowedForPlayer(playerId) {
  const taken = (gameState.turnsTaken?.[playerId] ?? 0);
  return taken >= 2 ? 1 : 2;
}

function placeTile(cellIndex) {
  const wheelIndex = gameState.placementState.selectedWheel;
  let tileType = gameState.players[0].wheels[wheelIndex];

  if (tileType === T.ECLIPSE && gameState.players[0].eclipseUsed) tileType = T.ATK;

  const tile = { p: 1, t: tileType, sh: 0, cu: null };

  gameState.placementState.pendingPlacements.push({ wheelIndex, cellIndex, tileType });
  gameState.board[cellIndex] = tile;
  gameState.placementState.selectedWheel = null;

  const trappedByOpp = gameState.traps.some(tr => tr.cell === cellIndex && tr.player !== tile.p);
  gameState.placementState
    .pendingPlacements[gameState.placementState.pendingPlacements.length - 1]
    .trapped = trappedByOpp;

  if (!trappedByOpp) {
    if (tileType === T.WARD) startWardEffect(cellIndex);
    else if (tileType === T.HEX) startHexEffect(cellIndex);
    else if (tileType === T.ECLIPSE) startEclipseEffect(cellIndex);
  }
  updateAdjacentHighlights();
  updateUI();
}

function startWardEffect(cellIndex) {
  const adjacentAllies = ADJ[cellIndex].filter(c => {
    const ti = gameState.board[c];
    return ti && ti.p === 1;
  });

  if (adjacentAllies.length === 0) {
    const self = gameState.board[cellIndex];
    self.sh = 1;
    if (self.cu) self.cu = null;
    gameState.placementState.adjacentHighlighted = [];
  } else {
    gameState.placementState.awaitingWardTarget = {
      tileCell: cellIndex,
      availableTargets: adjacentAllies
    };
    gameState.placementState.adjacentHighlighted = adjacentAllies.slice();
  }
}

function startHexEffect(cellIndex) {
  const curseTargets = [];
  const trapTargets = [];
  ADJ[cellIndex].forEach(c => {
    const t = gameState.board[c];
    if (t && t.p !== 1) curseTargets.push(c);
    else if (!t) trapTargets.push(c);
  });

  gameState.placementState.awaitingHexChoice = {
    tileCell: cellIndex,
    curseTargets,
    trapTargets
  };
  gameState.placementState.adjacentHighlighted = [...curseTargets, ...trapTargets];
}

function startEclipseEffect(cellIndex) {
  gameState.placementState.awaitingEclipseChoice = {
    tileCell: cellIndex,
    wheelIndex: gameState.placementState.pendingPlacements[gameState.placementState.pendingPlacements.length - 1].wheelIndex
  };
}

function handleWardTarget(wardCell, targetCell) {
  const ward = gameState.board[wardCell];
  const ally = gameState.board[targetCell];
  ward.sh = 1; if (ward.cu) ward.cu = null;
  ally.sh = 1; if (ally.cu) ally.cu = null;
  gameState.placementState.awaitingWardTarget = null;

  updateUI();
}


function handleHexChoice(hexCell, targetCell, mode) {
  if (mode === 'curse') {
    const target = gameState.board[targetCell];
    if (target) {
      armCurse(targetCell, 1);
    }
  } else if (mode === 'trap') {
    const t = gameState.traps;
    for (let i = t.length - 1; i >= 0; i--) if (t[i].player === 1) t.splice(i, 1);
    t.push({ cell: targetCell, player: 1 });
    rebuildTrapIndex();
  }

  gameState.placementState.awaitingHexChoice = null;
  updateUI();
}

function handleEclipseChoice(eclipseCell, chosenType) {
  gameState.board[eclipseCell].t = chosenType;
  gameState.placementState.awaitingEclipseChoice = null;

  if (chosenType === T.WARD) {
    startWardEffect(eclipseCell);
  } else if (chosenType === T.HEX) {
    startHexEffect(eclipseCell);
  } else {
    gameState.placementState.adjacentHighlighted = [];
  }

  Ankidu.say(`🌙 ECLIPSE: Affinity ${ICON[chosenType]} chosen. You can continue your turn.`);
  updateUI();
}


function rollFaces(playerIndex, onlyUnused = true) {
  const P = gameState.players[playerIndex];
  const allowEclipse = !P.eclipseUsed;
  let eclipseRolled = false;
  for (let i = 0; i < 5; i++) {
    if (onlyUnused && P.usedWheels.includes(i)) continue;
    const pool = allowEclipse && !eclipseRolled ? [T.ATK, T.HEX, T.WARD, T.ECLIPSE] : [T.ATK, T.HEX, T.WARD];
    const face = pool[(Math.random() * pool.length) | 0];
    if (face === T.ECLIPSE) { P.wheels[i] = T.ECLIPSE; eclipseRolled = true; } else P.wheels[i] = face;
  }
}

function rerollAction() {
  const me = gameState.currentPlayer;

  if (me !== 1) return;
  if (gameState.phase !== 'place') return;

  if (gameState.placementState.pendingPlacements.length > 0) return;

  if (!gameState.firstMoveDone?.[me]) return;

  if (gameState.rerollUsedThisTurn) return;
  if (gameState.rerollsLeft[me] <= 0) return;

  rollFaces(0, true);
  gameState.rerollsLeft[me]--;
  gameState.rerollUsedThisTurn = true;
  updateUI();
}

function validateAction() {
  if (gameState.placementState.pendingPlacements.length === 0) return;

  if (gameState.placementState.awaitingWardTarget ||
    gameState.placementState.awaitingHexChoice ||
    gameState.placementState.awaitingEclipseChoice) {
    return;
  }

  const me = 1, opp = 2;
  const placements = gameState.placementState.pendingPlacements.slice();

  placements.forEach(p => {
    if (!gameState.players[0].usedWheels.includes(p.wheelIndex)) {
      gameState.players[0].usedWheels.push(p.wheelIndex);
    }
    if (gameState.players[0].wheels[p.wheelIndex] === T.ECLIPSE) {
      gameState.players[0].eclipseUsed = true;
    }
  });

  const flips = [];
  for (const p of placements) {
    if (p.trapped) {
      const trapIdx = gameState.traps.findIndex(t => t.cell === p.cellIndex && t.player === opp);
      if (trapIdx >= 0) {
        const ti = gameState.board[p.cellIndex];
        if (ti.sh > 0) { ti.sh = 0; }
        else { flips.push({ idx: p.cellIndex, from: ti.p, to: opp, src: 'TRAP' }); ti.p = opp; }
        gameState.traps.splice(trapIdx, 1);
        rebuildTrapIndex();
      }
    }
  }

  flips.push(...resolveCombatSimultaneousOn(gameState.board, me));

  gameState.lastFlips = flips.slice();

  gameState.placementState.pendingPlacements = [];
  gameState.placementState.adjacentHighlighted = [];
  gameState.rerollUsedThisTurn = false;
  gameState.turnSerial++;
  resolveCursesForPlayer(1);
  if (gameState.firstMoveDone[1] === false) gameState.firstMoveDone[1] = true;
  gameState.turnsTaken[1] = (gameState.turnsTaken[1] || 0) + 1;
  gameState.currentPlayer = 2;

  updateUI();

  setTimeout(simulateAITurn, 800);
}

function cancelAction() {
  if (gameState.placementState.pendingPlacements.length === 0) return;

  const lastPlacement = gameState.placementState.pendingPlacements.pop();
  gameState.board[lastPlacement.cellIndex] = null;
  gameState.placementState.awaitingWardTarget = null;
  gameState.placementState.awaitingHexChoice = null;
  gameState.placementState.awaitingEclipseChoice = null;

  updateAdjacentHighlights();
  updateUI();
}

function resetAction() {
  gameState.placementState.pendingPlacements.forEach(placement => {
    gameState.board[placement.cellIndex] = null;
  });

  gameState.placementState.pendingPlacements = [];
  gameState.placementState.selectedWheel = null;
  gameState.placementState.adjacentHighlighted = [];
  gameState.placementState.awaitingWardTarget = null;
  gameState.placementState.awaitingHexChoice = null;
  gameState.placementState.awaitingEclipseChoice = null;

  updateUI();
}

function isCellEmpty(cellIndex) {
  if (gameState.board[cellIndex] !== null) return false;
  return !gameState.placementState.pendingPlacements.some(p => p.cellIndex === cellIndex);
}

function updateAdjacentHighlights() {
  gameState.placementState.adjacentHighlighted = [];

  if (gameState.placementState.pendingPlacements.length === 1) {
    const maxTiles = maxTilesAllowedForPlayer(gameState.currentPlayer);
    if (maxTiles === 2) {
      const firstPlacement = gameState.placementState.pendingPlacements[0];
      const adjacentCells = ADJ[firstPlacement.cellIndex];
      gameState.placementState.adjacentHighlighted = adjacentCells.filter(cell => isCellEmpty(cell));
    }
  }
}

function doesTileBeat(typeA, typeB) {
  return BEATS[typeA] === typeB;
}

function resolveCombatSimultaneousOn(board, activePlayer, cow) {
  const atk = SCR.atk;
  for (let k = 0; k < 9; k++) { atk[k].p1 = 0; atk[k].p2 = 0; }

  for (let i = 0; i < 9; i++) {
    const A = board[i]; if (!A) continue;
    const neigh = ADJ[i];
    for (const j of neigh) {
      const Tt = board[j]; if (!Tt || Tt.p === A.p) continue;
      if (doesTileBeat(A.t, Tt.t)) (A.p === 1 ? atk[j].p1++ : atk[j].p2++);
    }
  }

  const flips = [];
  for (let j = 0; j < 9; j++) {
    const Tt = board[j]; if (!Tt) continue;
    let { p1, p2 } = atk[j];
    if (!p1 && !p2) continue;

    if (Tt.sh > 0) {
      if (p1 > p2) p1--; else if (p2 > p1) p2--;
      else if (activePlayer === 1 && p2 > 0) p2--; else if (activePlayer === 2 && p1 > 0) p1--;
      if (cow) cow(j);
      board[j].sh = 0;
    }

    if (p1 > p2 && Tt.p !== 1) {
      flips.push({ idx: j, from: Tt.p, to: 1, src: 'RPS' });
      if (cow) cow(j);
      board[j].p = 1;
    } else if (p2 > p1 && Tt.p !== 2) {
      flips.push({ idx: j, from: Tt.p, to: 2, src: 'RPS' });
      if (cow) cow(j);
      board[j].p = 2;
    }
  }
  return flips;
}

function resolveCursesForPlayer(endedPlayerId) {
  const flips = [];
  for (let i = 0; i < 9; i++) {
    const t = gameState.board[i]; if (!t || !t.cu) continue;
    const curse = t.cu;
    if (t.p === endedPlayerId && gameState.turnSerial >= curse.triggerOn) {
      if (t.sh > 0) {
        t.cu = null;
      } else {
        const to = curse.by, from = t.p;
        if (from !== to) {
          t.p = to;
          flips.push({ idx: i, from, to, src: 'CURSE' });
        }
        t.cu = null;
      }
    }
  }
  if (flips.length) gameState.lastFlips = flips;
}

function makeCOW(baseBoard, workBoard, journal) {
  return function cow(idx) {
    if (workBoard[idx] === baseBoard[idx]) {
      journal.push([idx, baseBoard[idx]]);
      workBoard[idx] = workBoard[idx] ? { ...workBoard[idx] } : null;
      return true;
    }
    return false;
  };
}

function scoreBoardFor(player, board) {
  const center = 4, corners = [0, 2, 6, 8];
  let s = 0;
  for (let i = 0; i < 9; i++) {
    const t = board[i]; if (!t) continue;
    const mult = (t.p === player ? 1 : -1);
    s += mult;
    if (i === center) s += 2 * mult;
    else if (corners.includes(i)) s += 1 * mult;
    const neigh = ADJ[i];
    let beat = 0, threat = 0;
    for (const j of neigh) {
      const o = board[j]; if (!o) continue;
      if (o.p !== t.p) {
        if (doesTileBeat(t.t, o.t)) beat++;
        if (doesTileBeat(o.t, t.t)) threat++;
      }
    }
    s += 0.4 * mult * beat - 0.3 * mult * threat;
  }
  return s;
}

function simulatePlacementAndResolve(player, wheelType, cellIndex, board, traps, opts = {}) {
  const B = board.slice();
  const journal = [];
  const cow = makeCOW(board, B, journal);
  const NT = { p: player, t: wheelType, sh: 0, cu: null };
  const opp = (player === 1 ? 2 : 1);
  const trapped = traps.some(tr => tr.cell === cellIndex && tr.player === opp);
  journal.push([cellIndex, B[cellIndex]]);
  B[cellIndex] = NT;

  if (!trapped) {
    if (wheelType === T.WARD) {
      NT.sh = 1;
      const allies = ADJ[cellIndex].filter(c => B[c] && B[c].p === player);
      if (allies.length) {
        let best = allies[0], bestScore = -1;
        for (const a of allies) {
          const neigh = ADJ[a];
          let menaces = 0;
          for (const j of neigh) { const o = B[j]; if (o && o.p !== player && doesTileBeat(o.t, B[a].t)) menaces++; }
          const cur = menaces;
          if (cur > bestScore) { bestScore = cur; best = a; }
        }
        cow(best);
        B[best] = { ...B[best], sh: (B[best].sh || 0) + 1, cu: null };
      }
    } else if (wheelType === T.HEX) {
      const curseTargets = ADJ[cellIndex].filter(c => B[c] && B[c].p === opp);
      const trapTargets = ADJ[cellIndex].filter(c => !B[c]);
      let did = false;
      if (curseTargets.length) {
        const pick = curseTargets.includes(4) ? 4 : curseTargets[0];
        if (typeof pick === 'number' && B[pick]) { cow(pick); B[pick] = { ...B[pick], cu: { by: player, triggerOn: Infinity } }; did = true; }
      }
      if (!did && trapTargets.length) {
        // no immediate effect in the sim, but "reserve" mentally: nothing to change on B
      }
    } else if (wheelType === T.ECLIPSE) {
      // test the 3 affinities at the evaluation stage (see simulateAITurn)
    }
  } else {
    if (NT.sh > 0) NT.sh = 0;
    else NT.p = opp;
  }

  resolveCombatSimultaneousOn(B, player, cow);
  return B;
}

function evaluateMove(player, wheelType, cellIndex, board, traps) {
  const B = simulatePlacementAndResolve(player, wheelType, cellIndex, board, traps);
  return scoreBoardFor(player, B);
}

function simulateAITurn() {
  if (canUseOmenNow() && gameState.currentPlayer === 2) {
    let bestIdx = null, bestGain = -1e9;
    for (const f of gameState.lastFlips) {
      const tmp = gameState.board.map(t => t ? { ...t } : null);
      if (tmp[f.idx]) tmp[f.idx].p = f.from;
      const gain = scoreBoardFor(2, tmp) - scoreBoardFor(2, gameState.board);
      if (gain > bestGain) { bestGain = gain; bestIdx = f.idx; }
    }
    if (bestIdx !== null) { applyOmenOn(bestIdx); updateUI(); }
  }

  const P = gameState.players[1];
  const availableWheels = [];
  for (let i = 0; i < 5; i++) if (!P.usedWheels.includes(i)) availableWheels.push(i);

  const empties = [];
  for (let i = 0; i < 9; i++) if (isCellEmpty(i)) empties.push(i);

  if (!availableWheels.length || !empties.length) {
    gameState.currentPlayer = 1;
    updateUI();
    return;
  }

  let best = null, bestScore = -1e9, bestEclipseType = null;

  for (const w of availableWheels) {
    const face = P.wheels[w];
    for (const cell of empties) {
      if (face === T.ECLIPSE) {
        for (const aff of [T.ATK, T.HEX, T.WARD]) {
          const sc = evaluateMove(2, aff, cell, gameState.board, gameState.traps);
          if (sc > bestScore) { bestScore = sc; best = { wheelIndex: w, cellIndex: cell, type: T.ECLIPSE }; bestEclipseType = aff; }
        }
      } else {
        const sc = evaluateMove(2, face, cell, gameState.board, gameState.traps);
        if (sc > bestScore) { bestScore = sc; best = { wheelIndex: w, cellIndex: cell, type: face }; bestEclipseType = null; }
      }
    }
  }

  const curScore = scoreBoardFor(2, gameState.board);
  if (bestScore <= curScore - 0.1 && gameState.rerollsLeft[2] > 0 && gameState.firstMoveDone[2] === true) {
    rollFaces(1, true);
    gameState.rerollsLeft[2]--;
    return setTimeout(simulateAITurn, 200);
  }

  const wheelIndex = best.wheelIndex;
  let tileType = best.type;
  const cellIndex = best.cellIndex;

  const tile = { p: 2, t: tileType, sh: 0, cu: null };

  gameState.board[cellIndex] = tile;
  gameState.players[1].usedWheels.push(wheelIndex);

  const trappedByP1 = gameState.traps.some(t => t.cell === cellIndex && t.player === 1);

  if (!trappedByP1) {
    if (tileType === T.WARD) {
      tile.sh = 1;
      const adjAllies = ADJ[cellIndex].filter(c => gameState.board[c] && gameState.board[c].p === 2);
      if (adjAllies.length) {
        let bestA = adjAllies[0], bestMen = -1;
        for (const a of adjAllies) {
          const neigh = ADJ[a];
          let men = 0;
          for (const j of neigh) { const o = gameState.board[j]; if (o && o.p === 1 && doesTileBeat(o.t, gameState.board[a].t)) men++; }
          if (men > bestMen) { bestMen = men; bestA = a; }
        }
        gameState.board[bestA].sh = (gameState.board[bestA].sh || 0) + 1;
        if (gameState.board[bestA].cu) gameState.board[bestA].cu = null
      }
    } else if (tileType === T.HEX) {
      const adj = ADJ[cellIndex];
      const curseTargets = adj.filter(c => gameState.board[c] && gameState.board[c].p === 1);
      const trapTargets = adj.filter(c => !gameState.board[c]);
      if (curseTargets.length) {
        const pick = curseTargets.includes(4) ? 4 : curseTargets[0];
        if (typeof pick === 'number' && gameState.board[pick]) armCurse(pick, 2);
      } else if (trapTargets.length) {
        gameState.traps = gameState.traps.filter(t => t.player !== 2);
        const bestT = trapTargets.sort((a, b) => {
          const pa = (a === 4 ? 2 : ([0, 2, 6, 8].includes(a) ? 1 : 0));
          const pb = (b === 4 ? 2 : ([0, 2, 6, 8].includes(b) ? 1 : 0));
          return pb - pa;
        })[0];
        gameState.traps.push({ cell: bestT, player: 2 });
      }
    } else if (tileType === T.ECLIPSE) {
      tile.t = bestEclipseType || T.ATK;
      if (tile.t === T.WARD) tile.sh = 1;
      gameState.players[1].eclipseUsed = true;
    }
  }

  const flips = [];
  if (trappedByP1) {
    const idxTrap = gameState.traps.findIndex(t => t.cell === cellIndex && t.player === 1);
    if (idxTrap >= 0) {
      if (tile.sh > 0) { tile.sh = 0; }
      else { flips.push({ idx: cellIndex, from: tile.p, to: 1, src: 'TRAP' }); tile.p = 1; }
      gameState.traps.splice(idxTrap, 1);
      rebuildTrapIndex();
    }
  }

  const flipsR = resolveCombatSimultaneousOn(gameState.board, 2);
  gameState.lastFlips = flips.concat(flipsR);
  gameState.turnSerial++;
  resolveCursesForPlayer(2);
  gameState.turnsTaken[2] = (gameState.turnsTaken[2] || 0) + 1;
  if (gameState.firstMoveDone[2] === false) gameState.firstMoveDone[2] = true;
  setTimeout(() => {
    gameState.currentPlayer = 1;
    gameState.currentTurn++;
    if (gameState.currentTurn > 3) endRound();
    else {
      gameState.phase = 'place';
    } updateUI();
  }, 300);
  updateUI();
}

function endRound() {
  const p1Tiles = gameState.board.filter(t => t && t.p === 1).length;
  const p2Tiles = gameState.board.filter(t => t && t.p === 2).length;

  let who = 'TIE';
  if (p1Tiles > p2Tiles) {
    gameState.roundWins[1] += 1;
    who = 'P1';
  } else if (p2Tiles > p1Tiles) {
    gameState.roundWins[2] += 1;
    who = 'P2';
  }
  gameState.roundResults.push(who);

  if (gameState.roundWins[1] === 2 || gameState.roundWins[2] === 2) {
    return endGame();
  }

  if (gameState.currentRound >= 3) {
    return endGame();
  }

  gameState.currentRound++;
  seedRound();
}

function seedRound() {
  document.getElementById('hud').style.display = 'block';

  gameState.board = Array(9).fill(null);
  gameState.traps = [];
  gameState.lastFlips = [];
  rebuildTrapIndex();
  gameState.currentTurn = 1;
  gameState.rerollsLeft = { 1: 2, 2: 2 };
  gameState.rerollUsedThisTurn = false;
  gameState.firstMoveDone = { 1: false, 2: false };
  gameState.turnsTaken = { 1: 0, 2: 0 };
  gameState.players.forEach(p => { p.usedWheels = []; p.rerollsUsed = 0; p.eclipseUsed = false; });
  rollFaces(0, false);
  rollFaces(1, false);

  const startPlayer = Math.random() < 0.5 ? 1 : 2;

  gameState.currentPlayer = startPlayer;
  gameState.omen = startPlayer === 1 ? { 1: 0, 2: 1 } : { 1: 1, 2: 0 };
  gameState.phase = 'place';

  updateUI();

    if (startPlayer === 2) {
    Ankidu.say("I'm starting...", []);
    setTimeout(simulateAITurn, 2000);
  }
}

function endGame() {
  gameState.gameOver = true;
  document.querySelectorAll('.btn').forEach(btn => btn.disabled = true);

  const p1 = gameState.roundWins[1], p2 = gameState.roundWins[2];
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'none';
  let txt;
  let body, choices;
  if (p1 > p2) { body = `You won the match (${p1}–${p2}).\n\n“I grant you the time you came for. Cherish those new lives.”`;
  } else if (p2 > p1) {    body = `I won the match (${p2}–${p1}).\n\n“Forgive me — the night takes as it gives. Try again, and I may yet bend the hours in your favor.”`;
  } else { body = `Draw.\n\n“Shadows linger. One more round?”`;}

  choices = [{ 
    label:'Rematch',
    onClick: ()=>{ 
      gameState.currentRound=1; 
      gameState.roundWins={1:0,2:0}; 
      gameState.roundResults=[]; 
      const hud2 = document.getElementById('hud');
      if (hud2) hud2.style.display = 'block';
      seedRound(); 
    } 
  }];
  Ankidu.say(body, choices);

  updateUI();
}

function rebuildTrapIndex() {
  trapByCell.fill(0);
  for (const t of gameState.traps) trapByCell[t.cell] = (t.player === 1 ? 1 : 2);
}

window.onload = function () {
  initializeUI();
};