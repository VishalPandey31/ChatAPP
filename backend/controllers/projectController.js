import Project from '../models/Project.js';

export const createProject = async (req, res) => {
    try {
        const { name, description, validCollaborators } = req.body;
        if (!name) return res.status(400).json({ message: 'Project name is required' });

        const project = new Project({
            name,
            description,
            admin: req.user._id,
            collaborators: validCollaborators.map(c => c._id)
        });

        await project.save();

        await project.populate('admin', 'name email profilePicture lastSeen publicKey');
        await project.populate('collaborators', 'name email accountStatus approvalStatus lastSeen profilePicture publicKey');

        res.status(201).json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getProjects = async (req, res) => {
    try {
        const projects = await Project.find()
            .populate('admin', 'email name profilePicture lastSeen role publicKey')
            .populate('collaborators', 'email name profilePicture lastSeen role publicKey');

        res.status(200).json(projects);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteProject = async (req, res) => {
    try {
        const { id } = req.params;
        await Project.findByIdAndDelete(id);
        res.status(200).json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to delete project' });
    }
};
