# Truehost Node.js Deployment

This project is now configured to build as a Node.js server app for Truehost/cPanel.

## Build Output

Run:

```bash
npm install
npm run build
```

The build creates:

- `.output/server/index.mjs` - the production Node.js server
- `.output/public` - static assets served by the Node.js server
- `app.js` - cPanel-friendly startup file

## Truehost Node.js App Settings

Use these settings in cPanel `Setup Node.js App`:

- Node.js version: `22.12.0` or newer. The `22.23.0` option in cPanel is OK.
- Application mode: `Production`
- Application root: `arcbarricadesportal.com` if that is the folder you selected in File Manager
- Application URL: `arcbarricadesportal.com`
- Application startup file: `app.js`
- Startup command: `npm start`

Do not set the application root to `.output/public`. That folder only contains static assets.

## What To Upload

Recommended upload if Truehost can run commands:

- `app.js`
- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `tsconfig.json`
- `components.json`
- `eslint.config.js`
- `public/`
- `src/`
- `supabase/`
- `.env.example`
- `TRUEHOST_NODE_SETUP.md`

Do not upload:

- `.env`
- `node_modules/`
- `.output/` if you are going to build on Truehost
- `.git/`

Then run:

```bash
npm install --include=dev
npm run build
```

Alternative upload if you build locally first:

- `app.js`
- `package.json`
- the full `.output/` folder, including both `.output/server` and `.output/public`

Do not upload only `.output/public`; the app will not render correctly without the Node server.

After uploading the project:

```bash
npm install --include=dev
npm run build
npm start
```

If cPanel gives you a `Run NPM Install` button, use that first, then run the build command from the terminal.

## Environment Variables

Add these in the Node.js app environment variables screen, not inside `public_html`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=re_your_key
RESEND_FROM_EMAIL="Your App <no-reply@yourdomain.com>"
RESEND_REPLY_TO_EMAIL=support@yourdomain.com
```

Use the same public values for browser builds:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Never put `SUPABASE_SERVICE_ROLE_KEY` or `RESEND_API_KEY` in frontend `VITE_` variables.

## Important Notes

- Do not upload your real `.env` file into `public_html`.
- `SUPABASE_PUBLISHABLE_KEY` should be the publishable key that starts with `sb_publishable`.
- The Supabase service-role key belongs only in `SUPABASE_SERVICE_ROLE_KEY`.
- Static upload of `.output/public` alone will not run server actions like Resend email sending or service-role customer sync.
