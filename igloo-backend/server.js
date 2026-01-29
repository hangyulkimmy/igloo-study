// igloo-backend/server.js
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import "dotenv/config";
import multer from "multer";
import path from "path";
import fs from "fs";

const app = express();

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ CORS (Live Server + local dev)
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-key"],
  })
);
app.options("*", cors({ origin: true }));

// ✅ DB pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// ✅ Admin auth
function requireAdmin(req, res, next) {
  const key = req.header("x-admin-key");
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// ✅ Uploads folder
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

function safeExt(originalname) {
  const ext = path.extname(originalname || "").toLowerCase();
  return ext && ext.length <= 6 ? ext : ".png";
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = safeExt(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_, file, cb) => {
    // Only allow images
    if (!file.mimetype?.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed"));
    }
    cb(null, true);
  },
});

app.use("/uploads", express.static(uploadDir));

// ---------------------
// Health
// ---------------------
app.get("/health", (_, res) => res.json({ ok: true }));

// ---------------------
// Helper: delete local file safely
// ---------------------
function tryDeleteFile(relativeUrl) {
  try {
    if (!relativeUrl) return;
    const filename = String(relativeUrl).replace(/^\/uploads\//, "");
    if (!filename || filename.includes("..")) return;
    const full = path.join(uploadDir, filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (e) {
    console.warn("Could not delete file:", e?.message || e);
  }
}

// ---------------------
// Admin: list submissions
// ---------------------
app.get("/admin/submissions", requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, test_id, name, grade, email, phone, subject, level, score, submitted_at
       FROM submissions
       ORDER BY submitted_at DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    console.error("LIST SUBMISSIONS ERROR:", e);
    res.status(500).json({ error: "failed to list submissions", detail: String(e?.message || e) });
  }
});

// ---------------------
// Admin: delete ONE submission
// ---------------------
app.delete("/admin/submissions/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `DELETE FROM submissions WHERE id=$1 RETURNING id`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: "not found" });

    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error("DELETE SUBMISSION ERROR:", e);
    res.status(500).json({ error: "failed to delete submission", detail: String(e?.message || e) });
  }
});


// ---------------------
// Admin: submission detail (LEFT JOIN so it still works after test delete)
// ---------------------
app.get("/admin/submissions/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT
         s.*,
         t.title AS test_title,
         t.questions AS test_questions,
         t.answer_key AS test_answer_key
       FROM submissions s
       LEFT JOIN tests t ON t.id = s.test_id
       WHERE s.id = $1`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: "not found" });

    const row = rows[0];
    res.json({
      ...row,
      title: row.test_title || "(deleted test)",
      questions: row.test_questions || null,
      answer_key: row.test_answer_key || null,
    });
  } catch (e) {
    console.error("SUBMISSION DETAIL ERROR:", e);
    res.status(500).json({ error: "failed to load submission", detail: String(e?.message || e) });
  }
});

// ---------------------
// Admin: list tests
// ---------------------
app.get("/admin/tests", requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, subject, level, title, created_at
       FROM tests
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    console.error("LIST TESTS ERROR:", e);
    res.status(500).json({ error: "failed to list tests", detail: String(e?.message || e) });
  }
});

// ---------------------
// Admin: get single test
// ---------------------
app.get("/admin/tests/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, subject, level, title, questions, answer_key, created_at
       FROM tests
       WHERE id=$1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "test not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error("TEST DETAIL ERROR:", e);
    res.status(500).json({ error: "failed to load test", detail: String(e?.message || e) });
  }
});

// ---------------------
// Compat: /api/* routes (so older frontend works)
// ---------------------
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/tests/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, subject, level, title, questions, answer_key, created_at
       FROM tests
       WHERE id=$1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "test not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error("API TEST DETAIL ERROR:", e);
    res.status(500).json({ error: "failed to load test", detail: String(e?.message || e) });
  }
});

app.get("/api/tests", requireAdmin, async (req, res) => {
  try {
    const { id } = req.query;
    if (id) {
      const { rows } = await pool.query(
        `SELECT id, subject, level, title, questions, answer_key, created_at
         FROM tests
         WHERE id=$1`,
        [String(id)]
      );
      if (!rows.length) return res.status(404).json({ error: "test not found" });
      return res.json(rows[0]);
    }

    const { rows } = await pool.query(
      `SELECT id, subject, level, title, created_at
       FROM tests
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    console.error("API LIST TESTS ERROR:", e);
    res.status(500).json({ error: "failed to list tests", detail: String(e?.message || e) });
  }
});


