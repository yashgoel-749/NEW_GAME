// ─── CONFIG ──────────────────────────────────────────────
// Change this to your Render backend URL after deploying
// For local dev, use ws://localhost:3000
const BACKEND_URL = window.location.hostname === 'localhost'
    ? 'ws://localhost:3000'
    : 'wss://YOUR_RENDER_URL.onrender.com';  // ← Replace after deploying backend

// ─── DOM Elements ────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const roomOverlay = document.getElementById('roomOverlay');
const waitingOverlay = document.getElementById('waitingOverlay');
const gameHud = document.getElementById('gameHud');

const tabCreate = document.getElementById('tabCreate');
const tabJoin = document.getElementById('tabJoin');
const createPanel = document.getElementById('createPanel');
const joinPanel = document.getElementById('joinPanel');

const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const errorMsg = document.getElementById('errorMsg');

const waitingRoomId = document.getElementById('waitingRoomId');
const copyBtn = document.getElementById('copyBtn');

const hudRoom = document.getElementById('hudRoom');
const hudPlayers = document.getElementById('hudPlayers');
const hudYou = document.getElementById('hudYou');

// ─── Game State ──────────────────────────────────────────
const ROWS = 16;
const COLS = 32;

let ws = null;
let playerId = null;
let players = {};
let map = [];
let localKeys = {};
let isGameActive = false;
let currentRoom = '';

// ─── Tab Switching ───────────────────────────────────────
tabCreate.onclick = () => switchTab('create');
tabJoin.onclick = () => switchTab('join');

function switchTab(tab) {
    hideError();
    if (tab === 'create') {
        tabCreate.classList.add('active');
        tabJoin.classList.remove('active');
        createPanel.classList.add('active');
        joinPanel.classList.remove('active');
    } else {
        tabJoin.classList.add('active');
        tabCreate.classList.remove('active');
        joinPanel.classList.add('active');
        createPanel.classList.remove('active');
        roomInput.focus();
    }
}

// ─── Room Actions ────────────────────────────────────────
createBtn.onclick = () => {
    const roomId = generateRoomId();
    connectToRoom(roomId);
};

joinBtn.onclick = () => {
    const roomId = roomInput.value.trim().toUpperCase();
    if (!roomId) {
        showError('Please enter a Room ID');
        return;
    }
    connectToRoom(roomId);
};

roomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinBtn.click();
});

copyBtn.onclick = () => {
    navigator.clipboard.writeText(currentRoom).then(() => {
        copyBtn.textContent = '✅';
        setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
    });
};

function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
    let id = '';
    for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

// ─── WebSocket Connection ────────────────────────────────
function connectToRoom(roomId) {
    hideError();
    currentRoom = roomId;

    try {
        ws = new WebSocket(`${BACKEND_URL}?room=${roomId}`);
    } catch (e) {
        showError('Could not connect to server');
        return;
    }

    ws.onopen = () => {
        console.log(`Connected to room ${roomId}`);
        // Show waiting screen
        roomOverlay.classList.add('hidden');
        waitingOverlay.classList.remove('hidden');
        waitingRoomId.textContent = roomId;
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'init') {
            playerId = data.playerId;
            players = data.players;
            map = data.map;

            hudRoom.textContent = currentRoom;
            hudYou.textContent = playerId;
            updatePlayerCount();

            // If both players are in, start immediately
            if (Object.keys(players).length >= 2) {
                startGame();
            }
        } else if (data.type === 'update') {
            players = data.players;
            updatePlayerCount();

            // Start game when player 2 arrives
            if (!isGameActive && Object.keys(players).length >= 2) {
                startGame();
            }
        } else if (data.type === 'error') {
            showError(data.message);
            waitingOverlay.classList.add('hidden');
            roomOverlay.classList.remove('hidden');
        }
    };

    ws.onerror = () => {
        showError('Connection failed. Is the server running?');
        waitingOverlay.classList.add('hidden');
        roomOverlay.classList.remove('hidden');
    };

    ws.onclose = () => {
        console.log('Disconnected');
        if (isGameActive) {
            stopGame();
        }
    };
}

function updatePlayerCount() {
    const count = Object.keys(players).length;
    hudPlayers.textContent = count;
}

// ─── Game Start / Stop ───────────────────────────────────
function startGame() {
    isGameActive = true;
    waitingOverlay.classList.add('hidden');
    roomOverlay.classList.add('hidden');
    gameHud.classList.remove('hidden');
    canvas.classList.add('visible');
    resize();
    requestAnimationFrame(gameLoop);
}

function stopGame() {
    isGameActive = false;
    canvas.classList.remove('visible');
    gameHud.classList.add('hidden');
    roomOverlay.classList.remove('hidden');
    waitingOverlay.classList.add('hidden');
    players = {};
    localKeys = {};
}

// ─── Canvas ──────────────────────────────────────────────
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function draw() {
    if (!map.length) return;

    const tileSize = Math.min(canvas.width / COLS, canvas.height / ROWS);
    const offsetX = (canvas.width - COLS * tileSize) / 2;
    const offsetY = (canvas.height - ROWS * tileSize) / 2;

    // Tile colors
    const tileColors = [
        '#059669', // grass (emerald-600)
        '#2563eb', // water (blue-600)
        '#b45309'  // soil  (amber-700)
    ];

    // Background
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw map tiles with subtle grid lines
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            ctx.fillStyle = tileColors[map[y][x]];
            ctx.fillRect(
                offsetX + x * tileSize + 0.5,
                offsetY + y * tileSize + 0.5,
                tileSize - 1,
                tileSize - 1
            );
        }
    }

    // Draw players
    for (const id in players) {
        const p = players[id];

        // Glow effect for current player
        if (parseInt(id) === playerId) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = p.color;
        }

        // Player square with rounded feel
        const px = p.px * tileSize + offsetX + 2;
        const py = p.py * tileSize + offsetY + 2;
        const ps = tileSize - 4;

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.roundRect(px, py, ps, ps, 4);
        ctx.fill();

        // Player label
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000';
        ctx.font = `bold ${Math.max(10, tileSize * 0.35)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`P${id}`, px + ps / 2, py + ps / 2);
    }

    ctx.shadowBlur = 0;
}

function gameLoop() {
    if (!isGameActive) return;
    draw();
    requestAnimationFrame(gameLoop);
}

// ─── Input ───────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
    if (!isGameActive || !ws) return;
    const key = e.key.toLowerCase();

    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd'].includes(key)) {
        e.preventDefault();
    }

    if (!localKeys[key]) {
        localKeys[key] = true;
        ws.send(JSON.stringify({ type: 'input', keys: localKeys }));
    }
});

window.addEventListener('keyup', (e) => {
    if (!isGameActive || !ws) return;
    const key = e.key.toLowerCase();
    localKeys[key] = false;
    ws.send(JSON.stringify({ type: 'input', keys: localKeys }));
});

// ─── Helpers ─────────────────────────────────────────────
function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
}

function hideError() {
    errorMsg.classList.add('hidden');
}

// ─── Init ────────────────────────────────────────────────
window.addEventListener('resize', resize);
window.onload = resize;
