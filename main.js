// NIGHT DEALER
const TILE_TYPES = {
  ATK: 'ATK', HEX: 'HEX', WARD: 'WARD', ECLIPSE: 'ECLIPSE'
};

const TILE_ICONS = {
  ATK: '⚔️', HEX: '👁️', WARD: '🛡️', ECLIPSE: '🌙'
};

const HEX_MODES = {
  CURSE: 'curse',
  TRAP: 'trap'
};

// ==== Palette & ownership ====
const OWN_COL = {1:'#4da3ff', 2:'#ff4d4d'};   // blue P1 / red P2
const ISO_COL = {dark:'#5f5f5fff', dark2:'#181818', hl:'#ffffff'};

// ==== Canvas iso ====
let iso, ictx;
let DPR = 1;
const TILE_W = 128;    // width of the diamond
const TILE_H = 64;    // height of the diamond
// origin "by eye" at the center;
let ORIGIN_X = 160, ORIGIN_Y = 110;

function initIsoCanvas() {
  iso  = document.getElementById('iso');
  ictx = iso.getContext('2d', { alpha: true });
  ictx.imageSmoothingEnabled = false;
  fitIsoDPI();
  window.addEventListener('resize', fitIsoDPI, {passive:true});
  iso.addEventListener('pointerdown', handleIsoPointer);
}

function fitIsoDPI(){
  DPR = Math.max(1, window.devicePixelRatio || 1);
  const cssW = iso.clientWidth || 320, cssH = iso.clientHeight || 240;
  iso.width  = Math.round(cssW * DPR);
  iso.height = Math.round(cssH * DPR);
  // draw in "CSS coordinates" (scale = DPR)
  ictx.setTransform(DPR,0,0,DPR,0,0);
  // recalculate origin approximately at the center
  ORIGIN_X = (cssW/2) | 0;
  ORIGIN_Y = ((cssH/2) - 20) | 0;
  drawBoardIso();
}

// grid (x,y) to diamond center in pixels
function isoPos(x, y) {
  return { x: ORIGIN_X + (x - y) * (TILE_W/2), y: ORIGIN_Y + (x + y) * (TILE_H/2) };
}

function diamondPath(ctx, cx, cy, w=TILE_W, h=TILE_H){
  ctx.beginPath();
  ctx.moveTo(cx,      cy - h/2);
  ctx.lineTo(cx + w/2, cy);
  ctx.lineTo(cx,      cy + h/2);
  ctx.lineTo(cx - w/2, cy);
  ctx.closePath();
}

function pointInDiamond(px, py, cx, cy, w=TILE_W, h=TILE_H){
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);
  // L1 norm in a normalized coordinate system
  return (dx/(w/2) + dy/(h/2)) <= 1;
}


