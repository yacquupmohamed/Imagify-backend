import mongoose from "mongoose";

const userSchma = new mongoose.Schema({
    name: {
        type: String,
        require: true
    },
    email: {
        type: String,
        require: true,
        unique: true
    },
    password: {
        type: String,
        require: true
    },
    creditBalance: {
        type: Number,
        default: 5
    }
})

const userModel = mongoose.models.user || mongoose.model("user", userSchma)

export default userModel;