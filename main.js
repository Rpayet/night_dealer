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
    adjacentHighlighted: []
  },
  
  // Combat system
  combatLog: [],
  
  phase: 'reroll',
  gameOver: false,
  traps: [],
  pendingCurses: [],
  firstTurnAutoReroll: true
};

// Tile structure
const createTile = (player, type, wheelIndex) => ({
  player: player,
  type: type,
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

// ===== COMBAT SYSTEM =====

/**
 * Determines if tileA beats tileB according to RPS rules
 * @param {string} typeA - Type of attacking tile
 * @param {string} typeB - Type of defending tile
 * @returns {boolean} True if A beats B
 */
function doesTileBeat(typeA, typeB) {
  if (!COMBAT_RULES[typeA] || !COMBAT_RULES[typeB]) {
    return false; // Unknown types don't fight
  }
  
  return COMBAT_RULES[typeA].beats === typeB;
}

/**
 * Attempts to flip a tile from attacker to defender
 * @param {number} attackerCell - Cell index of attacking tile
 * @param {number} defenderCell - Cell index of defending tile
 * @param {string} reason - Reason for the flip attempt ('combat', 'curse', 'trap')
 * @returns {boolean} True if flip was successful
 */
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
  
  // Check if attacker beats defender
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

/**
 * Resolves all combat between adjacent tiles
 */
function resolveCombat() {
  console.log('\n=== COMBAT RESOLUTION ===');
  gameState.combatLog = []; // Clear previous combat log
  
  let flipsOccurred = false;
  
  // Check all tiles for combat with adjacent enemies
  for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
    const tile = gameState.board[cellIndex];
    if (!tile) continue;
    
    const adjacentCells = getAdjacentCells(cellIndex);
    
    adjacentCells.forEach(adjCell => {
      const adjTile = gameState.board[adjCell];
      if (!adjTile) return;
      
      // Only process if different players
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

/**
 * Gets combat preview for a potential placement
 * @param {number} cellIndex - Where the tile would be placed
 * @param {string} tileType - Type of tile being placed
 * @param {number} player - Player placing the tile
 * @returns {Array} Array of potential combat outcomes
 */
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

// ===== PLACEMENT WORKFLOW (Updated with combat) =====

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
  
  // ECLIPSE handling (currently defaults to ATK)
  if (tileType === 'ECLIPSE') {
    tileType = 'ATK'; // TODO: Choice interface
    console.log('ECLIPSE converted to ATK (default choice)');
  }
  
  // Check adjacency if it's the 2nd tile
  if (gameState.placementState.pendingPlacements.length === 1) {
    const firstPlacement = gameState.placementState.pendingPlacements[0];
    if (!areAdjacent(firstPlacement.cellIndex, cellIndex)) {
      console.log('The 2nd tile must be adjacent to the first');
      return false;
    }
  }
  
  // Show combat preview
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
  
  const placement = {
    wheelIndex: wheelIndex,
    cellIndex: cellIndex,
    tileType: tileType
  };
  
  gameState.placementState.pendingPlacements.push(placement);
  gameState.placementState.selectedWheel = null;
  
  console.log(`Pending placement: ${tileType} on cell ${cellIndex}`);
  
  // Temporarily place tile for preview
  gameState.board[cellIndex] = createTile(gameState.currentPlayer, tileType, wheelIndex);
  
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
  gameState.board[lastPlacement.cellIndex] = null;
  
  console.log(`Placement cancelled: ${lastPlacement.tileType} from cell ${lastPlacement.cellIndex}`);
  
  updateSecondTilePlacement();
  return true;
}

function cancelAllPlacements() {
  console.log('Cancelling all placements');
  
  gameState.placementState.pendingPlacements.forEach(placement => {
    gameState.board[placement.cellIndex] = null;
  });
  
  gameState.placementState.pendingPlacements = [];
  gameState.placementState.selectedWheel = null;
  gameState.placementState.adjacentHighlighted = [];
  gameState.placementState.canPlaceSecond = false;
}

function validatePlacements() {
  if (gameState.placementState.pendingPlacements.length === 0) {
    console.log('No placement to validate');
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
  
  // Tiles are already on the board from preview
  
  // Resolve combat
  resolveCombat();
  
  // Reset placement state
  gameState.placementState.pendingPlacements = [];
  gameState.placementState.selectedWheel = null;
  gameState.placementState.adjacentHighlighted = [];
  gameState.placementState.canPlaceSecond = false;
  
  return true;
}

function canValidateTurn() {
  return gameState.placementState.pendingPlacements.length > 0;
}

// ===== AI FUNCTIONS (Updated) =====

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
  
  // Try to place second tile if possible
  const maxTiles = gameState.currentTurn === 3 ? 1 : 2;
  if (maxTiles > 1 && availableWheels.length > 1 && gameState.placementState.adjacentHighlighted.length > 0) {
    const secondWheel = availableWheels[1];
    const adjacentOptions = gameState.placementState.adjacentHighlighted;
    const secondCell = adjacentOptions[Math.floor(Math.random() * adjacentOptions.length)];
    
    gameState.placementState.selectedWheel = secondWheel;
    placeSelectedWheel(secondCell);
  }
  
  // Auto validate
  setTimeout(() => {
    validatePlacements();
    setTimeout(() => nextPlayer(), 1000);
  }, 1500);
  
  return true;
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
  
  gameState.placementState = {
    selectedWheel: null,
    pendingPlacements: [],
    tilesPlacedThisTurn: 0,
    canPlaceSecond: false,
    adjacentHighlighted: []
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
  console.log('Workflow: 1) Select a wheel, 2) Select a cell');
  
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
        rowStr += `P${tile.player}${tile.type.charAt(0)} `;
      } else {
        rowStr += '--- ';
      }
    }
    console.log(`[${rowStr}]`);
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
}

// ===== EXPORTS AND TESTS =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    gameState, selectWheel, placeSelectedWheel, cancelLastPlacement,
    cancelAllPlacements, validatePlacements, canValidateTurn, nextPlayer,
    startPlacementPhase, debugGameState, debugPlacementState, 
    TILE_TYPES, TILE_ICONS, COMBAT_RULES, resolveCombat, attemptFlip,
    doesTileBeat, getCombatPreview
  };
} else {
  // Enhanced test with combat
  document.addEventListener('DOMContentLoaded', () => {
    // Simulate game state
    gameState.currentPlayer = 1;
    gameState.currentTurn = 2;
    gameState.players[0].wheels = ['ATK', 'HEX', 'WARD', 'ECLIPSE', 'ATK'];
    gameState.players[0].usedWheels = [0];
    
    // Add some tiles for combat testing
    gameState.board[1] = createTile(2, 'HEX', 0); // P2 HEX in cell 1
    gameState.board[3] = createTile(2, 'WARD', 1); // P2 WARD in cell 3
    
    console.log('🎮 Test of combat system');
    debugGameState();
    startPlacementPhase();
    
    setTimeout(() => {
      console.log('\n--- Test: Select ATK wheel and place adjacent to enemy HEX ---');
      selectWheel(4); // ATK wheel
      placeSelectedWheel(4); // Center, adjacent to HEX at cell 1
      
      setTimeout(() => {
        console.log('\n--- Test: Validate and trigger combat ---');
        validatePlacements();
        debugGameState();
      }, 2000);
    }, 1000);
  });
}