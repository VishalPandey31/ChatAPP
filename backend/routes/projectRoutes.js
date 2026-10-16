import express from 'express';
import { createProject, getProjects, deleteProject, toggleScreenshotProtection } from '../controllers/projectController.js';
import { authenticateUser, requireApprovedUser } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateUser);

router.post('/', requireApprovedUser, createProject);
router.get('/', getProjects);
router.delete('/:id', requireApprovedUser, deleteProject);
router.put('/:id/screenshot-protection', requireApprovedUser, toggleScreenshotProtection);

export default router;
