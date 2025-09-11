// NIGHT DEALER
const TILE_TYPES = {
  ATK: 'ATK', HEX: 'HEX', WARD: 'WARD', ECLIPSE: 'ECLIPSE'
};

const TILE_ICONS = {
  ATK: '⚔️', HEX: '👁️', WARD: '🛡️', ECLIPSE: '🌙'
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
  if (!iso) { console.warn('Canvas #iso not found'); return; } // avoid a silent crash
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
  roundWins: {1: 0, 2: 0},
  roundResults: [], 
  board: Array(9).fill(null),
  turnsTaken: {1: 0, 2: 0},
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
gameState.turnSerial = 0; // +1 at each turn validation (P1 then P2, etc.)
gameState.firstMoveDone = {1:false, 2:false};

function armCurse(targetCell, byPlayer){
  const t = gameState.board[targetCell];
  if (!t) return;
  // arm the curse: triggers at the end of the next turn of the targeted player
  t.cursed = { by: byPlayer, triggerOn: gameState.turnSerial + 1 };
}

// UI State
let messages = [];

// Initialize the UI
function initializeUI() {
  createBoard();
  createWheels();
  gameState.currentRound = 1;
  gameState.roundWins = {1:0, 2:0};
  gameState.roundResults = [];
  seedRound();
}

function canUseOmenNow(){
  const who = gameState.currentPlayer; // player who starts the turn
  return gameState.omen[who] && gameState.lastFlips && gameState.lastFlips.length>0;
}

function applyOmenOn(idx){
  const who = gameState.currentPlayer;
  if (!canUseOmenNow()) return false;
  const found = gameState.lastFlips.find(f => f.idx===idx);
  //TODO : Make an event on UI to alert the player
  if (!found) { return false; }
  // restore owner
  const T = gameState.board[idx];
  T.player = found.from;
  gameState.omen[who] = 0; // consumed
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

  // Display round wins instead of cumulative tile points
  document.getElementById('p1Score').textContent = gameState.roundWins[1];
  document.getElementById('p2Score').textContent = gameState.roundWins[2];

  const me = gameState.currentPlayer;
  const rr = document.getElementById('rerollsUsed');
  if (rr) rr.textContent = (2 - gameState.rerollsLeft[me]);
  const ph = document.getElementById('phaseInfo');
  if (ph) ph.textContent = `Phase: ${gameState.phase}`;}

function drawBoardIso(){
  //TODO: transparent background: the decor (lantern, cats) can be drawn behind later
  ictx.setTransform(1,0,0,1,0,0);
  ictx.clearRect(0,0,iso.width, iso.height);
  ictx.setTransform(DPR,0,0,DPR,0,0);

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
    const me = gameState.currentPlayer;
    const canRerollInfo = (me === 1) &&
                          (gameState.firstMoveDone?.[me] === true) &&
                          (!gameState.rerollUsedThisTurn) &&
                          (gameState.rerollsLeft[me] > 0) &&
                          (gameState.placementState.pendingPlacements.length === 0);
    newPromptEl.textContent = canRerollInfo
      ? 'Select a wheel, then a cell (you may reroll once before placing).'
      : 'Select a wheel, then select a cell to place tile.';
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
  updateUI();
}

function cellClick(cellIndex) {
  if (gameState.currentPlayer !== 1 || gameState.phase !== 'place') return;

  // placement cap: 2 in T1–T2, 1 in T3
  const maxTiles = maxTilesAllowedForPlayer(gameState.currentPlayer);
  placeTile(cellIndex);
}

function maxTilesAllowedForPlayer(playerId) {
  const taken = (gameState.turnsTaken?.[playerId] ?? 0);
  return taken >= 2 ? 1 : 2;
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
  } 
  updateAdjacentHighlights();
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
    const self = gameState.board[cellIndex];
    self.shields = 1;
    // cleanse if cursed
    if (self.cursed) { self.cursed = null; }
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
  const ward = gameState.board[wardCell];
  const ally = gameState.board[targetCell];
  ward.shields = 1;
  if (ward.cursed) { ward.cursed = null; }
  ally.shields = 1;
  // cleanse if cursed
  if (ally.cursed) { ally.cursed = null; }
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
    // Remove old traps for this player
    gameState.traps = gameState.traps.filter(t => t.player !== 1);
    gameState.traps.push({ cell: targetCell, player: 1 });
  }

  gameState.placementState.awaitingHexChoice = null;
  updateUI();
}

