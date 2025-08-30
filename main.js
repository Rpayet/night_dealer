// NIGHT DEALER

// ===== CONSTANTS =====
const TILE_TYPES = {
  ATK: 'ATK', HEX: 'HEX', WARD: 'WARD', ECLIPSE: 'ECLIPSE'
};

const TILE_ICONS = {
  ATK: '⚔️', HEX: '👁️', WARD: '🛡️', ECLIPSE: '🌙'
};

const ECLIPSE_PROBABILITY = 0.2;

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
  
  // New placement workflow
  placementState: {
    selectedWheel: null,        // Index of selected wheel (-1 if none)
    pendingPlacements: [],      // [{wheelIndex, cellIndex, tileType}, ...]
    tilesPlacedThisTurn: 0,    // Number of tiles placed this turn
    canPlaceSecond: false,      // Can place a 2nd tile?
    adjacentHighlighted: []     // Highlighted adjacent cells
  },
  
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
  
  return (Math.abs(rowA - rowB) === 1 && colA === colA) ||
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
  // Checks if the cell is empty AND not already in pending placements
  if (gameState.board[cellIndex] !== null) return false;
  
  return !gameState.placementState.pendingPlacements.some(
    placement => placement.cellIndex === cellIndex
  );
}

// ===== NEW PLACEMENT WORKFLOW =====

/**
 * STEP 1: Player selects a wheel
 * @param {number} wheelIndex - Wheel index (0-4)
 * @returns {boolean} True if selection successful
 */
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
  
  // Checks if this wheel is already in pending placement
  if (gameState.placementState.pendingPlacements.some(p => p.wheelIndex === wheelIndex)) {
    console.log('This wheel is already selected for placement');
    return false;
  }
  
  // Selects the wheel
  gameState.placementState.selectedWheel = wheelIndex;
  console.log(`Wheel ${wheelIndex} selected (${currentPlayer.wheels[wheelIndex]})`);
  
  return true;
}

/**
 * STEP 2: Place the selected wheel on a cell
 * @param {number} cellIndex - Cell index (0-8)
 * @returns {boolean} True if placement successful
 */
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
  
  // Checks adjacency if it's the 2nd tile
  if (gameState.placementState.pendingPlacements.length === 1) {
    const firstPlacement = gameState.placementState.pendingPlacements[0];
    if (!areAdjacent(firstPlacement.cellIndex, cellIndex)) {
      console.log('The 2nd tile must be adjacent to the first');
      return false;
    }
  }
  
  // Creates the pending placement
  const placement = {
    wheelIndex: wheelIndex,
    cellIndex: cellIndex,
    tileType: tileType
  };
  
  gameState.placementState.pendingPlacements.push(placement);
  gameState.placementState.selectedWheel = null; // Deselects the wheel
  
  console.log(`Pending placement: ${tileType} on cell ${cellIndex}`);
  
  // Temporarily displays the tile on the board (for preview)
  gameState.board[cellIndex] = createTile(gameState.currentPlayer, tileType, wheelIndex);
  
  // Checks if a 2nd tile can be placed
  updateSecondTilePlacement();
  
  return true;
}

/**
 * Updates state for 2nd tile placement
 */
function updateSecondTilePlacement() {
  const maxTiles = gameState.currentTurn === 3 ? 1 : 2;
  const currentPlacements = gameState.placementState.pendingPlacements.length;
  
  if (currentPlacements === 1 && maxTiles === 2) {
    // Can place a 2nd tile - highlights adjacent cells
    const firstPlacement = gameState.placementState.pendingPlacements[0];
    const adjacentCells = getAdjacentCells(firstPlacement.cellIndex);
    
    gameState.placementState.adjacentHighlighted = adjacentCells.filter(cell => isCellEmpty(cell));
    gameState.placementState.canPlaceSecond = true;
    
    console.log(`Available adjacent cells: [${gameState.placementState.adjacentHighlighted.join(', ')}]`);
  } else {
    // Cannot place additional tile
    gameState.placementState.adjacentHighlighted = [];
    gameState.placementState.canPlaceSecond = false;
  }
}

/**
 * Cancels the last pending placement
 * @returns {boolean} True if cancellation successful
 */
