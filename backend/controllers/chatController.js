import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import Project from '../models/Project.js';

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

        // Strict Authorized Isolation: Must be a member of the project
        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const isMember = project.admin.toString() === req.user._id.toString() ||
            project.collaborators.some(id => id.toString() === req.user._id.toString());
        if (!isMember) return res.status(403).json({ message: 'Unauthorized project access' });

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
            .select('sender content iv encryptionVersion messageType replyTo clientMessageId edited deleted reactions status createdAt callMeta senderKeyId recipientKeyId')
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

        // Strict Authorization: Only project admin can wipe history
        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });
        if (project.admin.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only project administrators can wipe history' });
        }

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

        // Strict Authorized Isolation: Must be a member of the project
        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const isMember = project.admin.toString() === req.user._id.toString() ||
            project.collaborators.some(id => id.toString() === req.user._id.toString());
        if (!isMember) return res.status(403).json({ message: 'Unauthorized project recovery' });

        const messages = await Message.find({ projectId })
            .select('sender content iv encryptionVersion messageType replyTo clientMessageId edited deleted reactions status createdAt callMeta senderKeyId recipientKeyId')
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

export const askAI = async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ message: 'Prompt is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ message: 'AI is not configured on the server.' });
        }

        const fetchResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!fetchResponse.ok) {
            const errData = await fetchResponse.json().catch(() => ({}));
            console.error('Gemini API Error:', errData);
            return res.status(502).json({ message: 'Failed to get AI response' });
        }

        const data = await fetchResponse.json();
        const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!aiText) {
            return res.status(500).json({ message: 'Invalid AI response format' });
        }

        res.status(200).json({ response: aiText });
    } catch (err) {
        console.error('Error in askAI:', err);
        res.status(500).json({ message: 'Internal server error during AI request' });
    }
};