// Simplified game state for UI
let gameState = {
  currentPlayer: 1,
  currentRound: 1,
  currentTurn: 1,
  scores: [0, 0],
  board: Array(9).fill(null),
  players: [
    {
      wheels: ['ATK', 'HEX', 'WARD', 'ATK', 'HEX'],
      usedWheels: [],
      rerollsUsed: 0,
      eclipseUsed: false,
      isHuman: true
    },
    {
      wheels: ['WARD', 'ATK', 'HEX', 'WARD', 'ATK'],
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
  phase: 'place', // Start in place phase for testing
  traps: [],
  gameOver: false
};

// Limits & resolution memory
gameState.lastFlips = [];           // [{idx, from, to, src:'RPS'|'TRAP'|'CURSE'}]
gameState.omen = { 1: 0, 2: 1 };      // P2 gets 1 Omen per round
gameState.rerollsLeft = { 1: 2, 2: 2 }; // 2 rerolls remaining (the initial roll in T1 does not count)
gameState.rerollUsedThisTurn = false; // max 1 per turn (T2/T3)

// UI State
let selectedCell = null;
let messages = [];

// Initialize the UI
function initializeUI() {
  createBoard();
  createWheels();
  updateUI();
  addMessage('Game initialized. Player 1 starts!', 'info');
}

function canUseOmenNow(){
  const who = gameState.currentPlayer; // player who starts the turn
  return gameState.omen[who] && gameState.lastFlips && gameState.lastFlips.length>0;
}

function applyOmenOn(idx){
  const who = gameState.currentPlayer;
  if (!canUseOmenNow()) return false;
  const found = gameState.lastFlips.find(f => f.idx===idx);
  if (!found) { addMessage('Omen: clicked cell is not from last flip', 'info'); return false; }
  // restore owner
  const T = gameState.board[idx];
  T.player = found.from;
  gameState.omen[who] = 0; // consumed
  addMessage(`Omen: flip cancelled on ${idx}`, 'combat');
  return true;
}

function createBoard() {
  initIsoCanvas(); // initialize the iso canvas
}


function createWheels() {
  // Player 1 wheels
  const p1Wheels = document.getElementById('player1Wheels');
  p1Wheels.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const wheel = document.createElement('div');
    wheel.className = 'wheel';
    wheel.id = `p1-wheel-${i}`;
    wheel.onclick = () => wheelClick(0, i);
    p1Wheels.appendChild(wheel);
  }

  // Player 2 wheels (hidden for AI)
  const p2Wheels = document.getElementById('player2Wheels');
  p2Wheels.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const wheel = document.createElement('div');
    wheel.className = 'wheel hidden';
    wheel.id = `p2-wheel-${i}`;
    wheel.textContent = '?';
    p2Wheels.appendChild(wheel);
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
  document.getElementById('currentRound').textContent = gameState.currentRound;
  document.getElementById('currentTurn').textContent = gameState.currentTurn;
  document.getElementById('currentPlayer').textContent = gameState.currentPlayer;

  //! visual cap at 9
  document.getElementById('p1Score').textContent = Math.min(9, gameState.scores[0]);
  document.getElementById('p2Score').textContent = Math.min(9, gameState.scores[1]);

  const me = gameState.currentPlayer;
  document.getElementById('rerollsUsed').textContent = (2 - gameState.rerollsLeft[me]);
  document.getElementById('phaseInfo').textContent = `Phase: ${gameState.phase}`;
}

function drawBoardIso(){
  //TODO: transparent background: the decor (lantern, cats) can be drawn behind later
  ictx.clearRect(0,0,iso.width/DPR,iso.height/DPR);

  // 1) checkerboard background (2 tones)
  for (let y=0;y<3;y++){
    for (let x=0;x<3;x++){
      const {x:cx, y:cy} = isoPos(x,y);
      diamondPath(ictx, cx, cy);
      ictx.fillStyle = ((x+y)&1) ? ISO_COL.dark2 : ISO_COL.dark;
      ictx.fill();
    }
  }

  // 2) adjacency highlights for possible second placement
  if (gameState.placementState.adjacentHighlighted?.length){
    for (const i of gameState.placementState.adjacentHighlighted){
      const x=i%3, y=(i/3)|0; const {x:cx, y:cy} = isoPos(x,y);
      diamondPath(ictx, cx, cy);
      ictx.lineWidth = 2;
      ictx.setLineDash([4,3]);
      ictx.strokeStyle = ISO_COL.hl;
      ictx.stroke();
      ictx.setLineDash([]);
    }
  }

  // 3) placed tiles (temporary emoji) + owned outline + shields
  for (let i=0;i<9;i++){
    const t = gameState.board[i]; if (!t) continue;
    const x=i%3, y=(i/3)|0; const {x:cx, y:cy} = isoPos(x,y);

    // icon
    ictx.font = '16px system-ui, sans-serif';
    ictx.textAlign = 'center';
    ictx.textBaseline = 'middle';
    ictx.fillStyle = '#e6e6e6';
    ictx.fillText(TILE_ICONS[t.type], cx, cy-2);

    // shield (small square at top-right)
    if (t.shields>0){
      ictx.fillStyle = '#3BA7A9';
      ictx.fillRect(cx + (TILE_W/2 - 10), cy - (TILE_H/2) + 4, 6, 6);
    }

    // ownership outline
    diamondPath(ictx, cx, cy);
    ictx.lineWidth = 2;
    ictx.strokeStyle = OWN_COL[t.player];
    ictx.stroke();
  }

  // 4) traps (on empty cells)
  for (let i=0;i<9;i++){
    const trap = gameState.traps.find(t => t.cell===i);
    if (!trap) continue;
    const hasTile = !!gameState.board[i];
    if (hasTile) continue;

    const x=i%3, y=(i/3)|0; const {x:cx, y:cy} = isoPos(x,y);
    ictx.beginPath();
    ictx.arc(cx, cy, 6, 0, Math.PI*2);
    ictx.fillStyle = '#E2C044'; // lantern amber
    ictx.globalAlpha = 0.85;
    ictx.fill();
    ictx.globalAlpha = 1;
    ictx.lineWidth = 1;
    ictx.strokeStyle = '#5b4511';
    ictx.stroke();
  }

  // 5) flash on this turn's flips (lastFlips)
  if (gameState.lastFlips?.length){
    for (const f of gameState.lastFlips){
      const i=f.idx, x=i%3, y=(i/3)|0; const {x:cx, y:cy} = isoPos(x,y);
      diamondPath(ictx, cx, cy);
      ictx.lineWidth = 3;
      ictx.globalAlpha = 0.7;
      ictx.strokeStyle = OWN_COL[f.to];
      ictx.stroke();
      ictx.globalAlpha = 1;
    }
  }
}

// wrapper
function updateBoard() { drawBoardIso(); }

function handleIsoPointer(ev){
  const rect = iso.getBoundingClientRect();
  // coordinates in CSS pixels (not physical pixels)
  const px = ev.clientX - rect.left;
  const py = ev.clientY - rect.top;

  for (let y=0;y<3;y++){
    for (let x=0;x<3;x++){
      const {x:cx, y:cy} = isoPos(x,y);
      if (pointInDiamond(px, py, cx, cy)) {
        const idx = y*3 + x;
        cellClick(idx);
        drawBoardIso(); // rerender
        return;
      }
    }
  }
}

function updateWheels() {
  // Player 1 wheels
  for (let i = 0; i < 5; i++) {
    const wheelEl = document.getElementById(`p1-wheel-${i}`);
    const wheel = gameState.players[0].wheels[i];
    const isUsed = gameState.players[0].usedWheels.includes(i) || wheelPendingUsed(i);
    const isSelected = gameState.placementState.selectedWheel === i;

    wheelEl.textContent = TILE_ICONS[wheel] || '?';
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
  const canReroll = (gameState.phase === 'reroll') &&
                    (me === 1) &&
                    (gameState.currentTurn >= 2) &&
                    (!gameState.rerollUsedThisTurn) &&
                    (gameState.rerollsLeft[me] > 0);

  const canValidate = gameState.placementState.pendingPlacements.length > 0 &&
    !gameState.placementState.awaitingWardTarget &&
    !gameState.placementState.awaitingHexChoice &&
    !gameState.placementState.awaitingEclipseChoice;

  document.getElementById('rerollBtn').disabled = !isHumanTurn || !canReroll;
  document.getElementById('skipRerollBtn').disabled = !isHumanTurn || gameState.phase !== 'reroll';
  document.getElementById('validateBtn').disabled = !isHumanTurn || !canValidate;
  document.getElementById('cancelBtn').disabled = !isHumanTurn || gameState.placementState.pendingPlacements.length === 0;
  document.getElementById('resetBtn').disabled = !isHumanTurn || gameState.placementState.pendingPlacements.length === 0;
}

function updateSpecialEffects() {
  const promptEl = document.getElementById('effectPrompt');
  const effectsEl = document.getElementById('specialEffects');

  // Clear previous content
  effectsEl.innerHTML = '<div class="effect-prompt" id="effectPrompt"></div>';
  const newPromptEl = document.getElementById('effectPrompt');

  if (gameState.placementState.awaitingWardTarget) {
    const wardState = gameState.placementState.awaitingWardTarget;
    newPromptEl.textContent = `🛡️ WARD: Choose ally to shield`;

    const optionsEl = document.createElement('div');
    optionsEl.className = 'effect-options';

    wardState.availableTargets.forEach(cellIndex => {
      const btn = document.createElement('button');
      btn.className = 'effect-btn';
      btn.textContent = `Cell ${cellIndex}`;
      btn.onclick = () => handleWardTarget(wardState.tileCell, cellIndex);
      optionsEl.appendChild(btn);
    });

    effectsEl.appendChild(optionsEl);

  } else if (gameState.placementState.awaitingHexChoice) {
    const hexState = gameState.placementState.awaitingHexChoice;
    newPromptEl.textContent = `🔮 HEX: Choose curse or trap`;

    const optionsEl = document.createElement('div');
    optionsEl.className = 'effect-options';

    if (hexState.curseTargets.length > 0) {
      hexState.curseTargets.forEach(cellIndex => {
        const btn = document.createElement('button');
        btn.className = 'effect-btn';
        btn.textContent = `Curse ${cellIndex}`;
        btn.onclick = () => handleHexChoice(hexState.tileCell, cellIndex, 'curse');
        optionsEl.appendChild(btn);
      });
    }

    if (hexState.trapTargets.length > 0) {
      hexState.trapTargets.forEach(cellIndex => {
        const btn = document.createElement('button');
        btn.className = 'effect-btn';
        btn.textContent = `Trap ${cellIndex}`;
        btn.onclick = () => handleHexChoice(hexState.tileCell, cellIndex, 'trap');
        optionsEl.appendChild(btn);
      });
    }

    effectsEl.appendChild(optionsEl);

  } else if (gameState.placementState.awaitingEclipseChoice) {
    const eclipseState = gameState.placementState.awaitingEclipseChoice;
    newPromptEl.textContent = `🌙 ECLIPSE: Choose affinity`;

    const optionsEl = document.createElement('div');
    optionsEl.className = 'effect-options';

    ['ATK', 'HEX', 'WARD'].forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'effect-btn';
      btn.textContent = `${TILE_ICONS[type]} ${type}`;
      btn.onclick = () => handleEclipseChoice(eclipseState.tileCell, type);
      optionsEl.appendChild(btn);
    });

    effectsEl.appendChild(optionsEl);

  } else {
    newPromptEl.textContent = gameState.phase === 'reroll' ?
      'Reroll or skip to placement phase' :
      'Select wheel, then select cell to place tile';
  }
}

