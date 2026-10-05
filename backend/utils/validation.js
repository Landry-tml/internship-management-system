function isSafeExternalUrl(value) {
    if (!value) return true;
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch (err) {
        return false;
    }
}

module.exports = { isSafeExternalUrl };
