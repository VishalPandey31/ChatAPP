import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import { socketHandler } from './socket/index.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: [process.env.FRONTEND_URL, "http://localhost:5173", "https://menifestation.surge.sh"],
  credentials: true,
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/projects', projectRoutes);

const io = new Server(server, {
  cors: {
    origin: [process.env.FRONTEND_URL, "http://localhost:5173", "https://menifestation.surge.sh"],
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
    });
  })
  .catch(err => {
    console.error("MongoDB connection error:", err);
  });
