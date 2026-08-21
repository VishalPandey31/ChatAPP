import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticateUser = async (req, res, next) => {
    try {
        const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'Authentication required. No token provided.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({ message: 'User not found. Authentication failed.' });
        }

        if (user.accountStatus === 'REMOVED') {
            return res.status(403).json({ message: 'Your account has been removed by the administrator. Please contact the administrator.' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication Error:', error);
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
};

export const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'ADMIN') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }
};

export const requireApprovedUser = (req, res, next) => {
    if (req.user && req.user.role === 'ADMIN') {
        return next(); // Admins are implicitly approved for any general action
    }
    if (req.user && req.user.role === 'USER' && req.user.approvalStatus === 'APPROVED') {
        next();
    } else {
        res.status(403).json({ message: 'Your account is waiting for admin approval.' });
    }
};
