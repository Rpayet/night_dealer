// NIGHT DEALER - STEP 2: REROLL MANAGEMENT AND TURN START

// ===== CONSTANTS =====
const TILE_TYPES = {
  ATK: 'ATK', HEX: 'HEX', WARD: 'WARD', ECLIPSE: 'ECLIPSE'
};

const TILE_ICONS = {
  ATK: '⚔️', HEX: '👁️', WARD: '🛡️', ECLIPSE: '🌙'
};

// Probability of ECLIPSE appearing (adjustable)
const ECLIPSE_PROBABILITY = 0.2; // 20%

// ===== GAME STATE (extended) =====
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
      isHuman: true        // Player 1 = human
    },
    {
      wheels: [],
      selectedWheels: [],
      usedWheels: [],
      rerollsUsed: 0,
      eclipseUsed: false,
      omenUsed: false,
      isHuman: false       // Player 2 = AI
    }
  ],
  
  selectedTiles: [],
  phase: 'reroll',
  gameOver: false,
  traps: [],
  pendingCurses: [],
  
  // New: control for the first turn
  firstTurnAutoReroll: true    // First turn forces an automatic reroll
};

// ===== REROLL FUNCTIONS =====

/**
 * Rolls a wheel to get a random face
 */
function rollWheel(playerIndex, wheelIndex) {
  const player = gameState.players[playerIndex];
  const availableTypes = ['ATK', 'HEX', 'WARD'];
  
  // ECLIPSE possible if not yet used this round
  if (!player.eclipseUsed && Math.random() < ECLIPSE_PROBABILITY) {
    availableTypes.push('ECLIPSE');
  }
  
  return availableTypes[Math.floor(Math.random() * availableTypes.length)];
}

/**
 * Randomly chooses the first player
 * @returns {number} 1 or 2
 */
function chooseFirstPlayer() {
  return Math.random() < 0.5 ? 1 : 2;
}

/**
 * Initializes a new round
 */
function initNewRound() {
  console.log(`🌙 Start of Round ${gameState.currentRound}`);
  
  // Reset board and special elements
  gameState.board = Array(9).fill(null);
  gameState.traps = [];
  gameState.pendingCurses = [];
  gameState.selectedTiles = [];
  
  // Choose first player (random only in round 1)
  if (gameState.currentRound === 1) {
    gameState.currentPlayer = chooseFirstPlayer();
    console.log(`First player chosen randomly: Player ${gameState.currentPlayer}`);
  }
  
  gameState.currentTurn = 1;
  gameState.phase = 'reroll';
  gameState.firstTurnAutoReroll = true;
  
  // Initialize wheels for both players
  initializePlayers();
  
  // Automatic reroll for the first turn
  executeFirstTurnAutoReroll();
}

/**
 * Initializes the wheels for both players for a new round
 */
function initializePlayers() {
  for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
    const player = gameState.players[playerIndex];
    
    // Reset round states
    player.selectedWheels = [];
    player.usedWheels = [];
    player.rerollsUsed = 0;
    player.eclipseUsed = false;
    player.omenUsed = false;
    
    // Generate 5 wheels
    player.wheels = [];
    for (let wheelIndex = 0; wheelIndex < 5; wheelIndex++) {
      player.wheels.push(rollWheel(playerIndex, wheelIndex));
    }
  }
}

/**
 * Executes the mandatory automatic reroll for the first turn
 */
function executeFirstTurnAutoReroll() {
  if (!gameState.firstTurnAutoReroll) return;
  
  console.log(`Automatic reroll for Turn 1 for Player ${gameState.currentPlayer}`);
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  // Reroll all unused wheels (all in turn 1)
  for (let wheelIndex = 0; wheelIndex < 5; wheelIndex++) {
    if (!currentPlayer.usedWheels.includes(wheelIndex)) {
      currentPlayer.wheels[wheelIndex] = rollWheel(gameState.currentPlayer - 1, wheelIndex);
    }
  }
  
  currentPlayer.rerollsUsed = 1; // Mark reroll as used
  gameState.firstTurnAutoReroll = false;
  gameState.phase = 'place'; // Go directly to placement phase
  
  console.log('New wheels after auto reroll:', currentPlayer.wheels);
}

/**
 * Checks if reroll is available for the current player
 * @returns {boolean} True if reroll possible
 */
function isRerollAvailable() {
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  // No reroll in turn 1 (automatic)
  if (gameState.currentTurn === 1) return false;
  
  // No reroll if already used
  if (currentPlayer.rerollsUsed >= 1) return false;
  
  // No reroll if tiles are already selected for placement
  if (gameState.selectedTiles.length > 0) return false;
  
  // Must have available wheels
  const availableWheels = getAvailableWheels(gameState.currentPlayer - 1);
  return availableWheels.length > 0;
}

/**
 * Gets the list of available (unused) wheels for a player
 * @param {number} playerIndex - Player index (0 or 1)
 * @returns {number[]} Array of indices of available wheels
 */
function getAvailableWheels(playerIndex) {
  const player = gameState.players[playerIndex];
  const availableWheels = [];
  
  for (let i = 0; i < 5; i++) {
    if (!player.usedWheels.includes(i)) {
      availableWheels.push(i);
    }
  }
  
  return availableWheels;
}

/**
 * Executes the reroll of ALL available wheels (turns 2 and 3)
 * RULE: Reroll automatically shuffles all unused wheels
 */
