import express from 'express';
import { getUserChats, getMessages, getProjectMessages, clearProjectChat, recoverRecentMessages } from '../controllers/chatController.js';
import { authenticateUser, requireApprovedUser, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateUser, requireApprovedUser);

// IMPORTANT: static-prefix routes (/project/...) MUST be registered before
// the wildcard route (/:userId) so Express doesn't swallow them as userId="project"
router.get('/project/:projectId/recover', requireAdmin, recoverRecentMessages);
router.get('/project/:projectId', getProjectMessages);
router.delete('/project/:projectId/clear', clearProjectChat);

router.get('/', getUserChats);
router.get('/:userId', getMessages);

export default router;
