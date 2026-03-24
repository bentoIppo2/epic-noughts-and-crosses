const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));

// ===== DATABASE SETUP =====
const db = new sqlite3.Database('/data/users.db', (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Connected to SQLite database');
});

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    wins INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    FOREIGN KEY(username) REFERENCES users(username)
  )
`);

// ===== DATA MIGRATION =====
function runMigration() {
  db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
    if (err) {
      console.error('Migration check failed:', err);
      return;
    }

    if (row.count > 0) {
      console.log('Migration skipped: users table already contains data');
      return;
    }

    console.log('Users table is empty — restoring backup data...');

    const migrationSQL = `
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
INSERT INTO users VALUES(1,'ben','$2b$10$6g7cH7Azseqz3KFTMmaaEOd1svJpiSxjhuF7nuu/ZIJhpWnGMomO2','2026-03-24 09:43:10');
INSERT INTO users VALUES(2,'luca','$2b$10$PfeJNuAPbbitqPijvXbDSePEtFUWauSg1Goa1Xd8TFLjLl.nSHVm.','2026-03-24 09:47:33');
INSERT INTO users VALUES(3,'Kmhb','$2b$10$xkWeDsf5DO/H69e8qVhYue8wi0hmcmmPYFDwwTftWBSQfl0UJMuW2','2026-03-24 10:04:59');
INSERT INTO users VALUES(4,'settingstest','$2b$10$c9dGTYQIPn2MwNe.r118v.OuLAjhMykuzsMo.sckNvPKSSRviT/ne','2026-03-24 10:09:48');
INSERT INTO users VALUES(5,'finaltest','$2b$10$YHLWGje9s2ySpdVK3pJ5ie1iy8F6NqGkbxQt9nPxps5e2hMbojOnW','2026-03-24 10:10:05');
INSERT INTO users VALUES(7,'themetest','$2b$10$BkHoVcrFPziOnz3146BqGuRN6JmRkT14hNqyR6eOiQKgQgyFsP2M2','2026-03-24 10:14:58');
INSERT INTO stats VALUES(1,'ben',5,0,1);
INSERT INTO stats VALUES(2,'luca',0,0,4);
INSERT INTO stats VALUES(6,'Kmhb',1,0,1);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence VALUES('users',7);
INSERT INTO sqlite_sequence VALUES('stats',12);
COMMIT;
PRAGMA foreign_keys=ON;
    `;

    db.exec(migrationSQL, (execErr) => {
      if (execErr) {
        console.error('Migration failed:', execErr);
      } else {
        console.log('Migration successful: user accounts and stats restored');
      }
    });
  });
}

// Run migration after tables are created (serialize ensures ordering)
db.serialize(() => {
  runMigration();
});

let games = {};

// Track who started the previous game for each game session
let gameStartTracker = {};

// ===== STATS TRACKING =====
function updateStats(username, result) {
  db.run(
    `INSERT INTO stats (username, ${result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws'}) 
     VALUES (?, 1)
     ON CONFLICT(username) DO UPDATE SET ${result === 'win' ? 'wins=wins+1' : result === 'loss' ? 'losses=losses+1' : 'draws=draws+1'}`,
    [username],
    (err) => {
      if (err) console.error('Stats update error:', err);
    }
  );
}

// ===== WIN CHECK =====
function checkWin(board) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (let [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

// ===== REGISTER PAGE =====
app.get('/register', (req, res) => {
  const error = req.query.error || '';
  const username = req.query.username || '';
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Register</title>
      <style>
        body { font-family: Arial; background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; margin: 0; padding: 20px; }
        .container { max-width: 400px; margin: 100px auto; background: rgba(255,255,255,0.1); padding: 30px; border-radius: 10px; }
        h1 { text-align: center; }
        input { width: 100%; padding: 10px; margin: 10px 0; border: none; border-radius: 5px; box-sizing: border-box; }
        button { width: 100%; padding: 10px; background: #51cf66; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        button:hover { background: #40c057; }
        .error { color: #ff6b6b; margin-bottom: 15px; padding: 10px; background: rgba(255,107,107,0.2); border-radius: 5px; font-size: 0.95em; }
        .link { text-align: center; margin-top: 15px; }
        a { color: #74c0fc; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Create Account</h1>
        ${error ? `<div class="error">⚠️ ${error}</div>` : ''}
        <form method="POST" action="/register">
          <input type="text" name="username" placeholder="Username" value="${username}" required />
          <input type="password" name="password" placeholder="Password" required />
          <input type="password" name="confirm_password" placeholder="Confirm Password" required />
          <button type="submit">Register</button>
        </form>
        <div class="link">Already have an account? <a href="/login">Login here</a></div>
      </div>
    </body>
    </html>
  `);
});

