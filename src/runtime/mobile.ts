// SeedLang 移动端运行时：基于 Interpreter 扩展的移动设备 API，支持设备信息、屏幕、电池、定位、相机、通知、传感器等
// 默认设备字段为仿真/未接宿主；真机环境请通过 MobileRuntimeOptions.device 注入。

import { Interpreter, SeedValue } from '../core/interpreter';
import { parse } from '../core/parser';

export interface MobileDeviceProfile {
  platform?: string;
  os?: string;
  osVersion?: string;
  model?: string;
  manufacturer?: string;
  uuid?: string;
  serial?: string;
  isVirtual?: boolean;
  isRooted?: boolean;
}

export interface MobileRuntimeOptions {
  device?: MobileDeviceProfile;
  /** 为 true 时 API 桩将日志打到 console（前缀 [MobileRuntime]）。默认 false（静默）。 */
  debug?: boolean;
  log?: (message: string) => void;
}

interface ResolvedMobileDevice {
  platform: string;
  os: string;
  osVersion: string;
  model: string;
  manufacturer: string;
  uuid: string;
  serial: string;
  isVirtual: boolean;
  isRooted: boolean;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function mergeMobileDeviceProfile(overrides?: MobileDeviceProfile): ResolvedMobileDevice {
  const uuid = overrides?.uuid ?? generateUUID();
  const serial = overrides?.serial ?? `sim-${uuid.replace(/-/g, '').slice(0, 12)}`;
  return {
    platform: overrides?.platform ?? 'mobile',
    os: overrides?.os ?? 'unknown',
    osVersion: overrides?.osVersion ?? '1.0',
    model: overrides?.model ?? 'Generic Device',
    manufacturer: overrides?.manufacturer ?? 'Unknown',
    uuid,
    serial,
    isVirtual: overrides?.isVirtual ?? true,
    isRooted: overrides?.isRooted ?? false
  };
}

export class MobileRuntime extends Interpreter {
  private deviceInfo: Map<string, SeedValue> = new Map();
  private readonly logSink: (message: string) => void;
  private readonly device: ResolvedMobileDevice;

  constructor(options: MobileRuntimeOptions = {}) {
    super();
    this.device = mergeMobileDeviceProfile(options.device);
    this.logSink =
      options.log ??
      (options.debug === true ? (m: string) => console.log(`[MobileRuntime] ${m}`) : () => {});
    this.setupMobileAPIs();
  }

  private setupMobileAPIs(): void {
    const d = this.device;
    this.globals.define('device', {
      type: 'object',
      value: null,
      properties: new Map([
        ['platform', { type: 'string', value: d.platform }],
        ['os', { type: 'string', value: d.os }],
        ['osVersion', { type: 'string', value: d.osVersion }],
        ['model', { type: 'string', value: d.model }],
        ['manufacturer', { type: 'string', value: d.manufacturer }],
        ['uuid', { type: 'string', value: d.uuid }],
        ['serial', { type: 'string', value: d.serial }],
        ['isVirtual', { type: 'boolean', value: d.isVirtual }],
        ['isRooted', { type: 'boolean', value: d.isRooted }],
        ['getInfo', {
          type: 'function',
          value: (): SeedValue => ({
            type: 'object',
            value: null,
            properties: new Map([
              ['platform', { type: 'string', value: d.platform }],
              ['model', { type: 'string', value: d.model }],
              ['os', { type: 'string', value: d.os }],
              ['osVersion', { type: 'string', value: d.osVersion }],
              ['serial', { type: 'string', value: d.serial }],
              ['isVirtual', { type: 'boolean', value: d.isVirtual }]
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
            this.logSink(`Screen keepAwake: ${enable.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['setBrightness', {
          type: 'function',
          value: (level: SeedValue): SeedValue => {
            this.logSink(`Screen brightness set to: ${level.value}`);
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
            this.logSink(`Orientation locked to: ${orientation.value}`);
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
            this.logSink('Getting current position...');
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
            this.logSink('Watching position...');
            return { type: 'number', value: Date.now() };
          }
        }],
        ['clearWatch', {
          type: 'function',
          value: (watchId: SeedValue): SeedValue => {
            this.logSink(`Clearing watch: ${watchId.value}`);
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
            this.logSink('Opening camera...');
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
            this.logSink('Capturing photo...');
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
            this.logSink('Opening gallery...');
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
            this.logSink(`Vibrating for ${ms}ms`);
            return { type: 'null', value: null };
          }
        }],
        ['vibratePattern', {
          type: 'function',
          value: (pattern: SeedValue): SeedValue => {
            this.logSink(`Vibrating pattern: ${JSON.stringify(pattern.value)}`);
            return { type: 'null', value: null };
          }
        }],
        ['cancel', {
          type: 'function',
          value: (): SeedValue => {
            this.logSink('Vibration cancelled');
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
            this.logSink(`Notification scheduled: ${title} - ${body}`);
            return {
              type: 'object',
              value: null,
              properties: new Map([
                ['id', { type: 'string', value: generateUUID() }]
              ])
            };
          }
        }],
        ['cancel', {
          type: 'function',
          value: (id: SeedValue): SeedValue => {
            this.logSink(`Notification cancelled: ${id.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['cancelAll', {
          type: 'function',
          value: (): SeedValue => {
            this.logSink('All notifications cancelled');
            return { type: 'boolean', value: true };
          }
        }],
        ['requestPermission', {
          type: 'function',
          value: (): SeedValue => {
            this.logSink('Requesting notification permission');
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
            this.logSink('Finding contacts...');
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
            this.logSink('Picking contact...');
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
            this.logSink(`Storage set: ${key.value}`);
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
            this.logSink('Checking biometric availability...');
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
            this.logSink(`Biometric auth: ${reason.value}`);
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
            this.logSink('Registering for push notifications...');
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
            this.logSink('Unregistering from push notifications');
            return { type: 'boolean', value: true };
          }
        }],
        ['subscribe', {
          type: 'function',
          value: (topic: SeedValue): SeedValue => {
            this.logSink(`Subscribed to topic: ${topic.value}`);
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
            this.logSink('App exiting...');
            return { type: 'null', value: null };
          }
        }],
        ['minimize', {
          type: 'function',
          value: (): SeedValue => {
            this.logSink('App minimizing...');
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
            this.logSink(`Haptic impact: ${s}`);
            return { type: 'null', value: null };
          }
        }],
        ['notification', {
          type: 'function',
          value: (type: SeedValue): SeedValue => {
            this.logSink(`Haptic notification: ${type.value}`);
            return { type: 'null', value: null };
          }
        }],
        ['selection', {
          type: 'function',
          value: (): SeedValue => {
            this.logSink('Haptic selection');
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
            this.logSink('Showing keyboard');
            return { type: 'null', value: null };
          }
        }],
        ['hide', {
          type: 'function',
          value: (): SeedValue => {
            this.logSink('Hiding keyboard');
            return { type: 'null', value: null };
          }
        }],
        ['setStyle', {
          type: 'function',
          value: (style: SeedValue): SeedValue => {
            this.logSink(`Keyboard style: ${style.value}`);
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
        this.logSink(`Sharing: ${title} - ${text} - ${url}`);
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
            this.logSink(`Clipboard write: ${text.value}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['read', {
          type: 'function',
          value: (): SeedValue => {
            this.logSink('Clipboard read');
            return { type: 'string', value: '' };
          }
        }]
      ])
    });
  }

  run(code: string): SeedValue[] {
    const ast = parse(code);
    return this.interpret(ast);
  }
}
