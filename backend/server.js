import express from "express";
import http from "http";
import https from "https";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import notificationRoutes from './routes/NotificationRoutes.js';
import { socketHandler } from './socket/index.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// --------------------------------------------------
// Security: HTTP Headers (Helmet)
// --------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false, // Prevents CORS from being blocked on APIs
  crossOriginOpenerPolicy: false // Allows popup/auth flows
}));

// --------------------------------------------------
// CORS — Strict origin list
// --------------------------------------------------
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "https://menifestation.surge.sh"
  ],
  credentials: true,
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(cookieParser());

// --------------------------------------------------
// Rate Limiting
// --------------------------------------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 200,                   // Max 200 requests per window per IP globally
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // Strict: 20 attempts per 15 minutes on auth routes
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please wait 15 minutes.' }
});

app.use(globalLimiter);
app.use('/api/auth/admin/login', authLimiter);
app.use('/api/auth/user/login', authLimiter);
app.use('/api/auth/admin/register', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/notifications', notificationRoutes);

const io = new Server(server, {
  maxHttpBufferSize: 2e7, // 20 MB for base64 image uploads
  cors: {
    origin: [
      process.env.FRONTEND_URL,
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "https://menifestation.surge.sh"
    ],
    credentials: true,
  }
});

socketHandler(io);

app.get("/", (req, res) => {
  res.send("API is running...");
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);

      // Self-ping to keep Render backend awake
      const RENDER_URL = "https://chatapp-53it.onrender.com";
      setInterval(() => {
        https.get(RENDER_URL, (res) => {
          console.log(`[Self-Ping] awake check: ${res.statusCode}`);
        }).on('error', (err) => {
          console.error('[Self-Ping] error:', err.message);
        });
      }, 14 * 60 * 1000); // 14 minutes
    });
  })
  .catch(err => {
    console.error("MongoDB connection error:", err);
  });
