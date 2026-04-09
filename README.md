# Dev Days Raffle

A static raffle site for event sign-ups and winner selection, designed to deploy to GitHub Pages and persist raffle state in Supabase.

## What it does

- Public attendee entry form at the root URL
- Password-gated admin page at `#/admin`
- Draw animation that reveals the persisted winner
- Winner history and dashboard counts
- One-win-per-person enforcement via Supabase

## Stack

- Vite + React + TypeScript
- Supabase for storage and draw RPCs
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

3. Fill in the Supabase values and admin password hash in `.env.local`.

4. Start the app:

   ```powershell
   npm run dev
   ```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon key used by the static app |
| `VITE_ADMIN_PASSWORD_HASH` | Yes | SHA-256 hash of the admin password |
| `VITE_EVENT_NAME` | No | Override the page title |
| `VITE_EVENT_TAGLINE` | No | Override the hero tagline |
| `VITE_BASE_PATH` | No | Override the Pages base path if needed |

Generate the admin password hash with:

```powershell
npm run hash:admin -- "your-password-here"
```

## Supabase setup

Apply the schema in `supabase\migrations\202604091954_raffle.sql` to your Supabase project. It creates:

- `raffle_entries`
- `raffle_summary()`
- `list_recent_winners(limit_count integer)`
- `draw_winner(selected_prize_label text)`

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
