'use strict';

function isTrustedGlobalName(globalsWithBuiltins, name) {
    return !!(globalsWithBuiltins && Object.prototype.hasOwnProperty.call(globalsWithBuiltins, name));
}

module.exports = {
    isTrustedGlobalName
};