app.post('/register', async (req, res) => {
  const { username, password, confirm_password } = req.body;
  const encodedUsername = encodeURIComponent(username);

  if (!username || !password || !confirm_password) {
    return res.redirect(`/register?error=${encodeURIComponent('All fields are required')}&username=${encodedUsername}`);
  }

  if (password !== confirm_password) {
    return res.redirect(`/register?error=${encodeURIComponent('Passwords do not match')}&username=${encodedUsername}`);
  }

  if (username.length < 3) {
    return res.redirect(`/register?error=${encodeURIComponent('Username must be at least 3 characters')}&username=${encodedUsername}`);
  }

  if (password.length < 6) {
    return res.redirect(`/register?error=${encodeURIComponent('Password must be at least 6 characters')}&username=${encodedUsername}`);
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.redirect(`/register?error=${encodeURIComponent('Username already exists')}&username=${encodedUsername}`);
        }
        return res.redirect(`/register?error=${encodeURIComponent('Registration error - please try again')}&username=${encodedUsername}`);
      }

      req.session.username = username;
      res.redirect('/');
    });
  } catch (error) {
    res.redirect(`/register?error=${encodeURIComponent('Server error - please try again')}&username=${encodedUsername}`);
  }
});

// ===== LOGIN PAGE =====
app.get('/login', (req, res) => {
  const error = req.query.error || '';
  const username = req.query.username || '';
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Login</title>
      <style>
        body { font-family: Arial; background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; margin: 0; padding: 20px; }
        .container { max-width: 400px; margin: 100px auto; background: rgba(255,255,255,0.1); padding: 30px; border-radius: 10px; }
        h1 { text-align: center; }
        input { width: 100%; padding: 10px; margin: 10px 0; border: none; border-radius: 5px; box-sizing: border-box; }
        button { width: 100%; padding: 10px; background: #74c0fc; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        button:hover { background: #4dabf7; }
        .error { color: #ff6b6b; margin-bottom: 15px; padding: 10px; background: rgba(255,107,107,0.2); border-radius: 5px; font-size: 0.95em; }
        .link { text-align: center; margin-top: 15px; }
        a { color: #74c0fc; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Login</h1>
        ${error ? `<div class="error">⚠️ ${error}</div>` : ''}
        <form method="POST" action="/login">
          <input type="text" name="username" placeholder="Username" value="${username}" required />
          <input type="password" name="password" placeholder="Password" required />
          <button type="submit">Login</button>
        </form>
        <div class="link">Don't have an account? <a href="/register">Register here</a></div>
      </div>
    </body>
    </html>
  `);
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const encodedUsername = encodeURIComponent(username);

  if (!username || !password) {
    return res.redirect(`/login?error=${encodeURIComponent('Username and password are required')}&username=${encodedUsername}`);
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      return res.redirect(`/login?error=${encodeURIComponent('Server error - please try again')}&username=${encodedUsername}`);
    }

    if (!user) {
      return res.redirect(`/login?error=${encodeURIComponent('Invalid username or password')}&username=${encodedUsername}`);
    }

    try {
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.redirect(`/login?error=${encodeURIComponent('Invalid username or password')}&username=${encodedUsername}`);
      }

      req.session.username = username;
      res.redirect('/');
    } catch (error) {
      res.redirect(`/login?error=${encodeURIComponent('Server error - please try again')}&username=${encodedUsername}`);
    }
  });
});

// ===== HOME =====
// ===== HOME =====
app.get('/', (req, res) => {
  if (!req.session.username) {
    return res.redirect('/login');
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Noughts & Crosses</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial; background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; min-height: 100vh; padding: 20px; }
        .wrapper { display: flex; gap: 20px; max-width: 1200px; margin: 0 auto; }
        .container { flex: 1; background: rgba(255,255,255,0.1); padding: 40px; border-radius: 10px; text-align: center; }
        .sidebar { width: 300px; background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; }
        h1 { font-size: 2.5em; margin-bottom: 10px; }
        h2 { font-size: 1.3em; margin-bottom: 15px; color: #74c0fc; }
        .welcome { font-size: 1.2em; margin-bottom: 30px; color: #74c0fc; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 1.1em; color: #b3d9ff; margin-bottom: 15px; font-weight: bold; }
        .button-group { display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; }
        a, button { padding: 12px 30px; text-decoration: none; border: none; border-radius: 8px; cursor: pointer; font-size: 1.1em; font-weight: bold; transition: 0.2s; }
        .btn-create { background: #51cf66; color: white; }
        .btn-create:hover { background: #40c057; }
        .btn-logout { background: #ff6b6b; color: white; }
        .btn-logout:hover { background: #ee5a52; }
        .input-group { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        #gameIdInput { padding: 12px 15px; border: none; border-radius: 8px; font-size: 1em; width: 200px; box-sizing: border-box; }
        .btn-join { background: #4dabf7; color: white; }
        .btn-join:hover { background: #339af0; }
        .error-msg { color: #ff6b6b; font-size: 0.9em; margin-top: 8px; }
        
        /* Leaderboard Styles */
        .leaderboard-table { width: 100%; font-size: 0.9em; }
        .leaderboard-table th, .leaderboard-table td { padding: 8px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.2); }
        .leaderboard-table th { background: rgba(255,255,255,0.1); font-weight: bold; }
        .leaderboard-table tr:hover { background: rgba(255,255,255,0.05); }
        .rank { font-weight: bold; color: #ffd43b; }
        .rank-1 { color: #ffd700; }
        .rank-2 { color: #c0c0c0; }
        .rank-3 { color: #cd7f32; }
        
        .button-row { display: flex; gap: 10px; justify-content: center; margin-top: 30px; flex-wrap: wrap; }
        .button-row a { padding: 12px 30px; text-decoration: none; border: none; border-radius: 8px; cursor: pointer; font-size: 1.1em; font-weight: bold; transition: 0.2s; }
        .btn-settings { background: #ffd43b; color: #1e3c72; }
        .btn-settings:hover { background: #ffec99; }
        
        @media (max-width: 768px) {
          .wrapper { flex-direction: column; }
          .sidebar { width: 100%; }
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <h1>Noughts & Crosses</h1>
          <div class="welcome">Welcome, <strong>${req.session.username}!</strong></div>
          
          <div class="section">
            <div class="section-title">Create New Game</div>
            <div class="button-group">
              <a href="/create" class="btn-create">Create Game</a>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Join Existing Game</div>
            <div class="input-group">
              <input type="text" id="gameIdInput" placeholder="Enter game ID" maxlength="5" />
              <button class="btn-join" onclick="joinGame()">Join</button>
            </div>
            <div id="errorMsg" class="error-msg"></div>
            <div style="margin-top: 15px;">
              <a href="/games" class="btn-join">Browse Games</a>
            </div>
          </div>

          <div class="button-row">
            <a href="/settings" class="btn-settings">⚙️ Settings</a>
            <a href="/logout" class="btn-logout">Logout</a>
          </div>
        </div>

        <div class="sidebar">
          <h2>🏆 Leaderboard</h2>
          <table class="leaderboard-table" id="leaderboardTable">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>W-D-L</th>
              </tr>
            </thead>
            <tbody id="leaderboardBody">
              <tr><td colspan="3" style="text-align: center;">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        function joinGame() {
          const gameId = document.getElementById('gameIdInput').value.trim();
          const errorMsg = document.getElementById('errorMsg');
          
          if (!gameId) {
            errorMsg.innerText = '⚠️ Please enter a game ID';
            return;
          }
          
          errorMsg.innerText = '';
          window.location.href = '/game/' + gameId;
        }

        document.getElementById('gameIdInput').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') joinGame();
        });

        document.getElementById('gameIdInput').addEventListener('input', function() {
          document.getElementById('errorMsg').innerText = '';
        });

        // Load leaderboard
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
              
              return \`
                <tr>
                  <td class="rank \${rankClass}">#\${rank}</td>
                  <td>\${player.username}</td>
                  <td>\${player.wins}-\${player.draws}-\${player.losses}</td>
                </tr>
              \`;
            }).join('');
          } catch (err) {
            console.error('Error loading leaderboard:', err);
          }
        }

        loadLeaderboard();
        // Refresh leaderboard every 10 seconds
        setInterval(loadLeaderboard, 10000);

        // Socket.IO for real-time updates
        const socket = io();
        socket.on('leaderboardUpdate', () => {
          loadLeaderboard();
        });
      </script>
    </body>
    </html>
  `);
});

// ===== SETTINGS PAGE =====
app.get('/settings', (req, res) => {
  if (!req.session.username) {
    return res.redirect('/login');
  }

  const error = req.query.error || '';
  const success = req.query.success || '';

  db.get('SELECT * FROM stats WHERE username = ?', [req.session.username], (err, stats) => {
    const wins = stats?.wins || 0;
    const draws = stats?.draws || 0;
    const losses = stats?.losses || 0;
    const total = wins + draws + losses;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Account Settings</title>
        <style>
          body { font-family: Arial; background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 50px auto; background: rgba(255,255,255,0.1); padding: 30px; border-radius: 10px; }
          h1 { text-align: center; margin-top: 0; }
          .section { margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.2); }
          .section:last-child { border-bottom: none; }
          .section-title { font-size: 1.2em; color: #74c0fc; margin-bottom: 15px; font-weight: bold; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px 0; }
          .info-label { color: #b3d9ff; }
          .info-value { font-weight: bold; }
          input, textarea { width: 100%; padding: 10px; margin: 10px 0; border: none; border-radius: 5px; box-sizing: border-box; font-size: 1em; }
          button { padding: 10px 20px; background: #51cf66; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin-right: 10px; }
          button:hover { background: #40c057; }
          .btn-danger { background: #ff6b6b; }
          .btn-danger:hover { background: #ee5a52; }
          .back-link { text-align: center; margin-top: 20px; }
          .back-link a { color: #74c0fc; text-decoration: none; }
          .back-link a:hover { text-decoration: underline; }
          .error { color: #ff6b6b; background: rgba(255,107,107,0.2); padding: 12px; border-radius: 5px; margin-bottom: 15px; }
          .success { color: #51cf66; background: rgba(81,207,102,0.2); padding: 12px; border-radius: 5px; margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⚙️ Account Settings</h1>

          ${error ? `<div class="error">⚠️ ${error}</div>` : ''}
          ${success ? `<div class="success">✅ ${success}</div>` : ''}

          <!-- Account Info Section -->
          <div class="section">
            <div class="section-title">Account Information</div>
            <div class="info-row">
              <span class="info-label">Username:</span>
              <span class="info-value">${req.session.username}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Games Played:</span>
              <span class="info-value">${total}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Wins:</span>
              <span class="info-value">${wins}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Draws:</span>
              <span class="info-value">${draws}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Losses:</span>
              <span class="info-value">${losses}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Win Rate:</span>
              <span class="info-value">${winRate}%</span>
            </div>
          </div>

          <!-- Change Password Section -->
          <div class="section">
            <div class="section-title">Change Password</div>
            <form method="POST" action="/settings">
              <input type="password" name="current_password" placeholder="Current Password" required />
              <input type="password" name="new_password" placeholder="New Password (min 6 chars)" required />
              <input type="password" name="confirm_password" placeholder="Confirm New Password" required />
              <button type="submit">Change Password</button>
            </form>
          </div>

          <!-- Danger Zone -->
          <div class="section">
            <div class="section-title" style="color: #ff6b6b;">Danger Zone</div>
            <p style="color: #b3d9ff; font-size: 0.9em;">⚠️ These actions cannot be undone</p>
            <form method="POST" action="/settings/delete" style="margin-top: 10px;">
              <button type="submit" class="btn-danger" onclick="return confirm('Are you sure? This will delete your account and all your data.')">Delete Account</button>
            </form>
          </div>

          <div class="back-link">
            <a href="/">← Back to Home</a>
          </div>
        </div>
      </body>
      </html>
    `);
  });
});

// ===== UPDATE PASSWORD =====
app.post('/settings', async (req, res) => {
  if (!req.session.username) {
    return res.redirect('/login');
  }

  const { current_password, new_password, confirm_password } = req.body;

  if (!current_password || !new_password || !confirm_password) {
    return res.redirect(`/settings?error=${encodeURIComponent('All fields are required')}`);
  }

  if (new_password !== confirm_password) {
    return res.redirect(`/settings?error=${encodeURIComponent('New passwords do not match')}`);
  }

  if (new_password.length < 6) {
    return res.redirect(`/settings?error=${encodeURIComponent('New password must be at least 6 characters')}`);
  }

  if (new_password === current_password) {
    return res.redirect(`/settings?error=${encodeURIComponent('New password must be different from current password')}`);
  }

  db.get('SELECT * FROM users WHERE username = ?', [req.session.username], async (err, user) => {
    if (err || !user) {
      return res.redirect(`/settings?error=${encodeURIComponent('User not found')}`);
    }

    try {
      const isPasswordValid = await bcrypt.compare(current_password, user.password);

      if (!isPasswordValid) {
        return res.redirect(`/settings?error=${encodeURIComponent('Current password is incorrect')}`);
      }

      const hashedPassword = await bcrypt.hash(new_password, 10);

      db.run(
        'UPDATE users SET password = ? WHERE username = ?',
        [hashedPassword, req.session.username],
        (updateErr) => {
          if (updateErr) {
            return res.redirect(`/settings?error=${encodeURIComponent('Failed to update password')}`);
          }
          res.redirect(`/settings?success=${encodeURIComponent('Password changed successfully!')}`);
        }
      );
    } catch (error) {
      res.redirect(`/settings?error=${encodeURIComponent('Server error')}`);
    }
  });
});

// ===== DELETE ACCOUNT =====
app.post('/settings/delete', (req, res) => {
  if (!req.session.username) {
    return res.redirect('/login');
  }

  const username = req.session.username;

  db.run('DELETE FROM users WHERE username = ?', [username], (err1) => {
    if (err1) {
      return res.redirect(`/settings?error=${encodeURIComponent('Failed to delete account')}`);
    }

    db.run('DELETE FROM stats WHERE username = ?', [username], (err2) => {
      if (err2) {
        console.error('Error deleting stats:', err2);
      }

      req.session.destroy((err3) => {
        if (err3) console.error('Error destroying session:', err3);
        res.redirect('/login?message=Account deleted successfully');
      });
    });
  });
});

// ===== LOGOUT =====
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.send('Error logging out');
    res.redirect('/login');
  });
});

// ===== LEADERBOARD API =====
app.get('/api/leaderboard', (req, res) => {
  db.all(
    `SELECT username, wins, draws, losses, (wins + draws * 0.5) as points 
     FROM stats 
     ORDER BY wins DESC, points DESC, draws DESC 
     LIMIT 10`,
    [],
    (err, rows) => {
      if (err) {
        return res.json([]);
      }
      res.json(rows || []);
    }
  );
});

// ===== GAMES LIST PAGE =====
app.get('/games', (req, res) => {
  if (!req.session.username) {
    return res.redirect('/login');
  }

  const gamesList = Object.entries(games).map(([id, game]) => ({
    id,
    playerCount: game.players.length,
    players: game.players.map(p => p.name).join(', '),
    status: game.winner ? 'Finished' : (game.players.length === 2 ? 'In Progress' : 'Waiting')
  }));

  const gamesHTML = gamesList.map(game => `
    <tr>
      <td><strong>${game.id}</strong></td>
      <td>${game.playerCount}/2</td>
      <td>${game.players || 'Empty'}</td>
      <td><span style="color: ${game.status === 'Waiting' ? '#51cf66' : (game.status === 'In Progress' ? '#ffd43b' : '#ff6b6b')}">${game.status}</span></td>
      <td><a href="/game/${game.id}" style="color: #74c0fc; text-decoration: none; font-weight: bold;">Join →</a></td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Browse Games</title>
      <style>
        body { font-family: Arial; background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; margin: 0; padding: 20px; }
        .container { max-width: 900px; margin: 50px auto; background: rgba(255,255,255,0.1); padding: 30px; border-radius: 10px; }
        h1 { text-align: center; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: rgba(255,255,255,0.2); padding: 12px; text-align: left; border-bottom: 2px solid rgba(255,255,255,0.3); }
        td { padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        tr:hover { background: rgba(255,255,255,0.05); }
        .empty-state { text-align: center; padding: 40px; color: #b3d9ff; }
        .back-btn, .refresh-btn { display: inline-block; padding: 10px 20px; background: #4dabf7; color: white; text-decoration: none; border-radius: 8px; border: none; cursor: pointer; font-weight: bold; margin-right: 10px; }
        .back-btn:hover, .refresh-btn:hover { background: #339af0; }
        .button-group { text-align: center; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Available Games</h1>
        
        <div class="button-group">
          <a href="/" class="back-btn">← Back</a>
          <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
        </div>

        ${gamesHTML ? `
          <table>
            <thead>
              <tr>
                <th>Game ID</th>
                <th>Players</th>
                <th>Player Names</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${gamesHTML}
            </tbody>
          </table>
        ` : `
          <div class="empty-state">
            <p>No games available yet.</p>
            <p><a href="/create" style="color: #74c0fc;">Create a new game →</a></p>
          </div>
        `}
      </div>
    </body>
    </html>
  `);
});

// ===== CREATE GAME =====
app.get('/create', (req, res) => {
  const id = Math.random().toString(36).substr(2, 5);

  games[id] = {
    board: Array(9).fill(""),
    players: [],
    turn: "X",
    winner: null,
    host: null
  };

  res.redirect(`/game/${id}`);
});

// ===== REDIRECT INVALID GAME PATH =====
app.get('/game', (req, res) => {
  res.redirect('/');
});

// ===== GAME PAGE =====
app.get('/game/:id', (req, res) => {
  if (!req.session.username) {
    return res.redirect('/login');
  }

  const gameHtml = require('fs').readFileSync(path.join(__dirname, 'public', 'game.html'), 'utf8');
  const htmlWithUsername = gameHtml.replace(
    '</head>',
    `<script>window.loggedInUser = "${req.session.username}";</script></head>`
  );
  res.send(htmlWithUsername);
});

// ===== SOCKET =====
io.on('connection', (socket) => {

  socket.on('join', ({ gameId, username }) => {
    const game = games[gameId];
    if (!game) return;

    socket.join(gameId);

    if (game.players.length < 2) {
      const symbol = game.players.length === 0 ? "X" : "O";

      const player = {
        id: socket.id,
        symbol,
        name: username
      };

      game.players.push(player);

      if (game.players.length === 1) {
        game.host = socket.id;
      }

      socket.emit('player', {
        symbol,
        name: username,
        isHost: socket.id === game.host
      });
    }

    io.to(gameId).emit('update', game);
  });

  socket.on('move', ({ gameId, index }) => {
    const game = games[gameId];
    if (!game || game.winner) return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    if (player.symbol !== game.turn) return;
    if (game.board[index] !== "") return;

    game.board[index] = player.symbol;

    const winner = checkWin(game.board);

    if (winner) {
      game.winner = winner;
      
      // Record stats
      if (game.players.length === 2) {
        const winnerPlayer = game.players.find(p => p.symbol === winner);
        const loserPlayer = game.players.find(p => p.symbol !== winner);
        
        if (winnerPlayer) updateStats(winnerPlayer.name, 'win');
        if (loserPlayer) updateStats(loserPlayer.name, 'loss');
      }
      
      // Notify all clients to refresh leaderboard
      io.emit('leaderboardUpdate');
    } else if (!game.board.includes("")) {
      game.winner = "draw";
      
      // Record draw
      if (game.players.length === 2) {
        game.players.forEach(p => updateStats(p.name, 'draw'));
      }
      
      // Notify all clients to refresh leaderboard
      io.emit('leaderboardUpdate');
    } else {
      game.turn = game.turn === "X" ? "O" : "X";
    }

    io.to(gameId).emit('update', game);
  });

  socket.on('restart', (gameId) => {
    const game = games[gameId];
    if (!game) return;

    if (socket.id !== game.host) return;
    if (!game.winner) return;

    // Alternate who goes first
    if (!gameStartTracker[gameId]) {
      gameStartTracker[gameId] = 'X'; // First game starts with X
    }
    const nextTurn = gameStartTracker[gameId] === 'X' ? 'O' : 'X';
    gameStartTracker[gameId] = nextTurn;

    game.board = Array(9).fill("");
    game.turn = nextTurn;
    game.winner = null;

    io.to(gameId).emit('update', game);
  });
});

server.listen(3000, () => {
  console.log("RUNNING: http://localhost:3000");
});