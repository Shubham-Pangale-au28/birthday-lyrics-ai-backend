import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import mongoose from "mongoose";
import { z } from "zod";
import OpenAI from "openai";
import User from "./models/User";

const app = express();
app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGODB_URI!)
  .then(() => {
    console.log(`Connected To MongoDB `);
  })

  .catch((err) => {
    console.log(`Cannot Connect to the database!`, err);
    process.exit();
  });

// ---------- validators ----------
const registerSchema = z.object({
  name: z.string().min(2).max(60),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  email: z.string().email(),
  gender: z.enum(["male", "female", "other"]).optional(),
  genre: z.string().min(3).max(20).optional(),
});

const detailsSchema = z.object({
  userId: z.string(),
  gender: z.enum(["male", "female", "other"]),
  genre: z.string().min(3).max(20),
  receiverName: z.string().min(2).max(60),
});

// ---------- routes ----------
// 1) register
app.post("/api/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.issues);
  const user = await User.create(parsed.data);
  res.json({ ...user });
});

// 2) mock OTP (OTP = 1234 as per assignment)
app.post("/api/otp/verify", (req: Request, res: Response) => {
  const { otp } = req.body;
  if (otp === "1234") return res.json({ ok: true });
  return res.status(400).json({ ok: false, message: "Invalid OTP" });
});

// 3) save preferences + generate lyrics via OpenAI
const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

function buildPrompt(receiverName: string, genre: string, gender: "male" | "female" | "other") {
  const third = gender === "male" ? "him" : gender === "female" ? "her" : "them";
  const poss = gender === "male" ? "his" : gender === "female" ? "her" : "their";

  return `
Wish a happy birthday to ${receiverName}.

Ensure that "Happy birthday" is mentioned at least twice in the lyrics, and it should rhyme. The lyrics should use simple, short, and easy to pronounce words as much as possible.

Using the above information, please write 16 lines of ${genre} lyrics that I can dedicate to ${third}/${poss} birthday. Each line can have maximum of 8 words or 40 characters.

The lyrics generated should be completely unique and never written before every single time and should not in any way or manner infringe on any trademarks/copyrights or any other rights of any individual or entity anywhere in the world. Any references or similarity to existing lyrics of any song anywhere in the world needs to be completely avoided. Any mention of proper nouns i.e. names or places of any manner apart from the ones mentioned above needs to be completely avoided. The lyrics generated should not be insensitive or should not offend any person/ place/ caste/ religion/ creed/ tribe/ country/ gender/ government/ organisation or any entity or individual in any manner whatsoever. Any words which might be construed directly or indirectly as cuss words or are offensive in any language should also be completely avoided.
`.trim();
}

app.post("/api/lyrics", async (req: Request, res: Response) => {
  const parsed = detailsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.issues);
  const { userId, gender, genre, receiverName } = parsed.data;

  const prompt = buildPrompt(receiverName, genre, gender);

  const completion: any = await openai.chat.completions.create({
    model: "gemini-1.5-flash",
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  const lyrics = completion.choices[0]?.message?.content.trim();
  await User.findByIdAndUpdate(userId, { gender, genre, lyrics });

  res.json({ lyrics });
});

app.post("/api/tts", async (req: Request, res: Response) => {
  const { text } = req.body;
  const voiceId = "21m00Tcm4TlvDq8ikWAM";

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: { stability: 0.4, similarity_boost: 0.7 },
    }),
  });

  if (!response.ok) return res.status(500).send("TTS failed");

  res.setHeader("Content-Type", "audio/mpeg");
  res.send(Buffer.from(await response.arrayBuffer()));
});

app.post("/api/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).send("Missing fields");

  // Simulate user lookup
  const user = await User.findOne({ email });
  if (!user) return res.status(401).send("Invalid credentials");

  res.json({ ...user });
});

app.listen(process.env.PORT, () => console.log(`API on http://localhost:${process.env.PORT}`));

app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to the Birthday Lyrics AI API");
});
