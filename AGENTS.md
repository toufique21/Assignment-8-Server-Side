# AGENTS.md

## Project

`booknook-server-side` — a small Express 5 + MongoDB REST API backend for the BookNook app. All server code lives in a single file, `index.js`. No frontend, no build step, no tests.

## Commands

```bash
npm install          # install dependencies
node index.js        # run the server (http://localhost:8000)
npx nodemon index.js # run with auto-reload (nodemon is installed but has no npm script)
```

There is no `dev`, `start`, or test script in `package.json`; `npm test` is a placeholder that exits 1.

## Environment

- `.env` is git-ignored and must define:
  - `MONGODB_URL` — MongoDB connection string (database `BookNook`).
  - `BETTER_AUTH_SECRET` — the same secret the Next.js better-auth instance uses; required to verify the signed session cookie.
  - `CLIENT_URL` — the CORS origin allowed to send credentialed requests (defaults to `http://localhost:3000`).
- The database name (`BookNook`), collection name (`Book`), and port (`8000`) are hardcoded in `index.js`.

## Architecture

- ESM (`"type": "module"`), so use `import` / `export`, not `require`.
- MongoDB connects once at module load via a top-level `await connectToMongoDB()`; the app will fail to start if the DB is unreachable.
- Shared handles: `db` (`BookNook`), `bookCollection` (`Book`), `sessionCollection` (`session`), `userCollection` (`user`).
- Middleware: `cors({ origin: CLIENT_URL, credentials: true })` and `express.json()`.
- `verifyAPI(req, res, next)` protects private routes. It reads the better-auth session from the cookie or an `Authorization: Bearer <token>` header, validates the token against the shared `session` collection, loads the `user`, and sets `req.user` (`id`, `name`, `email`, `image`, `emailVerified`) plus `req.session`. Invalid/missing/expired sessions get `401 { error }`.
- Route handlers are registered directly on `app` in `index.js` — add new endpoints there, following the existing style.

## API Endpoints

| Method | Path             | Auth | Purpose                                             |
| ------ | ---------------- | ---- | --------------------------------------------------- |
| GET    | `/`              | —    | Health check, returns `{ message }`                 |
| POST   | `/Add-Book`      | yes  | Inserts the body into `Book`; `userId`, `userName`, `userEmail`, and `createdAt` are overwritten from the session |
| GET    | `/My-Books`      | yes  | Books where `userEmail` matches `req.user.email`, newest first |
| PUT    | `/My-Books/:id`  | yes  | Updates `title`, `author`, `category`, `imageUrl`, `copies`, `description` when the book belongs to `req.user.email`; `userName`/`userEmail`/`createdAt` are untouched |
| DELETE | `/My-Books/:id`  | yes  | Deletes a book by `_id` when it belongs to `req.user.email`; also drops its `borrows` records |
| GET    | `/All-Books`     | —    | All books, newest first                             |
| GET    | `/All-Books/:id` | yes  | Single book by MongoDB `_id`                        |

## Conventions

- Validate inputs before querying: `/All-Books/:id` and `/My-Books/:id` check `ObjectId.isValid` (400 otherwise); `PUT /My-Books/:id` validates the editable fields.
- Ownership comes from `req.user.email` only. Never trust `?email=` or body-supplied `userId`/`userEmail`/`userName` — the middleware exists to prevent that.
- Wrap DB reads in `try/catch`, `console.dir(error)` for logging, and respond with a 5xx JSON `{ error }` message.
- Lists are sorted by `createdAt: -1`; documents are expected to carry `userEmail` and `createdAt` (string ISO date) fields.
- Responses are JSON objects/arrays; the code is unformatted in places (missing semicolons, inconsistent spacing) — keep edits readable without reformatting unrelated lines.
- Register `verifyAPI` as the route middleware for every new private endpoint: `app.get("/path", verifyAPI, handler)`.

## Gotchas

- `PORT` is not read from the environment; change the constant in `index.js` if needed.
- Do not commit `.env`.
- Sessions are created by the Next.js app; this server only validates them against MongoDB. If `BETTER_AUTH_SECRET` changes, update both `.env` files.
- The session cookie is `better-auth.session_token` (or `__Secure-better-auth.session_token` when secure). Its value is `<token>.<HMAC-SHA256>`; the middleware verifies the signature when `BETTER_AUTH_SECRET` is set and looks the token up in `session`.
- Bearer tokens may be either the raw session token or the signed cookie value. A JWT from better-auth's `jwt()` plugin is not accepted by `verifyAPI`.
- Browser clients must call protected endpoints with `credentials: "include"`; CORS must keep `credentials: true` and a concrete `origin` (never `*`).
- Express 5: async handler errors are forwarded automatically, but the existing handlers still use explicit `try/catch` — follow that pattern for consistency.
