const PII_PATTERNS = {
    // Phone numbers (various formats)
    phone: /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
    // Email addresses
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    // Social Security Numbers
    ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    // Credit card numbers
    creditCard: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    // IP addresses
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
};

function redactString(str) {
    if (typeof str !== 'string') {
        return str;
    }

    let redacted = str;
    redacted = redacted.replace(PII_PATTERNS.email, '[REDACTED_EMAIL]');
    redacted = redacted.replace(PII_PATTERNS.ssn, '[REDACTED_SSN]');
    redacted = redacted.replace(PII_PATTERNS.creditCard, '[REDACTED_CREDIT_CARD]');
    redacted = redacted.replace(PII_PATTERNS.phone, '[REDACTED_PHONE]');
    redacted = redacted.replace(PII_PATTERNS.ipAddress, '[REDACTED_IP]');

    return redacted;
}

function redactObject(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj === 'string') {
        return redactString(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => redactObject(item));
    }

    if (typeof obj === 'object') {
        const redacted = {};
        for (const key of Object.keys(obj)) {
            redacted[key] = redactObject(obj[key]);
        }
        return redacted;
    }

    return obj;
}

function redactPii(data) {
    return redactObject(data);
}

exports.redactPii = redactPii;