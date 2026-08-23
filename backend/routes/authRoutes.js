import express from 'express';
import { registerAdmin, loginAdmin, loginUser, logout, getMe, uploadPublicKey, getPublicKey } from '../controllers/authController.js';
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

export default router;
