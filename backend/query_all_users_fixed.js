import mongoose from 'mongoose';
import dotenv from 'dotenv';
import './models/User.js'; // Register User schema
dotenv.config();

const User = mongoose.model('User');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await User.find().select('email role approvalStatus accountStatus');
        console.log(JSON.stringify(users, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
