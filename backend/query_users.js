import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const userSchema = new mongoose.Schema({
    email: String,
    name: String,
    role: String,
    publicKey: String,
    approvalStatus: String,
    accountStatus: String
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await User.find({
            _id: { $in: ["6a8759487cab5eb86bbb2c08", "6a875ef66eacba19e8c5d194"] }
        });
        console.log(JSON.stringify(users, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
