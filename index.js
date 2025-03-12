require('dotenv').config();
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const redis = require('redis');
const cors = require('cors');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const PORT = process.env.PORT || 3000;
const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT;

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true })); // Middleware for FormData

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));


// Connect to Redis
const redisClient = redis.createClient({ host: REDIS_HOST, port: REDIS_PORT });
redisClient.on('connect', () => console.log("✅ Redis Connected"));
redisClient.on('error', (err) => console.error("❌ Redis Error:", err));

// User Schema
const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    uniqueGameId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    profilePic: { type: String, default: "" },
    country: { type: String, default: "Unknown" },
    coins: { type: Number, default: 2500 },
    gems: { type: Number, default: 250 },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", UserSchema);

/**
 * Generate a secure temporary token (UUID)
 */
function generateAuthToken() {
    return crypto.randomBytes(16).toString("hex"); // 32-character token
}

/**
 * Verify Facebook OAuth Token
 */
async function verifyFacebookToken(userToken) {
    try {
        const appToken = `${FB_APP_ID}|${FB_APP_SECRET}`;
        const url = `https://graph.facebook.com/debug_token?input_token=${userToken}&access_token=${appToken}`;
        const response = await axios.get(url);
        return response.data.data || null;
    } catch (error) {
        console.error("❌ Facebook Token Verification Failed:", error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Authentication Endpoint
 */
app.post('/auth', async (req, res) => {
    const { token } = req.body;
    console.log(req.body)
    // if (!token) return res.status(400).json({ error: "Access token required" });

    // const fbData = await verifyFacebookToken(token);
    // if (!fbData || !fbData.user_id) {
    //     return res.status(401).json({ error: "Invalid or expired token" });
    // }

    // const userId = fbData.user_id;
    // let user = await User.findOne({ userId });

    // if (!user) {
    //     const uniqueGameId = crypto.randomBytes(4).toString("hex").toUpperCase();
    //     user = new User({
    //         userId,
    //         uniqueGameId,
    //         name: fbData.name || "Unknown Player",
    //         profilePic: fbData.picture?.data?.url || "",
    //         country: "Unknown",
    //         coins: 2500,
    //         gems: 250
    //     });
    //     await user.save();
    // }

    // const authToken = generateAuthToken();
    // redisClient.setex(`auth:${authToken}`, 3600, userId);

    // res.json({
    //     success: true,
    //     token: authToken,
    //     user: {
    //         userId: user.userId,
    //         uniqueGameId: user.uniqueGameId,
    //         name: user.name,
    //         profilePic: user.profilePic,
    //         country: user.country,
    //         coins: user.coins,
    //         gems: user.gems
    //     }
    // });
});

io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
        return next(new Error("Authentication required"));
    }

    redisClient.get(`auth:${token}`, (err, userId) => {
        if (err || !userId) {
            return next(new Error("Invalid or expired token"));
        }
        socket.userId = userId;
        next();
    });
});

/**
 * WebSocket Connection Handling
 */
io.on('connection', (socket) => {
    console.log(`✅ WebSocket Connected: User ${socket.userId}`);

    socket.on('join_game', (gameId) => {
        console.log(`User ${socket.userId} joined game ${gameId}`);
        socket.join(gameId);
        io.to(gameId).emit('player_joined', { userId: socket.userId });
    });

    socket.on('roll_dice', (gameId) => {
        const diceRoll = Math.floor(Math.random() * 6) + 1;
        io.to(gameId).emit('dice_result', { userId: socket.userId, diceRoll });
    });

    socket.on('disconnect', () => {
        console.log(`❌ User ${socket.userId} disconnected`);
    });
});

/**
 * Start Server
 */
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));