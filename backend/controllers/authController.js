import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const generateToken = (userId, res) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: '24h'
    });

    res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'none',
        secure: true
        // No maxAge => session cookie that expires when browser/tab session ends
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
            const token = generateToken(user._id, res);
            res.status(201).json({
                _id: user._id,
                email: user.email,
                role: user.role,
                token
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

        const user = await User.findOne({ email, role: 'ADMIN' }).select('+password');
        if (!user || user.accountStatus === 'REMOVED') {
            return res.status(401).json({ message: 'Invalid credentials or account revoked.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = generateToken(user._id, res);

        res.json({
            _id: user._id,
            email: user.email,
            role: user.role,
            approvalStatus: user.approvalStatus,
            token
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

        const user = await User.findOne({ email, role: 'USER' }).select('+password');
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
        const token = generateToken(user._id, res);

        // If still pending, we will tell the frontend so it shows the waiting screen.
        // Note: The specific real-time logic for notifying admin will be in the route/service when this is called.

        res.json({
            _id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            approvalStatus: user.approvalStatus,
            accountStatus: user.accountStatus,
            token
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

export const logout = (req, res) => {
    res.cookie('token', '', {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
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

// @desc Upload / Update E2EE Public Key for this user
export const uploadPublicKey = async (req, res) => {
    try {
        const { keyId, publicKey } = req.body;

        if (!publicKey || typeof publicKey !== 'string' || publicKey.length > 2048) {
            return res.status(400).json({ message: 'Invalid public key format.' });
        }

        const effectiveKeyId = keyId || 'legacy';
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Update active publicKey slot
        user.publicKey = publicKey;

        // Deduplicate publicKeys array to eliminate redundant duplicates
        let existingKeys = (user.publicKeys || []).filter(k => k && k.keyId !== effectiveKeyId);
        existingKeys.push({ keyId: effectiveKeyId, publicKey, createdAt: new Date() });

        // Keep at most 20 recent unique keys
        if (existingKeys.length > 20) {
            existingKeys = existingKeys.slice(-20);
        }

        user.publicKeys = existingKeys;
        await user.save();

        res.status(200).json({ message: 'Public key registered successfully.', keyId: effectiveKeyId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc Fetch another user's E2EE Public Key by userId
export const getPublicKey = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId).select('publicKey publicKeys name');
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Deduplicate publicKeys array by keyId so client receives clean unique keys
        const uniqueKeysMap = new Map();
        for (const k of (user.publicKeys || [])) {
            if (k && k.keyId && k.publicKey) {
                uniqueKeysMap.set(k.keyId, { keyId: k.keyId, publicKey: k.publicKey, createdAt: k.createdAt });
            }
        }

        res.status(200).json({
            publicKey: user.publicKey, // active/latest public key
            publicKeys: Array.from(uniqueKeysMap.values())
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc Upload Zero-Knowledge Encrypted Private Key Ring Backup
export const uploadEncryptedKeyRing = async (req, res) => {
    try {
        const { encryptedKeyRing, encryptedKeyRingIv } = req.body;
        if (!encryptedKeyRing || !encryptedKeyRingIv) {
            return res.status(400).json({ message: 'Missing encrypted key ring data.' });
        }
        await User.findByIdAndUpdate(req.user._id, {
            encryptedKeyRing: typeof encryptedKeyRing === 'object' ? (encryptedKeyRing.ciphertext || JSON.stringify(encryptedKeyRing)) : String(encryptedKeyRing),
            encryptedKeyRingIv: typeof encryptedKeyRingIv === 'object' ? (encryptedKeyRingIv.iv || JSON.stringify(encryptedKeyRingIv)) : String(encryptedKeyRingIv)
        });
        res.status(200).json({ message: 'Encrypted Key Ring backup successful.' });
    } catch (error) {
        console.error('Backup upload error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc Fetch Zero-Knowledge Encrypted Private Key Ring Backup
export const getEncryptedKeyRing = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('encryptedKeyRing encryptedKeyRingIv');
        if (!user || !user.encryptedKeyRing) {
            return res.status(404).json({ message: 'No backup found.' });
        }
        res.status(200).json({
            encryptedKeyRing: user.encryptedKeyRing,
            encryptedKeyRingIv: user.encryptedKeyRingIv
        });
    } catch (error) {
        console.error('Backup fetch error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc Save user's 128-d Face Biometric Descriptor & eye baseline
export const saveFaceProfile = async (req, res) => {
    try {
        const { descriptor, eyeRatioBaseline } = req.body;
        if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
            return res.status(400).json({ message: 'Invalid face biometric descriptor. Exactly 128 float values required.' });
        }
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        user.faceProfile = {
            isConfigured: true,
            descriptor: descriptor.map(Number),
            enrolledAt: new Date(),
            eyeRatioBaseline: Number(eyeRatioBaseline) || 0.2
        };
        user.antiSnatchProtection = true;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Face biometric template registered successfully.',
            isConfigured: true,
            enrolledAt: user.faceProfile.enrolledAt
        });
    } catch (error) {
        console.error('Save face profile error:', error);
        res.status(500).json({ message: 'Server error saving face biometric profile.' });
    }
};

// @desc Get user's Face Biometric profile and descriptor for client verification
export const getFaceProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('faceProfile antiSnatchProtection');
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.status(200).json({
            isConfigured: user.faceProfile?.isConfigured || false,
            descriptor: user.faceProfile?.descriptor || [],
            enrolledAt: user.faceProfile?.enrolledAt || null,
            eyeRatioBaseline: user.faceProfile?.eyeRatioBaseline || 0.2,
            antiSnatchProtection: user.antiSnatchProtection !== false
        });
    } catch (error) {
        console.error('Get face profile error:', error);
        res.status(500).json({ message: 'Server error retrieving face biometric profile.' });
    }
};

// @desc Clear user's Face Biometric profile (allow re-enrollment)
export const deleteFaceProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        user.faceProfile = { isConfigured: false, descriptor: [], enrolledAt: null, eyeRatioBaseline: null };
        await user.save();
        res.status(200).json({ success: true, message: 'Face biometric profile cleared successfully.' });
    } catch (error) {
        console.error('Delete face profile error:', error);
        res.status(500).json({ message: 'Server error deleting face biometric profile.' });
    }
};

// @desc Toggle real-time anti-snatch eye/face protection
export const toggleAntiSnatch = async (req, res) => {
    try {
        const { enabled } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        user.antiSnatchProtection = Boolean(enabled);
        await user.save();
        res.status(200).json({ success: true, antiSnatchProtection: user.antiSnatchProtection });
    } catch (error) {
        console.error('Toggle anti-snatch error:', error);
        res.status(500).json({ message: 'Server error toggling anti-snatch protection.' });
    }
};

// @desc Verify password for security unlock when phone is snatched or face mismatch occurs
export const unlockWithPassword = async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ message: 'Password is required to unlock.' });
        }
        const user = await User.findById(req.user._id).select('+password');
        if (!user) return res.status(404).json({ message: 'User not found.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid password. Unlock failed.' });
        }
        res.status(200).json({ success: true, message: 'Unlocked successfully.' });
    } catch (error) {
        console.error('Unlock error:', error);
        res.status(500).json({ message: 'Server error verifying password.' });
    }
};

