import { Schema, model } from "mongoose";

const UserSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  gender: { type: String, enum: ["male", "female", "other"], required: false },
  genre: { type: String, required: false }, // e.g., pop, rock, soft
  createdAt: { type: Date, default: Date.now },
  lyrics: { type: String },
  ttsUrl: { type: String },
});
export default model("User", UserSchema);
