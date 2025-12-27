const express = require('express');
const cors = require('cors');
const db = require('./db');
const { normalizeEvent } = require('./utils/normalizer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// POST /events - Ingest raw events
app.post('/events', (req, res) => {
    const rawPayload = JSON.stringify(req.body);
    const simulateFailure = req.query.simulate_failure === 'true';

    // Step 1: Store raw input first so we don't lose anything
    // even if normalization fails later.
    db.run(
        'INSERT INTO raw_events (payload, status) VALUES (?, ?)',
        [rawPayload, 'RECEIVED'],
        function (err) {
            if (err) {
                console.error('Failed to store raw event', err);
                return res.status(500).json({ error: 'Database error on ingestion' });
            }

            const rawId = this.lastID;

            // Simulation of mid-request failure
            if (simulateFailure) {
                db.run(
                    'UPDATE raw_events SET status = ?, error_message = ? WHERE id = ?',
                    ['FAILED', 'Simulated DB failure', rawId]
                );
                return res.status(500).json({ error: 'Simulated DB failure' });
            }

            try {
                // Step 2: Normalize
                const { normalized, hash } = normalizeEvent(req.body);

                // Step 3: Store processed data with deduplication
                // We use the hash as the ID to prevent double counting.
                db.run(
                    `INSERT INTO processed_events (id, client_id, metric, amount, timestamp) 
           VALUES (?, ?, ?, ?, ?)`,
                    [hash, normalized.client_id, normalized.metric, normalized.amount, normalized.timestamp],
                    function (err) {
                        if (err) {
                            // If it's a unique constraint error, it's a duplicate.
                            // This is "good enough" for now because we don't have event IDs
                            // from the client. Content hashing handles retries safely.
                            if (err.message.includes('UNIQUE constraint failed')) {
                                db.run('UPDATE raw_events SET status = ? WHERE id = ?', ['PROCESSED', rawId]);
                                return res.status(200).json({ status: 'ignored', message: 'Duplicate event' });
                            }

                            // Other DB errors
                            db.run(
                                'UPDATE raw_events SET status = ?, error_message = ? WHERE id = ?',
                                ['FAILED', err.message, rawId]
                            );
                            return res.status(500).json({ error: 'Failed to process event' });
                        }

                        // Step 4: Success!
                        db.run('UPDATE raw_events SET status = ? WHERE id = ?', ['PROCESSED', rawId]);
                        res.status(201).json({ status: 'success', id: hash });
                    }
                );
            } catch (err) {
                // Normalization failed or something else
                db.run(
                    'UPDATE raw_events SET status = ?, error_message = ? WHERE id = ?',
                    ['FAILED', err.message, rawId]
                );
                res.status(400).json({ error: 'Normalization error' });
            }
        }
    );
});

// GET /aggregates - Return counts and totals
app.get('/aggregates', (req, res) => {
    const { client_id, metric } = req.query;

    let query = `
    SELECT 
      client_id, 
      metric, 
      COUNT(*) as count, 
      SUM(amount) as total_amount 
    FROM processed_events 
    WHERE 1=1
  `;
    const params = [];

    if (client_id) {
        query += ' AND client_id = ?';
        params.push(client_id);
    }
    if (metric) {
        query += ' AND metric = ?';
        params.push(metric);
    }

    // TODO: Add pagination here if we ever have more than 100 clients.
    // Right now, this just dumps everything which is fine for a demo.
    query += ' GROUP BY client_id, metric';

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Helper for UI to show status
app.get('/status', (req, res) => {
    db.all('SELECT * FROM raw_events ORDER BY created_at DESC LIMIT 50', (err, raws) => {
        db.all('SELECT * FROM processed_events ORDER BY processed_at DESC LIMIT 50', (err2, processed) => {
            res.json({ raws, processed });
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
