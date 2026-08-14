import express from "express";
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

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Middleware User & Supabase Check
app.use(async (req, res, next) => {
  let userId = (req.headers['x-user-id'] as string) || req.cookies.user_id;
  if (!userId) userId = uuidv4();
  if (userId !== req.cookies.user_id) {
    res.cookie('user_id', userId, { maxAge: 31536000000, httpOnly: true, secure: true, sameSite: "none" });
  }
  try {
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single();

  if (!user) {
    await supabase.from('users').insert([{
      id: userId,
      created_at: new Date().toISOString()
    }]);
  }
} catch (e) {}
  (req as any).userId = userId;
  next();
});

// API Routes
app.get("/api/sessions", async (req, res) => {
  const { data } = await supabase.from('sessions').select('*').eq('user_id', (req as any).userId).order('created_at', { ascending: false });
  res.json(data || []);
});

app.post("/api/sessions", async (req, res) => {
  try {
    const { id, title } = req.body;
    const userId = (req as any).userId;

    const { data, error } = await supabase
      .from("sessions")
      .insert([{
        id,
        user_id: userId,
        title: title || "New Chat",
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error("Supabase session error:", error);

      return res.status(500).json({
        success: false,
        error: error.message,
        details: error.details,
        hint: error.hint
      });
    }

    return res.status(201).json({
      success: true,
      session: data
    });

  } catch (error: any) {
    console.error("Create session exception:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Unknown error"
    });
  }
});

// Serve Static Files (Vercel Mode)
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).end();
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

export default app;
