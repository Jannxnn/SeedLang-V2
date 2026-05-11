// SeedLang 嵌入式运行时：基于 Interpreter 扩展的 IoT/嵌入式 API，支持 GPIO、I2C、SPI、UART、PWM、ADC 等硬件接口

import { Interpreter, SeedValue } from '../core/interpreter';
import { parse } from '../core/parser';

export class EmbeddedRuntime extends Interpreter {
  private gpio: Map<number, PinState> = new Map();
  private i2c: Map<number, I2CDevice> = new Map();
  private spi: Map<number, SPIDevice> = new Map();
  private uart: Map<number, UARTDevice> = new Map();
  private pwm: Map<number, PWMState> = new Map();
  private adc: Map<number, number> = new Map();
  private timers: Map<number, NodeJS.Timeout> = new Map();
  private timerId: number = 0;

  constructor() {
    super();
    this.setupEmbeddedAPIs();
  }

  private setupEmbeddedAPIs(): void {
    this.globals.define('GPIO', {
      type: 'object',
      value: null,
      properties: new Map([
        ['INPUT', { type: 'number', value: 0 }],
        ['OUTPUT', { type: 'number', value: 1 }],
        ['INPUT_PULLUP', { type: 'number', value: 2 }],
        ['INPUT_PULLDOWN', { type: 'number', value: 3 }],
        ['HIGH', { type: 'number', value: 1 }],
        ['LOW', { type: 'number', value: 0 }],
        ['setup', {
          type: 'function',
          value: (pin: SeedValue, mode: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            const modeNum = mode.value as number;
            this.gpio.set(pinNum, { mode: modeNum, value: 0 });
            console.log(`GPIO ${pinNum} set to mode ${modeNum}`);
            return { type: 'null', value: null };
          }
        }],
        ['write', {
          type: 'function',
          value: (pin: SeedValue, value: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            const val = value.value as number;
            if (this.gpio.has(pinNum)) {
              this.gpio.get(pinNum)!.value = val;
            }
            console.log(`GPIO ${pinNum} write ${val}`);
            return { type: 'null', value: null };
          }
        }],
        ['read', {
          type: 'function',
          value: (pin: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            const state = this.gpio.get(pinNum);
            const val = state ? state.value : 0;
            console.log(`GPIO ${pinNum} read ${val}`);
            return { type: 'number', value: val };
          }
        }],
        ['toggle', {
          type: 'function',
          value: (pin: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            if (this.gpio.has(pinNum)) {
              const state = this.gpio.get(pinNum)!;
              state.value = state.value === 0 ? 1 : 0;
              console.log(`GPIO ${pinNum} toggle to ${state.value}`);
              return { type: 'number', value: state.value };
            }
            return { type: 'number', value: 0 };
          }
        }],
        ['pulse', {
          type: 'function',
          value: (pin: SeedValue, duration: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            const dur = duration.value as number;
            console.log(`GPIO ${pinNum} pulse ${dur}ms`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('PWM', {
      type: 'object',
      value: null,
      properties: new Map([
        ['setup', {
          type: 'function',
          value: (pin: SeedValue, frequency: SeedValue, duty?: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            const freq = frequency.value as number;
            const dutyVal = duty ? duty.value as number : 0.5;
            this.pwm.set(pinNum, { frequency: freq, duty: dutyVal });
            console.log(`PWM ${pinNum} freq=${freq}Hz duty=${dutyVal}`);
            return { type: 'null', value: null };
          }
        }],
        ['setDuty', {
          type: 'function',
          value: (pin: SeedValue, duty: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            const dutyVal = duty.value as number;
            if (this.pwm.has(pinNum)) {
              this.pwm.get(pinNum)!.duty = dutyVal;
            }
            console.log(`PWM ${pinNum} duty=${dutyVal}`);
            return { type: 'null', value: null };
          }
        }],
        ['setFrequency', {
          type: 'function',
          value: (pin: SeedValue, frequency: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            const freq = frequency.value as number;
            if (this.pwm.has(pinNum)) {
              this.pwm.get(pinNum)!.frequency = freq;
            }
            console.log(`PWM ${pinNum} freq=${freq}Hz`);
            return { type: 'null', value: null };
          }
        }],
        ['stop', {
          type: 'function',
          value: (pin: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            this.pwm.delete(pinNum);
            console.log(`PWM ${pinNum} stopped`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('ADC', {
      type: 'object',
      value: null,
      properties: new Map([
        ['setup', {
          type: 'function',
          value: (pin: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            this.adc.set(pinNum, 0);
            console.log(`ADC ${pinNum} setup`);
            return { type: 'null', value: null };
          }
        }],
        ['read', {
          type: 'function',
          value: (pin: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            const val = Math.random() * 4095;
            this.adc.set(pinNum, val);
            console.log(`ADC ${pinNum} read ${val.toFixed(2)}`);
            return { type: 'number', value: val };
          }
        }],
        ['readVoltage', {
          type: 'function',
          value: (pin: SeedValue, vref?: SeedValue): SeedValue => {
            const pinNum = pin.value as number;
            const ref = vref ? vref.value as number : 3.3;
            const raw = Math.random() * 4095;
            const voltage = (raw / 4095) * ref;
            console.log(`ADC ${pinNum} voltage ${voltage.toFixed(3)}V`);
            return { type: 'number', value: voltage };
          }
        }]
      ])
    });

    this.globals.define('I2C', {
      type: 'object',
      value: null,
      properties: new Map([
        ['setup', {
          type: 'function',
          value: (bus: SeedValue, _options?: SeedValue): SeedValue => {
            const busNum = bus.value as number;
            this.i2c.set(busNum, { address: 0, buffer: [] });
            console.log(`I2C bus ${busNum} setup`);
            return { type: 'null', value: null };
          }
        }],
        ['write', {
          type: 'function',
          value: (bus: SeedValue, address: SeedValue, data: SeedValue): SeedValue => {
            const busNum = bus.value as number;
            const addr = address.value as number;
            console.log(`I2C bus ${busNum} write to 0x${addr.toString(16)}: ${JSON.stringify(data.value)}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['read', {
          type: 'function',
          value: (bus: SeedValue, address: SeedValue, length: SeedValue): SeedValue => {
            const busNum = bus.value as number;
            const addr = address.value as number;
            const len = length.value as number;
            const data = Array(len).fill(0).map(() => Math.floor(Math.random() * 256));
            console.log(`I2C bus ${busNum} read from 0x${addr.toString(16)}: ${len} bytes`);
            return { type: 'array', value: data.map(d => ({ type: 'number', value: d })) };
          }
        }],
        ['scan', {
          type: 'function',
          value: (bus: SeedValue): SeedValue => {
            const busNum = bus.value as number;
            const devices = [0x3C, 0x68, 0x76];
            console.log(`I2C bus ${busNum} scan found: ${devices.map(d => '0x' + d.toString(16)).join(', ')}`);
            return { type: 'array', value: devices.map(d => ({ type: 'number', value: d })) };
          }
        }]
      ])
    });

    this.globals.define('SPI', {
      type: 'object',
      value: null,
      properties: new Map([
        ['setup', {
          type: 'function',
          value: (bus: SeedValue, _options?: SeedValue): SeedValue => {
            const busNum = bus.value as number;
            this.spi.set(busNum, { mode: 0, speed: 1000000, buffer: [] });
            console.log(`SPI bus ${busNum} setup`);
            return { type: 'null', value: null };
          }
        }],
        ['transfer', {
          type: 'function',
          value: (bus: SeedValue, data: SeedValue): SeedValue => {
            const busNum = bus.value as number;
            const input = data.value as SeedValue[];
            const output = input.map(() => ({ type: 'number', value: Math.floor(Math.random() * 256) }));
            console.log(`SPI bus ${busNum} transfer ${input.length} bytes`);
            return { type: 'array', value: output };
          }
        }],
        ['write', {
          type: 'function',
          value: (bus: SeedValue, data: SeedValue): SeedValue => {
            const busNum = bus.value as number;
            console.log(`SPI bus ${busNum} write ${JSON.stringify(data.value)}`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('UART', {
      type: 'object',
      value: null,
      properties: new Map([
        ['setup', {
          type: 'function',
          value: (port: SeedValue, options?: SeedValue): SeedValue => {
            const portNum = port.value as number;
            const baud = options?.properties?.get('baudRate')?.value || 9600;
            this.uart.set(portNum, { baudRate: baud as number, buffer: '' });
            console.log(`UART ${portNum} setup baud=${baud}`);
            return { type: 'null', value: null };
          }
        }],
        ['write', {
          type: 'function',
          value: (port: SeedValue, data: SeedValue): SeedValue => {
            const portNum = port.value as number;
            console.log(`UART ${portNum} write: ${data.value}`);
            return { type: 'null', value: null };
          }
        }],
        ['read', {
          type: 'function',
          value: (port: SeedValue, length?: SeedValue): SeedValue => {
            const portNum = port.value as number;
            const len = length ? length.value as number : 64;
            const data = 'mock-uart-data';
            console.log(`UART ${portNum} read ${len} bytes`);
            return { type: 'string', value: data };
          }
        }],
        ['available', {
          type: 'function',
          value: (_port: SeedValue): SeedValue => {
            return { type: 'number', value: 0 };
          }
        }],
        ['onData', {
          type: 'function',
          value: (port: SeedValue, _callback: SeedValue): SeedValue => {
            const portNum = port.value as number;
            console.log(`UART ${portNum} data handler registered`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('Timer', {
      type: 'object',
      value: null,
      properties: new Map([
        ['setInterval', {
          type: 'function',
          value: (callback: SeedValue, interval: SeedValue): SeedValue => {
            const id = ++this.timerId;
            const ms = interval.value as number;
            const timer = setInterval(() => {
              if (callback.type === 'function') {
                callback.value();
              }
            }, ms);
            this.timers.set(id, timer);
            console.log(`Timer ${id} interval ${ms}ms`);
            return { type: 'number', value: id };
          }
        }],
        ['setTimeout', {
          type: 'function',
          value: (callback: SeedValue, delay: SeedValue): SeedValue => {
            const id = ++this.timerId;
            const ms = delay.value as number;
            const timer = setTimeout(() => {
              if (callback.type === 'function') {
                callback.value();
              }
              this.timers.delete(id);
            }, ms);
            this.timers.set(id, timer);
            console.log(`Timer ${id} timeout ${ms}ms`);
            return { type: 'number', value: id };
          }
        }],
        ['clear', {
          type: 'function',
          value: (id: SeedValue): SeedValue => {
            const timerId = id.value as number;
            if (this.timers.has(timerId)) {
              clearTimeout(this.timers.get(timerId)!);
              this.timers.delete(timerId);
              console.log(`Timer ${timerId} cleared`);
            }
            return { type: 'null', value: null };
          }
        }],
        ['delay', {
          type: 'function',
          value: (ms: SeedValue): SeedValue => {
            console.log(`Delay ${ms.value}ms`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('Sensor', {
      type: 'object',
      value: null,
      properties: new Map([
        ['temperature', {
          type: 'function',
          value: (): SeedValue => {
            const temp = 25 + (Math.random() - 0.5) * 10;
            console.log(`Temperature: ${temp.toFixed(2)}°C`);
            return { type: 'number', value: temp };
          }
        }],
        ['humidity', {
          type: 'function',
          value: (): SeedValue => {
            const hum = 50 + (Math.random() - 0.5) * 20;
            console.log(`Humidity: ${hum.toFixed(2)}%`);
            return { type: 'number', value: hum };
          }
        }],
        ['pressure', {
          type: 'function',
          value: (): SeedValue => {
            const pressure = 101325 + (Math.random() - 0.5) * 1000;
            console.log(`Pressure: ${pressure.toFixed(0)} Pa`);
            return { type: 'number', value: pressure };
          }
        }],
        ['light', {
          type: 'function',
          value: (): SeedValue => {
            const light = Math.random() * 1000;
            console.log(`Light: ${light.toFixed(0)} lux`);
            return { type: 'number', value: light };
          }
        }],
        ['accelerometer', {
          type: 'function',
          value: (): SeedValue => {
            const x = (Math.random() - 0.5) * 2;
            const y = (Math.random() - 0.5) * 2;
            const z = 9.8 + (Math.random() - 0.5);
            console.log(`Accelerometer: x=${x.toFixed(2)}, y=${y.toFixed(2)}, z=${z.toFixed(2)}`);
            return {
              type: 'object',
              value: null,
              properties: new Map([
                ['x', { type: 'number', value: x }],
                ['y', { type: 'number', value: y }],
                ['z', { type: 'number', value: z }]
              ])
            };
          }
        }],
        ['gyroscope', {
          type: 'function',
          value: (): SeedValue => {
            const x = (Math.random() - 0.5) * 10;
            const y = (Math.random() - 0.5) * 10;
            const z = (Math.random() - 0.5) * 10;
            console.log(`Gyroscope: x=${x.toFixed(2)}, y=${y.toFixed(2)}, z=${z.toFixed(2)} deg/s`);
            return {
              type: 'object',
              value: null,
              properties: new Map([
                ['x', { type: 'number', value: x }],
                ['y', { type: 'number', value: y }],
                ['z', { type: 'number', value: z }]
              ])
            };
          }
        }],
        ['magnetometer', {
          type: 'function',
          value: (): SeedValue => {
            const x = (Math.random() - 0.5) * 100;
            const y = (Math.random() - 0.5) * 100;
            const z = (Math.random() - 0.5) * 100;
            console.log(`Magnetometer: x=${x.toFixed(2)}, y=${y.toFixed(2)}, z=${z.toFixed(2)} µT`);
            return {
              type: 'object',
              value: null,
              properties: new Map([
                ['x', { type: 'number', value: x }],
                ['y', { type: 'number', value: y }],
                ['z', { type: 'number', value: z }]
              ])
            };
          }
        }],
        ['distance', {
          type: 'function',
          value: (): SeedValue => {
            const dist = Math.random() * 400;
            console.log(`Distance: ${dist.toFixed(2)} cm`);
            return { type: 'number', value: dist };
          }
        }]
      ])
    });

    this.globals.define('WiFi', {
      type: 'object',
      value: null,
      properties: new Map([
        ['connect', {
          type: 'function',
          value: (ssid: SeedValue, _password: SeedValue): SeedValue => {
            console.log(`WiFi connecting to ${ssid.value}...`);
            return {
              type: 'promise',
              value: Promise.resolve({
                type: 'object',
                value: null,
                properties: new Map([
                  ['connected', { type: 'boolean', value: true }],
                  ['ip', { type: 'string', value: '192.168.1.100' }]
                ])
              })
            };
          }
        }],
        ['disconnect', {
          type: 'function',
          value: (): SeedValue => {
            console.log('WiFi disconnecting...');
            return { type: 'null', value: null };
          }
        }],
        ['getStatus', {
          type: 'function',
          value: (): SeedValue => ({
            type: 'object',
            value: null,
            properties: new Map([
              ['connected', { type: 'boolean', value: true }],
              ['ssid', { type: 'string', value: 'MockNetwork' }],
              ['ip', { type: 'string', value: '192.168.1.100' }],
              ['rssi', { type: 'number', value: -45 }]
            ])
          })
        }],
        ['scan', {
          type: 'function',
          value: (): SeedValue => {
            console.log('WiFi scanning...');
            return {
              type: 'array',
              value: [
                { type: 'string', value: 'Network1' },
                { type: 'string', value: 'Network2' },
                { type: 'string', value: 'Network3' }
              ]
            };
          }
        }]
      ])
    });

    this.globals.define('BLE', {
      type: 'object',
      value: null,
      properties: new Map([
        ['start', {
          type: 'function',
          value: (): SeedValue => {
            console.log('BLE starting...');
            return { type: 'boolean', value: true };
          }
        }],
        ['stop', {
          type: 'function',
          value: (): SeedValue => {
            console.log('BLE stopping...');
            return { type: 'null', value: null };
          }
        }],
        ['advertise', {
          type: 'function',
          value: (data: SeedValue): SeedValue => {
            console.log(`BLE advertising: ${JSON.stringify(data.value)}`);
            return { type: 'null', value: null };
          }
        }],
        ['scan', {
          type: 'function',
          value: (duration?: SeedValue): SeedValue => {
            const dur = duration ? duration.value as number : 5000;
            console.log(`BLE scanning for ${dur}ms...`);
            return {
              type: 'promise',
              value: Promise.resolve({
                type: 'array',
                value: [
                  {
                    type: 'object',
                    value: null,
                    properties: new Map([
                      ['name', { type: 'string', value: 'Device1' }],
                      ['rssi', { type: 'number', value: -50 }],
                      ['address', { type: 'string', value: 'AA:BB:CC:DD:EE:FF' }]
                    ])
                  }
                ]
              })
            };
          }
        }],
        ['connect', {
          type: 'function',
          value: (address: SeedValue): SeedValue => {
            console.log(`BLE connecting to ${address.value}...`);
            return {
              type: 'promise',
              value: Promise.resolve({ type: 'boolean', value: true })
            };
          }
        }]
      ])
    });

    this.globals.define('MQTT', {
      type: 'object',
      value: null,
      properties: new Map([
        ['connect', {
          type: 'function',
          value: (host: SeedValue, _options?: SeedValue): SeedValue => {
            console.log(`MQTT connecting to ${host.value}...`);
            return {
              type: 'promise',
              value: Promise.resolve({ type: 'boolean', value: true })
            };
          }
        }],
        ['publish', {
          type: 'function',
          value: (topic: SeedValue, message: SeedValue): SeedValue => {
            console.log(`MQTT publish ${topic.value}: ${message.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['subscribe', {
          type: 'function',
          value: (topic: SeedValue, _callback: SeedValue): SeedValue => {
            console.log(`MQTT subscribe ${topic.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['unsubscribe', {
          type: 'function',
          value: (topic: SeedValue): SeedValue => {
            console.log(`MQTT unsubscribe ${topic.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['disconnect', {
          type: 'function',
          value: (): SeedValue => {
            console.log('MQTT disconnecting...');
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('Storage', {
      type: 'object',
      value: null,
      properties: new Map([
        ['save', {
          type: 'function',
          value: (key: SeedValue, _value: SeedValue): SeedValue => {
            console.log(`Storage save ${key.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['load', {
          type: 'function',
          value: (key: SeedValue): SeedValue => {
            console.log(`Storage load ${key.value}`);
            return { type: 'null', value: null };
          }
        }],
        ['remove', {
          type: 'function',
          value: (key: SeedValue): SeedValue => {
            console.log(`Storage remove ${key.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['clear', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Storage clear');
            return { type: 'boolean', value: true };
          }
        }]
      ])
    });

    this.globals.define('Device', {
      type: 'object',
      value: null,
      properties: new Map([
        ['info', {
          type: 'function',
          value: (): SeedValue => ({
            type: 'object',
            value: null,
            properties: new Map([
              ['chip', { type: 'string', value: 'ESP32' }],
              ['flash', { type: 'number', value: 4096 }],
              ['ram', { type: 'number', value: 520 }],
              ['freq', { type: 'number', value: 240 }]
            ])
          })
        }],
        ['reset', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Device resetting...');
            return { type: 'null', value: null };
          }
        }],
        ['deepSleep', {
          type: 'function',
          value: (ms: SeedValue): SeedValue => {
            console.log(`Device deep sleep ${ms.value}ms`);
            return { type: 'null', value: null };
          }
        }],
        ['getFreeHeap', {
          type: 'function',
          value: (): SeedValue => {
            return { type: 'number', value: 200000 };
          }
        }],
        ['uptime', {
          type: 'function',
          value: (): SeedValue => {
            return { type: 'number', value: process.uptime() * 1000 };
          }
        }]
      ])
    });

    this.globals.define('LED', {
      type: 'object',
      value: null,
      properties: new Map([
        ['on', {
          type: 'function',
          value: (pin?: SeedValue): SeedValue => {
            const p = pin ? pin.value : 2;
            console.log(`LED ${p} ON`);
            return { type: 'null', value: null };
          }
        }],
        ['off', {
          type: 'function',
          value: (pin?: SeedValue): SeedValue => {
            const p = pin ? pin.value : 2;
            console.log(`LED ${p} OFF`);
            return { type: 'null', value: null };
          }
        }],
        ['blink', {
          type: 'function',
          value: (pin: SeedValue, interval: SeedValue): SeedValue => {
            console.log(`LED ${pin.value} blink ${interval.value}ms`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('Servo', {
      type: 'object',
      value: null,
      properties: new Map([
        ['attach', {
          type: 'function',
          value: (pin: SeedValue): SeedValue => {
            console.log(`Servo attached to pin ${pin.value}`);
            return { type: 'null', value: null };
          }
        }],
        ['write', {
          type: 'function',
          value: (pin: SeedValue, angle: SeedValue): SeedValue => {
            console.log(`Servo ${pin.value} angle ${angle.value}°`);
            return { type: 'null', value: null };
          }
        }],
        ['detach', {
          type: 'function',
          value: (pin: SeedValue): SeedValue => {
            console.log(`Servo detached from pin ${pin.value}`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });
  }

  run(code: string): SeedValue[] {
    const ast = parse(code);
    return this.interpret(ast);
  }

  cleanup(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

interface PinState {
  mode: number;
  value: number;
}

interface I2CDevice {
  address: number;
  buffer: number[];
}

interface SPIDevice {
  mode: number;
  speed: number;
  buffer: number[];
}

interface UARTDevice {
  baudRate: number;
  buffer: string;
}

interface PWMState {
  frequency: number;
  duty: number;
}
