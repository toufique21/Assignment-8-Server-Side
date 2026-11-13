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

- `.env` is git-ignored and must define `MONGODB_URL` (a MongoDB connection string).
- The database name (`BookNook`), collection name (`Book`), and port (`8000`) are hardcoded in `index.js`.

## Architecture

- ESM (`"type": "module"`), so use `import` / `export`, not `require`.
- MongoDB connects once at module load via a top-level `await connectToMongoDB()`; the app will fail to start if the DB is unreachable.
- Shared handles: `db` (`BookNook`), `bookCollection` (`Book`).
- Middleware: `cors()` (open to all origins) and `express.json()`.
- Route handlers are registered directly on `app` in `index.js` — add new endpoints there, following the existing style.

## API Endpoints

| Method | Path             | Purpose                                             |
| ------ | ---------------- | --------------------------------------------------- |
| GET    | `/`              | Health check, returns `{ message }`                 |
| POST   | `/Add-Book`      | Inserts `req.body` into the `Book` collection       |
| GET    | `/My-Books`      | Books where `userEmail` matches `?email=`, newest first |
| DELETE | `/My-Books/:id`  | Deletes a book by `_id` when its `userEmail` matches `?email=`; also drops its `borrows` records |
| GET    | `/All-Books`     | All books, newest first                             |
| GET    | `/All-Books/:id` | Single book by MongoDB `_id`                        |

## Conventions

- Validate inputs before querying: `/My-Books` requires a non-empty `email` query param (400 otherwise); `/All-Books/:id` checks `ObjectId.isValid` (400 otherwise).
- Wrap DB reads in `try/catch`, `console.dir(error)` for logging, and respond with a 5xx JSON `{ error }` message.
- Lists are sorted by `createdAt: -1`; documents are expected to carry `userEmail` and `createdAt` fields.
- Responses are JSON objects/arrays; the code is unformatted in places (missing semicolons, inconsistent spacing) — keep edits readable without reformatting unrelated lines.
- No auth, validation library, or schema enforcement is present; `POST /Add-Book` stores the body as-is.

## Gotchas

- `PORT` is not read from the environment; change the constant in `index.js` if needed.
- Do not commit `.env`.
- Express 5: async handler errors are forwarded automatically, but the existing handlers still use explicit `try/catch` — follow that pattern for consistency.
