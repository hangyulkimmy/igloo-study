# Igloo Study

Test-taking platform for Igloo Study, a tutoring service I run. Students take placement/level tests in the browser; I upload, edit, and review tests from an admin dashboard.

**[▶ Try the tester](https://hangyulkimmy.github.io/igloo-study/Igloostudy-tester/)** — it talks to the live API, so go easy.

This is a real product with real users, not a demo. The classroom side, [Igloo Classroom](https://igloo-assistant.up.railway.app), lives in a separate private repo (code on request).

<!-- screenshot: docs/tester.png  |  docs/admin.png -->

## Parts

| Folder | What it is |
|---|---|
| `igloo-backend/` | Express API + PostgreSQL. Tests and submissions are stored in Postgres; test PDFs/images go to Cloudinary. Admin routes are protected with an `x-admin-key` header. |
| `igloo-admin/` | Admin dashboard — log in, upload a test (PDF or image), edit questions/answers, review student submissions. |
| `Igloostudy-tester/` | The student-facing tester — pick a test, answer, submit. |

### API surface

```
GET  /api/tests, /api/tests/:id          public: list/fetch tests
POST /submissions                         student submits answers
GET  /admin/tests, /admin/submissions     admin: manage tests & review submissions
POST /admin/tests/upload                  upload a test file (multer → Cloudinary)
PUT  /admin/tests/:id                     edit a test
```

## Run locally

```bash
cd igloo-backend
npm install
cp .env.example .env     # DATABASE_URL, ADMIN_KEY, CLOUDINARY_*
psql "$DATABASE_URL" -f sql/schema.sql
npm run dev
```

Then open `igloo-admin/index.html` and `Igloostudy-tester/index.html` (any static server; `config.js` points them at the API).

## Stack

Node · Express · PostgreSQL (`pg`) · Zod validation · Multer + Cloudinary for uploads · vanilla HTML/JS front ends

