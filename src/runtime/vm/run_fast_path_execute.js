'use strict';

function executeRunFastPath(owner, bc, flushVmGlobalValuesIfNeeded, hardenArrayObject) {
    try {
        const result = owner._vm.run(bc);
        flushVmGlobalValuesIfNeeded(owner._vm, bc.vars, hardenArrayObject);
        return result;
    } catch (error) {
        console.log('\n=== ERROR IN runFastPath ===');
        console.log('Error:', error.message);
        console.log('Stack:', error.stack);
        throw error;
    }
}

module.exports = {
    executeRunFastPath
};
