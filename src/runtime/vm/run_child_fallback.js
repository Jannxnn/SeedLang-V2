'use strict';

function createRunChildFallback(SeedLangVMCtor, code) {
    return (childOptions, forwardedOptions) => {
        const child = new SeedLangVMCtor(childOptions);
        return child.run(code, forwardedOptions);
    };
}

module.exports = {
    createRunChildFallback
};