// Event handlers
function wheelPendingUsed(i){
  return gameState.placementState.pendingPlacements.some(p => p.wheelIndex === i);
}

function wheelClick(player, wheelIndex) {
  if (player !== 0 || gameState.currentPlayer !== 1 || gameState.phase !== 'place') return;

  const isUsed = gameState.players[0].usedWheels.includes(wheelIndex) || wheelPendingUsed(wheelIndex);
  if (isUsed) return;

  gameState.placementState.selectedWheel = wheelIndex;
  addMessage(`Selected wheel ${wheelIndex} (${gameState.players[0].wheels[wheelIndex]})`, 'info');
  updateUI();
}

function cellClick(cellIndex) {
  if (gameState.currentPlayer !== 1 || gameState.phase !== 'place') return;

  if (gameState.placementState.selectedWheel === null) {
    addMessage('Select a wheel first!', 'info');
    return;
  }

  if (!isCellEmpty(cellIndex)) {
    addMessage('Cell is not empty!', 'info');
    return;
  }

  // Check adjacency for second tile
  if (gameState.placementState.pendingPlacements.length === 1) {
    if (!gameState.placementState.adjacentHighlighted.includes(cellIndex)) {
      addMessage('Second tile must be adjacent to first!', 'info');
      return;
    }
  }

  // placement cap: 2 in T1–T2, 1 in T3
  const maxTiles = (gameState.currentTurn === 3) ? 1 : 2;
  if (gameState.placementState.pendingPlacements.length >= maxTiles) {
    addMessage(`Cap reached: ${maxTiles} tile(s) this turn`, 'info');
    return;
  }
  placeTile(cellIndex);
}

