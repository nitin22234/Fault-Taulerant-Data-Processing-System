const crypto = require('crypto');

/**
 * Normalizes raw event data.
 * This is intentionally kept simple to handle dirty data from clients.
 */
function normalizeEvent(raw) {
    // Extract fields - clients might send these in different formats
    // or they might be missing.
    // TODO: Maybe add a whitelist of allowed metrics to prevent junk data.
    const clientId = raw.client_id || raw.clientId || raw.cid || 'unknown';
    const metric = raw.metric || raw.type || 'generic';

    // Safely convert amount to number
    let amount = 0;
    if (raw.amount !== undefined) {
        amount = parseFloat(raw.amount);
        if (isNaN(amount)) amount = 0;
    } else if (raw.value !== undefined) {
        amount = parseFloat(raw.value);
        if (isNaN(amount)) amount = 0;
    }

    // Safely convert timestamp to ISO string
    let timestamp;
    const rawTs = raw.timestamp || raw.ts || raw.created_at;
    if (rawTs) {
        const d = new Date(rawTs);
        timestamp = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } else {
        timestamp = new Date().toISOString();
    }

    const normalized = {
        client_id: String(clientId),
        metric: String(metric),
        amount: amount,
        timestamp: timestamp
    };

    // Generate a hash for deduplication
    // Using normalized fields ensures that if a client retries with the exact same data,
    // we catch it. We include client_id, metric, amount, and timestamp in the hash.
    const hash = crypto
        .createHash('sha256')
        .update(`${normalized.client_id}-${normalized.metric}-${normalized.amount}-${normalized.timestamp}`)
        .digest('hex');

    return { normalized, hash };
}

module.exports = { normalizeEvent };
