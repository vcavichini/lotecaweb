# SPEC-MIGRATION: Next.js to Hono (Zero-Build)

## Objective
Migrate the `loteca` app from Next.js to a lightweight Hono server running directly with `tsx` to eliminate the build step.

## Stack
- **Runtime**: Node.js v22 (managed by nvm)
- **Engine**: Hono + `@hono/node-server`
- **Runner**: `tsx` (execution of `.ts` files in memory/runtime)
- **UI**: Hono JSX (Server-side rendering)
- **Database**: SQLite (keep `src/lib/db.ts` as is)

## Requirements
1. **Zero Build**: The app must run with `node --import tsx src/server.ts`. No `npm run build` required.
2. **Logic Preservation**: Reuse all files in `src/lib/` without modifications.
3. **Route Mapping**:
   - `GET /`: Replicate `src/app/page.tsx` using Hono JSX.
   - `GET /api/contest/latest`: Replicate `src/app/api/contest/latest/route.ts`.
   - `GET /api/contest/:id`: Replicate `src/app/api/contest/[contestNumber]/route.ts`.
4. **CSS**: Since we are removing Next.js, `page.module.css` won't work out of the box. Use a global CSS file or standard `<style>` tags in the JSX layout.

## Steps
1. Install dependencies: `npm install hono @hono/node-server`.
2. Create `src/server.ts` as the entry point.
3. Create a `Layout` component in `src/components/Layout.tsx`.
4. Implement the Home page in `src/server.ts` or a separate file.
5. Update `package.json` scripts:
   - `"dev": "tsx watch src/server.ts"`
   - `"start": "node --import tsx src/server.ts"`
6. Update `newloteca.service` to use the new start command.

## Constraints
- Do not use any Next.js specific components like `<Link>` (use standard `<a>`).
- Port must remain `8126`.
