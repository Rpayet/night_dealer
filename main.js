// NIGHT DEALER

// ===== CONSTANTS =====
const TILE_TYPES = {
  ATK: 'ATK', HEX: 'HEX', WARD: 'WARD', ECLIPSE: 'ECLIPSE'
};

const TILE_ICONS = {
  ATK: '⚔️', HEX: '👁️', WARD: '🛡️', ECLIPSE: '🌙'
};

const ECLIPSE_PROBABILITY = 0.2;

// RPS Triangle: ATK > HEX > WARD > ATK
const COMBAT_RULES = {
  ATK: { beats: 'HEX', losesTo: 'WARD' },
  HEX: { beats: 'WARD', losesTo: 'ATK' },
  WARD: { beats: 'ATK', losesTo: 'HEX' }
};

// HEX modes
const HEX_MODES = {
  CURSE: 'curse',
  TRAP: 'trap'
};

// ===== GAME STATE =====
const gameState = {
  currentPlayer: 1,
  currentRound: 1,
  currentTurn: 1,
  scores: [0, 0],
  board: Array(9).fill(null),
  
  players: [
    {
      wheels: [],
      selectedWheels: [],
      usedWheels: [],
      rerollsUsed: 0,
      eclipseUsed: false,
      omenUsed: false,
      isHuman: true
    },
    {
      wheels: [],
      selectedWheels: [],
      usedWheels: [],
      rerollsUsed: 0,
      eclipseUsed: false,
      omenUsed: false,
      isHuman: false
    }
  ],
  
  // Placement workflow
  placementState: {
    selectedWheel: null,
    pendingPlacements: [],
    tilesPlacedThisTurn: 0,
    canPlaceSecond: false,
    adjacentHighlighted: [],
    
    // Special effects state
    awaitingWardTarget: null,        // {tileCell: number, availableTargets: number[]}
    awaitingHexChoice: null,         // {tileCell: number, curseTargets: number[], trapTargets: number[]}
    awaitingEclipseChoice: null,     // {tileCell: number, wheelIndex: number}
    
    // Applied effects (reversible before validation)
    wardTargets: [],                 // [{wardCell, targetCell}, ...]
    hexChoices: [],                  // [{hexCell, mode: 'curse'|'trap', targetCell}, ...]
    eclipseChoices: []               // [{eclipseCell, wheelIndex, chosenType}, ...]
  },
  
  // Combat system
  combatLog: [],
  
  // Active effects
  traps: [],                         // {cell: number, player: number}
  pendingCurses: [],                // {targetCell: number, fromCell: number, player: number}
  
  phase: 'reroll',
  gameOver: false,
  firstTurnAutoReroll: true
};

// Enhanced tile structure
const createTile = (player, type, wheelIndex) => ({
  player: player,
  type: type,
  originalType: type,                // For ECLIPSE tracking
  wheelIndex: wheelIndex,
  shields: 0,
  cursed: false,
  trapToken: null
});

// ===== UTILITY FUNCTIONS =====

