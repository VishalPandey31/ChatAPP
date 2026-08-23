import User from '../models/User.js';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import Project from '../models/Project.js';
import webpush from 'web-push';
import dotenv from 'dotenv';
dotenv.config();

webpush.setVapidDetails(
    'mailto:support@chatapp.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

let connectedUsers = new Map(); // socket.id -> userId
let userSockets = new Map(); // userId -> Set of socket.id

export const socketHandler = (io) => {
    io.on("connection", (socket) => {
        console.log("New client connected", socket.id);

        // When a user logs in and establishes connection
        socket.on("join", async (userId) => {
            connectedUsers.set(socket.id, userId);

            if (!userSockets.has(userId)) {
                userSockets.set(userId, new Set());
                // Broadcast online status since this is a new device online
                socket.broadcast.emit("user_status", { userId, status: "online" });
            }
            userSockets.get(userId).add(socket.id);
            console.log(`User ${userId} joined with socket ${socket.id}`);

            // Send the complete list of currently online users to the user who just joined
            const currentOnlineUsers = Array.from(userSockets.keys());
            socket.emit("initial_online_users", currentOnlineUsers);
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
            const targetSockets = userSockets.get(userId);
            if (targetSockets) {
                targetSockets.forEach(socketId => {
                    io.to(socketId).emit("user:approval-approved", { message: "Account approved" });
                });
            }
        });

        // Admin Rejects User
        socket.on("admin:reject-user", (userId) => {
            const targetSockets = userSockets.get(userId);
            if (targetSockets) {
                targetSockets.forEach(socketId => {
                    io.to(socketId).emit("user:approval-rejected", { message: "Account rejected" });
                });
            }
        });

        // Admin Removes User
        socket.on("admin:remove-user", (userId) => {
            const targetSockets = userSockets.get(userId);
            if (targetSockets) {
                targetSockets.forEach(socketId => {
                    io.to(socketId).emit("user:removed", { message: "Account removed by administrator" });
                });
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
                const receiverSockets = userSockets.get(receiverId);
                if (receiverSockets) {
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit("receive_message", msg);
                    });
                }

                // Push Notification Trigger
                if (receiver.pushSubscriptions && receiver.pushSubscriptions.length > 0) {
                    const payload = JSON.stringify({
                        title: 'ChatApp',
                        body: 'New encrypted message',
                        data: { url: '/chat/' + senderId }
                    });

                    const validSubs = [];
                    let changed = false;
                    await Promise.all(receiver.pushSubscriptions.map(async sub => {
                        try {
                            await webpush.sendNotification(sub, payload);
                            validSubs.push(sub);
                        } catch (error) {
                            console.error("WebPush send_message error:", error.statusCode || error);
                            // 410 Gone, 404 Not Found, 401 Unauthorized, 400 Bad Request all signify invalid/stale sub
                            if (error.statusCode === 410 || error.statusCode === 404 || error.statusCode === 401 || error.statusCode === 400) {
                                changed = true;
                            } else {
                                validSubs.push(sub);
                            }
                        }
                    }));
                    if (changed) {
                        receiver.pushSubscriptions = validSubs;
                        await receiver.save();
                    }
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
                const { senderId, projectId, content, messageType, replyTo, clientMessageId } = data;
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
                if (clientMessageId) {
                    msgData.clientMessageId = clientMessageId;
                }

                let msg = await Message.create(msgData);

                // Populate sender and replyTo for frontend preview in real-time
                msg = await msg.populate('sender', 'name email profilePicture');
                msg = await msg.populate({ path: 'replyTo', select: 'content sender' });

                // Emit to designated project room
                io.to(projectId).emit("receive_project_message", msg);

                // Push Notification Logic for all project partners
                const project = await Project.findById(projectId).populate('collaborators').populate('admin');
                if (project) {
                    const allMembers = [project.admin, ...(project.collaborators || [])].filter(Boolean);
                    const receivers = allMembers.filter(m => m._id.toString() !== senderId.toString());

                    const payload = JSON.stringify({
                        title: 'ChatApp Team',
                        body: 'New encrypted message',
                        data: {
                            url: '/chat/' + projectId,
                            type: 'CHAT_MESSAGE'
                        }
                    });

                    for (const u of receivers) {
                        if (u.pushSubscriptions && u.pushSubscriptions.length > 0) {
                            const validSubs = [];
                            let changed = false;

                            // Get fresh user instance for saving
                            const dbUser = await User.findById(u._id);

                            await Promise.all(dbUser.pushSubscriptions.map(async sub => {
                                try {
                                    await webpush.sendNotification(sub, payload);
                                    validSubs.push(sub);
                                } catch (err) {
                                    console.error("WebPush send_project_message error:", err.statusCode || err);
                                    if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 401 || err.statusCode === 400) {
                                        changed = true;
                                    } else {
                                        validSubs.push(sub);
                                    }
                                }
                            }));

                            if (changed && dbUser) {
                                dbUser.pushSubscriptions = validSubs;
                                await dbUser.save();
                            }
                        }
                    }
                }

            } catch (err) {
                console.error("Socket error on send_project_message:", err);
            }
        });

        socket.on("clear_project_chat", (projectId) => {
            io.to(projectId).emit("chat_cleared");
        });

        // Project Message Edit
        socket.on("edit_project_message", async (data) => {
            try {
                const { messageId, senderId, newContent, projectId } = data;
                const msg = await Message.findById(messageId);
                if (msg && msg.sender.toString() === senderId && !msg.deleted) {
                    msg.content = newContent;
                    msg.edited = true;
                    msg.editedAt = new Date();
                    await msg.save();
                    const populatedMsg = await Message.findById(messageId)
                        .populate('sender', 'name email profilePicture')
                        .populate({ path: 'replyTo', select: 'content sender' });
                    io.to(projectId).emit("message_edited", populatedMsg);
                }
            } catch (err) { console.error("Edit error:", err); }
        });

        // Project Message Delete
        socket.on("delete_project_message", async (data) => {
            try {
                const { messageId, senderId, projectId } = data;
                const msg = await Message.findById(messageId);
                if (msg && msg.sender.toString() === senderId) {
                    msg.deleted = true;
                    msg.deletedAt = new Date();
                    msg.content = "This message was deleted";
                    await msg.save();
                    io.to(projectId).emit("message_deleted", { messageId, projectId });
                }
            } catch (err) { console.error("Delete error:", err); }
        });

        // Project Message Reaction
        socket.on("project_message_reaction", async (data) => {
            try {
                const { messageId, userId, reaction, projectId } = data;
                const msg = await Message.findById(messageId);
                if (msg && !msg.deleted) {
                    // check if user already reacted
                    const existingIndex = msg.reactions.findIndex(r => r.user.toString() === userId);
                    if (existingIndex > -1) {
                        if (msg.reactions[existingIndex].reaction === reaction) {
                            // toggle off
                            msg.reactions.splice(existingIndex, 1);
                        } else {
                            // change reaction
                            msg.reactions[existingIndex].reaction = reaction;
                        }
                    } else {
                        // add reaction
                        msg.reactions.push({ user: userId, reaction });
                    }
                    await msg.save();
                    const populatedMsg = await Message.findById(messageId)
                        .populate('sender', 'name email profilePicture')
                        .populate({ path: 'replyTo', select: 'content sender' });
                    io.to(projectId).emit("message_reaction_updated", populatedMsg);
                }
            } catch (err) { console.error("Reaction error:", err); }
        });

        // Ticks - Delivered & Seen for Project
        socket.on("project_message_delivered", async (data) => {
            try {
                const { messageId, projectId, receiverId } = data;
                const msg = await Message.findById(messageId);
                if (msg && msg.sender.toString() !== receiverId && msg.status === 'SENT') {
                    msg.status = 'DELIVERED';
                    await msg.save();
                    io.to(projectId).emit("message_status_update", { messageId, status: 'DELIVERED', projectId });
                }
            } catch (err) { }
        });

        socket.on("project_messages_seen", async (data) => {
            try {
                const { projectId, userId } = data;
                // update all messages in project where status is not READ and sender is not userId
                await Message.updateMany(
                    { projectId, sender: { $ne: userId }, status: { $ne: 'READ' } },
                    { $set: { status: 'READ' } }
                );
                io.to(projectId).emit("project_status_read", { projectId, readerId: userId });
            } catch (err) { }
        });

        // Project Typing
        socket.on("typing_project", ({ senderId, projectId, name }) => {
            socket.to(projectId).emit("display_typing_project", { senderId, projectId, name });
        });

        socket.on("stop_typing_project", ({ senderId, projectId }) => {
            socket.to(projectId).emit("hide_typing_project", { senderId, projectId });
        });

        socket.on("typing", ({ senderId, receiverId }) => {
            const receiverSockets = userSockets.get(receiverId);
            if (receiverSockets) {
                receiverSockets.forEach(socketId => {
                    io.to(socketId).emit("display_typing", { senderId });
                });
            }
        });

        // Voice Call Signaling
        socket.on("call-user", async (data) => {
            const { callerId, receiverId, callId, callerName } = data;
            const receiverSockets = userSockets.get(receiverId);
            if (receiverSockets && receiverSockets.size > 0) {
                receiverSockets.forEach(socketId => {
                    io.to(socketId).emit("incoming-call", { callerId, callerName, callId });
                });
            } else {
                socket.emit("call-failed", { callId, reason: "User offline" });
            }
        });

        socket.on("accept-call", (data) => {
            const { callerId, receiverId, callId } = data;
            const callerSockets = userSockets.get(callerId);
            if (callerSockets) {
                callerSockets.forEach(socketId => {
                    io.to(socketId).emit("call-accepted", { receiverId, callId });
                });
            }
        });

        socket.on("reject-call", (data) => {
            const { callerId, receiverId, callId, reason } = data;
            const callerSockets = userSockets.get(callerId);
            if (callerSockets) {
                callerSockets.forEach(socketId => {
                    io.to(socketId).emit("call-rejected", { receiverId, callId, reason: reason || "declined" });
                });
            }
        });

        socket.on("end-call", (data) => {
            const { targetId, callId } = data;
            const targetSockets = userSockets.get(targetId);
            if (targetSockets) {
                targetSockets.forEach(socketId => {
                    io.to(socketId).emit("call-ended", { callId });
                });
            }
        });

        socket.on("webrtc-offer", (data) => {
            const { targetId, offer, callId } = data;
            const targetSockets = userSockets.get(targetId);
            if (targetSockets) {
                targetSockets.forEach(socketId => {
                    io.to(socketId).emit("webrtc-offer", { offer, callId });
                });
            }
        });

        socket.on("webrtc-answer", (data) => {
            const { targetId, answer, callId } = data;
            const targetSockets = userSockets.get(targetId);
            if (targetSockets) {
                targetSockets.forEach(socketId => {
                    io.to(socketId).emit("webrtc-answer", { answer, callId });
                });
            }
        });

        socket.on("webrtc-ice-candidate", (data) => {
            const { targetId, candidate, callId } = data;
            const targetSockets = userSockets.get(targetId);
            if (targetSockets) {
                targetSockets.forEach(socketId => {
                    io.to(socketId).emit("webrtc-ice-candidate", { candidate, callId });
                });
            }
        });

        socket.on("disconnect", () => {
            console.log("Client disconnected", socket.id);
            const userId = connectedUsers.get(socket.id);
            if (userId) {
                connectedUsers.delete(socket.id);

                const socketsForUser = userSockets.get(userId);
                if (socketsForUser) {
                    socketsForUser.delete(socket.id);
                    if (socketsForUser.size === 0) {
                        userSockets.delete(userId);
                        // Broadcast offline
                        socket.broadcast.emit("user_status", { userId, status: "offline", lastSeen: new Date() });
                        // Update DB
                        User.findByIdAndUpdate(userId, { lastSeen: new Date() }).exec();
                    }
                }
            }
        });
    });
};
