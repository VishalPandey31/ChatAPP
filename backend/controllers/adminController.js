import User from '../models/User.js';
import bcrypt from 'bcryptjs';

// @desc Create a new user (Admin only)
export const createUser = async (req, res) => {
    try {
        const { email, password, confirmPassword, name, profilePicture, about } = req.body;

        if (password !== confirmPassword) {
            return res.status(400).json({ message: 'Passwords do not match' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            email,
            password: hashedPassword,
            name: name || '',
            profilePicture: profilePicture || '',
            about: about || '',
            role: 'USER',
            approvalStatus: 'PENDING',
            accountStatus: 'ACTIVE'
        });

        res.status(201).json({
            _id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            approvalStatus: user.approvalStatus
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error creating user' });
    }
};

// @desc Get all users for admin dashboard
export const getUsers = async (req, res) => {
    try {
        const users = await User.find({ role: 'USER' }).select('-password');
        res.status(200).json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching users' });
    }
};

// @desc Approve a user
export const approveUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.approvalStatus = 'APPROVED';
        await user.save();

        res.status(200).json({ message: 'User approved successfully', user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error approving user' });
    }
};

// @desc Reject a user
export const rejectUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Removing the user completely upon rejection, 
        // or just marking as removed. We'll mark as removed to keep history.
        user.accountStatus = 'REMOVED';
        user.approvalStatus = 'PENDING'; // Optional, but usually stays pending with REMOVED
        await user.save();

        res.status(200).json({ message: 'User rejected successfully', user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error rejecting user' });
    }
};

// @desc Remove a user
export const removeUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.accountStatus = 'REMOVED';
        await user.save();

        res.status(200).json({ message: 'User removed successfully', user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error removing user' });
    }
};

// @desc Restore a user
export const restoreUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.accountStatus = 'ACTIVE';
        user.approvalStatus = 'APPROVED'; // Restored users auto-approve
        await user.save();

        res.status(200).json({ message: 'User restored successfully', user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error restoring user' });
    }
};