function areAdjacent(cellA, cellB) {
  const rowA = Math.floor(cellA / 3);
  const colA = cellA % 3;
  const rowB = Math.floor(cellB / 3);
  const colB = cellB % 3;
  
  return (Math.abs(rowA - rowB) === 1 && colA === colB) ||
         (Math.abs(colA - colB) === 1 && rowA === rowB);
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

function isCellEmpty(cellIndex) {
  if (gameState.board[cellIndex] !== null) return false;
  
  return !gameState.placementState.pendingPlacements.some(
    placement => placement.cellIndex === cellIndex
  );
}

function getAllyAdjacentCells(cellIndex, player) {
  return getAdjacentCells(cellIndex).filter(adjCell => {
    const tile = gameState.board[adjCell];
    return tile && tile.player === player;
  });
}

function getEnemyAdjacentCells(cellIndex, player) {
  return getAdjacentCells(cellIndex).filter(adjCell => {
    const tile = gameState.board[adjCell];
    return tile && tile.player !== player;
  });
}

function getEmptyAdjacentCells(cellIndex) {
  return getAdjacentCells(cellIndex).filter(adjCell => isCellEmpty(adjCell));
}

// ===== COMBAT SYSTEM =====

function doesTileBeat(typeA, typeB) {
  if (!COMBAT_RULES[typeA] || !COMBAT_RULES[typeB]) {
    return false;
  }
  
  return COMBAT_RULES[typeA].beats === typeB;
}

function attemptFlip(attackerCell, defenderCell, reason = 'combat') {
  const attacker = gameState.board[attackerCell];
  const defender = gameState.board[defenderCell];
  
  if (!attacker || !defender) {
    console.log(`Flip failed: Invalid tiles (${attackerCell} → ${defenderCell})`);
    return false;
  }
  
  if (attacker.player === defender.player) {
    console.log(`Flip failed: Same player (${attackerCell} → ${defenderCell})`);
    return false;
  }
  
  const canFlip = doesTileBeat(attacker.type, defender.type);
  
  if (!canFlip) {
    gameState.combatLog.push({
      type: 'flip_failed',
      reason: reason,
      attacker: attackerCell,
      defender: defenderCell,
      attackerType: attacker.type,
      defenderType: defender.type,
      message: `${attacker.type} cannot beat ${defender.type}`
    });
    console.log(`❌ Flip failed: ${attacker.type} cannot beat ${defender.type}`);
    return false;
  }
  
  // Check shields
  if (defender.shields > 0) {
    defender.shields--;
    gameState.combatLog.push({
      type: 'shield_block',
      reason: reason,
      attacker: attackerCell,
      defender: defenderCell,
      attackerType: attacker.type,
      defenderType: defender.type,
      shieldsLeft: defender.shields,
      message: `${defender.type} blocked with shield (${defender.shields} left)`
    });
    console.log(`🛡️ Shield block: ${defender.type} blocked, ${defender.shields} shields left`);
    return false;
  }
  
  // Successful flip
  const oldPlayer = defender.player;
  const oldType = defender.type;
  
  defender.player = attacker.player;
  
  gameState.combatLog.push({
    type: 'flip_success',
    reason: reason,
    attacker: attackerCell,
    defender: defenderCell,
    attackerType: attacker.type,
    defenderType: oldType,
    oldPlayer: oldPlayer,
    newPlayer: defender.player,
    message: `${attacker.type} flipped ${oldType} (P${oldPlayer} → P${defender.player})`
  });
  
  console.log(`⚔️ Flip success: ${attacker.type} flipped ${oldType} (P${oldPlayer} → P${defender.player})`);
  return true;
}

function resolveCombat() {
  console.log('\n=== COMBAT RESOLUTION ===');
  gameState.combatLog = [];
  
  let flipsOccurred = false;
  
  for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
    const tile = gameState.board[cellIndex];
    if (!tile) continue;
    
    const adjacentCells = getAdjacentCells(cellIndex);
    
    adjacentCells.forEach(adjCell => {
      const adjTile = gameState.board[adjCell];
      if (!adjTile) return;
      
      if (tile.player !== adjTile.player) {
        const flipSuccessful = attemptFlip(cellIndex, adjCell, 'combat');
        if (flipSuccessful) {
          flipsOccurred = true;
        }
      }
    });
  }
  
  if (!flipsOccurred) {
    console.log('No combat occurred this turn');
  }
  
  return flipsOccurred;
}

function getCombatPreview(cellIndex, tileType, player) {
  const preview = [];
  const adjacentCells = getAdjacentCells(cellIndex);
  
  adjacentCells.forEach(adjCell => {
    const adjTile = gameState.board[adjCell];
    if (!adjTile || adjTile.player === player) return;
    
    const wouldFlip = doesTileBeat(tileType, adjTile.type) && adjTile.shields === 0;
    const wouldBeFlipped = doesTileBeat(adjTile.type, tileType);
    
    if (wouldFlip || wouldBeFlipped) {
      preview.push({
        adjCell: adjCell,
        adjType: adjTile.type,
        adjShields: adjTile.shields,
        wouldFlip: wouldFlip,
        wouldBeFlipped: wouldBeFlipped
      });
    }
  });
  
  return preview;
}

// ===== SPECIAL EFFECTS SYSTEM =====

/**
 * WARD SYSTEM: Shield placement
 */
function startWardTargeting(cellIndex) {
  const tile = gameState.board[cellIndex];
  if (!tile || tile.type !== 'WARD') return false;
  
  const availableTargets = getAllyAdjacentCells(cellIndex, tile.player);
  
  if (availableTargets.length === 0) {
    // No allies to target, just add shield to self
    tile.shields++;
    console.log(`🛡️ WARD self-shield: +1 shield on cell ${cellIndex}`);
    return true;
  }
  
  // Multiple targets available, require choice
  gameState.placementState.awaitingWardTarget = {
    tileCell: cellIndex,
    availableTargets: availableTargets
  };
  
  console.log(`🛡️ WARD targeting: Choose ally from cells [${availableTargets.join(', ')}]`);
  return true;
}

function selectWardTarget(wardCell, targetCell) {
  const wardState = gameState.placementState.awaitingWardTarget;
  
  if (!wardState || wardState.tileCell !== wardCell) {
    console.log('No ward targeting in progress');
    return false;
  }
  
  if (!wardState.availableTargets.includes(targetCell)) {
    console.log('Invalid ward target');
    return false;
  }
  
  // Add shields
  const wardTile = gameState.board[wardCell];
  const targetTile = gameState.board[targetCell];
  
  wardTile.shields++;
  targetTile.shields++;
  
  // Record the choice
  gameState.placementState.wardTargets.push({
    wardCell: wardCell,
    targetCell: targetCell
  });
  
  gameState.placementState.awaitingWardTarget = null;
  
  console.log(`🛡️ WARD effect: +1 shield on ward (${wardCell}) and ally (${targetCell})`);
  return true;
}

