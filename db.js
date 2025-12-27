const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

// Initialize tables
db.serialize(() => {
    // Store raw inputs exactly as received
    db.run(`
    CREATE TABLE IF NOT EXISTS raw_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT,
      status TEXT, -- 'RECEIVED', 'PROCESSED', 'FAILED'
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Normalized and deduplicated data
    db.run(`
    CREATE TABLE IF NOT EXISTS processed_events (
      id TEXT PRIMARY KEY, -- This will be the content hash
      client_id TEXT,
      metric TEXT,
      amount REAL,
      timestamp TEXT,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

module.exports = db;
