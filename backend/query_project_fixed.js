import mongoose from 'mongoose';
import dotenv from 'dotenv';
import './models/User.js'; // Register User schema
dotenv.config();

const projectSchema = new mongoose.Schema({
    name: String,
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

const Project = mongoose.model('Project', projectSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const project = await Project.findById("6a87677d3381257915f12e03").populate('admin').populate('collaborators');
        console.log(JSON.stringify(project, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
