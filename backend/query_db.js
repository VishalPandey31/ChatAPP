import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const messageSchema = new mongoose.Schema({
    sender: mongoose.Schema.Types.ObjectId,
    receiver: mongoose.Schema.Types.ObjectId,
    projectId: mongoose.Schema.Types.ObjectId,
    content: String,
    iv: String,
    encryptionVersion: Number,
    messageType: String,
    clientMessageId: String,
    deleted: Boolean,
    status: String
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");
        const msgs = await Message.find().sort({ createdAt: -1 }).limit(10);
        console.log("Recent 10 messages:");
        msgs.forEach(m => {
            console.log(`ID: ${m._id}, Type: ${m.messageType}, Content: "${m.content}", IV: ${m.iv}, EVersion: ${m.encryptionVersion}, ProjectId: ${m.projectId}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