function cancelLastPlacement() {
  if (gameState.placementState.pendingPlacements.length === 0) {
    console.log('No placement to cancel');
    return false;
  }
  
  // Gets the last placement
  const lastPlacement = gameState.placementState.pendingPlacements.pop();
  
  // Removes the tile from the board (preview)
  gameState.board[lastPlacement.cellIndex] = null;
  
  console.log(`Placement cancelled: ${lastPlacement.tileType} from cell ${lastPlacement.cellIndex}`);
  
  // Updates 2nd placement state
  updateSecondTilePlacement();
  
  return true;
}

/**
 * Cancels all pending placements
 */
function cancelAllPlacements() {
  console.log('Cancelling all placements');
  
  // Removes all preview tiles
  gameState.placementState.pendingPlacements.forEach(placement => {
    gameState.board[placement.cellIndex] = null;
  });
  
  // Reset placement state
  gameState.placementState.pendingPlacements = [];
  gameState.placementState.selectedWheel = null;
  gameState.placementState.adjacentHighlighted = [];
  gameState.placementState.canPlaceSecond = false;
}

/**
 * Validates all pending placements
 * @returns {boolean} True if validation successful
 */
function validatePlacements() {
  if (gameState.placementState.pendingPlacements.length === 0) {
    console.log('No placement to validate');
    return false;
  }
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  console.log(`Validating ${gameState.placementState.pendingPlacements.length} placement(s)`);
  
  // Confirms all placements
  gameState.placementState.pendingPlacements.forEach(placement => {
    // Marks the wheel as used
    currentPlayer.usedWheels.push(placement.wheelIndex);
    
    // Marks ECLIPSE as used if applicable
    if (currentPlayer.wheels[placement.wheelIndex] === 'ECLIPSE') {
      currentPlayer.eclipseUsed = true;
    }
    
    console.log(`✓ ${placement.tileType} validated on cell ${placement.cellIndex} (wheel ${placement.wheelIndex})`);
  });
  
  // Tiles are already on the board (preview), no need to place again
  
  // Reset placement state
  gameState.placementState.pendingPlacements = [];
  gameState.placementState.selectedWheel = null;
  gameState.placementState.adjacentHighlighted = [];
  gameState.placementState.canPlaceSecond = false;
  
  return true;
}

/**
 * Checks if the player can validate their turn
 * @returns {boolean} True if validation possible
 */
function canValidateTurn() {
  // Must have at least one pending placement
  return gameState.placementState.pendingPlacements.length > 0;
}

// ===== TURN MANAGEMENT =====

/**
 * Moves to next player/turn
 */
function nextPlayer() {
  console.log(`\n=== END OF PLAYER ${gameState.currentPlayer} TURN ===`);
  
  if (gameState.currentPlayer === 1) {
    // Move to player 2
    gameState.currentPlayer = 2;
  } else {
    // Move to next turn
    gameState.currentPlayer = 1;
    gameState.currentTurn++;
    
    if (gameState.currentTurn > 3) {
      endRound();
      return;
    }
  }
  
  startNewTurn();
}

/**
 * Starts a new turn
 */
function startNewTurn() {
  console.log(`\n=== START TURN ${gameState.currentTurn} - PLAYER ${gameState.currentPlayer} ===`);
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  // Reset for new turn
  currentPlayer.selectedWheels = [];
  currentPlayer.rerollsUsed = 0;
  
  // Reset placement state
  gameState.placementState = {
    selectedWheel: null,
    pendingPlacements: [],
    tilesPlacedThisTurn: 0,
    canPlaceSecond: false,
    adjacentHighlighted: []
  };
  
  if (gameState.currentTurn === 1) {
    // Turn 1: auto reroll
    gameState.phase = 'reroll';
    gameState.firstTurnAutoReroll = true;
    executeFirstTurnAutoReroll(); // This function should be imported/redefined
  } else {
    // Turns 2-3: optional reroll phase
    gameState.phase = 'reroll';
    
    if (currentPlayer.isHuman) {
      console.log('Human player - Optional reroll phase');
    } else {
      // AI decides automatically
      setTimeout(() => aiDecideReroll(), 500);
    }
  }
}

/**
 * Ends the current round
 */
