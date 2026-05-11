'use strict';

function hashString32(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return h;
}

module.exports = {
    hashString32
};