function handleEclipseChoice(eclipseCell, chosenType) {
  gameState.board[eclipseCell].type = chosenType;
  gameState.placementState.awaitingEclipseChoice = null;

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
  if (me !== 1) return;
  if (gameState.phase !== 'place') return;

  rollFaces(0, true); // reroll unused wheels for the human player
  gameState.rerollsLeft[me]--;
  gameState.rerollUsedThisTurn = true;
  gameState.phase = 'place';
  updateUI();
}

function validateAction() {
  if (gameState.placementState.pendingPlacements.length === 0) return;

  // No unresolved special effects
  if (gameState.placementState.awaitingWardTarget || 
      gameState.placementState.awaitingHexChoice || 
      gameState.placementState.awaitingEclipseChoice) {
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
        if (T.shields>0) { T.shields=0; }
        else { flips.push({idx:p.cellIndex, from:T.player, to:opp, src:'TRAP'}); T.player = opp; }
        gameState.traps.splice(trapIdx,1); // trap consumed
      }
    }
  }

  // 4) SIMULTANEOUS RPS
  flips.push(...resolveCombatSimultaneous(me));

  // 5) Store for defender's Omen
  gameState.lastFlips = flips.slice();

  // 6) Reset placement state
  gameState.placementState.pendingPlacements = [];
  gameState.placementState.adjacentHighlighted = [];
  gameState.rerollUsedThisTurn = false; // new turn, reroll possible (if T2/T3)
  gameState.turnSerial++;              
  resolveCursesForPlayer(1);           // if P1 was cursed and did not protect
  // mark P1 first move as completed (even if it was technically turn 2 when AI started)
  if (gameState.firstMoveDone[1] === false) gameState.firstMoveDone[1] = true;
  gameState.turnsTaken[1] = (gameState.turnsTaken[1] || 0) + 1;


  // 7) Switch to AI turn (defender's turn start = Omen possible)
  gameState.currentPlayer = 2;

  // AI Omen (optional). For now, not used automatically.
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
    const maxTiles = maxTilesAllowedForPlayer(gameState.currentPlayer);
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

function resolveCursesForPlayer(endedPlayerId){
  const flips = [];
  for (let i=0;i<9;i++){
    const t = gameState.board[i]; if (!t || !t.cursed) continue;
    const curse = t.cursed;
    // triggers only if the cell belongs to the player who just finished THEIR turn
    if (t.player === endedPlayerId && gameState.turnSerial >= curse.triggerOn) {
      if (t.shields > 0) {
        t.cursed = null;
      } else {
        // flip for the curse's author
        const to = curse.by, from = t.player;
        if (from !== to) {
          t.player = to;
          flips.push({ idx:i, from, to, src:'CURSE' });
        }
        t.cursed = null;
      }
    }
  }
  if (flips.length) gameState.lastFlips = flips; // visible for Omen at the start of the next turn
}

function cloneBoard(src){
  return src.map(t => t ? {...t} : null);
}

// Fast scoring heuristic (position + local control)
function scoreBoardFor(player, board){
  const center = 4, corners = [0,2,6,8];
  let s = 0;
  for (let i=0;i<9;i++){
    const t = board[i]; if (!t) continue;
    const mult = (t.player===player? 1 : -1);
    s += mult; // 1 point per controlled cell
    if (i===center) s += 2*mult;
    else if (corners.includes(i)) s += 1*mult;
    // potential: number of adjacent enemies beatable – threats suffered
    const neigh = getAdjacentCells(i);
    let beat=0, threat=0;
    for (const j of neigh){
      const o = board[j]; if (!o) continue;
      if (o.player!==t.player){
        if (doesTileBeat(t.type, o.type)) beat++;
        if (doesTileBeat(o.type, t.type)) threat++;
      }
    }
    s += 0.4*mult*beat - 0.3*mult*threat;
  }
  return s;
}

