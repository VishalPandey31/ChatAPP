import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const messageSchema = new mongoose.Schema({
    content: String,
    sender: mongoose.Schema.Types.ObjectId,
    projectId: mongoose.Schema.Types.ObjectId,
    iv: String,
    encryptionVersion: Number
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const msgs = await Message.find({
            content: {
                $in: [
                    "Mess aaya hi nhi tha ek bhi ky krta",
                    "Kabse likh rha",
                    "Baby yeh website ko thik kr raha isiliye ache se nhi chal rha abhi"
                ]
            }
        });
        console.log(JSON.stringify(msgs, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