/**
 * HEX SYSTEM: Curse or Trap choice
 */
function startHexChoice(cellIndex) {
  const tile = gameState.board[cellIndex];
  if (!tile || tile.type !== 'HEX') return false;
  
  const curseTargets = getEnemyAdjacentCells(cellIndex, tile.player);
  const trapTargets = getEmptyAdjacentCells(cellIndex);
  
  if (curseTargets.length === 0 && trapTargets.length === 0) {
    console.log('🔮 HEX: No valid targets for curse or trap');
    return true; // HEX placed but no effect
  }
  
  gameState.placementState.awaitingHexChoice = {
    tileCell: cellIndex,
    curseTargets: curseTargets,
    trapTargets: trapTargets
  };
  
  console.log(`🔮 HEX choice: Curse enemies [${curseTargets.join(', ')}] OR trap empties [${trapTargets.join(', ')}]`);
  return true;
}

function selectHexTarget(hexCell, targetCell, mode) {
  const hexState = gameState.placementState.awaitingHexChoice;
  
  if (!hexState || hexState.tileCell !== hexCell) {
    console.log('No hex choice in progress');
    return false;
  }
  
  let validTarget = false;
  
  if (mode === HEX_MODES.CURSE && hexState.curseTargets.includes(targetCell)) {
    validTarget = true;
    console.log(`🔮 HEX curse: Target cell ${targetCell} will be cursed`);
    
    // Add to pending curses (resolved at end of opponent's turn)
    gameState.pendingCurses.push({
      targetCell: targetCell,
      fromCell: hexCell,
      player: gameState.board[hexCell].player
    });
    
  } else if (mode === HEX_MODES.TRAP && hexState.trapTargets.includes(targetCell)) {
    validTarget = true;
    console.log(`🔮 HEX trap: Trap token placed on cell ${targetCell}`);
    
    // Remove old trap for this player
    gameState.traps = gameState.traps.filter(trap => trap.player !== gameState.board[hexCell].player);
    
    // Add new trap
    gameState.traps.push({
      cell: targetCell,
      player: gameState.board[hexCell].player
    });
  }
  
  if (!validTarget) {
    console.log('Invalid hex target or mode');
    return false;
  }
  
  // Record the choice
  gameState.placementState.hexChoices.push({
    hexCell: hexCell,
    mode: mode,
    targetCell: targetCell
  });
  
  gameState.placementState.awaitingHexChoice = null;
  return true;
}

/**
 * ECLIPSE SYSTEM: Affinity choice
 */
function startEclipseChoice(cellIndex, wheelIndex) {
  const tile = gameState.board[cellIndex];
  if (!tile || tile.originalType !== 'ECLIPSE') return false;
  
  gameState.placementState.awaitingEclipseChoice = {
    tileCell: cellIndex,
    wheelIndex: wheelIndex
  };
  
  console.log(`🌙 ECLIPSE choice: Select affinity (ATK/HEX/WARD) for cell ${cellIndex}`);
  return true;
}

function selectEclipseAffinity(eclipseCell, chosenType) {
  const eclipseState = gameState.placementState.awaitingEclipseChoice;
  
  if (!eclipseState || eclipseState.tileCell !== eclipseCell) {
    console.log('No eclipse choice in progress');
    return false;
  }
  
  if (!['ATK', 'HEX', 'WARD'].includes(chosenType)) {
    console.log('Invalid eclipse affinity');
    return false;
  }
  
  // Change tile type
  const tile = gameState.board[eclipseCell];
  tile.type = chosenType;
  
  // Record the choice
  gameState.placementState.eclipseChoices.push({
    eclipseCell: eclipseCell,
    wheelIndex: eclipseState.wheelIndex,
    chosenType: chosenType
  });
  
  gameState.placementState.awaitingEclipseChoice = null;
  
  console.log(`🌙 ECLIPSE affinity: Cell ${eclipseCell} is now ${chosenType}`);
  
  // Trigger special effects for chosen type
  if (chosenType === 'WARD') {
    startWardTargeting(eclipseCell);
  } else if (chosenType === 'HEX') {
    startHexChoice(eclipseCell);
  }
  
  return true;
}

/**
 * Reset all special effect choices for a tile
 */
