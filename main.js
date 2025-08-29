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
  board: Array(9).fill(null), // Each cell contains null or a tile object
  
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
  
  // Placement management
  selectedTiles: [],        // Selected cells for placement [cellIndex, ...]
  selectedWheels: [],       // Wheels selected for these placements [wheelIndex, ...]
  phase: 'reroll',         // 'reroll' or 'place'
  gameOver: false,
  
  traps: [],               // Active traps [{player, cell, type}]
  pendingCurses: [],       // Pending curses
  firstTurnAutoReroll: true
};

// Structure of a tile on the board
const createTile = (player, type, wheelIndex) => ({
  player: player,          // 1 or 2
  type: type,              // ATK, HEX, WARD, ECLIPSE
  wheelIndex: wheelIndex,  // Index of the wheel used
  shields: 0,              // Number of shields
  cursed: false,           // Curse marker
  trapToken: null          // Associated trap token
});

// ===== PLACEMENT FUNCTIONS =====

/**
 * Checks if a cell can receive a tile
 * @param {number} cellIndex - Cell index (0-8)
 * @returns {boolean} True if placement is valid
 */
function isCellEmpty(cellIndex) {
  return cellIndex >= 0 && cellIndex < 9 && gameState.board[cellIndex] === null;
}

/**
 * Checks if two cells are orthogonally adjacent
 * @param {number} cellA - Index cell A
 * @param {number} cellB - Index cell B  
 * @returns {boolean} True if adjacent
 */
function areAdjacent(cellA, cellB) {
  const rowA = Math.floor(cellA / 3);
  const colA = cellA % 3;
  const rowB = Math.floor(cellB / 3);
  const colB = cellB % 3;
  
  return (Math.abs(rowA - rowB) === 1 && colA === colB) ||
       (Math.abs(colA - colB) === 1 && rowA === rowB);
}

/**
 * Gets the cells adjacent to a given position
 * @param {number} cellIndex - Cell index
 * @returns {number[]} Array of adjacent cells
 */