function executeReroll() {
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  // Checks
  if (!isRerollAvailable()) {
    console.log('Error: Reroll not available');
    return false;
  }
  
  if (gameState.phase !== 'reroll') {
    console.log('Error: Not in reroll phase');
    return false;
  }
  
  // Get all available (unused) wheels
  const availableWheels = getAvailableWheels(gameState.currentPlayer - 1);
  
  if (availableWheels.length === 0) {
    console.log('Error: No wheels available for reroll');
    return false;
  }
  
  // Automatically reroll ALL available wheels
  console.log(`Automatic reroll of ${availableWheels.length} available wheels for Player ${gameState.currentPlayer}`);
  
  availableWheels.forEach(wheelIndex => {
    const oldValue = currentPlayer.wheels[wheelIndex];
    currentPlayer.wheels[wheelIndex] = rollWheel(gameState.currentPlayer - 1, wheelIndex);
    console.log(`Wheel ${wheelIndex}: ${oldValue} → ${currentPlayer.wheels[wheelIndex]}`);
  });
  
  currentPlayer.selectedWheels = []; // Clear all selection
  currentPlayer.rerollsUsed = 1;
  gameState.phase = 'place';
  
  return true;
}

/**
 * Simple AI: decides if it wants to reroll (turns 2 and 3)
 */
function aiDecideReroll() {
  const aiPlayer = gameState.players[1]; // Player 2 = AI
  
  if (gameState.currentTurn === 1) {
    // Turn 1: automatic reroll already done
    return;
  }
  
  if (!isRerollAvailable()) {
    console.log('AI: Reroll not available, moving to placement');
    gameState.phase = 'place';
    return;
  }
  
  // Simple strategy: 40% chance to reroll
  if (Math.random() < 0.4) {
    console.log('AI decides to reroll');
    executeReroll();
  } else {
    console.log('AI decides not to reroll');
    gameState.phase = 'place';
  }
}

/**
 * Goes directly to placement phase (without reroll)
 */
function skipRerollToPlace() {
  if (!isRerollAvailable() && gameState.phase === 'reroll') {
    console.log('Reroll not available, automatically moving to placement');
    gameState.phase = 'place';
    return true;
  }
  
  if (gameState.phase === 'reroll' && gameState.currentTurn > 1) {
    console.log('Player chooses not to reroll');
    gameState.phase = 'place';
    return true;
  }
  
  return false;
}

/**
 * Starts a new turn
 */
function startNewTurn() {
  console.log(`\n=== TURN ${gameState.currentTurn} - PLAYER ${gameState.currentPlayer} ===`);
  
  const currentPlayer = gameState.players[gameState.currentPlayer - 1];
  
  // Reset for the new turn
  currentPlayer.selectedWheels = [];
  currentPlayer.rerollsUsed = 0;
  gameState.selectedTiles = [];
  
  if (gameState.currentTurn === 1) {
    // Turn 1: mandatory automatic reroll
    gameState.phase = 'reroll';
    gameState.firstTurnAutoReroll = true;
    executeFirstTurnAutoReroll();
  } else {
    // Turns 2 and 3: optional reroll
    gameState.phase = 'reroll';
    
    if (currentPlayer.isHuman) {
      console.log('Human player turn - waiting for reroll decision');
    } else {
      // AI makes its decision automatically
      setTimeout(() => aiDecideReroll(), 500); // Small delay for simulation
    }
  }
}

/**
 * Initializes the complete game
 */
function initGame() {
  console.log('🌙 Initializing Night Dealer...');
  
  // Global reset
  gameState.currentRound = 1;
  gameState.currentTurn = 1;
  gameState.scores = [0, 0];
  gameState.gameOver = false;
  
  // Start the first round
  initNewRound();
}

/**
 * Displays the game state with focus on rerolls
 */
function debugRerollState() {
  console.log('\n=== REROLL STATE ===');
  console.log(`Round ${gameState.currentRound}, Turn ${gameState.currentTurn}, Phase: ${gameState.phase}`);
  console.log(`Current player: ${gameState.currentPlayer} (${gameState.players[gameState.currentPlayer - 1].isHuman ? 'Human' : 'AI'})`);
  console.log(`Reroll available: ${isRerollAvailable()}`);
  
  gameState.players.forEach((player, index) => {
    console.log(`\nPlayer ${index + 1}:`);
    if (index === 0 || !player.isHuman) { // Show wheels for human player or in debug
      console.log(`  Wheels: ${player.wheels.join(', ')}`);
    } else {
      console.log(`  Wheels: [HIDDEN - AI]`);
    }
    console.log(`  Used wheels: [${player.usedWheels.join(', ')}] (${5 - player.usedWheels.length} available)`);
    console.log(`  Rerolls: ${player.rerollsUsed}/1`);
    console.log(`  Eclipse used: ${player.eclipseUsed}`);
  });
  
  console.log(`\nCurrent selections:`);
  console.log(`  Selected tiles: [${gameState.selectedTiles.join(', ')}]`);
}

// ===== EXPORTS AND TESTS =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    gameState, initGame, executeReroll, skipRerollToPlace, isRerollAvailable,
    getAvailableWheels, startNewTurn, debugRerollState, TILE_TYPES, TILE_ICONS
  };
} else {
  // Automatic test
  document.addEventListener('DOMContentLoaded', () => {
    initGame();
    debugRerollState();
    
    // Simulation of a complete cycle
    setTimeout(() => {
      console.log('\n--- SIMULATION MOVE TO TURN 2 ---');
      gameState.currentTurn = 2;
      gameState.currentPlayer = 1; // Human player
      gameState.players[0].usedWheels = [0, 1]; // Simulate 2 used wheels
      startNewTurn();
      setTimeout(() => {
        debugRerollState();
        console.log('\n--- TEST REROLL WITH 3 AVAILABLE WHEELS ---');
        if (isRerollAvailable()) {
          executeReroll();
          debugRerollState();
        }
      }, 1000);
    }, 2000);
  });
}