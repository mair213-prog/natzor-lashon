## Current release: v0.88.60 — Compliance reliability and accessibility

Current release notes, validation, and update instructions: [README_08860.md](README_08860.md).

The earlier milestone descriptions below are retained as project history.

# קידום+ / Kidum+

**כל ילד. הדרך שלו.**

Starter monorepo for the Kidum+ integration-teacher workflow system.

## Apps
- `apps/mobile` – React Native / Expo mobile client
- `apps/web` – Next.js web/admin client

## Shared packages
- `packages/types` – shared TypeScript domain types
- `packages/design-system` – design tokens based on the Kidum+ visual language
- `packages/validation` – validation schemas
- `packages/api-client` – typed API client
- `packages/ui` – reusable UI components

## Services
- `services/ai` – AI context building, grounded answers and reports
- `services/reports` – report generation/export
- `services/notifications` – notifications
- `services/jobs` – scheduled automation jobs

## Supabase
- `supabase/migrations` – PostgreSQL schema
- `supabase/policies` – RLS policies
- `supabase/functions` – server functions

## First implementation milestone
1. Auth + organizations
2. Children + assignments
3. Child profile + timeline
4. Documentation
5. Goals + progress
6. Tasks + reminders
7. AI report readiness + generation

## Runnable web prototype (added)
The repository now includes a responsive Hebrew RTL Next.js prototype in `apps/web`.

Implemented flows:
- Demo login
- “היום שלי” dashboard
- Children list + search
- Child profile overview
- Central + action sheet
- 15-second quick documentation flow with success state
- Responsive desktop/mobile navigation

Run locally:
```bash
npm install
npm run dev:web
```
Then open `http://localhost:3000`.

> The UI currently uses local demo data. Supabase wiring is the next implementation milestone.


See `docs/IMPLEMENTATION_STATUS_V05.md` for the latest implementation status.

## v0.19 Premium UI
- Home dashboard rebuilt to match the approved visual mockup.
- Original Kidum multicolor person-plus brand mark and slogan restored.
- Premium pastel visual system, animated hero, KPI cards, chart, recent children, alerts and quick actions.
- Responsive RTL layout; existing Supabase/auth/security/data flows preserved.
- Bundled local hero visual asset in apps/web/public/hero-child.webp.
