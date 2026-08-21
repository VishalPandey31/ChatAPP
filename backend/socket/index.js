import User from '../models/User.js';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';

let connectedUsers = new Map(); // socket.id -> userId
let userSockets = new Map(); // userId -> socket.id

export const socketHandler = (io) => {
    io.on("connection", (socket) => {
        console.log("New client connected", socket.id);

        // When a user logs in and establishes connection
        socket.on("join", async (userId) => {
            connectedUsers.set(socket.id, userId);
            userSockets.set(userId, socket.id);
            console.log(`User ${userId} joined with socket ${socket.id}`);

            // Send the complete list of currently online users to the user who just joined
            const currentOnlineUsers = Array.from(userSockets.keys());
            socket.emit("initial_online_users", currentOnlineUsers);

            // Broadcast online status to everyone else
            socket.broadcast.emit("user_status", { userId, status: "online" });
        });

        // Triggered by the Active Members Modal Refresh button
        socket.on("get_online_users", () => {
            const currentOnlineUsers = Array.from(userSockets.keys());
            socket.emit("initial_online_users", currentOnlineUsers);
        });

        // Admin Approval Request
        socket.on("user:approval-request", async (data) => {
            // Find all admins
            const admins = await User.find({ role: 'ADMIN' });
            admins.forEach(admin => {
                const adminSocketId = userSockets.get(admin._id.toString());
                if (adminSocketId) {
                    io.to(adminSocketId).emit("new_approval_request", data);
                }
            });
        });

        // Admin Approves User
        socket.on("admin:approve-user", (userId) => {
            const targetSocketId = userSockets.get(userId);
            if (targetSocketId) {
                io.to(targetSocketId).emit("user:approval-approved", { message: "Account approved" });
            }
        });

        // Admin Rejects User
        socket.on("admin:reject-user", (userId) => {
            const targetSocketId = userSockets.get(userId);
            if (targetSocketId) {
                io.to(targetSocketId).emit("user:approval-rejected", { message: "Account rejected" });
            }
        });

        // Admin Removes User
        socket.on("admin:remove-user", (userId) => {
            const targetSocketId = userSockets.get(userId);
            if (targetSocketId) {
                io.to(targetSocketId).emit("user:removed", { message: "Account removed by administrator" });
            }
        });

        // Direct Messaging - 1-to-1
        socket.on("send_message", async (data) => {
            // data: { senderId, receiverId, content, messageType }

            try {
                const { senderId, receiverId, content, messageType } = data;

                // Verify both sender & receiver are allowed
                const sender = await User.findById(senderId);
                const receiver = await User.findById(receiverId);

                if (!sender || !receiver) return;

                // Security check: normal user cannot chat with another normal user unapproved, 
                // actually only ADMIN <-> USER is 1:1, or approved users.
                if (sender.role === 'USER' && (sender.approvalStatus !== 'APPROVED' || sender.accountStatus !== 'ACTIVE')) {
                    return;
                }

                const msg = await Message.create({
                    sender: senderId,
                    receiver: receiverId,
                    content,
                    messageType: messageType || 'TEXT'
                });

                // Find or create Chat
                let chat = await Chat.findOne({
                    participants: { $all: [senderId, receiverId] }
                });

                if (!chat) {
                    chat = await Chat.create({
                        participants: [senderId, receiverId],
                        lastMessage: msg._id
                    });
                } else {
                    chat.lastMessage = msg._id;
                    await chat.save();
                }

                // Notify Receiver
                const receiverSocketId = userSockets.get(receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit("receive_message", msg);
                }

                // Notify Sender (for ack)
                socket.emit("message_sent", msg);

            } catch (err) {
                console.error("Socket error on send_message:", err);
            }
        });

        // Project Group Messaging
        socket.on("join_project", (projectId) => {
            socket.join(projectId);
        });

        socket.on("send_project_message", async (data) => {
            try {
                const { senderId, projectId, content, messageType, replyTo } = data;
                const sender = await User.findById(senderId);

                if (!sender || !projectId) return;

                if (sender.role === 'USER' && (sender.approvalStatus !== 'APPROVED' || sender.accountStatus !== 'ACTIVE')) {
                    return;
                }

                // Create message
                let msgData = {
                    sender: senderId,
                    projectId: projectId,
                    content,
                    messageType: messageType || 'TEXT'
                };
                if (replyTo) {
                    msgData.replyTo = replyTo;
                }

                let msg = await Message.create(msgData);

                // Populate sender and replyTo for frontend preview in real-time
                msg = await msg.populate('sender', 'name email profilePicture');
                msg = await msg.populate({ path: 'replyTo', select: 'content sender' });

                // Emit to designated project room
                io.to(projectId).emit("receive_project_message", msg);

            } catch (err) {
                console.error("Socket error on send_project_message:", err);
            }
        });

        socket.on("clear_project_chat", (projectId) => {
            io.to(projectId).emit("chat_cleared");
        });

        socket.on("typing", ({ senderId, receiverId }) => {
            const receiverSocketId = userSockets.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("display_typing", { senderId });
            }
        });

        socket.on("disconnect", () => {
            console.log("Client disconnected", socket.id);
            const userId = connectedUsers.get(socket.id);
            if (userId) {
                userSockets.delete(userId);
                connectedUsers.delete(socket.id);

                // Broadcast offline
                socket.broadcast.emit("user_status", { userId, status: "offline", lastSeen: new Date() });

                // Update DB
                User.findByIdAndUpdate(userId, { lastSeen: new Date() }).exec();
            }
        });
    });
};