function placeTile(cellIndex) {
  const wheelIndex = gameState.placementState.selectedWheel;
  let tileType = gameState.players[0].wheels[wheelIndex];

  // Only one ECLIPSE per round: any other ECLIPSE becomes ATK
  if (tileType === 'ECLIPSE' && gameState.players[0].eclipseUsed) {
    tileType = 'ATK';
  }

  const tile = {
    player: 1,
    type: tileType,
    originalType: tileType,
    wheelIndex,
    shields: 0,
    cursed: false,
    trapToken: null
  };

  gameState.placementState.pendingPlacements.push({ wheelIndex, cellIndex, tileType });
  gameState.board[cellIndex] = tile;
  gameState.placementState.selectedWheel = null;

  const trappedByOpp = gameState.traps.some(t => t.cell === cellIndex && t.player !== tile.player);
  gameState.placementState
    .pendingPlacements[gameState.placementState.pendingPlacements.length - 1]
    .trapped = trappedByOpp;

  // Placement effects ONLY if not trapped
  if (!trappedByOpp) {
    if (tileType === 'WARD')      startWardEffect(cellIndex);
    else if (tileType === 'HEX')  startHexEffect(cellIndex);
    else if (tileType === 'ECLIPSE') startEclipseEffect(cellIndex);
  } else {
    addMessage('Trap: placement effect cancelled (flip attempted on validation)', 'effect');
  }

  updateAdjacentHighlights();
  addMessage(`Placed ${tileType} on cell ${cellIndex}`, 'effect');
  updateUI();
}

