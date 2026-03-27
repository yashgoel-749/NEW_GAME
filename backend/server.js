const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

// Simple HTTP server for health checks (Render needs this)
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            rooms: Object.keys(rooms).length,
            uptime: process.uptime()
        }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Grid World WebSocket Server');
    }
});

const wss = new WebSocket.Server({ server });

// ─── Game State ──────────────────────────────────────────
const rooms = {};

// ─── Connection Handler ──────────────────────────────────
wss.on('connection', (ws, req) => {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const room = params.get('room') || 'default';

    // Create room if it doesn't exist
    if (!rooms[room]) {
        rooms[room] = {
            players: {},
            map: generateMap(),
            keys: { 1: {}, 2: {} }
        };
    }

    const roomData = rooms[room];
    let playerId = null;

    // Assign player slot
    if (!roomData.players[1]) {
        playerId = 1;
        roomData.players[1] = { px: 5, py: 5, color: '#f43f5e' };
    } else if (!roomData.players[2]) {
        playerId = 2;
        roomData.players[2] = { px: 15, py: 10, color: '#facc15' };
    } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full! (Max 2 players)' }));
        ws.close();
        return;
    }

    ws.playerId = playerId;
    ws.room = room;

    console.log(`[Room ${room}] Player ${playerId} joined`);

    // Send initial state
    ws.send(JSON.stringify({
        type: 'init',
        playerId,
        players: roomData.players,
        map: roomData.map
    }));

    // Notify existing players about the new join
    broadcastToRoom(room, {
        type: 'update',
        players: roomData.players
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'input') {
                roomData.keys[playerId] = data.keys;
            }
        } catch (e) {
            console.error('Bad message:', e.message);
        }
    });

    ws.on('close', () => {
        console.log(`[Room ${room}] Player ${playerId} left`);
        if (roomData.players[playerId]) {
            delete roomData.players[playerId];
            roomData.keys[playerId] = {};
        }

        // Broadcast updated player list
        broadcastToRoom(room, {
            type: 'update',
            players: roomData.players
        });

        // Clean up empty rooms
        if (Object.keys(roomData.players).length === 0) {
            delete rooms[room];
            console.log(`[Room ${room}] Deleted (empty)`);
        }
    });
});

// ─── Broadcast Helper ────────────────────────────────────
function broadcastToRoom(room, data) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.room === room && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ─── Game Loop (60fps) ───────────────────────────────────
setInterval(() => {
    for (const id in rooms) {
        const roomData = rooms[id];
        updatePlayers(roomData);
        broadcastToRoom(id, {
            type: 'update',
            players: roomData.players
        });
    }
}, 16);

// ─── Map Generation ──────────────────────────────────────
function generateMap() {
    const rows = 16;
    const cols = 32;
    const map = [];
    for (let y = 0; y < rows; y++) {
        map[y] = Array(cols).fill(0);
    }

    createPatch(map, 8, 4, 3, 1);   // WATER
    createPatch(map, 24, 10, 4, 1);
    createPatch(map, 16, 12, 3, 2); // SOIL
    createPatch(map, 4, 12, 2, 2);

    return map;
}

function createPatch(map, cx, cy, radius, type) {
    for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
            const dx = cx + x;
            const dy = cy + y;
            if (dx >= 0 && dx < 32 && dy >= 0 && dy < 16) {
                if (x * x + y * y <= radius * radius) {
                    map[dy][dx] = type;
                }
            }
        }
    }
}

// ─── Player Physics ──────────────────────────────────────
function updatePlayers(roomData) {
    const speed = 4;
    const delta = 0.016;
    const moveAmount = speed * delta;

    for (const id of Object.keys(roomData.players)) {
        const p = roomData.players[id];
        const keys = roomData.keys[id] || {};

        let newX = p.px;
        let newY = p.py;

        if (keys.w || keys.arrowup)    newY -= moveAmount;
        if (keys.s || keys.arrowdown)  newY += moveAmount;
        if (keys.a || keys.arrowleft)  newX -= moveAmount;
        if (keys.d || keys.arrowright) newX += moveAmount;

        const gridX = Math.round(newX);
        const gridY = Math.round(newY);

        if (gridX >= 0 && gridX < 32 && gridY >= 0 && gridY < 16) {
            if (roomData.map[gridY][gridX] === 0) {
                p.px = newX;
                p.py = newY;
            }
        }
    }
}

// ─── Start Server ────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Grid World server running on port ${PORT}`);
});
