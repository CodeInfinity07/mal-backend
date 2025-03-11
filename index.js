require('dotenv').config();
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const axios = require('axios');
const cors = require('cors');

const APP_ID = process.env.FB_APP_ID;
const APP_SECRET = process.env.FB_APP_SECRET;
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for now, restrict this in production!
        methods: ['GET', 'POST']
    }
});

app.use(express.json());
app.use(cors());

const authenticatedUsers = new Map(); // Store authenticated users

/**
 * Verify Facebook OAuth token using Facebook Graph API
 * @param {string} userToken - The access token from the client
 * @returns {Promise<Object|null>} - Decoded token data if valid
 */
async function verifyFacebookToken(userToken) {
    try {
        const appToken = `${APP_ID}|${APP_SECRET}`;
        const url = `https://graph.facebook.com/debug_token?input_token=${userToken}&access_token=${appToken}`;
        
        const response = await axios.get(url);
        const data = response.data;

        if (data.data && data.data.is_valid) {
            return data.data; // Returns { user_id, expires_at, app_id, ... }
        } else {
            throw new Error('Invalid Facebook token');
        }
    } catch (error) {
        console.error('Error verifying Facebook token:', error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Express route to authenticate user
 */
app.post('/auth', async (req, res) => {
    const { accessToken } = req.body;

    if (!accessToken) {
        return res.status(400).json({ error: 'Access token required' });
    }

    const fbData = await verifyFacebookToken(accessToken);
    if (!fbData) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Generate a temporary token for WebSocket authentication
    const userId = fbData.user_id;
    const tempToken = `${userId}-${Date.now()}`; // Simple token (use JWT for better security)

    authenticatedUsers.set(tempToken, userId); // Store in-memory (Consider Redis for scalability)

    res.json({ success: true, userId, token: tempToken });
});

/**
 * Handle WebSocket Connections
 */
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle authentication
    socket.on('authenticate', (data) => {
        const { token } = data;

        if (!authenticatedUsers.has(token)) {
            console.log('Authentication failed for', socket.id);
            return socket.emit('auth_error', { error: 'Invalid token' });
        }

        const userId = authenticatedUsers.get(token);
        console.log(`User ${userId} authenticated successfully.`);

        socket.userId = userId; // Store user ID in the socket session
        socket.emit('authenticated', { userId });

        // Handle game-related events
        socket.on('roll_dice', () => {
            const diceRoll = Math.floor(Math.random() * 6) + 1;
            io.emit('dice_result', { userId, diceRoll });
        });

        socket.on('disconnect', () => {
            console.log(`User ${userId} disconnected`);
        });
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});