// Applies a "virtual" placement and simulates the resolution (TRAP -> RPS)
function simulatePlacementAndResolve(player, wheelType, cellIndex, board, traps, opts={}){
  const opp = (player===1?2:1);
  const B = cloneBoard(board);
  const T = { player, type: wheelType, originalType: wheelType, shields:0, cursed:false, trapToken:null };
  const trapped = traps.some(t => t.cell===cellIndex && t.player===opp);

  // Placement
  B[cellIndex] = T;

  // Placement effects if not trapped
  if (!trapped){
    if (wheelType==='WARD'){
      // self-shield + shield best adjacent ally if present
      T.shields = 1;
      const allies = getAdjacentCells(cellIndex).filter(c => B[c] && B[c].player===player);
      if (allies.length){
        // choose the most "contested" ally
        let best = allies[0], bestScore = -1;
        for (const a of allies){
          const neigh = getAdjacentCells(a);
          let menaces = 0;
          for (const j of neigh){ const o = B[j]; if (o && o.player!==player && doesTileBeat(o.type, B[a].type)) menaces++; }
          const cur = menaces;
          if (cur>bestScore){ bestScore=cur; best=a; }
        }
        B[best].shields = (B[best].shields||0)+1;
      }
    } else if (wheelType==='HEX'){
      const curseTargets = getAdjacentCells(cellIndex).filter(c => B[c] && B[c].player===opp);
      const trapTargets  = getAdjacentCells(cellIndex).filter(c => !B[c]);
      // simple policy: if we can curse the center or flip quickly, curse, otherwise trap near the center
      let did=false;
      if (curseTargets.length){
        // just mark a flag (not used yet), indirect impact via heuristic
        const pick = curseTargets.includes(4) ? 4 : curseTargets[0];
        if (typeof pick==='number' && B[pick]) { B[pick] = {...B[pick], cursed:1}; did=true; }
      }
      if (!did && trapTargets.length){
        // no immediate effect in the sim, but "reserve" mentally: nothing to change on B
      }
    } else if (wheelType==='ECLIPSE'){
      // test the 3 affinities at the evaluation stage (see simulateAITurn)
    }
  } else {
    // trapped: effects cancelled, trap flip before RPS
    if (T.shields>0) T.shields=0;
    else T.player = opp;
  }

  // Simultaneous RPS
  const keep = { board: gameState.board, lastFlips: gameState.lastFlips };
  gameState.board = B;
  const flips = resolveCombatSimultaneous(player);
  gameState.board = keep.board;
  // (no need to memorize flips here)
  return B;
}

// Evaluates a move (type/cell) for player
function evaluateMove(player, wheelType, cellIndex, board, traps){
  const B = simulatePlacementAndResolve(player, wheelType, cellIndex, board, traps);
  return scoreBoardFor(player, B);
}

