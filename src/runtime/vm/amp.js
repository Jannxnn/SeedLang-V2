'use strict';

function _decodeAmpCompressedString(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&#x27;/g, "'")
                .replace(/&#x2F;/g, '/');
}

module.exports = { _decodeAmpCompressedString };