function endRound() {
  console.log(`\n=== END OF ROUND ${gameState.currentRound} ===`);
  
  // Counts tiles controlled by each player
  const p1Tiles = gameState.board.filter(tile => tile && tile.player === 1).length;
  const p2Tiles = gameState.board.filter(tile => tile && tile.player === 2).length;
  
  gameState.scores[0] += p1Tiles;
  gameState.scores[1] += p2Tiles;
  
  console.log(`Points this round: P1=${p1Tiles}, P2=${p2Tiles}`);
  console.log(`Total scores: P1=${gameState.scores[0]}, P2=${gameState.scores[1]}`);
  
  // Checks end conditions
  if (gameState.scores[0] >= 9 || gameState.scores[1] >= 9 || gameState.currentRound >= 3) {
    endGame();
    return;
  }
  
  // Prepare next round
  gameState.currentRound++;
  gameState.currentTurn = 1;
  gameState.currentPlayer = 1; // P1 always starts new rounds
  
  // Reset board
  gameState.board = Array(9).fill(null);
  gameState.traps = [];
  gameState.pendingCurses = [];
  
  // Reset players for new round
  gameState.players.forEach(player => {
    player.selectedWheels = [];
    player.usedWheels = [];
    player.rerollsUsed = 0;
    player.eclipseUsed = false;
    player.omenUsed = false;
    
    // Regenerate wheels
    player.wheels = [];
    for (let i = 0; i < 5; i++) {
      player.wheels.push(rollWheel(gameState.players.indexOf(player), i));
    }
  });
  
  startNewRound();
}

/**
 * Ends the game
 */
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

// ===== SIMPLE AI =====

/**
 * AI: Automatically places its tiles
 */
function aiPlaceTiles() {
  const availableWheels = [];
  for (let i = 0; i < 5; i++) {
    if (!gameState.players[1].usedWheels.includes(i)) {
      availableWheels.push(i);
    }
  }
  
  if (availableWheels.length === 0) return false;
  
  // Finds all empty cells
  const emptyCells = [];
  for (let i = 0; i < 9; i++) {
    if (isCellEmpty(i)) emptyCells.push(i);
  }
  
  if (emptyCells.length === 0) return false;
  
  // Place the first tile
  const firstWheel = availableWheels[0];
  const firstCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  
  gameState.placementState.selectedWheel = firstWheel;
  placeSelectedWheel(firstCell);
  
  // Try to place a 2nd tile if possible
  const maxTiles = gameState.currentTurn === 3 ? 1 : 2;
  if (maxTiles > 1 && availableWheels.length > 1 && gameState.placementState.adjacentHighlighted.length > 0) {
    const secondWheel = availableWheels[1];
    const adjacentOptions = gameState.placementState.adjacentHighlighted;
    const secondCell = adjacentOptions[Math.floor(Math.random() * adjacentOptions.length)];
    
    gameState.placementState.selectedWheel = secondWheel;
    placeSelectedWheel(secondCell);
  }
  
  // Automatically validate
  setTimeout(() => {
    validatePlacements();
    setTimeout(() => nextPlayer(), 500);
  }, 1000);
  
  return true;
}

/**
 * Starts the placement phase
 */
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

// ===== HELPERS (to import from previous steps) =====

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
  // Simplified implementation - to be completed with step 2 logic
  console.log('AI decides not to reroll');
  startPlacementPhase();
}

function startNewRound() {
  startNewTurn();
}

// ===== DEBUG =====

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
    startPlacementPhase, debugPlacementState, TILE_TYPES, TILE_ICONS
  };
} else {
  // Test the new workflow
  document.addEventListener('DOMContentLoaded', () => {
    // Simulate a game state
    gameState.currentPlayer = 1;
    gameState.currentTurn = 2;
    gameState.players[0].wheels = ['ATK', 'HEX', 'WARD', 'ECLIPSE', 'ATK'];
    gameState.players[0].usedWheels = [0]; // One wheel used
    
    console.log('🎮 Test of the new placement workflow');
    startPlacementPhase();
    
    // Simulate player actions
    setTimeout(() => {
      console.log('\n--- Test: Select wheel 1 (HEX) ---');
      selectWheel(1);
      debugPlacementState();
      
      setTimeout(() => {
        console.log('\n--- Test: Place on cell 4 (center) ---');
        placeSelectedWheel(4);
        debugPlacementState();
        
        setTimeout(() => {
          console.log('\n--- Test: Select wheel 2 (WARD) for 2nd tile ---');
          selectWheel(2);
          
          setTimeout(() => {
            console.log('\n--- Test: Place on adjacent cell 3 ---');
            placeSelectedWheel(3);
            debugPlacementState();
            
            setTimeout(() => {
              console.log('\n--- Test: Validate placements ---');
              validatePlacements();
              debugPlacementState();
            }, 1000);
          }, 1000);
        }, 1000);
      }, 1000);
    }, 1000);
  });
}