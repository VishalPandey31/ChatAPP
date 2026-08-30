import Chat from '../models/Chat.js';
import Message from '../models/Message.js';

export const getUserChats = async (req, res) => {
    try {
        const chats = await Chat.find({ participants: req.user._id })
            .populate('participants', 'name email profilePicture lastSeen role')
            .populate('lastMessage')
            .sort({ updatedAt: -1 })
            .lean();

        res.status(200).json(chats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching chats' });
    }
};

export const getMessages = async (req, res) => {
    try {
        const { userId } = req.params; // The other user's ID
        const currentUserId = req.user._id;

        const messages = await Message.find({
            $or: [
                { sender: currentUserId, receiver: userId },
                { sender: userId, receiver: currentUserId }
            ]
        }).sort({ createdAt: 1, _id: 1 }).lean();

        res.status(200).json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching messages' });
    }
};

export const getProjectMessages = async (req, res) => {
    try {
        const { projectId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);
        const { before, beforeId, after, afterId } = req.query;

        let query = { projectId };
        if (before) {
            if (beforeId) {
                query.$or = [
                    { createdAt: { $lt: new Date(before) } },
                    { createdAt: new Date(before), _id: { $lt: beforeId } }
                ];
            } else {
                query.createdAt = { $lt: new Date(before) };
            }
        } else if (after) {
            if (afterId) {
                query.$or = [
                    { createdAt: { $gt: new Date(after) } },
                    { createdAt: new Date(after), _id: { $gt: afterId } }
                ];
            } else {
                query.createdAt = { $gt: new Date(after) };
            }
        }

        const messages = await Message.find(query)
            .select('sender content iv encryptionVersion messageType replyTo clientMessageId edited deleted reactions status createdAt callMeta')
            .populate('sender', 'name email profilePicture')
            .populate({ path: 'replyTo', select: 'content sender iv encryptionVersion messageType deleted', populate: { path: 'sender', select: 'name email' } })
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit)
            .lean();

        // Reverse so oldest first for frontend rendering
        messages.reverse();

        res.status(200).json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching project messages' });
    }
};

export const clearProjectChat = async (req, res) => {
    try {
        const { projectId } = req.params;
        await Message.deleteMany({ projectId });
        res.status(200).json({ message: 'Chat cleared successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error clearing project messages' });
    }
};

export const recoverRecentMessages = async (req, res) => {
    try {
        const { projectId } = req.params;
        const validLimits = [50, 100, 250, 500];
        let limit = parseInt(req.query.limit);
        if (!validLimits.includes(limit)) limit = 100;

        const messages = await Message.find({ projectId })
            .select('sender content iv encryptionVersion messageType replyTo clientMessageId edited deleted reactions status createdAt callMeta')
            .populate('sender', 'name email profilePicture')
            .populate({ path: 'replyTo', select: 'content sender iv encryptionVersion messageType deleted', populate: { path: 'sender', select: 'name email' } })
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit)
            .lean();

        // Reverse so oldest first for frontend rendering
        messages.reverse();

        res.status(200).json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error recovering project messages' });
    }
};
