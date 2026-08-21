import express from 'express';
import { registerAdmin, loginAdmin, loginUser, logout, getMe } from '../controllers/authController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

router.post('/admin/register', registerAdmin);
router.post('/admin/login', loginAdmin);
router.post('/user/login', loginUser);
router.post('/logout', logout);
router.get('/me', authenticateUser, getMe);

export default router;
