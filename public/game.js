const socket = io();

const grid = document.getElementById("grid");
const statusText = document.getElementById("status");
const restartBtn = document.getElementById("restart");
const gameIdDisplay = document.getElementById("gameIdDisplay");
const loserOverlay = document.getElementById("loserOverlay");
const playerStatusDiv = document.getElementById("playerStatus");
const hostControlsDiv = document.getElementById("hostControls");
const spectatorModeDiv = document.getElementById("spectatorMode");
const spectatorListDiv = document.getElementById("spectatorList");

const gameId = window.location.pathname.split("/").pop();
const username = window.loggedInUser;

let playerSymbol = null;
let isHost = false;
let isSpectator = false;
let game = {};

// Initialize UI elements
hostControlsDiv.style.display = 'none';
spectatorModeDiv.style.display = 'none';

// display game ID
gameIdDisplay.innerText = `Game ID: ${gameId}`;

// win combos
const winCombos = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

// grid
for (let i = 0; i < 9; i++) {
  const btn = document.createElement("button");
  btn.onclick = () => {
    if (!isSpectator) {
      socket.emit('move', { gameId, index: i });
    }
  };
  grid.appendChild(btn);
}

// Check for spectate mode from URL query params
const urlParams = new URLSearchParams(window.location.search);
const isSpectatingUrl = urlParams.has('spectate');

// join
async function joinGame() {
  try {
    // Fetch game info to check if it's private
    const response = await fetch(`/api/game-info/${gameId}`);
    const gameInfo = response.ok ? await response.json() : null;

    if (gameInfo && !gameInfo.isPublic && gameInfo.hasPassword) {
      const password = prompt('This is a private game. Enter the password:');
      if (password === null) {
        window.location.href = '/';
        return;
      }
      socket.emit('join', { gameId, username, password, isSpectating: isSpectatingUrl });
    } else if (gameInfo && !gameInfo.isPublic && !gameInfo.hasPassword) {
      socket.emit('join', { gameId, username, password: '', isSpectating: isSpectatingUrl });
    } else {
      socket.emit('join', { gameId, username, isSpectating: isSpectatingUrl });
    }
  } catch (err) {
    console.error('Error fetching game info:', err);
    socket.emit('join', { gameId, username, isSpectating: isSpectatingUrl });
  }
}

joinGame();

socket.on('player', (data) => {
  playerSymbol = data.symbol;
  isHost = data.isHost;
  isSpectator = false;

  statusText.innerText = `You are ${data.name} (${data.symbol})`;
  spectatorModeDiv.style.display = 'none';
  spectatorModeDiv.innerHTML = '';
});

socket.on('spectator', (data) => {
  isSpectator = true;
  playerSymbol = null;
  statusText.innerText = 'You are watching as a spectator';
  spectatorModeDiv.style.display = 'block';
  spectatorModeDiv.innerHTML = '<strong>👁️ Spectator Mode</strong> - You are watching this game as a spectator';
  
  // Disable grid clicking for spectators
  document.querySelectorAll('.grid button').forEach(btn => {
    btn.style.cursor = 'default';
  });
});

socket.on('playerDisconnected', (data) => {
  console.log(data.name + ' has disconnected');
  if (isHost && !isSpectator) {
    showHostControls();
  }
});

socket.on('kicked', (data) => {
  alert('You were kicked from the game: ' + data.reason);
  window.location.href = '/';
});

socket.on('joinError', (data) => {
  alert('Error joining game: ' + data.error);
  window.location.href = '/';
});

socket.on('spectatorLeft', (data) => {
  console.log(data.name + ' left as spectator');
});

function getWinningLine(board) {
  for (let combo of winCombos) {
    const [a,b,c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return combo;
    }
  }
  return null;
}