function resetSpecialEffects(cellIndex) {
  // Remove ward targets
  gameState.placementState.wardTargets = gameState.placementState.wardTargets.filter(
    ward => ward.wardCell !== cellIndex
  );
  
  // Remove hex choices
  gameState.placementState.hexChoices = gameState.placementState.hexChoices.filter(
    hex => hex.hexCell !== cellIndex
  );
  
  // Remove eclipse choices
  gameState.placementState.eclipseChoices = gameState.placementState.eclipseChoices.filter(
    eclipse => eclipse.eclipseCell !== cellIndex
  );
  
  // Remove pending effects
  gameState.pendingCurses = gameState.pendingCurses.filter(
    curse => curse.fromCell !== cellIndex
  );
  
  gameState.traps = gameState.traps.filter(trap => {
    // More complex logic might be needed here
    return true; // For now, keep traps
  });
  
  // Reset awaiting states if they match
  if (gameState.placementState.awaitingWardTarget?.tileCell === cellIndex) {
    gameState.placementState.awaitingWardTarget = null;
  }
  if (gameState.placementState.awaitingHexChoice?.tileCell === cellIndex) {
    gameState.placementState.awaitingHexChoice = null;
  }
  if (gameState.placementState.awaitingEclipseChoice?.tileCell === cellIndex) {
    gameState.placementState.awaitingEclipseChoice = null;
  }
  
  // Reset tile shields and type if needed
  const tile = gameState.board[cellIndex];
  if (tile) {
    tile.shields = 0;
    if (tile.originalType === 'ECLIPSE') {
      tile.type = 'ECLIPSE'; // Reset to original
    }
  }
}

/**
 * Check if all special effects are resolved
 */
function areSpecialEffectsResolved() {
  return !gameState.placementState.awaitingWardTarget &&
         !gameState.placementState.awaitingHexChoice &&
         !gameState.placementState.awaitingEclipseChoice;
}

// ===== PLACEMENT WORKFLOW (Enhanced) =====

function selectWheel(wheelIndex) {
  if (gameState.phase !== 'place') {
    console.log('Not in placement phase');
    return false;
  }
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  if (!currentPlayer.isHuman) {
    console.log('It is not the human player\'s turn');
    return false;
  }
  
  if (currentPlayer.usedWheels.includes(wheelIndex)) {
    console.log('This wheel is already used');
    return false;
  }
  
  if (gameState.placementState.pendingPlacements.some(p => p.wheelIndex === wheelIndex)) {
    console.log('This wheel is already selected for placement');
    return false;
  }
  
  gameState.placementState.selectedWheel = wheelIndex;
  console.log(`Wheel ${wheelIndex} selected (${currentPlayer.wheels[wheelIndex]})`);
  
  return true;
}

function placeSelectedWheel(cellIndex) {
  if (gameState.phase !== 'place') {
    console.log('Not in placement phase');
    return false;
  }
  
  if (gameState.placementState.selectedWheel === null) {
    console.log('No wheel selected');
    return false;
  }
  
  if (!isCellEmpty(cellIndex)) {
    console.log('Cell not available');
    return false;
  }
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  const wheelIndex = gameState.placementState.selectedWheel;
  let tileType = currentPlayer.wheels[wheelIndex];
  
  // Check adjacency if it's the 2nd tile
  if (gameState.placementState.pendingPlacements.length === 1) {
    const firstPlacement = gameState.placementState.pendingPlacements[0];
    if (!areAdjacent(firstPlacement.cellIndex, cellIndex)) {
      console.log('The 2nd tile must be adjacent to the first');
      return false;
    }
  }
  
  // Create tile
  let tile;
  if (tileType === 'ECLIPSE') {
    // ECLIPSE keeps original type for tracking
    tile = createTile(gameState.currentPlayer, 'ECLIPSE', wheelIndex);
    tile.originalType = 'ECLIPSE';
  } else {
    tile = createTile(gameState.currentPlayer, tileType, wheelIndex);
  }
  
  // Show combat preview for non-ECLIPSE tiles
  if (tileType !== 'ECLIPSE') {
    const combatPreview = getCombatPreview(cellIndex, tileType, gameState.currentPlayer);
    if (combatPreview.length > 0) {
      console.log(`⚔️ Combat preview for ${tileType} on cell ${cellIndex}:`);
      combatPreview.forEach(p => {
        if (p.wouldFlip) {
          console.log(`  → Would flip ${p.adjType} on cell ${p.adjCell}`);
        }
        if (p.wouldBeFlipped) {
          console.log(`  ← Would be flipped by ${p.adjType} on cell ${p.adjCell}`);
        }
      });
    }
  }
  
  const placement = {
    wheelIndex: wheelIndex,
    cellIndex: cellIndex,
    tileType: tileType
  };
  
  gameState.placementState.pendingPlacements.push(placement);
  gameState.placementState.selectedWheel = null;
  
  console.log(`Pending placement: ${tileType} on cell ${cellIndex}`);
  
  // Place tile on board for preview
  gameState.board[cellIndex] = tile;
  
  // Handle special effects
  if (tileType === 'ECLIPSE') {
    startEclipseChoice(cellIndex, wheelIndex);
  } else if (tileType === 'WARD') {
    startWardTargeting(cellIndex);
  } else if (tileType === 'HEX') {
    startHexChoice(cellIndex);
  }
  
  updateSecondTilePlacement();
  
  return true;
}

