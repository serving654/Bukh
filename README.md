# NEXUS — Bookmark Vault

NEXUS is a personal bookmark command center built with React, TypeScript, Vite, Supabase Auth/PostgreSQL/RLS, Edge Functions, and PWA support.

## Current authentication model

- User chooses their own User ID.
- User chooses their own password and confirms it during registration.
- Login uses User ID + password only.
- NEXUS does not collect Gmail or any other email from the user.
- No Resend integration.
- No generated credentials.
- No password recovery. The registration screen explicitly warns that a forgotten password cannot be recovered; the user must create a new account.
- Passwords are handled by Supabase Auth and are never stored in the application database.

Supabase Auth remains the authentication authority. The server-side registration function creates a non-routable internal Auth identity solely because Supabase password authentication requires an identity address; that internal value is never displayed to the user and is not stored in `public.profiles`.

## Features

- Bookmark CRUD, favorites, metadata fetch, notes and domains.
- Collections and tags with per-user relationship tables.
- Search and command palette (`Ctrl/Cmd + K`).
- JSON/HTML import and export.
- Persistent per-user customization panel: theme, accent, density, background, glow, borders, sidebar mode, bookmark view and reduced motion.
- Strict PostgreSQL RLS for user isolation.
- Server-side validation and database-backed rate limiting for public auth endpoints.
- Secure metadata fetching with SSRF-oriented validation.
- Account deletion and global session logout.
- Responsive desktop/mobile UI and PWA assets.

## Supabase

Current project ref: `grauvnvzxxatlmgthjcg`.

Browser configuration is in `public/config.js`; the publishable key is safe for browser use. Never put a Supabase secret/service-role key in frontend code.

For a fresh database, apply `supabase/migrations/001_nexus.sql` and then `supabase/migrations/002_production_hardening.sql`.

In Supabase Authentication settings, keep **Confirm email** disabled and **Allow new users to sign up** disabled. NEXUS registration is handled by the server-side Edge Function.

## GitHub Actions

The Pages workflow builds the Vite app and deploys `dist` to GitHub Pages.

The Supabase workflow deploys Edge Functions to project `grauvnvzxxatlmgthjcg` and requires a GitHub repository secret named `SUPABASE_ACCESS_TOKEN`. That token is a Supabase Personal Access Token for CLI deployment; never commit it to source control.

## Development

```bash
npm install
npm run build
npm run dev
```

The project uses Node 22 in CI. GitHub Actions use current Node-24-compatible action major versions where applicable.