function startWardEffect(cellIndex) {
  const adjacentAllies = [];
  const adjacentCells = getAdjacentCells(cellIndex);

  adjacentCells.forEach(adjCell => {
    const tile = gameState.board[adjCell];
    if (tile && tile.player === 1) {
      adjacentAllies.push(adjCell);
    }
  });

  if (adjacentAllies.length === 0) {
    // No allies, just shield self
    gameState.board[cellIndex].shields = 1;
    addMessage('WARD: Self-shield applied', 'effect');
  } else {
    // Multiple targets, need choice
    gameState.placementState.awaitingWardTarget = {
      tileCell: cellIndex,
      availableTargets: adjacentAllies
    };
  }
}

function startHexEffect(cellIndex) {
  const curseTargets = [];
  const trapTargets = [];
  const adjacentCells = getAdjacentCells(cellIndex);

  adjacentCells.forEach(adjCell => {
    const tile = gameState.board[adjCell];
    if (tile && tile.player !== 1) {
      curseTargets.push(adjCell);
    } else if (!tile) {
      trapTargets.push(adjCell);
    }
  });

  if (curseTargets.length === 0 && trapTargets.length === 0) {
    addMessage('HEX: No valid targets', 'effect');
    return;
  }

  gameState.placementState.awaitingHexChoice = {
    tileCell: cellIndex,
    curseTargets: curseTargets,
    trapTargets: trapTargets
  };
}

function startEclipseEffect(cellIndex) {
  gameState.placementState.awaitingEclipseChoice = {
    tileCell: cellIndex,
    wheelIndex: gameState.placementState.pendingPlacements[gameState.placementState.pendingPlacements.length - 1].wheelIndex
  };
}

function handleWardTarget(wardCell, targetCell) {
  gameState.board[wardCell].shields = 1;
  gameState.board[targetCell].shields = 1;
  gameState.placementState.awaitingWardTarget = null;

  addMessage(`WARD: Shields applied to ward and ally at ${targetCell}`, 'effect');
  updateUI();
}

function handleHexChoice(hexCell, targetCell, mode) {
  if (mode === 'curse') {
    const target = gameState.board[targetCell];
    if (target) {
      target.cursed = 1; // mark
      addMessage(`HEX: curse placed on ${targetCell}`, 'effect');
    }
  } else if (mode === 'trap') {
    // Remove old traps for this player
    gameState.traps = gameState.traps.filter(t => t.player !== 1);
    gameState.traps.push({ cell: targetCell, player: 1 });
    addMessage(`HEX: Trap placed on cell ${targetCell}`, 'effect');
  }

  gameState.placementState.awaitingHexChoice = null;
  updateUI();
}

function handleEclipseChoice(eclipseCell, chosenType) {
  gameState.board[eclipseCell].type = chosenType;
  gameState.placementState.awaitingEclipseChoice = null;

  addMessage(`ECLIPSE: Chose ${chosenType} affinity`, 'effect');

  // Trigger cascading effects
  if (chosenType === 'WARD') {
    startWardEffect(eclipseCell);
  } else if (chosenType === 'HEX') {
    startHexEffect(eclipseCell);
  }

  updateUI();
}

// Action handlers
function rollFaces(playerIndex, onlyUnused = true) {
  const P = gameState.players[playerIndex];
  // ensures at most 1 ECLIPSE per player for the round
  const allowEclipse = !P.eclipseUsed;
  let eclipseRolled = false;
  for (let i = 0; i < 5; i++) {
    if (onlyUnused && P.usedWheels.includes(i)) continue;
    const pool = ['ATK', 'HEX', 'WARD'];
    if (allowEclipse && !eclipseRolled) pool.push('ECLIPSE');
    const face = pool[Math.floor(Math.random() * pool.length)];
    P.wheels[i] = (face === 'ECLIPSE' ? (eclipseRolled ? 'ATK' : (eclipseRolled = true, 'ECLIPSE')) : face);
  }
}

function rerollAction() {
  const me = gameState.currentPlayer;
  if (gameState.phase !== 'reroll' || me !== 1) return;
  if (gameState.currentTurn === 1) { addMessage('T1 = initial roll already done', 'info'); return; }
  if (gameState.rerollUsedThisTurn) { addMessage('Already 1 reroll this turn', 'info'); return; }
  if (gameState.rerollsLeft[me] <= 0) { addMessage('No rerolls left', 'info'); return; }

  rollFaces(0, true); // reroll unused wheels for the human player
  gameState.rerollsLeft[me]--;
  gameState.rerollUsedThisTurn = true;
  gameState.phase = 'place';
  addMessage(`Reroll done. Remaining: ${gameState.rerollsLeft[me]}`, 'info');
  updateUI();
}