function updateSecondTilePlacement() {
  const maxTiles = gameState.currentTurn === 3 ? 1 : 2;
  const currentPlacements = gameState.placementState.pendingPlacements.length;
  
  if (currentPlacements === 1 && maxTiles === 2) {
    const firstPlacement = gameState.placementState.pendingPlacements[0];
    const adjacentCells = getAdjacentCells(firstPlacement.cellIndex);
    
    gameState.placementState.adjacentHighlighted = adjacentCells.filter(cell => isCellEmpty(cell));
    gameState.placementState.canPlaceSecond = true;
    
    console.log(`Available adjacent cells: [${gameState.placementState.adjacentHighlighted.join(', ')}]`);
  } else {
    gameState.placementState.adjacentHighlighted = [];
    gameState.placementState.canPlaceSecond = false;
  }
}

function cancelLastPlacement() {
  if (gameState.placementState.pendingPlacements.length === 0) {
    console.log('No placement to cancel');
    return false;
  }
  
  const lastPlacement = gameState.placementState.pendingPlacements.pop();
  
  // Reset special effects for this tile
  resetSpecialEffects(lastPlacement.cellIndex);
  
  // Remove tile from board
  gameState.board[lastPlacement.cellIndex] = null;
  
  console.log(`Placement cancelled: ${lastPlacement.tileType} from cell ${lastPlacement.cellIndex}`);
  
  updateSecondTilePlacement();
  return true;
}

function cancelAllPlacements() {
  console.log('Cancelling all placements');
  
  gameState.placementState.pendingPlacements.forEach(placement => {
    resetSpecialEffects(placement.cellIndex);
    gameState.board[placement.cellIndex] = null;
  });
  
  // Reset all placement state
  gameState.placementState.pendingPlacements = [];
  gameState.placementState.selectedWheel = null;
  gameState.placementState.adjacentHighlighted = [];
  gameState.placementState.canPlaceSecond = false;
  
  // Reset special effects state
  gameState.placementState.awaitingWardTarget = null;
  gameState.placementState.awaitingHexChoice = null;
  gameState.placementState.awaitingEclipseChoice = null;
  gameState.placementState.wardTargets = [];
  gameState.placementState.hexChoices = [];
  gameState.placementState.eclipseChoices = [];
}

function validatePlacements() {
  if (gameState.placementState.pendingPlacements.length === 0) {
    console.log('No placement to validate');
    return false;
  }
  
  if (!areSpecialEffectsResolved()) {
    console.log('Cannot validate: Special effects still pending');
    return false;
  }
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  console.log(`\n=== VALIDATING ${gameState.placementState.pendingPlacements.length} PLACEMENT(S) ===`);
  
  // Mark wheels as used and ECLIPSE if applicable
  gameState.placementState.pendingPlacements.forEach(placement => {
    currentPlayer.usedWheels.push(placement.wheelIndex);
    
    if (currentPlayer.wheels[placement.wheelIndex] === 'ECLIPSE') {
      currentPlayer.eclipseUsed = true;
    }
    
    console.log(`✓ ${placement.tileType} validated on cell ${placement.cellIndex} (wheel ${placement.wheelIndex})`);
  });
  
  // Resolve combat
  resolveCombat();
  
  // Reset placement state
  gameState.placementState.pendingPlacements = [];
  gameState.placementState.selectedWheel = null;
  gameState.placementState.adjacentHighlighted = [];
  gameState.placementState.canPlaceSecond = false;
  
  // Reset special effects state (effects are now permanent)
  gameState.placementState.wardTargets = [];
  gameState.placementState.hexChoices = [];
  gameState.placementState.eclipseChoices = [];
  
  return true;
}

function canValidateTurn() {
  return gameState.placementState.pendingPlacements.length > 0 && areSpecialEffectsResolved();
}

// ===== AI FUNCTIONS (Enhanced) =====

function aiPlaceTiles() {
  const availableWheels = [];
  for (let i = 0; i < 5; i++) {
    if (!gameState.players[1].usedWheels.includes(i)) {
      availableWheels.push(i);
    }
  }
  
  if (availableWheels.length === 0) return false;
  
  const emptyCells = [];
  for (let i = 0; i < 9; i++) {
    if (isCellEmpty(i)) emptyCells.push(i);
  }
  
  if (emptyCells.length === 0) return false;
  
  // Place first tile
  const firstWheel = availableWheels[0];
  const firstCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  
  gameState.placementState.selectedWheel = firstWheel;
  placeSelectedWheel(firstCell);
  
  // Handle AI special effects
  setTimeout(() => {
    aiResolveSpecialEffects();
    
    // Try second tile
    const maxTiles = gameState.currentTurn === 3 ? 1 : 2;
    if (maxTiles > 1 && availableWheels.length > 1 && gameState.placementState.adjacentHighlighted.length > 0) {
      const secondWheel = availableWheels[1];
      const adjacentOptions = gameState.placementState.adjacentHighlighted;
      const secondCell = adjacentOptions[Math.floor(Math.random() * adjacentOptions.length)];
      
      gameState.placementState.selectedWheel = secondWheel;
      placeSelectedWheel(secondCell);
      
      setTimeout(() => {
        aiResolveSpecialEffects();
        setTimeout(() => {
          validatePlacements();
          setTimeout(() => nextPlayer(), 1000);
        }, 1000);
      }, 1000);
    } else {
      setTimeout(() => {
        validatePlacements();
        setTimeout(() => nextPlayer(), 1000);
      }, 1000);
    }
  }, 1000);
  
  return true;
}

