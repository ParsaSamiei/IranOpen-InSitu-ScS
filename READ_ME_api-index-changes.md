# Add to api/index.js

Add this block right before the existing comment
`// Locally (npm start / node api/index.js) ...` near the bottom of the file
(after all the `app.get/post/put/delete` routes, before the `if (process.env.VERCEL !== '1')` block):

```js
// ---------- Serve the built client (only relevant when running outside Vercel) ----------
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});
```

`path` is already imported at the top of the file, so no new require is needed.

# Also fix api/db.js (needed for Docker's local Postgres, which has no SSL)

Current line:
```js
ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
```

Change to also recognize the `sslmode=disable` flag the Docker Compose file sets:
```js
ssl: /localhost|sslmode=disable/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
```

This keeps Neon (which needs SSL) working unchanged, while letting the Docker Postgres
(no SSL, connected to via `?sslmode=disable`) connect correctly.
