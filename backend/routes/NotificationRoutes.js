import express from 'express';
import User from '../models/User.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/notifications/subscribe
// @desc    Subscribe a device to push notifications
// @access  Private
router.post('/subscribe', authenticateUser, async (req, res) => {
    try {
        const subscription = req.body;
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if this endpoint already exists to avoid duplicates
        const existingSub = user.pushSubscriptions.find(sub => sub.endpoint === subscription.endpoint);

        if (!existingSub) {
            user.pushSubscriptions.push(subscription);
            await user.save();
        }

        res.status(201).json({ success: true, message: 'Subscription added successfully' });
    } catch (err) {
        console.error("Push Subscribe Error: ", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