function getAdjacentCells(cellIndex) {
  const row = Math.floor(cellIndex / 3);
  const col = cellIndex % 3;
  const adjacent = [];
  
  // Checks the 4 directions: North, East, South, West
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

/**
 * Checks if a tile placement is valid according to the rules
 * @param {number[]} selectedCells - Selected cells
 * @returns {boolean} True if placement is valid
 */
function isPlacementValid(selectedCells) {
  // Must have at least one tile
  if (selectedCells.length === 0) return false;
  
  // Maximum according to the turn (T1-T2: 2 tiles, T3: 1 tile)
  const maxTiles = gameState.currentTurn === 3 ? 1 : 2;
  if (selectedCells.length > maxTiles) return false;
  
  // All cells must be empty
  if (!selectedCells.every(cell => isCellEmpty(cell))) return false;
  
  // If 2 tiles, they must be adjacent
  if (selectedCells.length === 2) {
    return areAdjacent(selectedCells[0], selectedCells[1]);
  }
  
  return true;
}

/**
 * Handles selection/deselection of a cell by the human player
 * @param {number} cellIndex - Index of the clicked cell
 * @returns {boolean} True if selection changed
 */
function handleCellSelection(cellIndex) {
  if (gameState.phase !== 'place') {
    console.log('Not in placement phase');
    return false;
  }
  
  if (!gameState.players[gameState.currentPlayer - 1].isHuman) {
    console.log('Not the human player\'s turn');
    return false;
  }
  
  if (!isCellEmpty(cellIndex)) {
    console.log('Cell already occupied');
    return false;
  }
  
  const selectedIndex = gameState.selectedTiles.indexOf(cellIndex);
  
  if (selectedIndex > -1) {
    // Deselect the cell
    gameState.selectedTiles.splice(selectedIndex, 1);
    console.log(`Cell ${cellIndex} deselected`);
  } else {
    // Check if we can select this cell
    const maxTiles = gameState.currentTurn === 3 ? 1 : 2;
    
    if (gameState.selectedTiles.length >= maxTiles) {
      console.log(`Maximum ${maxTiles} tile(s) for turn ${gameState.currentTurn}`);
      return false;
    }
    
    // If it's the 2nd tile, check adjacency
    if (gameState.selectedTiles.length === 1) {
      if (!areAdjacent(gameState.selectedTiles[0], cellIndex)) {
        console.log('Tiles must be adjacent');
        return false;
      }
    }
    
    // Select the cell
    gameState.selectedTiles.push(cellIndex);
    console.log(`Cell ${cellIndex} selected`);
  }
  
  return true;
}

/**
 * Gets the available wheels for the current player
 * @returns {object[]} Array of available wheels [{index, type}, ...]
 */
function getAvailableWheelsForPlacement() {
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  const availableWheels = [];
  
  for (let i = 0; i < 5; i++) {
    if (!currentPlayer.usedWheels.includes(i)) {
      availableWheels.push({
        index: i,
        type: currentPlayer.wheels[i]
      });
    }
  }
  
  return availableWheels;
}

/**
 * Automatically selects wheels to use for placement
 * @param {number} numTiles - Number of tiles to place
 * @returns {object[]} Array of selected wheels [{index, type}, ...]
 */
function selectWheelsForPlacement(numTiles) {
  const availableWheels = getAvailableWheelsForPlacement();
  
  if (availableWheels.length < numTiles) {
    console.log(`Not enough wheels available: ${availableWheels.length} < ${numTiles}`);
    return [];
  }
  
  // For now, take the first available wheels
  // Later, let the player choose
  return availableWheels.slice(0, numTiles);
}

/**
 * Places the selected tiles on the board
 * @returns {boolean} True if placement succeeded
 */
function placeTiles() {
  if (gameState.phase !== 'place') {
    console.log('Error: Not in placement phase');
    return false;
  }
  
  if (!isPlacementValid(gameState.selectedTiles)) {
    console.log('Error: Invalid placement');
    return false;
  }
  
  const numTiles = gameState.selectedTiles.length;
  const selectedWheels = selectWheelsForPlacement(numTiles);
  
  if (selectedWheels.length !== numTiles) {
    console.log('Error: Cannot select required wheels');
    return false;
  }
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  console.log(`Placing ${numTiles} tile(s) for Player ${gameState.currentPlayer}`);
  
  // Place each tile
  gameState.selectedTiles.forEach((cellIndex, i) => {
    const wheel = selectedWheels[i];
    let tileType = wheel.type;
    
    // Special handling for ECLIPSE
    if (wheel.type === 'ECLIPSE') {
      // For AI, simple automatic choice
      if (!currentPlayer.isHuman) {
        const choices = ['ATK', 'HEX', 'WARD'];
        tileType = choices[Math.floor(Math.random() * choices.length)];
      } else {
        // For human player, will prompt for choice in UI later
        // For now, default to ATK
        tileType = 'ATK';
        console.log('ECLIPSE: Default choice ATK (to be implemented in UI)');
      }
      currentPlayer.eclipseUsed = true;
    }
    
    // Create and place the tile
    const tile = createTile(gameState.currentPlayer, tileType, wheel.index);
    gameState.board[cellIndex] = tile;
    
    // Mark the wheel as used
    currentPlayer.usedWheels.push(wheel.index);
    
    console.log(`Tile ${tileType} placed in cell ${cellIndex} (wheel ${wheel.index})`);
  });
  
  // Clear selections
  gameState.selectedTiles = [];
  
  console.log('Placement finished');
  return true;
}

/**
 * AI: Decides where to place its tiles (simple strategy)
 */
function aiPlaceTiles() {
  const availableWheels = getAvailableWheelsForPlacement();
  
  if (availableWheels.length === 0) {
    console.log('AI: No wheels available');
    return false;
  }
  
  // Find all empty cells
  const emptyCells = [];
  for (let i = 0; i < 9; i++) {
    if (isCellEmpty(i)) {
      emptyCells.push(i);
    }
  }
  
  if (emptyCells.length === 0) {
    console.log('AI: No free cell');
    return false;
  }
  
  // Simple strategy: random placement
  const maxTiles = Math.min(
    gameState.currentTurn === 3 ? 1 : 2,
    availableWheels.length,
    emptyCells.length
  );
  
  // Select a first random cell
  const firstCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  gameState.selectedTiles = [firstCell];
  
  // If can place a 2nd tile, look for an adjacent cell
  if (maxTiles > 1 && gameState.currentTurn < 3) {
    const adjacentCells = getAdjacentCells(firstCell).filter(cell => isCellEmpty(cell));
    
    if (adjacentCells.length > 0) {
      const secondCell = adjacentCells[Math.floor(Math.random() * adjacentCells.length)];
      gameState.selectedTiles.push(secondCell);
    }
  }
  
  console.log(`AI selects cells: [${gameState.selectedTiles.join(', ')}]`);
  
  // Place the tiles
  return placeTiles();
}

/**
 * Checks if the current player can validate their turn
 * @returns {boolean} True if validation is possible
 */
function canValidateTurn() {
  if (gameState.phase !== 'place') return false;
  
  // Must have placed at least one tile this turn
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  const tilesPlacedThisTurn = gameState.board.filter(tile => 
    tile && tile.player === gameState.currentPlayer
  ).length;
  
  return tilesPlacedThisTurn > 0 || gameState.selectedTiles.length > 0;
}

/**
 * Displays the board state
 */
function debugBoard() {
  console.log('\n=== BOARD STATE ===');
  console.log('Board 3x3:');
  
  for (let row = 0; row < 3; row++) {
    let line = '';
    for (let col = 0; col < 3; col++) {
      const cellIndex = row * 3 + col;
      const tile = gameState.board[cellIndex];
      
      if (tile) {
        line += `P${tile.player}${tile.type.substring(0,1)} `;
      } else {
        line += '--- ';
      }
    }
    console.log(`${row}: ${line}`);
  }
  
  console.log(`Selected cells: [${gameState.selectedTiles.join(', ')}]`);
  
  const availableWheels = getAvailableWheelsForPlacement();
  console.log(`Available wheels: ${availableWheels.length}`);
  availableWheels.forEach(wheel => {
    console.log(`  Wheel ${wheel.index}: ${wheel.type}`);
  });
}

/**
 * Starts the placement phase for the current player
 */
function startPlacementPhase() {
  gameState.phase = 'place';
  gameState.selectedTiles = [];
  
  console.log(`\n=== PLACEMENT PHASE - PLAYER ${gameState.currentPlayer} ===`);
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  const maxTiles = gameState.currentTurn === 3 ? 1 : 2;
  
  console.log(`Can place up to ${maxTiles} tile(s)`);
  
  if (currentPlayer.isHuman) {
    console.log('Waiting for human player selection...');
    debugBoard();
  } else {
    console.log('AI is thinking...');
    setTimeout(() => {
      aiPlaceTiles();
      debugBoard();
    }, 1000);
  }
}

// ===== EXPORTS AND TESTS =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    gameState, handleCellSelection, placeTiles, canValidateTurn,
    isPlacementValid, areAdjacent, getAdjacentCells, startPlacementPhase,
    debugBoard, TILE_TYPES, TILE_ICONS, createTile
  };
} else {
  // Placement test
  document.addEventListener('DOMContentLoaded', () => {
    // Simulate state after reroll
    gameState.currentPlayer = 1;
    gameState.currentTurn = 2;
    gameState.phase = 'place';
    gameState.players[0].wheels = ['ATK', 'HEX', 'WARD', 'ATK', 'ECLIPSE'];
    gameState.players[0].usedWheels = [0]; // One wheel already used
    
    console.log('🎮 Placement test - Player 1, Turn 2');
    startPlacementPhase();
    
    // Selection test
    setTimeout(() => {
      console.log('\n--- Test select cells 0 and 1 (adjacent) ---');
      handleCellSelection(0);
      handleCellSelection(1);
      debugBoard();
      
      setTimeout(() => {
        console.log('\n--- Test placement ---');
        if (canValidateTurn()) {
          placeTiles();
          debugBoard();
        }
      }, 1000);
    }, 2000);
  });
}