const dns = require('dns').promises;

// List of disposable email providers to block
const DISPOSABLE_DOMAINS = new Set([
    'mailinator.com', '10minutemail.com', 'tempmail.com', 'dispostable.com',
    'trashmail.com', 'yopmail.com', 'guerrillamail.com', 'fakeinbox.com',
    'throwawaymail.com', 'getnada.com', 'sharklasers.com', 'example.com'
]);

/**
 * Validates whether an email address is syntactically valid and has active Mail Exchange (MX) DNS records.
 */
async function verifyRealEmail(email) {
    if (!email || typeof email !== 'string') {
        return { isValid: false, reason: 'Email string is required.' };
    }

    const trimmed = email.trim().toLowerCase();

    // 1. Basic Format Regex Check
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmed)) {
        return { isValid: false, reason: 'Invalid email syntax format.' };
    }

    const domain = trimmed.split('@')[1];

    // 2. Disposable Email Filter
    if (DISPOSABLE_DOMAINS.has(domain)) {
        return { isValid: false, reason: 'Disposable or temporary email domains are not allowed.' };
    }

    // 3. Live DNS MX Record Lookup
    try {
        const mxRecords = await dns.resolveMx(domain);
        if (!mxRecords || mxRecords.length === 0) {
            return { isValid: false, reason: `Domain "${domain}" has no valid mail servers (MX records).` };
        }
        return { 
            isValid: true, 
            domain, 
            mxServer: mxRecords[0].exchange,
            reason: `Email domain "${domain}" is active and verified via MX DNS records (${mxRecords[0].exchange}).` 
        };
    } catch (err) {
        // Fallback for local development or DNS timeout
        if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
            return { isValid: false, reason: `The email domain "${domain}" does not exist or has no mail exchange record.` };
        }
        // If DNS fails due to network isolation, allow well-formed emails with warning
        return { isValid: true, domain, reason: 'Email syntax valid (DNS check skipped due to local network state).' };
    }
}

module.exports = { verifyRealEmail };