function aiResolveSpecialEffects() {
  // AI automatically resolves special effects
  
  // Handle WARD targeting
  if (gameState.placementState.awaitingWardTarget) {
    const wardState = gameState.placementState.awaitingWardTarget;
    if (wardState.availableTargets.length > 0) {
      const randomTarget = wardState.availableTargets[Math.floor(Math.random() * wardState.availableTargets.length)];
      selectWardTarget(wardState.tileCell, randomTarget);
    }
  }
  
  // Handle HEX choice
  if (gameState.placementState.awaitingHexChoice) {
    const hexState = gameState.placementState.awaitingHexChoice;
    
    // AI prefers curse over trap (60% chance if both available)
    const hasCurseTargets = hexState.curseTargets.length > 0;
    const hasTrapTargets = hexState.trapTargets.length > 0;
    
    if (hasCurseTargets && (!hasTrapTargets || Math.random() < 0.6)) {
      const randomTarget = hexState.curseTargets[Math.floor(Math.random() * hexState.curseTargets.length)];
      selectHexTarget(hexState.tileCell, randomTarget, HEX_MODES.CURSE);
    } else if (hasTrapTargets) {
      const randomTarget = hexState.trapTargets[Math.floor(Math.random() * hexState.trapTargets.length)];
      selectHexTarget(hexState.tileCell, randomTarget, HEX_MODES.TRAP);
    }
  }
  
  // Handle ECLIPSE choice
  if (gameState.placementState.awaitingEclipseChoice) {
    const eclipseState = gameState.placementState.awaitingEclipseChoice;
    const affinities = ['ATK', 'HEX', 'WARD'];
    const randomAffinity = affinities[Math.floor(Math.random() * affinities.length)];
    selectEclipseAffinity(eclipseState.tileCell, randomAffinity);
    
    // If ECLIPSE became WARD or HEX, resolve those effects too
    setTimeout(() => aiResolveSpecialEffects(), 500);
  }
}

// ===== TURN MANAGEMENT =====

function nextPlayer() {
  console.log(`\n=== END OF PLAYER ${gameState.currentPlayer} TURN ===`);
  
  if (gameState.currentPlayer === 1) {
    gameState.currentPlayer = 2;
  } else {
    gameState.currentPlayer = 1;
    gameState.currentTurn++;
    
    if (gameState.currentTurn > 3) {
      endRound();
      return;
    }
  }
  
  startNewTurn();
}

function startNewTurn() {
  console.log(`\n=== START TURN ${gameState.currentTurn} - PLAYER ${gameState.currentPlayer} ===`);
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  currentPlayer.selectedWheels = [];
  currentPlayer.rerollsUsed = 0;
  
  // Reset placement state completely
  gameState.placementState = {
    selectedWheel: null,
    pendingPlacements: [],
    tilesPlacedThisTurn: 0,
    canPlaceSecond: false,
    adjacentHighlighted: [],
    awaitingWardTarget: null,
    awaitingHexChoice: null,
    awaitingEclipseChoice: null,
    wardTargets: [],
    hexChoices: [],
    eclipseChoices: []
  };
  
  if (gameState.currentTurn === 1) {
    gameState.phase = 'reroll';
    gameState.firstTurnAutoReroll = true;
    executeFirstTurnAutoReroll();
  } else {
    gameState.phase = 'reroll';
    
    if (currentPlayer.isHuman) {
      console.log('Human player - Optional reroll phase');
    } else {
      setTimeout(() => aiDecideReroll(), 500);
    }
  }
}

function startPlacementPhase() {
  gameState.phase = 'place';
  console.log(`\n=== PLACEMENT PHASE - PLAYER ${gameState.currentPlayer} ===`);
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  const maxTiles = gameState.currentTurn === 3 ? 1 : 2;
  
  console.log(`Can place up to ${maxTiles} tile(s)`);
  console.log('Workflow: 1) Select a wheel, 2) Select a cell, 3) Resolve special effects');
  
  if (!currentPlayer.isHuman) {
    console.log('AI is playing...');
    setTimeout(() => aiPlaceTiles(), 1000);
  }
}

