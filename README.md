# Dev Days Raffle

A static raffle site for event sign-ups and winner selection. Supports two modes:

- **Supabase mode** — deploy to GitHub Pages and persist raffle state in Supabase.
- **Local file mode** — run locally with a CSV or plain-text names file. No backend required.

## What it does

- Public attendee entry form at the root URL (Supabase mode)
- Password-gated admin page at `#/admin`
- Draw animation that reveals the persisted winner
- Winner history and dashboard counts
- One-win-per-person enforcement
- Admin entry management (review entrants and remove selected entries)
- Manual dark/light theme toggle with saved preference

<img width="1763" height="1784" alt="image" src="https://github.com/user-attachments/assets/b1176503-b4a1-47b7-a60d-67f3ba76b46a" />

## Stack

- Vite + React + TypeScript
- Supabase for storage and draw RPCs (optional)
- GitHub Actions workflow for GitHub Pages deployment

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy the environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Fill in `.env.local` — see [Environment variables](#environment-variables) below.

4. Start the app:

   ```powershell
   npm run dev
   ```

## Local file mode (no backend)

If you already have a list of attendee names and don't want to deploy Supabase, point the app at a CSV or plain-text file instead.

1. Add (or edit) `public/names.csv` with your attendees — a sample is already included:

   ```csv
   name,organization
   Ada Lovelace,Analytical Engine Co.
   Alan Turing,Bletchley Park
   ```

   Supported formats:
   - **CSV**: `name,organization` (header row optional; organization column optional)
   - **Plain text**: one name per line

2. Set `VITE_LOCAL_NAMES_FILE=/names.csv` in `.env.local`.

3. Leave `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` empty.

4. Run `npm run dev`. The app loads names from the file, allows manual attendee entry from the entry page, auto-saves each local submission back to the configured CSV, and lets you draw winners from the admin console.

5. Use the local-mode **Export attendee CSV** button to download the current merged list at any time.

Notes:
- Auto-save back to CSV is available only in local dev (`npm run dev`).
- In built/deployed static environments, CSV files are read-only assets. Local additions remain in memory for the current session unless you export.

When running in local file mode on localhost (`npm run dev`), the admin page does not require a password. In deployed environments, keep `VITE_ADMIN_PASSWORD_HASH` set.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase mode only | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase mode only | Public anon key used by the static app |
| `VITE_ADMIN_PASSWORD_HASH` | Required for deployed admin mode | SHA-256 hash of the admin password |
| `VITE_LOCAL_NAMES_FILE` | Local file mode only | Path to names file served by Vite (e.g. `/names.csv`) |
| `VITE_EVENT_NAME` | No | Override the page title |
| `VITE_EVENT_TAGLINE` | No | Override the hero tagline |
| `VITE_BASE_PATH` | No | Override the Pages base path if needed |

Generate the admin password hash with:

```powershell
npm run hash:admin -- "your-password-here"
```

## Supabase setup

Apply the schema migrations in `supabase\migrations\` to your Supabase project. They create:

- `raffle_entries`
- `raffle_summary()`
- `list_recent_winners(limit_count integer)`
- `draw_winner(selected_prize_label text)`
- `list_entries()`
- `remove_entry(selected_entry_id uuid)`

The app only inserts entrant rows directly. Admin stats and draws go through the SQL functions.

For the VS Code + MCP workflow, see `docs\supabase-deploy.md`.

## Security note

The admin page is password-gated in the client. That is good enough for lightweight event use, but it is not equivalent to server-side authentication. If you later need stronger protection, move admin draw operations behind a server-side secret or Supabase-authenticated flow.

## GitHub Pages deployment

The workflow in `.github\workflows\deploy.yml` builds and publishes the static site. Configure these repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ADMIN_PASSWORD_HASH`

Optional repository variables:

- `VITE_EVENT_NAME`
- `VITE_EVENT_TAGLINE`

When the repo is pushed to `main`, the workflow deploys the `dist` folder to GitHub Pages.
