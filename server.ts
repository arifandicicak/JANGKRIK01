import express from "express";
import { createServer as createViteServer } from "vite";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProd = process.env.NODE_ENV === "production";
const isVercel = !!process.env.VERCEL;

app.set('trust proxy', 1);
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Middleware User ID & Database Check
app.use(async (req, res, next) => {
  let userId = (req.headers['x-user-id'] as string) || req.cookies.user_id;
  if (!userId) userId = uuidv4();

  if (userId !== req.cookies.user_id) {
    res.cookie('user_id', userId, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
  }
  
  try {
    const { data: existingUser } = await supabase.from('users').select('id').eq('id', userId).single();
    if (!existingUser) {
      // PERBAIKAN: Gunakan timestamp angka (Date.now()) agar cocok dengan SQL BIGINT
      await supabase.from('users').insert([{ id: userId, created_at: Date.now() }]);
    }
  } catch (e) {
    console.error("User check error:", e);
  }
  
  (req as any).userId = userId;
  next();
});

// API Routes (Sessions & Messages)
app.get("/api/sessions", async (req, res) => {
  const userId = (req as any).userId;
  const { data: userSessions } = await supabase.from('sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  res.json(userSessions || []);
});

app.post("/api/sessions", async (req, res) => {
  const userId = (req as any).userId;
  const { id, title } = req.body;
  const { error } = await supabase.from('sessions').insert([{ id, user_id: userId, title, created_at: Date.now() }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post("/api/messages", async (req, res) => {
  const { id, sessionId, role, text, imageData } = req.body;
  // PERBAIKAN: Gunakan Date.now() untuk timestamp BIGINT
  const { error } = await supabase.from('messages').insert([{ 
    id, session_id: sessionId, role, text, timestamp: Date.now(), image_data: imageData || null 
  }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Static files & Vite
if (isProd || isVercel) {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).end();
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

// PERBAIKAN: Export app secara langsung agar Vercel bisa membacanya
export default app;

if (!isVercel) {
  app.listen(3000, () => console.log("Server running on port 3000"));
    }
    
