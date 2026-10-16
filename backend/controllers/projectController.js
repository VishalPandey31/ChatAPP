import Project from '../models/Project.js';
import User from '../models/User.js';
import Message from '../models/Message.js';

export const createProject = async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ message: 'Project name is required' });

        console.log(`[Projects] Creating project "${name}" by user: ${req.user._id}`);

        // Automatically assign all approved and active users to the new project so both partners have access
        const activeUsers = await User.find({ accountStatus: 'ACTIVE', approvalStatus: 'APPROVED' });
        const collaboratorIds = activeUsers
            .map(u => u._id)
            .filter(id => id.toString() !== req.user._id.toString());

        const project = new Project({
            name: name.trim(),
            description: description || '',
            admin: req.user._id,
            collaborators: collaboratorIds
        });

        await project.save();

        const populatedProject = await Project.findById(project._id)
            .populate('admin', 'name email profilePicture lastSeen role publicKey')
            .populate('collaborators', 'name email accountStatus approvalStatus lastSeen profilePicture role publicKey');

        // Broadcast to all connected clients in real-time so other user's dashboard updates immediately
        const io = req.app.get('io');
        if (io) {
            io.emit('project:created', populatedProject);
        }

        res.status(201).json(populatedProject);
    } catch (error) {
        console.error('[Projects] createProject error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getProjects = async (req, res) => {
    try {
        const userId = req.user._id;

        // Auto-sync: Make sure all approved and active users are in the collaborators list of all projects
        const activeUsers = await User.find({ accountStatus: 'ACTIVE', approvalStatus: 'APPROVED' });
        const activeUserIds = activeUsers.map(u => u._id);

        if (activeUserIds.length > 0) {
            await Project.updateMany(
                {},
                { 
                    $addToSet: { collaborators: { $each: activeUserIds } },
                    $pull: { collaborators: { $nin: activeUserIds } }
                }
            );
        }

        console.log(`[Projects] Fetching all projects for user: ${userId}`);

        // Return all projects for active users, sorted newest first
        const projects = await Project.find({})
            .sort({ createdAt: -1 })
            .populate('admin', 'email name profilePicture lastSeen role publicKey')
            .populate('collaborators', 'email name profilePicture lastSeen role publicKey');

        console.log(`[Projects] Found ${projects.length} project(s) for user: ${userId}`);
        res.status(200).json(projects);
    } catch (error) {
        console.error('[Projects] getProjects error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await Project.findById(id);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Allow deletion by any active admin or collaborator of the app/project
        const isProjectAdmin = project.admin && project.admin.toString() === req.user._id.toString();
        const isSystemAdmin = req.user.role === 'ADMIN';
        const isCollaborator = project.collaborators && project.collaborators.some(c => c.toString() === req.user._id.toString());

        if (!isSystemAdmin && !isProjectAdmin && !isCollaborator) {
            return res.status(403).json({ message: 'Unauthorized to delete this project' });
        }

        // Clean up all messages belonging to this project
        await Message.deleteMany({ projectId: id });

        // Delete the project
        await Project.findByIdAndDelete(id);

        console.log(`[Projects] Project ${id} deleted by user ${req.user._id}`);

        // Broadcast real-time deletion event to all connected sockets
        const io = req.app.get('io');
        if (io) {
            io.emit('project:deleted', { projectId: id });
        }

        res.status(200).json({ message: 'Project and associated messages deleted successfully', projectId: id });
    } catch (error) {
        console.error('[Projects] deleteProject error:', error);
        res.status(500).json({ message: 'Failed to delete project' });
    }
};

export const toggleScreenshotProtection = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await Project.findById(id);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        project.screenshotProtectionEnabled = !project.screenshotProtectionEnabled;
        await project.save();

        const populatedProject = await Project.findById(id)
            .populate('admin', 'email name profilePicture lastSeen role publicKey')
            .populate('collaborators', 'email name profilePicture lastSeen role publicKey');

        const io = req.app.get('io');
        if (io) {
            io.emit('project:updated', populatedProject);
        }

        res.status(200).json(populatedProject);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to toggle protection' });
    }
};