function endRound() {
  console.log(`\n=== END OF ROUND ${gameState.currentRound} ===`);
  
  const p1Tiles = gameState.board.filter(tile => tile && tile.player === 1).length;
  const p2Tiles = gameState.board.filter(tile => tile && tile.player === 2).length;
  
  gameState.scores[0] += p1Tiles;
  gameState.scores[1] += p2Tiles;
  
  console.log(`Points this round: P1=${p1Tiles}, P2=${p2Tiles}`);
  console.log(`Total scores: P1=${gameState.scores[0]}, P2=${gameState.scores[1]}`);
  
  if (gameState.scores[0] >= 9 || gameState.scores[1] >= 9 || gameState.currentRound >= 3) {
    endGame();
    return;
  }
  
  gameState.currentRound++;
  gameState.currentTurn = 1;
  gameState.currentPlayer = 1;
  
  gameState.board = Array(9).fill(null);
  gameState.traps = [];
  gameState.pendingCurses = [];
  gameState.combatLog = [];
  
  gameState.players.forEach(player => {
    player.selectedWheels = [];
    player.usedWheels = [];
    player.rerollsUsed = 0;
    player.eclipseUsed = false;
    player.omenUsed = false;
    
    player.wheels = [];
    for (let i = 0; i < 5; i++) {
      player.wheels.push(rollWheel(gameState.players.indexOf(player), i));
    }
  });
  
  startNewRound();
}

function endGame() {
  console.log('\n=== END OF GAME ===');
  
  gameState.gameOver = true;
  
  if (gameState.scores[0] > gameState.scores[1]) {
    console.log(`🏆 Player 1 wins with ${gameState.scores[0]} points!`);
  } else if (gameState.scores[1] > gameState.scores[0]) {
    console.log(`🏆 Player 2 wins with ${gameState.scores[1]} points!`);
  } else {
    console.log(`🤝 Tie with ${gameState.scores[0]} points each!`);
  }
}

// ===== HELPER FUNCTIONS =====

function rollWheel(playerIndex, wheelIndex) {
  const player = gameState.players[playerIndex];
  const availableTypes = ['ATK', 'HEX', 'WARD'];
  
  if (!player.eclipseUsed && Math.random() < ECLIPSE_PROBABILITY) {
    availableTypes.push('ECLIPSE');
  }
  
  return availableTypes[Math.floor(Math.random() * availableTypes.length)];
}

function executeFirstTurnAutoReroll() {
  if (!gameState.firstTurnAutoReroll) return;
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  for (let i = 0; i < 5; i++) {
    if (!currentPlayer.usedWheels.includes(i)) {
      currentPlayer.wheels[i] = rollWheel(gameState.currentPlayer - 1, i);
    }
  }
  
  currentPlayer.rerollsUsed = 1;
  gameState.firstTurnAutoReroll = false;
  startPlacementPhase();
}

function aiDecideReroll() {
  console.log('AI decides not to reroll');
  startPlacementPhase();
}

function startNewRound() {
  startNewTurn();
}

// ===== DEBUG FUNCTIONS =====

function debugGameState() {
  console.log('\n=== GAME STATE DEBUG ===');
  console.log(`Round: ${gameState.currentRound}, Turn: ${gameState.currentTurn}, Player: ${gameState.currentPlayer}`);
  console.log(`Phase: ${gameState.phase}`);
  console.log(`Scores: P1=${gameState.scores[0]}, P2=${gameState.scores[1]}`);
  
  console.log('\nBoard:');
  for (let row = 0; row < 3; row++) {
    let rowStr = '';
    for (let col = 0; col < 3; col++) {
      const cellIndex = row * 3 + col;
      const tile = gameState.board[cellIndex];
      if (tile) {
        const shieldStr = tile.shields > 0 ? `+${tile.shields}` : '';
        rowStr += `P${tile.player}${tile.type.charAt(0)}${shieldStr} `;
      } else {
        // Check for traps
        const trap = gameState.traps.find(t => t.cell === cellIndex);
        if (trap) {
          rowStr += `T${trap.player} `;
        } else {
          rowStr += '--- ';
        }
      }
    }
    console.log(`[${rowStr}]`);
  }
  
  // Show special effects state
  if (gameState.placementState.awaitingWardTarget) {
    console.log(`\n🛡️ Awaiting WARD target selection for cell ${gameState.placementState.awaitingWardTarget.tileCell}`);
    console.log(`Available targets: [${gameState.placementState.awaitingWardTarget.availableTargets.join(', ')}]`);
  }
  
  if (gameState.placementState.awaitingHexChoice) {
    const hexState = gameState.placementState.awaitingHexChoice;
    console.log(`\n🔮 Awaiting HEX choice for cell ${hexState.tileCell}`);
    console.log(`Curse targets: [${hexState.curseTargets.join(', ')}]`);
    console.log(`Trap targets: [${hexState.trapTargets.join(', ')}]`);
  }
  
  if (gameState.placementState.awaitingEclipseChoice) {
    console.log(`\n🌙 Awaiting ECLIPSE affinity choice for cell ${gameState.placementState.awaitingEclipseChoice.tileCell}`);
  }
  
  if (gameState.pendingCurses.length > 0) {
    console.log(`\nPending curses: ${gameState.pendingCurses.length}`);
    gameState.pendingCurses.forEach((curse, i) => {
      console.log(`  ${i+1}. Cell ${curse.targetCell} cursed by P${curse.player}`);
    });
  }
  
  if (gameState.traps.length > 0) {
    console.log(`\nActive traps:`);
    gameState.traps.forEach((trap, i) => {
      console.log(`  ${i+1}. Cell ${trap.cell} trapped by P${trap.player}`);
    });
  }
  
  if (gameState.combatLog.length > 0) {
    console.log('\nLast Combat Log:');
    gameState.combatLog.forEach((entry, i) => {
      console.log(`  ${i+1}. ${entry.message}`);
    });
  }
}

