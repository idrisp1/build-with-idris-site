# BuildWithIdris.com, Portfolio Site

A LinkedIn-style personal portfolio for Idris Paul, AI Systems Engineer. Public visitors see a polished, no-login profile; everything on the page (profile, projects, experience, education, AI Systems section, contact info) is edited live from the same page by signing in with Developer Login.

## Content sources

Real content, not filler, pulled from two places:

- `IdrisPaul_Resume.pdf` (the full-stack/cloud/backend-focused resume): both work history entries at JEZZOB Behavioral Health and as an independent freelance contractor, education dates, and the Google Cloud certification.
- The AI Solutions Specialist resume used earlier in this project: the MTN Cameroon AI Software Engineer role and the AI Systems section's verified entries.
- Three of your own real, live projects, captured directly: the GBPUSD Forex Bot, Peggy's Locs and Dreads, and Luxe By Bokeh, each with a real screenshot and an honest recorded product walkthrough video (`assets/videos/`) rather than a staged "watch me code" simulation.

Still placeholder, needs your input: profile photo, and the Model Training / RunPod Deployment cards in the AI Systems section (marked "Add your details" since neither resume covers that ground yet). Both are editable from the admin panel once you're signed in.

## How admin/guest works

One URL, one page. Guests see the plain public profile with no sign-in prompt. Click "Developer Login" top right (demo: `admin` / `admin123`, see `backend/.env`) to sign in and reveal edit controls in place: hover any section for an edit tab, hover a project card for edit/delete icons, or use the "Add / Edit Projects", "Add / Edit Experience", and "Edit Education & Certifications" buttons. Saves sync live to the backend and push to any other open guest tab over Server-Sent Events, no refresh needed.

Full admin coverage: profile and hero (including photo upload), full project CRUD (add, edit, delete, mark featured, image and video upload), AI Systems card text, work experience entries, education and certification entries, contact info, and a message inbox for anything submitted through the contact form.

## Local setup

```
cd backend
npm install
copy .env.example .env
```

`backend/.env` already has demo admin credentials (`admin` / `admin123`). Generate your own before any real deployment:

```
node backend/scripts/hash-password.js "your-new-password"
```

## Running locally

`launch_portfolio.bat` starts the backend and opens the site.

## Deploying to Railway

Not done yet, by design, matching how Peggy's and Bokeh's sites were deployed:

1. Create a GitHub repo (private is fine) and push this project to it.
2. In Railway, create a service from that repo. `railway.json` and `nixpacks.toml` are already set up to build from `backend/` and serve the repo root.
3. Set environment variables: `PORT` (Railway provides this), `NODE_ENV=production`, `FRONTEND_ORIGIN` (your Railway or custom domain URL), `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (generate a real one, don't ship admin/admin123 to production), `SESSION_SECRET`.
4. Add a persistent volume mounted at `backend/data`, this is where content, messages, and uploaded images/videos all live, and it needs to survive redeploys.
5. Point `BuildWithIdris.com` at the deployed service once you're ready.

## Project layout

- `index.html`, the whole site: one page, backend-driven content, admin editing revealed in place after signing in.
- `backend/server.js`, Express app: serves `index.html`, the content/message API, admin auth, and uploads.
- `backend/lib/`, content store, message store, admin auth helpers.
- `backend/data/`, `content.json` / `messages.json` (gitignored, created on first run).
- `backend/data/uploads/`, uploaded images and videos (gitignored).
- `assets/screenshots/`, `assets/videos/`, real screenshots and demo videos of your three showcased projects, committed to the repo.
- `logo-concepts.html`, three logo direction options for you to choose from.
- `mockup/`, the original approved visual mockup and its walkthrough video, kept as a reference record.
