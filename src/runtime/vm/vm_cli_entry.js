'use strict';

function runVmCli(SeedLangVMCtor, fsModule, processObj, consoleObj) {
    const args = processObj.argv.slice(2);
    if (!args.length) {
        consoleObj.log('SeedLang VM v2.0 - Bytecode Virtual Machine\nUsage: node vm.js <file.seed>');
        processObj.exit(0);
    }
    const code = fsModule.readFileSync(args[0], 'utf-8');
    const vm = new SeedLangVMCtor();
    vm.run(code);
    if (Array.isArray(vm.vm?.output)) vm.vm.output.forEach(line => consoleObj.log(line));
}

module.exports = {
    runVmCli
};