function skipRerollAction() {
  if (gameState.phase !== 'reroll' || gameState.currentPlayer !== 1) return;
  gameState.phase = 'place';
  addMessage('Reroll phase skipped', 'info');
  updateUI();
}

function validateAction() {
  if (gameState.placementState.pendingPlacements.length === 0) return;

  // No unresolved special effects
  if (gameState.placementState.awaitingWardTarget || 
      gameState.placementState.awaitingHexChoice || 
      gameState.placementState.awaitingEclipseChoice) {
    addMessage('Resolve special effects first!', 'info');
    return;
  }

  const me = 1, opp = 2; // human vs AI (for now)
  const placements = gameState.placementState.pendingPlacements.slice();

  // 1) mark used wheels (and ECLIPSE used)
  placements.forEach(p => {
    if (!gameState.players[0].usedWheels.includes(p.wheelIndex)){
      gameState.players[0].usedWheels.push(p.wheelIndex);
    }
    if (gameState.players[0].wheels[p.wheelIndex] === 'ECLIPSE') {
      gameState.players[0].eclipseUsed = true;
    }
  });

  // 2) TAG TRAP & cancel effect on placement if trapped
  // (already skipped prompts if trapped at placeTile)

  // 3) TRAP TRIGGER (immediate flip attempted on tiles placed on trapped cell)
  const flips = [];
  for (const p of placements) {
    if (p.trapped) {
      // consume opponent trap and attempt flip
      const trapIdx = gameState.traps.findIndex(t => t.cell===p.cellIndex && t.player===opp);
      if (trapIdx>=0) {
        const T = gameState.board[p.cellIndex];
        if (T.shields>0) { T.shields=0; addMessage(`Trap blocked by shield on ${p.cellIndex}`, 'combat'); }
        else { flips.push({idx:p.cellIndex, from:T.player, to:opp, src:'TRAP'}); T.player = opp; }
        gameState.traps.splice(trapIdx,1); // trap consumed
      }
    }
  }

  // 4) SIMULTANEOUS RPS
  flips.push(...resolveCombatSimultaneous(me));

  // TODO: 5) DELAYED EFFECTS (curses) — to implement for a "cursedBy" marker

  // 6) Store for defender's Omen
  gameState.lastFlips = flips.slice();

  // 7) Reset placement state
  gameState.placementState.pendingPlacements = [];
  gameState.placementState.adjacentHighlighted = [];
  gameState.rerollUsedThisTurn = false; // new turn, reroll possible (if T2/T3)

  addMessage('Turn validated. Resolution done.', 'combat');

  // 8) Switch to AI turn (defender's turn start = Omen possible)
  gameState.currentPlayer = 2;

  // AI Omen (optional). For now, not used automatically.
  // TODO: Choose the most "central" flip to cancel here.

  addMessage('AI turn...', 'info');
  updateUI();

  setTimeout(simulateAITurn, 800);
}

function cancelAction() {
  if (gameState.placementState.pendingPlacements.length === 0) return;

  const lastPlacement = gameState.placementState.pendingPlacements.pop();
  gameState.board[lastPlacement.cellIndex] = null;

  // Reset special effects
  gameState.placementState.awaitingWardTarget = null;
  gameState.placementState.awaitingHexChoice = null;
  gameState.placementState.awaitingEclipseChoice = null;

  updateAdjacentHighlights();
  addMessage(`Cancelled placement from cell ${lastPlacement.cellIndex}`, 'info');
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

  addMessage('All placements reset', 'info');
  updateUI();
}

// Utility functions
function isCellEmpty(cellIndex) {
  if (gameState.board[cellIndex] !== null) return false;
  return !gameState.placementState.pendingPlacements.some(p => p.cellIndex === cellIndex);
}

function getAdjacentCells(cellIndex) {
  const row = Math.floor(cellIndex / 3);
  const col = cellIndex % 3;
  const adjacent = [];

  const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];

  directions.forEach(([deltaRow, deltaCol]) => {
    const newRow = row + deltaRow;
    const newCol = col + deltaCol;

    if (newRow >= 0 && newRow < 3 && newCol >= 0 && newCol < 3) {
      adjacent.push(newRow * 3 + newCol);
    }
  });

  return adjacent;
}

