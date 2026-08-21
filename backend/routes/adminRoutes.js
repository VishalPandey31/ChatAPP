import express from 'express';
import { createUser, getUsers, approveUser, rejectUser, removeUser, restoreUser } from '../controllers/adminController.js';
import { authenticateUser, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require an authenticated admin
router.use(authenticateUser, requireAdmin);

router.post('/users', createUser);
router.get('/users', getUsers);
router.put('/users/:id/approve', approveUser);
router.put('/users/:id/reject', rejectUser);
router.delete('/users/:id', removeUser);
router.put('/users/:id/restore', restoreUser);

export default router;
