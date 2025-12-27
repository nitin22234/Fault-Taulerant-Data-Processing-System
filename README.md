# Event Ingestion Service (Take-home)

This is a simple service to ingest and aggregate JSON events from unreliable clients. Built with Node.js, Express, and SQLite.

## How to run
1. `npm install`
2. `node index.js`
3. Open `http://localhost:3000`

---

## FAQ

### 1. What assumptions were made?
- I assumed that "duplicate" means the exact same data (client, metric, amount, timestamp).
- I assumed normalized fields are more reliable for deduplication than raw strings (to handle minor spacing changes in JSON).
- "Fault tolerance" here mostly means the system doesn't crash on bad JSON and keeps a record of failed attempts.

### 2. How is double counting prevented?
I generate a SHA-256 hash of the normalized fields (`client_id`, `metric`, `amount`, `timestamp`). This hash is used as the Primary Key in the `processed_events` table. If the same event is sent twice, the database unique constraint catches it and the code ignores the error safely.

**Limitations:** If a client purposely sends two identical metrics at the exact same millisecond, the second one will be ignored. This is a trade-off to ensure idempotency when clients retry on timeout.

### 3. What happens if the DB fails mid-request?
The ingestion flow is:
1. Store raw JSON + set status to `RECEIVED`.
2. Normalize data.
3. Try to insert into processed table.
4. Update raw status to `PROCESSED`.

If the DB fails after step 1 but before step 4, the record stays marked as `RECEIVED` or is explicitly marked as `FAILED` (if the connection is still alive enough to update). The client will likely get a 500 error and retry. Since we have the content hash, the retry won't cause double counting.

### 4. What would break first at scale?
- **SQLite Performance:** It's great for local stuff, but concurrent writes will eventually hit locking issues.
- **Deduplication Logic:** Calculating hashes on every request and doing a PK lookup becomes slow with millions of records.
- **Aggregation:** Currently, I'm doing `SUM/COUNT` on the fly. This will crawl once the table gets large. We'd need a separate aggregation table or a specialized time-series DB.
- **Memory:** If a client sends a massive JSON payload (e.g. 50MB), `JSON.parse` might block the event loop or crash the process.

## TODOs
- [ ] Add indexes on `client_id` and `timestamp` for faster lookups.
- [ ] Implement a background job to retry `FAILED` ingestions instead of waiting for client retries.
- [ ] Sanitize metric names to prevent weird characters in filters.
