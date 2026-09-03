import mongoose from 'mongoose';
import Message from './models/Message.js';
import fs from 'fs';

mongoose.connect('mongodb+srv://vishalpandey000090_db_user:I4IuP2I0YhZkDgY7@cluster0.drjv5v8.mongodb.net/?appName=Cluster0')
    .then(async () => {
        const msgs = await Message.find().sort({ createdAt: -1 }).limit(20).lean();
        let out = "RECENT MESSAGES:\n";
        msgs.forEach(m => {
            out += `[${m.createdAt}] ID: ${m._id}, Sender: ${m.sender}, Project: ${m.projectId}, Type: ${m.messageType}, Status: ${m.status}, Deleted: ${m.deleted}, clientMessageId: ${m.clientMessageId}\n`;
        });
        fs.writeFileSync('db_out.txt', out);
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
