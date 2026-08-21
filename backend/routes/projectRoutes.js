import express from 'express';
import { createProject, getProjects, deleteProject } from '../controllers/projectController.js';
import { authenticateUser, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateUser);

router.post('/', requireAdmin, createProject);
router.get('/', getProjects);
router.delete('/:id', requireAdmin, deleteProject);

export default router;
