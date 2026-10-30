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
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ message: 'Invalid subscription object' });
        }

        const userId = req.user._id;

        // Disassociate this endpoint from any other user accounts to prevent cross-account push leaks
        await User.updateMany(
            { _id: { $ne: userId }, 'pushSubscriptions.endpoint': subscription.endpoint },
            { $pull: { pushSubscriptions: { endpoint: subscription.endpoint } } }
        );

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!Array.isArray(user.pushSubscriptions)) {
            user.pushSubscriptions = [];
        }

        // Remove old occurrences of this endpoint from this user's list
        user.pushSubscriptions = user.pushSubscriptions.filter(sub => sub && sub.endpoint !== subscription.endpoint);

        // Add fresh subscription
        user.pushSubscriptions.push(subscription);

        // Keep at most 3 active endpoints per user
        if (user.pushSubscriptions.length > 3) {
            user.pushSubscriptions = user.pushSubscriptions.slice(-3);
        }

        await user.save();

        res.status(201).json({ success: true, message: 'Subscription saved successfully', count: user.pushSubscriptions.length });
    } catch (err) {
        console.error("Push Subscribe Error: ", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
