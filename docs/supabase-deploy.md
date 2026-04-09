# Supabase + VS Code MCP deployment plan

This is the practical checklist for getting the raffle app connected to Supabase once you have the Supabase MCP server available in VS Code.

## Goal

Use the Supabase MCP server from VS Code to:

1. connect to your Supabase project
2. apply the raffle schema in this repo
3. verify the database objects the app needs
4. collect the environment values for local development and GitHub Pages deployment

## What the app expects

This project already includes the app-side wiring. The missing piece is connecting it to a real Supabase project.

The app expects:

- a Supabase project URL
- a Supabase anon key
- the SQL in `supabase\migrations\202604091954_raffle.sql` to be applied
- an admin password hash in `VITE_ADMIN_PASSWORD_HASH`

## Phase 1: configure Supabase MCP in VS Code

In VS Code, set up your Supabase MCP server so Copilot can talk to your Supabase project.

At a high level, you want the MCP server to be able to:

- authenticate to Supabase
- list or select your project
- run SQL against that project
- inspect tables and functions

Once that is configured, come back to this repo and use Copilot chat in VS Code for the project-specific steps below.

## Phase 2: create or choose the Supabase project

In Supabase:

1. create a new project for the raffle, or choose an existing project dedicated to the event
2. wait for the database to finish provisioning
3. note the project URL
4. note the anon/public API key

Recommended project naming:

- project: `dev-days-raffle`
- database objects: use the names already defined in the migration file

## Phase 3: apply the raffle schema through MCP

After MCP is connected, have Copilot apply:

- `supabase\migrations\202604091954_raffle.sql`

That migration creates:

- `public.raffle_entries`
- `public.raffle_summary()`
- `public.list_recent_winners(integer)`
- `public.draw_winner(text)`

Suggested prompt to use in VS Code once the Supabase MCP server is ready:

```text
Use the Supabase MCP server for this workspace and apply the SQL in supabase\migrations\202604091954_raffle.sql to my raffle project. Then verify that the raffle_entries table and the raffle_summary, list_recent_winners, and draw_winner functions exist.
```

## Phase 4: verify the database behavior

After the migration is applied, verify:

1. `raffle_entries` exists
2. inserts are allowed for anon users
3. `raffle_summary()` returns counts
4. `list_recent_winners()` returns rows when winners exist
5. `draw_winner()` marks a winner and prevents that row from being drawn again

Suggested MCP prompt:

```text
Using the Supabase MCP server, verify the raffle schema for this repo. Confirm the raffle_entries table exists, inspect the policies on it, and verify the raffle_summary, list_recent_winners, and draw_winner functions are available.
```

## Phase 5: set local environment values

Copy `.env.example` to `.env.local` and fill in:

```powershell
Copy-Item .env.example .env.local
```

Values to set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ADMIN_PASSWORD_HASH`
- optionally `VITE_EVENT_NAME`
- optionally `VITE_EVENT_TAGLINE`

Generate the admin password hash with:

```powershell
npm run hash:admin -- "your-admin-password"
```

Then place that hash in `VITE_ADMIN_PASSWORD_HASH`.

## Phase 6: test locally before publishing

Run the app locally:

```powershell
npm install
npm run dev
```

Then verify:

1. the public page accepts an entry
2. the admin page at `#/admin` unlocks with your password
3. the admin dashboard loads counts
4. drawing a winner updates the recent winner list

## Phase 7: configure GitHub Pages deployment secrets

In the GitHub repository, add these **repository secrets**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ADMIN_PASSWORD_HASH`

Optional **repository variables**:

- `VITE_EVENT_NAME`
- `VITE_EVENT_TAGLINE`

The existing workflow at `.github\workflows\deploy.yml` uses those values during the build.

## Phase 8: publish

1. push the repository to GitHub
2. ensure GitHub Pages is enabled for GitHub Actions
3. push to `main`
4. wait for the Pages workflow to deploy
5. open the published site and test one public entry plus one admin draw

## Recommended MCP workflow in VS Code

Once your Supabase MCP server is configured, these are the best follow-up asks to use with Copilot:

### Apply the migration

```text
Use the Supabase MCP server and apply supabase\migrations\202604091954_raffle.sql to my connected project.
```

### Inspect the schema

```text
Use the Supabase MCP server to inspect the raffle_entries table, its policies, and the raffle_summary, list_recent_winners, and draw_winner functions.
```

### Smoke test the project

```text
Use the Supabase MCP server to insert a temporary raffle entry, run the summary function, and confirm the draw_winner function returns a winner. Do not leave extra test data behind when finished.
```

## Notes

- This app uses a client-side password gate for the admin page. That is lightweight protection for an event, not strong authentication.
- The draw logic is enforced in Supabase, which is what prevents the same entrant from winning twice.
- If you want stronger staff controls later, the next step would be to move draw operations behind authenticated server-side access instead of a client-visible anon flow.