function areAdjacent(cellA, cellB) {
  const rowA = Math.floor(cellA / 3);
  const colA = cellA % 3;
  const rowB = Math.floor(cellB / 3);
  const colB = cellB % 3;

  return (Math.abs(rowA - rowB) === 1 && colA === colB) ||
    (Math.abs(colA - colB) === 1 && rowA === rowB);
}

function updateAdjacentHighlights() {
  gameState.placementState.adjacentHighlighted = [];

  if (gameState.placementState.pendingPlacements.length === 1) {
    const maxTiles = gameState.currentTurn === 3 ? 1 : 2;
    if (maxTiles === 2) {
      const firstPlacement = gameState.placementState.pendingPlacements[0];
      const adjacentCells = getAdjacentCells(firstPlacement.cellIndex);
      gameState.placementState.adjacentHighlighted = adjacentCells.filter(cell => isCellEmpty(cell));
    }
  }
}

function doesTileBeat(typeA, typeB) {
  const rules = {
    ATK: 'HEX',
    HEX: 'WARD',
    WARD: 'ATK'
  };
  return rules[typeA] === typeB;
}

function resolveCombatSimultaneous(activePlayer){
  const atk = Array.from({length:9},()=>({p1:0,p2:0}));

  // 1) collect all attempts (simultaneous)
  for (let i=0;i<9;i++){
    const A = gameState.board[i]; if (!A) continue;
    const neigh = getAdjacentCells(i);
    for (const j of neigh){
      const T = gameState.board[j]; if (!T || T.player===A.player) continue;
      if (doesTileBeat(A.type, T.type)){ // A.aff beats T.aff (here aff=type)
        (A.player===1?atk[j].p1++:atk[j].p2++);
      }
    }
  }

  // 2) apply simultaneously (shield -> arbitration -> flip)
  const flips = [];
  for (let j=0;j<9;j++){
    const T = gameState.board[j]; if (!T) continue;
    let {p1,p2} = atk[j];
    if (!p1 && !p2) continue;

    // shield: blocks 1 attempt (regardless of side)
    if (T.shields>0){
      if      (p1>p2) p1--;
      else if (p2>p1) p2--;
      else if (activePlayer===1 && p2>0) p2--;
      else if (activePlayer===2 && p1>0) p1--;
      T.shields = 0;
    }

    if (p1>p2 && T.player!==1){ flips.push({idx:j,from:T.player,to:1,src:'RPS'}); T.player=1; }
    else if (p2>p1 && T.player!==2){ flips.push({idx:j,from:T.player,to:2,src:'RPS'}); T.player=2; }
  }
  return flips;
}

function simulateAITurn() {

  // (optional) AI uses Omen if a flip took the center
  // if (canUseOmenNow()) { const center=4; if (gameState.lastFlips.some(f=>f.idx===center)) { applyOmenOn(center); } }

  addMessage('AI is thinking...', 'info');

  // Simple AI: place random tiles
  const availableWheels = [];
  for (let i = 0; i < 5; i++) {
    if (!gameState.players[1].usedWheels.includes(i)) {
      availableWheels.push(i);
    }
  }

  const emptyCells = [];
  for (let i = 0; i < 9; i++) {
    if (isCellEmpty(i)) emptyCells.push(i);
  }

  if (availableWheels.length > 0 && emptyCells.length > 0) {
    // Place first tile
    const wheelIndex = availableWheels[0];
    const cellIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    const tileType = gameState.players[1].wheels[wheelIndex];

    const tile = {
      player: 2,
      type: tileType,
      originalType: tileType,
      wheelIndex: wheelIndex,
      shields: 0,
      cursed: false,
      trapToken: null
    };

    gameState.board[cellIndex] = tile;
    gameState.players[1].usedWheels.push(wheelIndex);

    const trappedByP1 = gameState.traps.some(t => t.cell === cellIndex && t.player === 1);

    // Cancel placement effects if trapped
    if (trappedByP1) {
      addMessage('Trap (P1): AI placement effect cancelled', 'effect');
    } else {
      // simple AI effects (current code for WARD/HEX/ECLIPSE) kept here
      if (tileType === 'WARD') {
        tile.shields = 1;
      } else if (tileType === 'HEX') {
        const adjacentEmpty = getAdjacentCells(cellIndex).filter(isCellEmpty);
        if (adjacentEmpty.length > 0) {
          gameState.traps = gameState.traps.filter(t => t.player !== 2);
          gameState.traps.push({ cell: adjacentEmpty[0], player: 2 });
          addMessage(`AI placed trap on cell ${adjacentEmpty[0]}`, 'effect');
        }
      } else if (tileType === 'ECLIPSE') {
        const affinities = ['ATK','HEX','WARD'];
        tile.type = affinities[Math.floor(Math.random()*affinities.length)];
        if (tile.type === 'WARD') tile.shields = 1;
        gameState.players[1].eclipseUsed = true;
      }
    }

    // Trigger P1's trap if placed on the trapped cell (flip before RPS)
    const flips = [];
    if (trappedByP1) {
      const idxTrap = gameState.traps.findIndex(t => t.cell === cellIndex && t.player === 1);
      if (idxTrap >= 0) {
        if (tile.shields > 0) { tile.shields = 0; addMessage(`Trap blocked by shield on ${cellIndex}`,'combat'); }
        else { flips.push({idx:cellIndex, from:tile.player, to:1, src:'TRAP'}); tile.player = 1; }
        gameState.traps.splice(idxTrap, 1);
      }
    }

    addMessage(`AI placed ${tileType} on cell ${cellIndex}`, 'info');

    const flipsR = resolveCombatSimultaneous(2);
    gameState.lastFlips = flips.concat(flipsR);

    // Next turn
    setTimeout(() => {
      gameState.currentPlayer = 1;
      gameState.currentTurn++;

      if (gameState.currentTurn > 3) {
        endRound();
      } else {
        // Reset for new turn
        gameState.phase = 'reroll';
        addMessage(`Turn ${gameState.currentTurn} - Your turn!`, 'info');
      }

      updateUI();
    }, 1500);
  } else {
    // AI can't play, skip
    gameState.currentPlayer = 1;
    addMessage('AI cannot play, skipping turn', 'info');
    updateUI();
  }

  updateUI();
}