// ---------------------
// Admin: upload test (IMAGE + answer key)
// ---------------------
app.post("/admin/tests/upload", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const { subject, level, title, num_questions, choices_count, answer_key } = req.body;

    if (!req.file) return res.status(400).json({ error: "image is required" });
    if (!subject || !level) return res.status(400).json({ error: "subject and level are required" });

    const n = parseInt(num_questions, 10);
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      return res.status(400).json({ error: "num_questions must be 1-200" });
    }

    const c = parseInt(choices_count, 10) || 5;
    if (![4, 5].includes(c)) return res.status(400).json({ error: "choices_count must be 4 or 5" });
    const letters = "ABCDE".slice(0, c);

    const keyStr = (answer_key || "").trim().toUpperCase().replace(/\s+/g, "");
    if (keyStr.length !== n) {
      return res.status(400).json({ error: `answer_key must be length ${n}` });
    }

    const map = {};
    for (let i = 0; i < n; i++) {
      const idx = letters.indexOf(keyStr[i]);
      if (idx === -1) return res.status(400).json({ error: `answer_key must use only ${letters}` });
      map[`q${i + 1}`] = idx;
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    const questions = {
      type: "image",
      image_url: imageUrl,
      num_questions: n,
      choices_count: c,
      choices: letters.split(""),
    };

    const { rows } = await pool.query(
      `INSERT INTO tests(subject, level, title, questions, answer_key)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)
       RETURNING id, subject, level, title, created_at`,
      [
        subject,
        level,
        title || `${subject.toUpperCase()} ${level} Test`,
        JSON.stringify(questions),
        JSON.stringify(map),
      ]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error("UPLOAD ERROR:", e);
    res.status(500).json({ error: "upload failed", detail: String(e?.message || e) });
  }
});

// ---------------------
// Admin: edit test (JSON or multipart; optional image replace)
// ---------------------
app.put("/admin/tests/:id", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;

    const { title, subject, level, num_questions, choices_count, answer_key, remove_image } = req.body;

    const { rows: existingRows } = await pool.query(
      `SELECT id, subject, level, title, questions, answer_key
       FROM tests WHERE id=$1`,
      [id]
    );
    if (!existingRows.length) return res.status(404).json({ error: "test not found" });

    const existing = existingRows[0];
    const q = existing.questions || {};
    if (!q || q.type !== "image") {
      return res.status(400).json({ error: "Only image tests supported for editing right now." });
    }

    const currentChoicesCount = Number(q.choices_count ?? (q.choices?.length ?? 5)) || 5;
    const newChoicesCount = choices_count ? Number(choices_count) : currentChoicesCount;
    if (![4, 5].includes(newChoicesCount)) {
      return res.status(400).json({ error: "choices_count must be 4 or 5" });
    }
    const letters = "ABCDE".slice(0, newChoicesCount);

    const currentN = Number(q.num_questions ?? 0);
    const newN = num_questions ? Number(num_questions) : currentN;
    if (!Number.isFinite(newN) || newN < 1 || newN > 200) {
      return res.status(400).json({ error: "num_questions must be 1-200" });
    }

    let newAnswerMap = existing.answer_key || {};
    if (typeof answer_key !== "undefined") {
      const keyStr = String(answer_key || "").trim().toUpperCase().replace(/\s+/g, "");
      if (keyStr.length !== newN) return res.status(400).json({ error: `answer_key must be length ${newN}` });

      const map = {};
      for (let i = 0; i < newN; i++) {
        const idx = letters.indexOf(keyStr[i]);
        if (idx === -1) return res.status(400).json({ error: `answer_key must use only ${letters}` });
        map[`q${i + 1}`] = idx;
      }
      newAnswerMap = map;
    }

    let imageUrl = q.image_url || null;

    const wantsRemove = String(remove_image || "").toLowerCase() === "true";
    if (wantsRemove && imageUrl) {
      tryDeleteFile(imageUrl);
      imageUrl = null;
    }

    if (req.file) {
      if (imageUrl) tryDeleteFile(imageUrl);
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const updatedQuestions = {
      ...q,
      num_questions: newN,
      choices_count: newChoicesCount,
      choices: letters.split(""),
      image_url: imageUrl,
    };

    const { rows } = await pool.query(
      `UPDATE tests
       SET subject=$1, level=$2, title=$3, questions=$4::jsonb, answer_key=$5::jsonb
       WHERE id=$6
       RETURNING id, subject, level, title, questions, answer_key, created_at`,
      [
        subject ?? existing.subject,
        level ?? existing.level,
        title ?? existing.title,
        JSON.stringify(updatedQuestions),
        JSON.stringify(newAnswerMap),
        id,
      ]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error("EDIT TEST ERROR:", e);
    res.status(500).json({ error: "failed to edit test", detail: String(e?.message || e) });
  }
});

