import Project from '../models/Project.js';
import User from '../models/User.js';

export const createProject = async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ message: 'Project name is required' });

        console.log(`[Projects] Creating project "${name}" for admin: ${req.user._id}`);

        // Automatically assign all approved and active users to the new project
        const activeUsers = await User.find({ role: 'USER', accountStatus: 'ACTIVE', approvalStatus: 'APPROVED' });

        const project = new Project({
            name,
            description,
            admin: req.user._id,
            collaborators: activeUsers.map(u => u._id)
        });

        await project.save();

        await project.populate('admin', 'name email profilePicture lastSeen publicKey');
        await project.populate('collaborators', 'name email accountStatus approvalStatus lastSeen profilePicture publicKey');

        res.status(201).json(project);
    } catch (error) {
        console.error('[Projects] createProject error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getProjects = async (req, res) => {
    try {
        const userId = req.user._id;

        // Auto-repair missing collaborators for the current active user so they are synced to existing projects
        if (req.user.role === 'USER') {
            await Project.updateMany(
                { collaborators: { $ne: userId } },
                { $addToSet: { collaborators: userId } }
            );
        }

        console.log(`[Projects] Fetching projects for user: ${userId}`);

        const projects = await Project.find({
            $or: [{ admin: userId }, { collaborators: userId }]
        })
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

        // Hard Data-Isolation check: Only project admin can delete
        if (project.admin.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized to delete this project' });
        }

        await Project.findByIdAndDelete(id);
        res.status(200).json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete project' });
    }
};

export const toggleScreenshotProtection = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await Project.findById(id);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Verification: Must be the admin of the project to toggle security rules
        if (project.admin.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized to modify project settings' });
        }

        project.screenshotProtectionEnabled = !project.screenshotProtectionEnabled;
        await project.save();

        const populatedProject = await Project.findById(id)
            .populate('admin', 'email name profilePicture lastSeen role publicKey')
            .populate('collaborators', 'email name profilePicture lastSeen role publicKey');

        res.status(200).json(populatedProject);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to toggle protection' });
    }
};