function endRound() {
  const p1Tiles = gameState.board.filter(t => t && t.player === 1).length;
  const p2Tiles = gameState.board.filter(t => t && t.player === 2).length;

  // Add points (optional: internal clamp to 9)
  gameState.scores[0] = Math.min(9, gameState.scores[0] + p1Tiles);
  gameState.scores[1] = Math.min(9, gameState.scores[1] + p2Tiles);

  addMessage(`Round ${gameState.currentRound} ended! P1: +${p1Tiles}, P2: +${p2Tiles}`, 'info');
  addMessage(`Total scores - P1: ${gameState.scores[0]}, P2: ${gameState.scores[1]}`, 'info');

  // End of game?
  if (gameState.scores[0] >= 9 || gameState.scores[1] >= 9 || gameState.currentRound >= 3) {
    endGame(); return;
  }

  // New round
  gameState.currentRound++;
  gameState.currentTurn = 1;
  gameState.currentPlayer = 1;

  // Reset board & round state
  gameState.board = Array(9).fill(null);
  gameState.traps = [];
  gameState.lastFlips = [];
  gameState.omen = { 1:0, 2:1 };
  gameState.rerollsLeft = { 1:2, 2:2 };
  gameState.rerollUsedThisTurn = false;

  // Reset players (used/eclipse) then seed wheels via rollFaces (consistent, 1x ECLIPSE max)
  gameState.players.forEach(p => { p.usedWheels = []; p.rerollsUsed = 0; p.eclipseUsed = false; });
  rollFaces(0, false);
  rollFaces(1, false);

  gameState.phase = 'place'; // T1: initial roll already done
  addMessage(`Round ${gameState.currentRound} started!`, 'info');
  updateUI();
}

function endGame() {
  gameState.gameOver = true;

  let winner = '';
  if (gameState.scores[0] > gameState.scores[1]) {
    winner = 'Player 1 wins!';
  } else if (gameState.scores[1] > gameState.scores[0]) {
    winner = 'Player 2 wins!';
  } else {
    winner = 'It\'s a tie!';
  }

  addMessage(`🏆 GAME OVER! ${winner}`, 'info');
  addMessage(`Final scores - P1: ${gameState.scores[0]}, P2: ${gameState.scores[1]}`, 'info');

  // Disable all controls
  document.querySelectorAll('.btn').forEach(btn => btn.disabled = true);
  updateUI();
}

function addMessage(text, type = 'info') {
  const messagesEl = document.getElementById('messageLog');
  const messageEl = document.createElement('div');
  messageEl.className = `message ${type}`;
  messageEl.textContent = `${new Date().toLocaleTimeString()}: ${text}`;
  messagesEl.appendChild(messageEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Initialize the game when page loads
window.onload = function () {
  initializeUI();
};