import express from 'express';
import {
    registerAdmin,
    loginAdmin,
    loginUser,
    logout,
    getMe,
    uploadPublicKey,
    getPublicKey,
    uploadEncryptedKeyRing,
    getEncryptedKeyRing,
    saveFaceProfile,
    getFaceProfile,
    deleteFaceProfile,
    toggleAntiSnatch,
    unlockWithPassword
} from '../controllers/authController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

router.post('/admin/register', registerAdmin);
router.post('/admin/login', loginAdmin);
router.post('/user/login', loginUser);
router.post('/logout', logout);
router.get('/me', authenticateUser, getMe);

// E2EE Public Key Routes
router.post('/keys/upload', authenticateUser, uploadPublicKey);       // Upload my public key
router.get('/keys/:userId', authenticateUser, getPublicKey);           // Fetch someone's public key

// E2EE Encrypted Key Ring Backup Routes
router.post('/keys/backup', authenticateUser, uploadEncryptedKeyRing);
router.get('/keys/backup', authenticateUser, getEncryptedKeyRing);

// Face Biometric & Couple Anti-Snatch Routes
router.post('/face/register', authenticateUser, saveFaceProfile);
router.get('/face/profile', authenticateUser, getFaceProfile);
router.delete('/face/profile', authenticateUser, deleteFaceProfile);
router.post('/face/toggle', authenticateUser, toggleAntiSnatch);
router.post('/face/unlock-password', authenticateUser, unlockWithPassword);

export default router;
