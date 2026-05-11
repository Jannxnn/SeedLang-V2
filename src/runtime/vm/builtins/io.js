'use strict';
// VM 内置函数 - IO 模块：提供 print、readFile、writeFile、exists、listDir、mkdir、remove、time、sleep 等输入输出与系统接口

function createIoBuiltins(vm) {
    return {
        print: (args) => {
            const s = args.map(a => vm.str(a)).join(' ');
            if (!vm.output) {
                vm.output = [];
            }
            vm.output.push(s);
            return null;
        },
        gui: {
            log: (args) => {
                const s = args.map(a => vm.str(a)).join(' ');
                if (!vm._suppressConsoleLog) console.log(s);
                if (!vm.output) {
                    console.log('DEBUG: this.output is undefined in gui logger!');
                    console.log('DEBUG: stack trace:', new Error().stack);
                    vm.output = [];
                }
                vm.output.push(s);
                return null;
            }
        }
    };
}

module.exports = {
    createIoBuiltins
};
