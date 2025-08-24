import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { z } from "zod";
import OpenAI from "openai";
import User from "./models/User.ts";
import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";

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
  phone: z.string().regex(/^[6-9]\d{9}$/), // India 10-digit mobile sample
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
app.post("/api/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.issues);
  const user = await User.create(parsed.data);
  res.json({ ...user });
});

// 2) mock OTP (OTP = 1234 as per assignment)
app.post("/api/otp/verify", (req, res) => {
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
  // pronouns per assignment doc
  const third = gender === "male" ? "him" : gender === "female" ? "her" : "them";
  const poss = gender === "male" ? "his" : gender === "female" ? "her" : "their";

  // Prompt per “Input Script for ChatGPT” with dynamic replacements
  // (kept verbatim structure and constraints). :contentReference[oaicite:2]{index=2}
  return `
Wish a happy birthday to ${receiverName}.

Ensure that "Happy birthday" is mentioned at least twice in the lyrics, and it should rhyme. The lyrics should use simple, short, and easy to pronounce words as much as possible.

Using the above information, please write 16 lines of ${genre} lyrics that I can dedicate to ${third}/${poss} birthday. Each line can have maximum of 8 words or 40 characters.

The lyrics generated should be completely unique and never written before every single time and should not in any way or manner infringe on any trademarks/copyrights or any other rights of any individual or entity anywhere in the world. Any references or similarity to existing lyrics of any song anywhere in the world needs to be completely avoided. Any mention of proper nouns i.e. names or places of any manner apart from the ones mentioned above needs to be completely avoided. The lyrics generated should not be insensitive or should not offend any person/ place/ caste/ religion/ creed/ tribe/ country/ gender/ government/ organisation or any entity or individual in any manner whatsoever. Any words which might be construed directly or indirectly as cuss words or are offensive in any language should also be completely avoided.
`.trim();
}

app.post("/api/lyrics", async (req, res) => {
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

// 4) TTS (server-side using ElevenLabs, optional)
app.post("/api/tts", async (req, res) => {
  const { text } = req.body as { text: string };
  if (!text) return res.status(400).send("text required");

  // Example using ElevenLabs REST (pseudo-minimal)
  // If you don't have a key, skip this route and use client-side Web Speech API.
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(400).json({ message: "TTS key missing" });
  const elevenlabs = new ElevenLabsClient({
    apiKey: apiKey, // Defaults to process.env.ELEVENLABS_API_KEY
  });
  const audio = await elevenlabs.textToSpeech.convert(
    "JBFqnCBsd6RMkjVDRZzb", // voice_id
    {
      text: text,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128", // output_format
    }
  );

  await play(audio);

  if (!audio) return res.status(500).send("TTS failed");

  res.setHeader("Content-Type", "audio/mpeg");
  res.send(audio);
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).send("Missing fields");

  // Simulate user lookup
  const user = await User.findOne({ email });
  if (!user) return res.status(401).send("Invalid credentials");

  res.json({ ...user });
});

app.listen(process.env.PORT, () => console.log(`API on http://localhost:${process.env.PORT}`));
