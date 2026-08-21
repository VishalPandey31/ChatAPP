import express from 'express';
import { getUserChats, getMessages, getProjectMessages, clearProjectChat } from '../controllers/chatController.js';
import { authenticateUser, requireApprovedUser } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateUser, requireApprovedUser);

router.get('/', getUserChats);
router.get('/:userId', getMessages);
router.get('/project/:projectId', getProjectMessages);
router.delete('/project/:projectId/clear', clearProjectChat);

export default router;
