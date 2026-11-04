## Corrected ZIP / build instructions

This full package contains **both** `rika/package.json` and `rika/frontend-react/package.json`. The root `npm run build` now invokes the root-installed Vite binary directly from the frontend folder. You **only** need `npm ci` at the root; do not create npm workspaces.

**On Windows:** Extract the **complete** ZIP first (not the white-theme small patch), open the inner `rika` folder in VS Code and check:

```powershell
Test-Path .\frontend-react\package.json
# must output True
npm ci
npm run build
npm run dev
```

If `Test-Path` returns `False`, the extraction was incomplete. Re-extract to a brand-new folder instead of merging with an old installation. Copy your existing `.env` to the new `rika` folder, but never overwrite it with the example. Existing MongoDB server data will not be modified by extracting the project.


## Warm-ivory storefront + sign-out update (4 November 2026)

The Urban Edit layout and **28 distinct product photos** remain, but the storefront, navigation, catalog sections and footer use RIKA’s earlier warm-white (`#faf9f6`) palette again. Photographic hero and editorial promotion banners remain dark for contrast.

**Sign out fix:** `frontend-react/src/store.jsx` explicitly issues `POST /api/auth/logout` (instead of the GET that caused the button to fail). After the server confirms the request, the browser clears the signed-in account, shopping bag, and wishlist state. The backend deletes the session and clears the HTTP-only session cookie.

To update an existing installation, replace the source files with this package, keep your own `.env` and `.local` data, then restart `npm run dev`. Test sign-out from **Account → Sign out**, and sign back in to confirm the session has ended. You can run `node --test tests/logout-client.test.mjs` to verify the logout request contract without a database.

# RIKA · Everyday, considered.

A distinctive, responsive fashion storefront continuing the supplied **doodleblue_fe2**-inspired RIKA project. This is an Express + MongoDB API and a React/Vite frontend, **not** a static storefront. Product data and imagery are illustrative; the new fashion photographs include original AI-generated demo imagery, not photographed merchandise or real stock.

## Features

- New dark fashion-editorial landing page with a cinematic streetwear hero, six category cards, curated trending section, and two clickable editorial collections. Rest of the site keeps readable light forms.
- **Six distinctly pictured dresses** (red studio, brown satin, emerald halter, cocoa shirt-dress, cobalt slip and botanical wrap) with a dedicated Dresses filter at `/shop?type=Dresses`. Each of the 28 catalog products references a different bundled JPEG, and an automated test checks image bytes for repetition.
- Original vector RIKA wordmark + monogram favicon, cinematic dark-editorial home, **28** curated sample products with **28 distinct product photo files**, responsive product catalog, category filters, search, sorting, product detail, size/colour variants and quick-add dialogs.
- Sign up, sign in/out, account profile, secure sessions and single-use forgot/reset-password links.
- Account-isolated wishlists, carts and order history. Server-side price calculation, version-checked cart updates, transaction-backed checkout and idempotency keys.
- **Frictionless demo checkout:** the bag screen immediately places an order when **Pay now** is clicked; there is **no address, phone-number, or payment form**. No money is charged and no shipment is created. Older saved orders still show addresses when available.
- Promo **RIKA10**: 10% off. Delivery ₹149 below ₹3,990, otherwise free.
- Keyboard-accessible native dialogs, small-screen two-column product layout, inline errors and account loading states.

## Local setup (Windows, Node.js 24 + MongoDB 9 + Compass)

From the extracted **`rika`** folder, run:

```powershell
npm ci
npm run dev
```

Open **http://localhost:5173**. The API runs at **http://127.0.0.1:4000** and is proxied through Vite. The launcher looks for MongoDB on `127.0.0.1:27018`, starts `mongod` if needed and initializes replica set `rikaLocal`. On Windows it searches `C:\Program Files\MongoDB\Server\<version>\bin\mongod.exe`; set `MONGOD_PATH` if installed elsewhere. The launcher creates `.local/db` only if a MongoDB server is not already listening; **it does not delete existing data**.

Compass connection:

```
mongodb://127.0.0.1:27018/rika?replicaSet=rikaLocal
```

