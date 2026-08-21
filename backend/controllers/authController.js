import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const generateToken = (userId, res) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });

    res.cookie('token', token, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production'
    });

    return token;
};

// @desc    Admin Registration
export const registerAdmin = async (req, res) => {
    try {
        const { secretCode, email, password, confirmPassword, securityQuestionAnswer } = req.body;

        if (secretCode !== process.env.ADMIN_SECRET_CODE) {
            return res.status(400).json({ message: 'Registration failed. Invalid credentials or configuration.' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Registration failed. Invalid credentials or configuration.' });
        }

        // Case-insensitive, whitespace-trimmed check
        const formattedAnswer = securityQuestionAnswer?.trim().toLowerCase();
        if (formattedAnswer !== 'freefire') {
            return res.status(400).json({ message: 'Registration failed. Invalid credentials or configuration.' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'Registration failed. Invalid credentials or configuration.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            email,
            password: hashedPassword,
            role: 'ADMIN',
            approvalStatus: 'APPROVED', // Admins are auto-approved
            accountStatus: 'ACTIVE'
        });

        if (user) {
            generateToken(user._id, res);
            res.status(201).json({
                _id: user._id,
                email: user.email,
                role: user.role
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

// @desc    Admin Login
export const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email, role: 'ADMIN' });
        if (!user || user.accountStatus === 'REMOVED') {
            return res.status(401).json({ message: 'Invalid credentials or account revoked.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        generateToken(user._id, res);

        res.json({
            _id: user._id,
            email: user.email,
            role: user.role,
            approvalStatus: user.approvalStatus
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

// @desc    Normal User Login
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email, role: 'USER' });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (user.accountStatus === 'REMOVED') {
            return res.status(403).json({ message: 'Your account has been removed by the administrator. Please contact the administrator.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Regardless of pending/approved, we generate a token so the frontend knows who is logged in.
        // Access to actual chat API is protected by `requireApprovedUser` middleware.
        generateToken(user._id, res);

        // If still pending, we will tell the frontend so it shows the waiting screen.
        // Note: The specific real-time logic for notifying admin will be in the route/service when this is called.

        res.json({
            _id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            approvalStatus: user.approvalStatus,
            accountStatus: user.accountStatus
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

export const logout = (req, res) => {
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0)
    });
    res.status(200).json({ message: 'Logged out successfully' });
};

// @desc Get current user details
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.status(200).json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
