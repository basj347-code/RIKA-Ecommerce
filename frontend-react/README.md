# RIKA React storefront

RIKA's responsive storefront is a Vite/React Router frontend backed by the root Express API and MongoDB. It is not a standalone static demo. Edit `src/App.jsx` for pages, `src/components.jsx` for shared components, `src/store.jsx` for server state and `src/App.css` / `src/index.css` for styles. Image attribution/source records live in `public/images/sources.json`.

Install and run **from the repository root** (`npm ci`, `npm run dev`). The root dependency installation is intentional to avoid Windows npm workspace symlink issues. Open `http://localhost:5173`. The frontend proxies `/api` to `127.0.0.1:4000`.

The homepage uses a dark, responsive editorial design; `/shop?type=Dresses` filters the six dress designs and catalog images are unique per product. The original SVG logo, colours and existing backend have been preserved.

Routes include home `/`, `/shop`, `/product/:id`, `/signup`, `/signin`, `/forgot-password`, `/reset-password`, `/cart`, `/account`, `/orders`, `/order-placed/:id`, `/wishlist`, `/journal`, and `/info/:slug`.

The `Pay now` button creates a demo order directly and navigates to confirmation. No external payment page or real payment gateway is used.

See the root `README.md` for MongoDB setup, reset mail, tests, hosting requirements and outstanding verification.