Optionally copy `.env.example` to `.env` and configure `MONGODB_URI` for an existing replica set or Atlas connection. **Transactions require a replica set (or sharded cluster).** On a system where the local server has already been initialized on port 27018, the same data remains accessible. If you configure Atlas in `.env`, start only with a reachable cluster and valid credentials.

## Forgot password

In local development with no SMTP settings, mail is written to `.local/mail/`. After requesting a reset from the website, run:

```powershell
npm run mail
```

Follow the displayed local reset link. RIKA uses Nodemailer for SMTP. For Gmail, configure `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=your-address@gmail.com`, `SMTP_PASS` with a **Google App Password** (not the Gmail login password), and `MAIL_FROM="RIKA <your-address@gmail.com>"`. Spaces in Google App Password display groups are removed automatically for Gmail. In production, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`. If development SMTP delivery fails, the API explains the error and the reset link is saved to `.local/mail` as a fallback. Never share the development mail files or expose reset tokens in a public API.

## Troubleshooting “This request is not allowed” on password reset

Open **http://localhost:5173/forgot-password** (or `http://127.0.0.1:5173/forgot-password`) and use **only** `npm run dev` for local development. A mutation sent from a different site or unexpected preview port is rejected by the Origin security check before Nodemailer is called. Local loopback hostnames are now both allowed regardless of whether `APP_ORIGIN` has a trailing `/`. For intentional alternative preview URLs, add an explicit comma-separated `APP_ALLOWED_ORIGINS` setting; do not disable the check. A rejected request logs its origin in the API terminal in development.

If a Gmail App Password was shared or accidentally committed, revoke it at https://myaccount.google.com/apppasswords and issue a new one. Never post `.env` contents containing credentials.

## Verification and packaging

```powershell
npm run build
npm run test:catalog
npm run test:origins
npm test
npm audit
```

`npm run test:catalog` and `npm run test:origins` run offline without MongoDB. `npm test` is an API integration suite that requires the local MongoDB replica set. It creates **only** a disposable `rika_test_<pid>` database and drops that test database afterward. It does not use or delete `rika` data. To use another isolated test database, set `RIKA_TEST_MONGODB_URI` with a database name beginning `rika_test_`.

The source archive excludes `node_modules`, `.env`, `.local`, `dist` and Git history. **Keep your existing `.env` unchanged** in your working directory when updating RIKA; never copy secret passwords into the source ZIP. Your Gmail App Password was previously shared, so revoke it and create a new one before using SMTP. Image sources and generated-asset records are in `frontend-react/public/images/sources.json`; imagery is illustrative and may not correspond precisely to product variants. Generated demo product imagery is marked as illustrative in the source records; the photographs are not proof of real inventory. The jacket on the original set uses an existing fashion photo for continuity.

## Hosting and security

`npm run build` creates static assets under `frontend-react/dist`, but production **also requires the running Express server**. Run with a Node host, reachable replica-set MongoDB/Atlas, HTTPS `APP_ORIGIN` and working SMTP. Production sessions use `Secure`, HTTP-only, SameSite=Lax cookies; changing endpoints require the `X-Rika-Request: 1` header and allowed Origin. Checkout does **not** collect real payments.

The previous starter project is credited here: https://github.com/santhosh274/doodleblue_fe2.

**Verification status:** The logo, redesigned storefront, expanded catalog, and checkout were updated and statically checked in a restricted environment, but the npm registry and local MongoDB executable were unavailable during finalization. Production build, live API tests, browser/mobile inspection and npm audit are not represented as having passed. Run the verification commands above on a configured machine before launch.

### Password reset link opens incorrectly

- Development links intentionally begin `http://localhost:5173/reset-password?token=...` and **only work on the PC running `npm run dev`**. Opening one on a phone directs the phone to itself.
- Make sure Vite is running on port `5173`; open the **latest** email (a new reset request invalidates old links). Reset links expire after 30 minutes and can only be submitted once.
- If Gmail does not make the URL clickable, copy the **entire** URL including the 64-character `token` into a browser on the development PC. Emails now include an HTML reset button and a plaintext URL.
- If the reset form loads but **Save password** fails, check the API response in DevTools > Network and confirm `.env` uses MongoDB's replica-set connection on `27018` (reset uses a transaction).
- The reset page shows a specific message when the `token` parameter is missing or truncated.