function spawnSparkles(element) {
  const rect = element.getBoundingClientRect();

  for (let i = 0; i < 25; i++) {
    const s = document.createElement("div");
    s.className = "sparkle";

    const x = (Math.random() - 0.5) * 200 + "px";
    const y = (Math.random() - 0.5) * 200 + "px";

    s.style.left = rect.left + rect.width / 2 + "px";
    s.style.top = rect.top + rect.height / 2 + "px";

    s.style.setProperty('--x', x);
    s.style.setProperty('--y', y);

    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }
}

function triggerConfetti() {
  for (let i = 0; i < 120; i++) {
    const c = document.createElement("div");
    c.className = "confetti";

    c.style.left = Math.random() * 100 + "vw";
    c.style.background = `hsl(${Math.random()*360},100%,50%)`;
    c.style.animationDuration = (Math.random() * 2 + 2) + "s";

    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}

function triggerShake() {
  document.body.classList.add("shake");
  setTimeout(() => {
    document.body.classList.remove("shake");
  }, 400);
}

function playWinSound() {
  const audio = new Audio("https://www.soundjay.com/buttons/sounds/button-10.mp3");
  audio.play();
}

function spawnDeathEffect(element) {
  const rect = element.getBoundingClientRect();

  const emojis = ["💀", "🩸", "☠️", "🪦"];

  for (let i = 0; i < 10; i++) {
    const e = document.createElement("div");
    e.className = "emoji";

    e.innerText = emojis[Math.floor(Math.random() * emojis.length)];

    const x = (Math.random() - 0.5) * 150 + "px";
    const y = (-Math.random() * 150) + "px";

    e.style.left = rect.left + rect.width / 2 + "px";
    e.style.top = rect.top + rect.height / 2 + "px";

    e.style.setProperty('--x', x);
    e.style.setProperty('--y', y);

    document.body.appendChild(e);

    setTimeout(() => e.remove(), 1500);
  }
}

// update
socket.on('update', (gameData) => {
  game = gameData; // Store game state
  const buttons = document.querySelectorAll(".grid button");

  // Display player status with connection indicators
  let playerStatusHTML = '';
  if (gameData.players.length > 0) {
    playerStatusHTML = '<div class="player-card">';
    gameData.players.forEach(player => {
      const isConnected = player.connected;
      const statusClass = isConnected ? 'status-online' : 'status-offline';
      const statusText = isConnected ? 'Online' : 'Offline';
      playerStatusHTML += `
        <div><span class="status-indicator ${statusClass}"></span>${player.name} (${player.symbol}) - ${statusText}</div>
      `;
    });
    playerStatusHTML += '</div>';
  }
  playerStatusDiv.innerHTML = playerStatusHTML;

  // Display spectators
  if (gameData.spectators && gameData.spectators.length > 0) {
    spectatorListDiv.innerHTML = `<div class="spectator-list"><strong>Spectators (${gameData.spectators.length}):</strong> ${gameData.spectators.map(s => s.name).join(', ')}</div>`;
  } else {
    spectatorListDiv.innerHTML = '';
  }

  // Show host controls if this player is host and a player is offline
  if (isHost && gameData.players.some(p => !p.connected)) {
    showHostControls();
  }

  // Hide loser overlay on any update (restart, new game, etc.)
  loserOverlay.style.display = "none";
  document.body.classList.remove("loser-mode");

  buttons.forEach(btn => {
    btn.classList.remove("win");
    btn.classList.remove("lose");
  });

  buttons.forEach(btn => {
    btn.disabled = false;
    btn.style.backgroundColor = "white";
    btn.style.background = "white";
    btn.style.color = "black";
    btn.style.transform = "scale(1)";
  });

  gameData.board.forEach((val, i) => {
    buttons[i].innerText = val;

    if (val === "X") {
      buttons[i].style.backgroundColor = "#74c0fc";
      buttons[i].style.background = "#74c0fc";
      buttons[i].style.color = "white";
      buttons[i].style.fontWeight = "bold";
    } else if (val === "O") {
      buttons[i].style.backgroundColor = "#ff8787";
      buttons[i].style.background = "#ff8787";
      buttons[i].style.color = "white";
      buttons[i].style.fontWeight = "bold";
    }
  });

  if (gameData.players.length < 2) {
    statusText.innerText = "Waiting for opponent...";
    buttons.forEach(btn => btn.disabled = true);
    return;
  }

  if (gameData.winner === "draw") {
    statusText.innerText = "🤝 Draw!";
    buttons.forEach(btn => btn.disabled = true);
    return;
  }

  if (gameData.winner) {
    const isWinner = gameData.winner === playerSymbol;

    if (isSpectator) {
      const winnerName = gameData.players.find(p => p.symbol === gameData.winner)?.name || 'Unknown';
      statusText.innerText = `🏆 ${winnerName} wins!`;
    } else {
      statusText.innerText = isWinner ? "🏆 YOU WIN" :  "💀 YOU LOST";
    }

    const line = getWinningLine(gameData.board);

    if (line) {
      line.forEach(i => {
        const btn = buttons[i];
        btn.classList.add("win");
        spawnSparkles(btn);
      });
    }

    if (!isWinner && !isSpectator) {
      document.body.classList.add("loser-mode");
      loserOverlay.style.display = "flex";

      buttons.forEach((btn, i) => {
        if (!line.includes(i) && gameData.board[i] !== "") {
          btn.classList.add("lose");
          spawnDeathEffect(btn);
        }
      });
    }

    triggerConfetti();
    triggerShake();
    playWinSound();

    buttons.forEach(btn => btn.disabled = true);
  } else {
    statusText.innerText = `Turn: ${gameData.turn}`;
  }

  // ✅ HOST CAN RESTART REGARDLESS OF WIN/LOSS
  if (isHost) {
    restartBtn.style.display = "block";
  } else {
    restartBtn.style.display = "none";
  }

  // Show main menu button for all players when game ends
  const mainMenuBtn = document.getElementById('mainMenuBtn');
  if (gameData.result || gameData.status === 'complete' || gameData.status === 'draw' || gameData.winner) {
    mainMenuBtn.style.display = "block";
  }
});

// ===== SHOW HOST CONTROLS =====
function showHostControls() {
  if (!isHost || isSpectator || !game.players) return;

  let controlsHTML = '<div class="host-controls">⚙️ <strong>Host Controls:</strong>';
  let hasDisconnected = false;
  
  // Add kick buttons for each opponent
  game.players.forEach(player => {
    if (player.name !== username && !player.connected) {
      hasDisconnected = true;
      controlsHTML += `<button class="btn-kick" onclick="kickPlayer('${player.name}')">👢 Kick ${player.name}</button>`;
    }
  });

  if (hasDisconnected) {
    controlsHTML += '</div>';
    hostControlsDiv.innerHTML = controlsHTML;
    hostControlsDiv.style.display = 'block';
  } else {
    hostControlsDiv.style.display = 'none';
  }
}

function kickPlayer(playerName) {
  if (confirm(`Kick ${playerName} from the game?`)) {
    socket.emit('kick', { gameId, playerName });
  }
}

restartBtn.onclick = () => {
  socket.emit('restart', gameId);
};

// ===== LEADERBOARD =====
async function loadLeaderboard() {
  try {
    const response = await fetch('/api/leaderboard');
    const leaderboard = await response.json();
    const tbody = document.getElementById('leaderboardBody');
    
    if (leaderboard.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No games yet</td></tr>';
      return;
    }
    
    tbody.innerHTML = leaderboard.map((player, idx) => {
      const rank = idx + 1;
      let rankClass = '';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';
      
      return `
        <tr>
          <td class="rank ${rankClass}">#${rank}</td>
          <td>${player.username}</td>
          <td>${player.wins}-${player.draws}-${player.losses}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading leaderboard:', err);
  }
}

loadLeaderboard();
// Refresh leaderboard every 10 seconds
setInterval(loadLeaderboard, 10000);

// Listen for real-time updates when a game finishes
socket.on('leaderboardUpdate', () => {
  loadLeaderboard();
});