function simulateAITurn() {
  // Omen auto: cancels the most "profitable" flip
  if (canUseOmenNow() && gameState.currentPlayer===2){
    let bestIdx = null, bestGain=-1e9;
    for (const f of gameState.lastFlips){
      const tmp = cloneBoard(gameState.board);
      // virtually undo
      if (tmp[f.idx]) tmp[f.idx].player = f.from;
      const gain = scoreBoardFor(2, tmp) - scoreBoardFor(2, gameState.board);
      if (gain>bestGain){ bestGain=gain; bestIdx=f.idx; }
    }
    if (bestIdx!==null){ applyOmenOn(bestIdx); updateUI(); }
  }

  const P = gameState.players[1];
  const availableWheels = [];
  for (let i=0;i<5;i++) if (!P.usedWheels.includes(i)) availableWheels.push(i);

  // free cells
  const empties = [];
  for (let i=0;i<9;i++) if (isCellEmpty(i)) empties.push(i);

  // if no possible move → skip
  if (!availableWheels.length || !empties.length){
    gameState.currentPlayer = 1;
    updateUI();
    return;
  }

  // Evaluate the best move (1 tile for now; can be extended to 2 in T1/T2)
  let best = null, bestScore = -1e9, bestEclipseType=null;

  for (const w of availableWheels){
    const face = P.wheels[w];
    for (const cell of empties){
      if (face==='ECLIPSE'){
        // test the 3 affinities and keep the best one
        for (const aff of ['ATK','HEX','WARD']){
          const sc = evaluateMove(2, aff, cell, gameState.board, gameState.traps);
          if (sc>bestScore){ bestScore=sc; best={wheelIndex:w, cellIndex:cell, type:'ECLIPSE'}; bestEclipseType=aff; }
        }
      } else {
        const sc = evaluateMove(2, face, cell, gameState.board, gameState.traps);
        if (sc>bestScore){ bestScore=sc; best={wheelIndex:w, cellIndex:cell, type:face}; bestEclipseType=null; }
      }
    }
  }

  // Simple reroll policy: if no move is ≥ to the current state + epsilon, and if AI has rerolls left
  const curScore = scoreBoardFor(2, gameState.board);
  // AI may still reroll once per turn, but never on its first move of the round.
  if (bestScore <= curScore-0.1 && gameState.rerollsLeft[2]>0 && gameState.firstMoveDone[2]===true){    rollFaces(1, true);
    gameState.rerollsLeft[2]--;
    return setTimeout(simulateAITurn, 200);
  }

  // Play the best move found
  const wheelIndex = best.wheelIndex;
  let tileType = best.type;
  const cellIndex = best.cellIndex;

  // place on the real board
  const tile = {
    player: 2,
    type: tileType,
    originalType: tileType,
    wheelIndex,
    shields: 0,
    cursed: false,
    trapToken: null
  };

  gameState.board[cellIndex] = tile;
  gameState.players[1].usedWheels.push(wheelIndex);

  const trappedByP1 = gameState.traps.some(t => t.cell === cellIndex && t.player === 1);

  if (trappedByP1) {
  } else {
    // simple AI effects
    if (tileType === 'WARD') {
      tile.shields = 1;
      // bonus: shield an ally if possible
      const adjAllies = getAdjacentCells(cellIndex).filter(c => gameState.board[c] && gameState.board[c].player===2);
      if (adjAllies.length){
        // protect the most threatened ally
        let bestA=adjAllies[0], bestMen= -1;
        for (const a of adjAllies){
          const neigh = getAdjacentCells(a);
          let men=0;
          for (const j of neigh){ const o=gameState.board[j]; if (o && o.player===1 && doesTileBeat(o.type, gameState.board[a].type)) men++; }
          if (men>bestMen){ bestMen=men; bestA=a; }
        }
        gameState.board[bestA].shields = (gameState.board[bestA].shields||0)+1;
        if (gameState.board[bestA].cursed) {
          gameState.board[bestA].cursed = null;
        }
      }
    } else if (tileType === 'HEX') {
      const adj = getAdjacentCells(cellIndex);
      const curseTargets = adj.filter(c => gameState.board[c] && gameState.board[c].player===1);
      const trapTargets  = adj.filter(c => !gameState.board[c]);
      if (curseTargets.length){
        const pick = curseTargets.includes(4) ? 4 : curseTargets[0];
        if (typeof pick==='number' && gameState.board[pick]) armCurse(pick, 2);
      } else if (trapTargets.length){
        gameState.traps = gameState.traps.filter(t => t.player !== 2);
        // place a trap as "central" as possible
        const bestT = trapTargets.sort((a,b)=>{
          const pa = (a===4?2: ([0,2,6,8].includes(a)?1:0));
          const pb = (b===4?2: ([0,2,6,8].includes(b)?1:0));
          return pb-pa;
        })[0];
        gameState.traps.push({ cell: bestT, player: 2 });
      }
    } else if (tileType === 'ECLIPSE') {
      tile.type = bestEclipseType || 'ATK';
      if (tile.type==='WARD') tile.shields = 1;
      gameState.players[1].eclipseUsed = true;
    }
  }

  // P1 trap if placed on it (before RPS)
  const flips = [];
  if (trappedByP1) {
    const idxTrap = gameState.traps.findIndex(t => t.cell === cellIndex && t.player === 1);
    if (idxTrap >= 0) {
      if (tile.shields > 0) { tile.shields = 0; }
      else { flips.push({idx:cellIndex, from:tile.player, to:1, src:'TRAP'}); tile.player = 1; }
      gameState.traps.splice(idxTrap, 1);
    }
  }

  const flipsR = resolveCombatSimultaneous(2);
  gameState.lastFlips = flips.concat(flipsR);
  gameState.turnSerial++;
  resolveCursesForPlayer(2); // if AI was cursed and did not protect
  gameState.turnsTaken[2] = (gameState.turnsTaken[2] || 0) + 1;
  // mark AI first move as completed
  if (gameState.firstMoveDone[2] === false) gameState.firstMoveDone[2] = true;
  // Next turn
  setTimeout(() => {
    gameState.currentPlayer = 1;
    gameState.currentTurn++;
    if (gameState.currentTurn > 3) endRound();
    else {
      // go straight to placement (no separate reroll phase)
      gameState.phase = 'place';
    }    updateUI();
  }, 300);
  updateUI();
}

