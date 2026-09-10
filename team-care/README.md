# Hueytown Team Care

Source for the employee portal and leader pilot, staged in the existing cfahueytown.com GitHub repository. This is the complete application source, including its uniform photos, password gate, request dashboard, database migrations and Groq integration. No runtime secrets or employee request records are included.

## Current and intended deployment

Today, cfahueytown.com/benefits redirects to the separately hosted portal. That redirect remains intact in this branch. Team Care is a Cloudflare Worker application, not a static HTML site: copying its web directory onto Vercel would bypass the password gate and break request storage and leader identity.

Target: employees stay at cfahueytown.com/benefits, with assets, login/logout, requests and API calls underneath that path. The homepage and recruiting pages stay at their current addresses. GitHub changes will be reviewed and tested before Vercel publishes them.

The root .vercelignore excludes this staged application from the current static website deployment. Do not remove that exclusion until a protected runtime, routing, storage and authentication are verified.

## Build and checks

Requires a current Node.js release with node:sqlite (Node 24 works).

    cd team-care
    npm ci
    npm run build
    npm test

The build emits a Worker and embeds employee-facing assets so the authentication gate protects them. Tests use an in-memory SQLite database and mock provider responses. They do not send email, call Groq, or book services.

## Move-to-domain checklist

1. Connect the existing Vercel project and inspect its production environment, routes and deployment settings. Do not create a second public restaurant site.
2. Choose and implement the server runtime path. The current Worker entry point and D1 binding cannot simply run as a Vercel Node function. Either retain a supported Cloudflare backend with authenticated routing or port storage and the Worker handler to a Vercel-compatible backend.
3. Preserve request data. Export/import only through authorized storage access, verify row counts and IDs, and prevent submissions during any final data cutover. Keep the existing database until the replacement is verified.
4. Replace or integrate dispatch-owned leader identity. Vercel must not trust client-supplied oai-authenticated-user-* headers. Those headers are trusted only behind the existing Sites dispatcher. Preserve verified email allowlisting for t@cfahueytown.com and 06123@chick-fil-a.com.
5. Move runtime secrets through server-side environment settings; do not commit them. Existing employee sessions can require a fresh login after moving domains. Keep secure, HttpOnly session cookies and cross-site request protection.
6. Make every path work under /benefits: HTML links, form actions, scripts/styles, images, fetch URLs, sign-in callbacks, redirects and email links. Test trailing slash behavior and the bare/www domain redirect. Do not use an iframe as a substitute for a working integration.
7. Test anonymous/password/leader access, rejected cross-site submissions, read/write requests, duplicate submission handling, email failure states, practice records, Groq fallback, and asset protection. Check real iPhone/Android sign-in and one authorized notification delivery.
8. Switch the existing /benefits redirect only after the integrated preview passes. Verify the public restaurant homepage still works and keep a rollback to the current redirect.

## Pilot state

- Employee password is configured on the current host, not in source.
- The leader dashboard supports individually authenticated, approved accounts.
- TEST requests send no email and are excluded from real counts.
- No cash payments, grants or reimbursements are offered.
- Groq code is present but needs the owner's account key and activation. It only selects approved categories, with consent, a timeout, daily cap and local fallback. It calls Groq, not the OpenAI API. The configured Qwen model is a preview model for evaluation and must be rechecked at activation.
- Real request intake remains closed until an email sender is connected and tested. Uniform email drafts remain available.

The root routing has deliberately not been changed to expose an incomplete migration.