function debugPlacementState() {
  console.log('\n=== PLACEMENT STATE ===');
  console.log(`Phase: ${gameState.phase}`);
  console.log(`Current player: ${gameState.currentPlayer}`);
  console.log(`Selected wheel: ${gameState.placementState.selectedWheel}`);
  console.log(`Pending placements: ${gameState.placementState.pendingPlacements.length}`);
  
  gameState.placementState.pendingPlacements.forEach((placement, i) => {
    console.log(`  ${i+1}. Wheel ${placement.wheelIndex} (${placement.tileType}) → Cell ${placement.cellIndex}`);
  });
  
  console.log(`Adjacent cells: [${gameState.placementState.adjacentHighlighted.join(', ')}]`);
  console.log(`Can validate: ${canValidateTurn()}`);
  console.log(`Special effects resolved: ${areSpecialEffectsResolved()}`);
}

// ===== EXPORTS AND TESTS =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    gameState, selectWheel, placeSelectedWheel, cancelLastPlacement,
    cancelAllPlacements, validatePlacements, canValidateTurn, nextPlayer,
    startPlacementPhase, debugGameState, debugPlacementState, 
    TILE_TYPES, TILE_ICONS, COMBAT_RULES, HEX_MODES,
    resolveCombat, attemptFlip, doesTileBeat, getCombatPreview,
    selectWardTarget, selectHexTarget, selectEclipseAffinity,
    areSpecialEffectsResolved, resetSpecialEffects
  };
} else {
  // Enhanced test with special effects
  document.addEventListener('DOMContentLoaded', () => {
    // Simulate game state for testing special effects
    gameState.currentPlayer = 1;
    gameState.currentTurn = 2;
    gameState.players[0].wheels = ['ATK', 'HEX', 'WARD', 'ECLIPSE', 'ATK'];
    gameState.players[0].usedWheels = [0];
    
    // Add some tiles for testing
    gameState.board[1] = createTile(1, 'ATK', 0); // P1 ATK ally for WARD testing
    gameState.board[3] = createTile(2, 'HEX', 1); // P2 HEX enemy for testing
    
    console.log('🎮 Test of special effects system');
    debugGameState();
    startPlacementPhase();
    
    setTimeout(() => {
      console.log('\n--- Test 1: Place WARD and target ally ---');
      selectWheel(2); // WARD wheel
      placeSelectedWheel(4); // Center, adjacent to ally at cell 1
      
      setTimeout(() => {
        console.log('Selecting ally at cell 1 as WARD target...');
        selectWardTarget(4, 1); // Target the ally
        debugGameState();
        
        setTimeout(() => {
          console.log('\n--- Test 2: Place HEX and choose curse ---');
          selectWheel(1); // HEX wheel
          placeSelectedWheel(7); // Bottom row, adjacent to center
          
          setTimeout(() => {
            console.log('Choosing curse mode targeting cell 4...');
            selectHexTarget(7, 4, HEX_MODES.CURSE); // Curse the WARD
            debugGameState();
            
            setTimeout(() => {
              console.log('\n--- Test 3: Place ECLIPSE and choose ATK affinity ---');
              selectWheel(3); // ECLIPSE wheel
              placeSelectedWheel(5); // Right center
              
              setTimeout(() => {
                console.log('Choosing ATK affinity for ECLIPSE...');
                selectEclipseAffinity(5, 'ATK');
                debugGameState();
                
                setTimeout(() => {
                  console.log('\n--- Final: Validate all placements ---');
                  if (canValidateTurn()) {
                    validatePlacements();
                    debugGameState();
                  } else {
                    console.log('Cannot validate - special effects still pending');
                  }
                }, 2000);
              }, 1000);
            }, 1000);
          }, 1000);
        }, 1000);
      }, 1000);
    }, 1000);
  });
}