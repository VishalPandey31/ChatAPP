import mongoose from 'mongoose';
import Project from './models/Project.js';
import User from './models/User.js';
import fs from 'fs';

mongoose.connect('mongodb+srv://vishalpandey000090_db_user:I4IuP2I0YhZkDgY7@cluster0.drjv5v8.mongodb.net/?appName=Cluster0')
    .then(async () => {
        const p = await Project.findById('6a87677d3381257915f12e03').lean();
        const u = await User.findById('6a875ef66eacba19e8c5d194').lean();
        let out = `Project: ${JSON.stringify(p)}\nUser: ${JSON.stringify(u)}\n`;
        fs.writeFileSync('proj_user.txt', out);
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
