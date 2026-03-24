const socket = io();

const grid = document.getElementById("grid");
const statusText = document.getElementById("status");
const restartBtn = document.getElementById("restart");
const playersText = document.getElementById("players");
const gameIdDisplay = document.getElementById("gameIdDisplay");
const loserOverlay = document.getElementById("loserOverlay");

const gameId = window.location.pathname.split("/").pop();
const username = window.loggedInUser;

let playerSymbol = null;
let isHost = false;

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
    socket.emit('move', { gameId, index: i });
  };
  grid.appendChild(btn);
}

// join
socket.emit('join', { gameId, username });

socket.on('player', (data) => {
  playerSymbol = data.symbol;
  isHost = data.isHost;

  statusText.innerText = `You are ${data.name} (${data.symbol})`;
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
socket.on('update', (game) => {
  const buttons = document.querySelectorAll(".grid button");

  // Hide loser overlay on any update (restart, new game, etc.)
  loserOverlay.style.display = "none";
  document.body.classList.remove("loser-mode");

  buttons.forEach(btn => {
    btn.classList.remove("win");
    btn.classList.remove("lose");
  });

  if (game.players.length === 1) {
    playersText.innerText = `👤 ${game.players[0].name} (X) waiting for opponent...`;
  } else if (game.players.length === 2) {
    playersText.innerText = `👤 ${game.players[0].name} (X) vs ${game.players[1].name} (O)`;
  }

  buttons.forEach(btn => {
    btn.disabled = false;
    btn.style.background = "white";
    btn.style.transform = "scale(1)";
  });

  game.board.forEach((val, i) => {
    buttons[i].innerText = val;

    if (val === "X") buttons[i].style.background = "#74c0fc";
    if (val === "O") buttons[i].style.background = "#ff8787";
  });

  if (game.players.length < 2) {
    statusText.innerText = "Waiting for opponent...";
    buttons.forEach(btn => btn.disabled = true);
    return;
  }

  if (game.winner === "draw") {
    statusText.innerText = "🤝 Draw!";
    buttons.forEach(btn => btn.disabled = true);
    return;
  }

  if (game.winner) {
    const isWinner = game.winner === playerSymbol;

    statusText.innerText = isWinner ? "🏆 YOU WIN" : "💀 YOU LOST";

    const line = getWinningLine(game.board);

    if (line) {
      line.forEach(i => {
        const btn = buttons[i];
        btn.classList.add("win");
        spawnSparkles(btn);
      });
    }

    if (!isWinner) {
      document.body.classList.add("loser-mode");
      loserOverlay.style.display = "flex";

      buttons.forEach((btn, i) => {
        if (!line.includes(i) && game.board[i] !== "") {
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
    statusText.innerText = `Turn: ${game.turn}`;
  }

  // ✅ HOST CAN RESTART REGARDLESS OF WIN/LOSS
  if (isHost) {
    restartBtn.style.display = "block";
  } else {
    restartBtn.style.display = "none";
  }
});

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