// ---------------------
// Admin: replace image ONLY (matches your edit-test.html call)
// PUT /admin/tests/:id/image  (multipart form-data: image=<file>)
// ---------------------
app.put("/admin/tests/:id/image", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "image is required" });

    const { rows: existingRows } = await pool.query(
      `SELECT id, questions FROM tests WHERE id=$1`,
      [id]
    );
    if (!existingRows.length) return res.status(404).json({ error: "test not found" });

    const q = existingRows[0].questions || {};
    const oldUrl = q?.image_url || null;

    const newUrl = `/uploads/${req.file.filename}`;
    const updatedQuestions = { ...q, image_url: newUrl };

    const { rows } = await pool.query(
      `UPDATE tests SET questions=$1::jsonb WHERE id=$2 RETURNING id, questions`,
      [JSON.stringify(updatedQuestions), id]
    );

    if (oldUrl) tryDeleteFile(oldUrl);

    res.json({ ok: true, id: rows[0].id, image_url: rows[0].questions?.image_url || newUrl });
  } catch (e) {
    console.error("REPLACE IMAGE ERROR:", e);
    res.status(500).json({ error: "failed to replace image", detail: String(e?.message || e) });
  }
});

// ---------------------
// Admin: delete test ONLY (do NOT delete submissions)
// - Detach submissions first to avoid FK errors.
// IMPORTANT: submissions.test_id must allow NULL OR have FK ON DELETE SET NULL.
// ---------------------
app.delete("/admin/tests/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: before } = await pool.query(`SELECT questions FROM tests WHERE id=$1`, [id]);
    if (!before.length) return res.status(404).json({ error: "test not found" });

    const q = before[0].questions || {};
    const imageUrl = q?.image_url || null;

    // ✅ detach submissions so we can delete test without deleting them
    // (requires submissions.test_id nullable)
    await pool.query(`UPDATE submissions SET test_id = NULL WHERE test_id = $1`, [id]);

    const { rows } = await pool.query(`DELETE FROM tests WHERE id=$1 RETURNING id`, [id]);
    if (!rows.length) return res.status(404).json({ error: "test not found" });

    if (imageUrl) tryDeleteFile(imageUrl);

    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE TEST ERROR:", e);
    res.status(500).json({ error: "failed to delete test", detail: String(e?.message || e) });
  }
});

// GET /tests?subject=english&level=beginner&pick=random
// pick=random (default) => random test
// pick=latest => latest test (optional fallback)
app.get("/tests", async (req, res) => {
  const subject = String(req.query.subject || "").trim();
  const level = String(req.query.level || "").trim();
  const pick = String(req.query.pick || "random").trim(); // "random" | "latest"

  if (!subject || !level) {
    return res.status(400).json({ error: "subject and level are required" });
  }

  const orderBy = pick === "latest" ? "created_at DESC" : "random()";

  try {
    const { rows } = await pool.query(
      `
      SELECT id, title, subject, level, questions, created_at
      FROM tests
      WHERE subject = $1 AND level = $2
      ORDER BY ${orderBy}
      LIMIT 1
      `,
      [subject, level]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "No tests found for that subject/level" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error("GET /tests error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---------------------
// Tester: submit answers (autograde)
// ---------------------
app.post("/submissions", async (req, res) => {
  try {
    const { test_id, name, grade, email, phone, subject, level, answers } = req.body;

    if (!test_id || !name || !grade || !email || !phone) {
      return res.status(400).json({ error: "missing required fields" });
    }

    const { rows: testRows } = await pool.query(
      `SELECT answer_key FROM tests WHERE id=$1`,
      [test_id]
    );
    if (!testRows.length) return res.status(404).json({ error: "test not found" });

    const answerKey = testRows[0].answer_key || {};
    let correct = 0;
    let total = 0;

    for (const [qid, correctIdx] of Object.entries(answerKey)) {
      total++;
      if (answers && answers[qid] === correctIdx) correct++;
    }

    const score = Math.round((correct / Math.max(total, 1)) * 100);

    const { rows } = await pool.query(
      `INSERT INTO submissions(test_id, name, grade, email, phone, subject, level, answers, score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       RETURNING id, score, submitted_at`,
      [
        test_id,
        name,
        grade,
        email,
        phone,
        subject || "",
        level || "",
        JSON.stringify(answers || {}),
        score,
      ]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error("SUBMIT ERROR:", e);
    res.status(500).json({ error: "submission failed", detail: String(e?.message || e) });
  }
});

// ---------------------
// Multer / generic error handler
// ---------------------
app.use((err, _req, res, _next) => {
  if (err) {
    return res.status(400).json({ error: "bad_request", detail: String(err.message || err) });
  }
  res.status(500).json({ error: "server_error" });
});

// JSON 404 (so frontend doesn't get HTML and fail JSON parsing)
app.use((_req, res) => res.status(404).json({ error: "not_found" }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API on ${port}`));
