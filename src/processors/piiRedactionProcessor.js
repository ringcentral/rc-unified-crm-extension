const PII_PATTERNS = {
    // Phone numbers - only match with explicit formatting:
    // - International format starting with + (e.g., +17206789819, +1-720-678-9819)
    // - US format with parentheses (e.g., (720) 678-9819)
    // - Format with dashes or dots as separators (e.g., 720-678-9819, 720.678.9819)
    phone: /\+\d{10,15}|\+\d{1,3}[-.\s]\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}|\(\d{3}\)\s?\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
    // Email addresses
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    // Social Security Numbers - require separators to avoid matching generic 9-digit IDs
    ssn: /\b\d{3}[-.\s]\d{2}[-.\s]\d{4}\b/g,
    // Credit card numbers - require separators
    creditCard: /\b\d{4}[-.\s]\d{4}[-.\s]\d{4}[-.\s]\d{4}\b/g,
    // IP addresses
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
};

// Field names that indicate PII content - values in these fields will always be redacted
const PII_FIELD_NAMES = new Set([
    'phoneNumber',
    'phone',
    'mobilePhone',
    'homePhone',
    'workPhone',
    'email',
    'emailAddress',
    'ssn',
    'socialSecurityNumber',
    'creditCard',
    'creditCardNumber'
]);

function getRedactionPlaceholder(fieldName) {
    const lowerName = fieldName.toLowerCase();
    if (lowerName.includes('phone')) return '[REDACTED_PHONE]';
    if (lowerName.includes('email')) return '[REDACTED_EMAIL]';
    if (lowerName.includes('ssn') || lowerName.includes('socialsecurity')) return '[REDACTED_SSN]';
    if (lowerName.includes('credit')) return '[REDACTED_CREDIT_CARD]';
    return '[REDACTED]';
}

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

function redactObject(obj, fieldName = null) {
    if (obj === null || obj === undefined) {
        return obj;
    }

    // If this is a value for a known PII field name, redact completely (but not empty strings)
    if (fieldName && PII_FIELD_NAMES.has(fieldName) && typeof obj === 'string' && obj.trim()) {
        return getRedactionPlaceholder(fieldName);
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
            redacted[key] = redactObject(obj[key], key);
        }
        return redacted;
    }

    return obj;
}

function redactPii(data) {
    return redactObject(data);
}

exports.redactPii = redactPii;