function endRound() {
  const p1Tiles = gameState.board.filter(t => t && t.player === 1).length;
  const p2Tiles = gameState.board.filter(t => t && t.player === 2).length;

  let who = 'TIE';
  if (p1Tiles > p2Tiles) {
    gameState.roundWins[1] += 1;
    who = 'P1';
  } else if (p2Tiles > p1Tiles) {
    gameState.roundWins[2] += 1;
    who = 'P2';
  } 
  gameState.roundResults.push(who);

  // early end if someone reaches 2 wins
  if (gameState.roundWins[1] === 2 || gameState.roundWins[2] === 2) {
    return endGame();
  }

  // Maximum 3 rounds
  if (gameState.currentRound >= 3) {
    return endGame();
  }

  // next round
  gameState.currentRound++;
  seedRound();
}

function seedRound() {
  // reset board & round state
  gameState.board = Array(9).fill(null);
  gameState.traps = [];
  gameState.lastFlips = [];
  gameState.currentTurn = 1;
  gameState.rerollsLeft = { 1: 2, 2: 2 };
  gameState.rerollUsedThisTurn = false;
  gameState.firstMoveDone = {1:false, 2:false};
  gameState.turnsTaken = { 1: 0, 2: 0 };

  // random wheels for both players (and reset flags)
  gameState.players.forEach(p => { p.usedWheels = []; p.rerollsUsed = 0; p.eclipseUsed = false; });
  rollFaces(0, false);
  rollFaces(1, false);

  // random draw for the first player
  const startPlayer = Math.random() < 0.5 ? 1 : 2;
  gameState.currentPlayer = startPlayer;

  // Omen: 1 for the defender (the one who does NOT start)
  gameState.omen = startPlayer === 1 ? {1:0, 2:1} : {1:1, 2:0};

  // phase
  gameState.phase = 'place';

  updateUI();

  if (startPlayer === 2) setTimeout(simulateAITurn, 300);
}

function endGame() {
  gameState.gameOver = true;

  let msg;
  if (gameState.roundWins[1] > gameState.roundWins[2]) {
    msg = 'Player 1 wins the match!';
  } else if (gameState.roundWins[2] > gameState.roundWins[1]) {
    msg = 'Player 2 wins the match!';
  } else {
    msg = 'Match nul (égalité globale).';
  }

  document.querySelectorAll('.btn').forEach(btn => btn.disabled = true);
  updateUI();
}

// Initialize the game when page loads
window.onload = function () {
  initializeUI();
};