// SeedLang 移动端运行时：基于 Interpreter 扩展的移动设备 API，支持设备信息、屏幕、电池、定位、相机、通知、传感器等

import { Interpreter, SeedValue } from '../core/interpreter';
import { parse } from '../core/parser';

export class MobileRuntime extends Interpreter {
  private deviceInfo: Map<string, SeedValue> = new Map();

  constructor() {
    super();
    this.setupMobileAPIs();
  }

  private setupMobileAPIs(): void {
    this.globals.define('device', {
      type: 'object',
      value: null,
      properties: new Map([
        ['platform', { type: 'string', value: 'mobile' }],
        ['os', { type: 'string', value: 'unknown' }],
        ['osVersion', { type: 'string', value: '1.0' }],
        ['model', { type: 'string', value: 'Generic Device' }],
        ['manufacturer', { type: 'string', value: 'Unknown' }],
        ['uuid', { type: 'string', value: this.generateUUID() }],
        ['serial', { type: 'string', value: 'MOCK-SERIAL' }],
        ['isVirtual', { type: 'boolean', value: true }],
        ['isRooted', { type: 'boolean', value: false }],
        ['getInfo', {
          type: 'function',
          value: (): SeedValue => ({
            type: 'object',
            value: null,
            properties: new Map([
              ['platform', { type: 'string', value: 'mobile' }],
              ['model', { type: 'string', value: 'Generic Device' }],
              ['os', { type: 'string', value: 'unknown' }],
              ['osVersion', { type: 'string', value: '1.0' }]
            ])
          })
        }]
      ])
    });

    this.globals.define('screen', {
      type: 'object',
      value: null,
      properties: new Map([
        ['width', { type: 'number', value: 375 }],
        ['height', { type: 'number', value: 812 }],
        ['density', { type: 'number', value: 3 }],
        ['orientation', { type: 'string', value: 'portrait' }],
        ['brightness', { type: 'number', value: 0.5 }],
        ['keepAwake', {
          type: 'function',
          value: (enable: SeedValue): SeedValue => {
            console.log(`Screen keepAwake: ${enable.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['setBrightness', {
          type: 'function',
          value: (level: SeedValue): SeedValue => {
            console.log(`Screen brightness set to: ${level.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['getOrientation', {
          type: 'function',
          value: (): SeedValue => ({ type: 'string', value: 'portrait' })
        }],
        ['lockOrientation', {
          type: 'function',
          value: (orientation: SeedValue): SeedValue => {
            console.log(`Orientation locked to: ${orientation.value}`);
            return { type: 'boolean', value: true };
          }
        }]
      ])
    });

    this.globals.define('battery', {
      type: 'object',
      value: null,
      properties: new Map([
        ['level', { type: 'number', value: 0.85 }],
        ['isCharging', { type: 'boolean', value: false }],
        ['getStatus', {
          type: 'function',
          value: (): SeedValue => ({
            type: 'object',
            value: null,
            properties: new Map([
              ['level', { type: 'number', value: 0.85 }],
              ['isCharging', { type: 'boolean', value: false }]
            ])
          })
        }]
      ])
    });

    this.globals.define('network', {
      type: 'object',
      value: null,
      properties: new Map([
        ['type', { type: 'string', value: 'wifi' }],
        ['isConnected', { type: 'boolean', value: true }],
        ['getConnectionType', {
          type: 'function',
          value: (): SeedValue => ({ type: 'string', value: 'wifi' })
        }],
        ['isOnline', {
          type: 'function',
          value: (): SeedValue => ({ type: 'boolean', value: true })
        }]
      ])
    });

    this.globals.define('geolocation', {
      type: 'object',
      value: null,
      properties: new Map([
        ['getCurrentPosition', {
          type: 'function',
          value: (success: SeedValue, _error?: SeedValue): SeedValue => {
            console.log('Getting current position...');
            const position: SeedValue = {
              type: 'object',
              value: null,
              properties: new Map([
                ['latitude', { type: 'number', value: 39.9042 }],
                ['longitude', { type: 'number', value: 116.4074 }],
                ['altitude', { type: 'number', value: 0 }],
                ['accuracy', { type: 'number', value: 10 }],
                ['timestamp', { type: 'number', value: Date.now() }]
              ])
            };
            if (success && success.type === 'function') {
              success.value(position);
            }
            return position;
          }
        }],
        ['watchPosition', {
          type: 'function',
          value: (_success: SeedValue, _error?: SeedValue, _options?: SeedValue): SeedValue => {
            console.log('Watching position...');
            return { type: 'number', value: Date.now() };
          }
        }],
        ['clearWatch', {
          type: 'function',
          value: (watchId: SeedValue): SeedValue => {
            console.log(`Clearing watch: ${watchId.value}`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('camera', {
      type: 'object',
      value: null,
      properties: new Map([
        ['getPicture', {
          type: 'function',
          value: (success: SeedValue, _error?: SeedValue, _options?: SeedValue): SeedValue => {
            console.log('Opening camera...');
            const result: SeedValue = {
              type: 'object',
              value: null,
              properties: new Map([
                ['uri', { type: 'string', value: 'file://mock-photo.jpg' }],
                ['width', { type: 'number', value: 1920 }],
                ['height', { type: 'number', value: 1080 }]
              ])
            };
            if (success && success.type === 'function') {
              success.value(result);
            }
            return result;
          }
        }],
        ['capture', {
          type: 'function',
          value: (_options?: SeedValue): SeedValue => {
            console.log('Capturing photo...');
            return {
              type: 'promise',
              value: Promise.resolve({
                type: 'object',
                value: null,
                properties: new Map([
                  ['uri', { type: 'string', value: 'file://mock-photo.jpg' }],
                  ['base64', { type: 'string', value: 'mock-base64-data' }]
                ])
              })
            };
          }
        }],
        ['openGallery', {
          type: 'function',
          value: (_success: SeedValue, _options?: SeedValue): SeedValue => {
            console.log('Opening gallery...');
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('vibration', {
      type: 'object',
      value: null,
      properties: new Map([
        ['vibrate', {
          type: 'function',
          value: (duration?: SeedValue): SeedValue => {
            const ms = duration ? duration.value as number : 100;
            console.log(`Vibrating for ${ms}ms`);
            return { type: 'null', value: null };
          }
        }],
        ['vibratePattern', {
          type: 'function',
          value: (pattern: SeedValue): SeedValue => {
            console.log(`Vibrating pattern: ${JSON.stringify(pattern.value)}`);
            return { type: 'null', value: null };
          }
        }],
        ['cancel', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Vibration cancelled');
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('notification', {
      type: 'object',
      value: null,
      properties: new Map([
        ['schedule', {
          type: 'function',
          value: (options: SeedValue): SeedValue => {
            const title = options.properties?.get('title')?.value || 'Notification';
            const body = options.properties?.get('body')?.value || '';
            console.log(`Notification scheduled: ${title} - ${body}`);
            return {
              type: 'object',
              value: null,
              properties: new Map([
                ['id', { type: 'string', value: this.generateUUID() }]
              ])
            };
          }
        }],
        ['cancel', {
          type: 'function',
          value: (id: SeedValue): SeedValue => {
            console.log(`Notification cancelled: ${id.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['cancelAll', {
          type: 'function',
          value: (): SeedValue => {
            console.log('All notifications cancelled');
            return { type: 'boolean', value: true };
          }
        }],
        ['requestPermission', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Requesting notification permission');
            return { type: 'promise', value: Promise.resolve({ type: 'boolean', value: true }) };
          }
        }]
      ])
    });

    this.globals.define('contacts', {
      type: 'object',
      value: null,
      properties: new Map([
        ['find', {
          type: 'function',
          value: (_options: SeedValue): SeedValue => {
            console.log('Finding contacts...');
            return {
              type: 'array',
              value: [
                {
                  type: 'object',
                  value: null,
                  properties: new Map([
                    ['name', { type: 'string', value: 'John Doe' }],
                    ['phone', { type: 'string', value: '+1234567890' }],
                    ['email', { type: 'string', value: 'john@example.com' }]
                  ])
                }
              ]
            };
          }
        }],
        ['pick', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Picking contact...');
            return {
              type: 'promise',
              value: Promise.resolve({
                type: 'object',
                value: null,
                properties: new Map([
                  ['name', { type: 'string', value: 'Selected Contact' }],
                  ['phone', { type: 'string', value: '+1234567890' }]
                ])
              })
            };
          }
        }]
      ])
    });

    this.globals.define('storage', {
      type: 'object',
      value: null,
      properties: new Map([
        ['set', {
          type: 'function',
          value: (key: SeedValue, value: SeedValue): SeedValue => {
            this.deviceInfo.set(key.value as string, value);
            console.log(`Storage set: ${key.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['get', {
          type: 'function',
          value: (key: SeedValue): SeedValue => {
            return this.deviceInfo.get(key.value as string) || { type: 'null', value: null };
          }
        }],
        ['remove', {
          type: 'function',
          value: (key: SeedValue): SeedValue => {
            this.deviceInfo.delete(key.value as string);
            return { type: 'boolean', value: true };
          }
        }],
        ['clear', {
          type: 'function',
          value: (): SeedValue => {
            this.deviceInfo.clear();
            return { type: 'boolean', value: true };
          }
        }],
        ['keys', {
          type: 'function',
          value: (): SeedValue => ({
            type: 'array',
            value: Array.from(this.deviceInfo.keys()).map(k => ({ type: 'string', value: k }))
          })
        }]
      ])
    });

    this.globals.define('biometric', {
      type: 'object',
      value: null,
      properties: new Map([
        ['isAvailable', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Checking biometric availability...');
            return {
              type: 'promise',
              value: Promise.resolve({
                type: 'object',
                value: null,
                properties: new Map([
                  ['available', { type: 'boolean', value: true }],
                  ['type', { type: 'string', value: 'fingerprint' }]
                ])
              })
            };
          }
        }],
        ['authenticate', {
          type: 'function',
          value: (reason: SeedValue): SeedValue => {
            console.log(`Biometric auth: ${reason.value}`);
            return {
              type: 'promise',
              value: Promise.resolve({
                type: 'object',
                value: null,
                properties: new Map([
                  ['success', { type: 'boolean', value: true }],
                  ['token', { type: 'string', value: 'mock-auth-token' }]
                ])
              })
            };
          }
        }]
      ])
    });

    this.globals.define('push', {
      type: 'object',
      value: null,
      properties: new Map([
        ['register', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Registering for push notifications...');
            return {
              type: 'promise',
              value: Promise.resolve({
                type: 'object',
                value: null,
                properties: new Map([
                  ['token', { type: 'string', value: 'mock-push-token' }]
                ])
              })
            };
          }
        }],
        ['unregister', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Unregistering from push notifications');
            return { type: 'boolean', value: true };
          }
        }],
        ['subscribe', {
          type: 'function',
          value: (topic: SeedValue): SeedValue => {
            console.log(`Subscribed to topic: ${topic.value}`);
            return { type: 'boolean', value: true };
          }
        }]
      ])
    });

    this.globals.define('app', {
      type: 'object',
      value: null,
      properties: new Map([
        ['version', { type: 'string', value: '1.0.0' }],
        ['name', { type: 'string', value: 'SeedLang App' }],
        ['packageName', { type: 'string', value: 'com.seedlang.app' }],
        ['exit', {
          type: 'function',
          value: (): SeedValue => {
            console.log('App exiting...');
            return { type: 'null', value: null };
          }
        }],
        ['minimize', {
          type: 'function',
          value: (): SeedValue => {
            console.log('App minimizing...');
            return { type: 'null', value: null };
          }
        }],
        ['getInfo', {
          type: 'function',
          value: (): SeedValue => ({
            type: 'object',
            value: null,
            properties: new Map([
              ['version', { type: 'string', value: '1.0.0' }],
              ['name', { type: 'string', value: 'SeedLang App' }],
              ['build', { type: 'string', value: '1' }]
            ])
          })
        }]
      ])
    });

    this.globals.define('haptics', {
      type: 'object',
      value: null,
      properties: new Map([
        ['impact', {
          type: 'function',
          value: (style?: SeedValue): SeedValue => {
            const s = style?.value || 'medium';
            console.log(`Haptic impact: ${s}`);
            return { type: 'null', value: null };
          }
        }],
        ['notification', {
          type: 'function',
          value: (type: SeedValue): SeedValue => {
            console.log(`Haptic notification: ${type.value}`);
            return { type: 'null', value: null };
          }
        }],
        ['selection', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Haptic selection');
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('keyboard', {
      type: 'object',
      value: null,
      properties: new Map([
        ['show', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Showing keyboard');
            return { type: 'null', value: null };
          }
        }],
        ['hide', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Hiding keyboard');
            return { type: 'null', value: null };
          }
        }],
        ['setStyle', {
          type: 'function',
          value: (style: SeedValue): SeedValue => {
            console.log(`Keyboard style: ${style.value}`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('share', {
      type: 'function',
      value: (options: SeedValue): SeedValue => {
        const title = options.properties?.get('title')?.value || '';
        const text = options.properties?.get('text')?.value || '';
        const url = options.properties?.get('url')?.value || '';
        console.log(`Sharing: ${title} - ${text} - ${url}`);
        return {
          type: 'promise',
          value: Promise.resolve({ type: 'boolean', value: true })
        };
      }
    });

    this.globals.define('clipboard', {
      type: 'object',
      value: null,
      properties: new Map([
        ['write', {
          type: 'function',
          value: (text: SeedValue): SeedValue => {
            console.log(`Clipboard write: ${text.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['read', {
          type: 'function',
          value: (): SeedValue => {
            console.log('Clipboard read');
            return { type: 'string', value: '' };
          }
        }]
      ])
    });
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  run(code: string): SeedValue[] {
    const ast = parse(code);
    return this.interpret(ast);
  }
}
