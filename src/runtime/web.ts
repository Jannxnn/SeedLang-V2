// SeedLang Web 运行时：基于 Interpreter 扩展的 DOM 渲染引擎，支持 Web 指令、组件注册、事件绑定与状态管理

import { Interpreter, SeedValue } from '../core/interpreter';
import { parse } from '../core/parser';
import * as fs from 'fs';
import * as path from 'path';

export class WebRuntime extends Interpreter {
  private components: Map<string, any> = new Map();
  private state: Map<string, SeedValue> = new Map();
  private eventListeners: Map<string, Function[]> = new Map();
  private timers: Map<number, ReturnType<typeof setInterval>> = new Map();
  private timerId: number = 0;

  constructor() {
    super();
    this.setupWebAPIs();
  }

  private seedToTemplateValue(value: SeedValue): any {
    if (!value) return null;
    if (value.type === 'null' || value.type === 'undefined') return null;
    if (value.type === 'number' || value.type === 'boolean' || value.type === 'string') return value.value;
    if (value.type === 'array') {
      return (value.value as SeedValue[]).map((item) => this.seedToTemplateValue(item));
    }
    if (value.type === 'object') {
      const obj: Record<string, any> = {};
      const props = value.properties || new Map<string, SeedValue>();
      props.forEach((v, k) => {
        obj[k] = this.seedToTemplateValue(v);
      });
      return obj;
    }
    return this.stringify(value);
  }

  private resolveTemplatePath(filePathValue: SeedValue): string {
    const rawPath = this.stringify(filePathValue);
    if (!rawPath) throw new Error('template.load() requires a non-empty path');
    if (path.isAbsolute(rawPath)) return rawPath;
    return path.resolve(process.cwd(), rawPath);
  }

  private renderTemplateString(template: string, contextSeed?: SeedValue): string {
    const context = contextSeed ? this.seedToTemplateValue(contextSeed) : {};
    const data = (context && typeof context === 'object') ? context : {};
    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, keyPath) => {
      const keys = String(keyPath).split('.');
      let current: any = data;
      for (const k of keys) {
        if (current === null || current === undefined) {
          current = undefined;
          break;
        }
        current = current[k];
      }
      if (current === null || current === undefined) return '';
      return String(current);
    });
  }

  private setupWebAPIs(): void {
    this.globals.define('createElement', {
      type: 'function',
      value: (tag: SeedValue, props?: SeedValue, children?: SeedValue) => {
        const element = {
          tag: this.stringify(tag),
          props: props?.properties || new Map(),
          children: children?.value || [],
          events: new Map()
        };
        return { type: 'object', value: null, properties: new Map([
          ['tag', { type: 'string', value: element.tag }],
          ['props', { type: 'object', value: null, properties: element.props }],
          ['children', { type: 'array', value: element.children }],
          ['events', { type: 'object', value: null, properties: element.events }]
        ])};
      }
    });

    this.globals.define('render', {
      type: 'function',
      value: (element: SeedValue, _container?: SeedValue) => {
        const html = this.renderToHTML(element);
        console.log('=== Web Render Output ===');
        console.log(html);
        console.log('========================');
        return { type: 'string', value: html };
      }
    });

    this.globals.define('template', {
      type: 'object',
      value: null,
      properties: new Map([
        ['load', {
          type: 'function',
          value: (filePathValue: SeedValue) => {
            const filePath = this.resolveTemplatePath(filePathValue);
            const content = fs.readFileSync(filePath, 'utf8');
            return { type: 'string', value: content };
          }
        }],
        ['render', {
          type: 'function',
          value: (templateValue: SeedValue, context?: SeedValue) => {
            const templateText = this.stringify(templateValue);
            const output = this.renderTemplateString(templateText, context);
            return { type: 'string', value: output };
          }
        }],
        ['renderFile', {
          type: 'function',
          value: (filePathValue: SeedValue, context?: SeedValue) => {
            const filePath = this.resolveTemplatePath(filePathValue);
            const templateText = fs.readFileSync(filePath, 'utf8');
            const output = this.renderTemplateString(templateText, context);
            return { type: 'string', value: output };
          }
        }],
        ['assetTag', {
          type: 'function',
          value: (kindValue: SeedValue, urlValue: SeedValue) => {
            const kind = this.stringify(kindValue).toLowerCase();
            const url = this.stringify(urlValue);
            if (kind === 'css') {
              return { type: 'string', value: `<link rel="stylesheet" href="${url}" />` };
            }
            if (kind === 'js') {
              return { type: 'string', value: `<script src="${url}"></script>` };
            }
            throw new Error(`template.assetTag() unsupported kind: ${kind}`);
          }
        }]
      ])
    });

    this.globals.define('templateLoad', {
      type: 'function',
      value: (filePathValue: SeedValue) => {
        const filePath = this.resolveTemplatePath(filePathValue);
        const content = fs.readFileSync(filePath, 'utf8');
        return { type: 'string', value: content };
      }
    });

    this.globals.define('templateRender', {
      type: 'function',
      value: (templateValue: SeedValue, context?: SeedValue) => {
        const templateText = this.stringify(templateValue);
        const output = this.renderTemplateString(templateText, context);
        return { type: 'string', value: output };
      }
    });

    this.globals.define('setState', {
      type: 'function',
      value: (key: SeedValue, value: SeedValue) => {
        const keyStr = this.stringify(key);
        this.state.set(keyStr, value);
        return value;
      }
    });

    this.globals.define('getState', {
      type: 'function',
      value: (key: SeedValue) => {
        const keyStr = this.stringify(key);
        return this.state.get(keyStr) || { type: 'null', value: null };
      }
    });

    this.globals.define('onEvent', {
      type: 'function',
      value: (event: SeedValue, handler: SeedValue) => {
        const eventStr = this.stringify(event);
        if (!this.eventListeners.has(eventStr)) {
          this.eventListeners.set(eventStr, []);
        }
        this.eventListeners.get(eventStr)!.push(handler.value);
        return { type: 'null', value: null };
      }
    });

    this.globals.define('emitEvent', {
      type: 'function',
      value: (event: SeedValue, data?: SeedValue) => {
        const eventStr = this.stringify(event);
        const listeners = this.eventListeners.get(eventStr) || [];
        for (const listener of listeners) {
          listener(data || { type: 'null', value: null });
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('fetch', {
      type: 'function',
      value: async (url: SeedValue, _options?: SeedValue) => {
        try {
          const urlStr = this.stringify(url);
          console.log(`Fetching: ${urlStr}`);
          return { type: 'object', value: null, properties: new Map([
            ['ok', { type: 'boolean', value: true }],
            ['status', { type: 'number', value: 200 }],
            ['data', { type: 'string', value: `Response from ${urlStr}` }]
          ])};
        } catch (e) {
          throw new Error(`Fetch failed: ${e}`);
        }
      }
    });

    this.globals.define('setTimeout', {
      type: 'function',
      value: (callback: SeedValue, delay: SeedValue) => {
        setTimeout(() => {
          callback.value();
        }, delay.value as number);
        return { type: 'number', value: Date.now() };
      }
    });

    this.globals.define('setInterval', {
      type: 'function',
      value: (callback: SeedValue, delay: SeedValue) => {
        const id = ++this.timerId;
        const timer = setInterval(() => {
          if (callback.type === 'function') {
            callback.value();
          }
        }, delay.value as number);
        this.timers.set(id, timer);
        return { type: 'number', value: id };
      }
    });

    this.globals.define('clearInterval', {
      type: 'function',
      value: (id: SeedValue) => {
        const timerId = id.value as number;
        if (this.timers.has(timerId)) {
          clearInterval(this.timers.get(timerId)!);
          this.timers.delete(timerId);
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('localStorage', {
      type: 'object',
      value: null,
      properties: new Map([
        ['getItem', {
          type: 'function',
          value: (key: SeedValue) => {
            console.log(`localStorage.getItem(${this.stringify(key)})`);
            return { type: 'null', value: null };
          }
        }],
        ['setItem', {
          type: 'function',
          value: (key: SeedValue, value: SeedValue) => {
            console.log(`localStorage.setItem(${this.stringify(key)}, ${this.stringify(value)})`);
            return { type: 'null', value: null };
          }
        }],
        ['removeItem', {
          type: 'function',
          value: (key: SeedValue) => {
            console.log(`localStorage.removeItem(${this.stringify(key)})`);
            return { type: 'null', value: null };
          }
        }],
        ['clear', {
          type: 'function',
          value: () => {
            console.log('localStorage.clear()');
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('sessionStorage', {
      type: 'object',
      value: null,
      properties: new Map([
        ['getItem', {
          type: 'function',
          value: (key: SeedValue) => {
            console.log(`sessionStorage.getItem(${this.stringify(key)})`);
            return { type: 'null', value: null };
          }
        }],
        ['setItem', {
          type: 'function',
          value: (key: SeedValue, value: SeedValue) => {
            console.log(`sessionStorage.setItem(${this.stringify(key)}, ${this.stringify(value)})`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('history', {
      type: 'object',
      value: null,
      properties: new Map([
        ['pushState', {
          type: 'function',
          value: (state: SeedValue, title: SeedValue, url: SeedValue) => {
            console.log(`history.pushState(${this.stringify(state)}, ${this.stringify(title)}, ${this.stringify(url)})`);
            return { type: 'null', value: null };
          }
        }],
        ['back', {
          type: 'function',
          value: () => {
            console.log('history.back()');
            return { type: 'null', value: null };
          }
        }],
        ['forward', {
          type: 'function',
          value: () => {
            console.log('history.forward()');
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('location', {
      type: 'object',
      value: null,
      properties: new Map([
        ['href', { type: 'string', value: 'http://localhost:3000' }],
        ['hostname', { type: 'string', value: 'localhost' }],
        ['pathname', { type: 'string', value: '/' }],
        ['search', { type: 'string', value: '' }],
        ['hash', { type: 'string', value: '' }]
      ])
    });

    this.globals.define('document', {
      type: 'object',
      value: null,
      properties: new Map([
        ['getElementById', {
          type: 'function',
          value: (id: SeedValue) => {
            console.log(`document.getElementById(${this.stringify(id)})`);
            return { type: 'null', value: null };
          }
        }],
        ['querySelector', {
          type: 'function',
          value: (selector: SeedValue) => {
            console.log(`document.querySelector(${this.stringify(selector)})`);
            return { type: 'null', value: null };
          }
        }],
        ['querySelectorAll', {
          type: 'function',
          value: (selector: SeedValue) => {
            console.log(`document.querySelectorAll(${this.stringify(selector)})`);
            return { type: 'array', value: [] };
          }
        }],
        ['createElement', {
          type: 'function',
          value: (tag: SeedValue) => {
            console.log(`document.createElement(${this.stringify(tag)})`);
            return { type: 'object', value: null, properties: new Map([
              ['tag', tag],
              ['style', { type: 'object', value: null, properties: new Map() }],
              ['classList', { type: 'array', value: [] }]
            ])};
          }
        }],
        ['addEventListener', {
          type: 'function',
          value: (event: SeedValue, _handler: SeedValue) => {
            console.log(`document.addEventListener(${this.stringify(event)}, handler)`);
            return { type: 'null', value: null };
          }
        }],
        ['title', { type: 'string', value: 'SeedLang App' }],
        ['body', { type: 'object', value: null, properties: new Map() }]
      ])
    });

    this.globals.define('window', {
      type: 'object',
      value: null,
      properties: new Map([
        ['innerWidth', { type: 'number', value: 1024 }],
        ['innerHeight', { type: 'number', value: 768 }],
        ['scrollX', { type: 'number', value: 0 }],
        ['scrollY', { type: 'number', value: 0 }],
        ['addEventListener', {
          type: 'function',
          value: (event: SeedValue, _handler: SeedValue) => {
            console.log(`window.addEventListener(${this.stringify(event)}, handler)`);
            return { type: 'null', value: null };
          }
        }],
        ['removeEventListener', {
          type: 'function',
          value: (event: SeedValue, _handler: SeedValue) => {
            console.log(`window.removeEventListener(${this.stringify(event)}, handler)`);
            return { type: 'null', value: null };
          }
        }],
        ['scrollTo', {
          type: 'function',
          value: (x: SeedValue, y: SeedValue) => {
            console.log(`window.scrollTo(${this.stringify(x)}, ${this.stringify(y)})`);
            return { type: 'null', value: null };
          }
        }],
        ['open', {
          type: 'function',
          value: (url: SeedValue) => {
            console.log(`window.open(${this.stringify(url)})`);
            return { type: 'null', value: null };
          }
        }],
        ['close', {
          type: 'function',
          value: () => {
            console.log('window.close()');
            return { type: 'null', value: null };
          }
        }],
        ['alert', {
          type: 'function',
          value: (message: SeedValue) => {
            console.log(`[ALERT] ${this.stringify(message)}`);
            return { type: 'null', value: null };
          }
        }],
        ['confirm', {
          type: 'function',
          value: (message: SeedValue) => {
            console.log(`[CONFIRM] ${this.stringify(message)}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['prompt', {
          type: 'function',
          value: (message: SeedValue, defaultValue?: SeedValue) => {
            console.log(`[PROMPT] ${this.stringify(message)}`);
            return { type: 'string', value: defaultValue ? defaultValue.value : '' };
          }
        }]
      ])
    });

    this.globals.define('console', {
      type: 'object',
      value: null,
      properties: new Map([
        ['log', {
          type: 'function',
          value: (...args: SeedValue[]) => {
            console.log(...args.map(a => this.stringify(a)));
            return { type: 'null', value: null };
          }
        }],
        ['error', {
          type: 'function',
          value: (...args: SeedValue[]) => {
            console.error(...args.map(a => this.stringify(a)));
            return { type: 'null', value: null };
          }
        }],
        ['warn', {
          type: 'function',
          value: (...args: SeedValue[]) => {
            console.warn(...args.map(a => this.stringify(a)));
            return { type: 'null', value: null };
          }
        }],
        ['info', {
          type: 'function',
          value: (...args: SeedValue[]) => {
            console.info(...args.map(a => this.stringify(a)));
            return { type: 'null', value: null };
          }
        }],
        ['debug', {
          type: 'function',
          value: (...args: SeedValue[]) => {
            console.debug(...args.map(a => this.stringify(a)));
            return { type: 'null', value: null };
          }
        }],
        ['table', {
          type: 'function',
          value: (data: SeedValue) => {
            console.table(data.value);
            return { type: 'null', value: null };
          }
        }],
        ['time', {
          type: 'function',
          value: (label?: SeedValue) => {
            console.time(label ? label.value : 'default');
            return { type: 'null', value: null };
          }
        }],
        ['timeEnd', {
          type: 'function',
          value: (label?: SeedValue) => {
            console.timeEnd(label ? label.value : 'default');
            return { type: 'null', value: null };
          }
        }],
        ['group', {
          type: 'function',
          value: (label?: SeedValue) => {
            console.group(label ? label.value : 'Group');
            return { type: 'null', value: null };
          }
        }],
        ['groupEnd', {
          type: 'function',
          value: () => {
            console.groupEnd();
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('CSS', {
      type: 'object',
      value: null,
      properties: new Map([
        ['supports', {
          type: 'function',
          value: (property: SeedValue, value: SeedValue) => {
            console.log(`CSS.supports(${this.stringify(property)}, ${this.stringify(value)})`);
            return { type: 'boolean', value: true };
          }
        }],
        ['escape', {
          type: 'function',
          value: (identifier: SeedValue) => {
            return { type: 'string', value: this.stringify(identifier) };
          }
        }]
      ])
    });

    this.globals.define('requestAnimationFrame', {
      type: 'function',
      value: (callback: SeedValue) => {
        const id = setTimeout(() => callback.value(), 16);
        return { type: 'number', value: id };
      }
    });

    this.globals.define('cancelAnimationFrame', {
      type: 'function',
      value: (id: SeedValue) => {
        clearTimeout(id.value as number);
        return { type: 'null' as const, value: null };
      }
    });

    this.globals.define('navigator', {
      type: 'object',
      value: null,
      properties: new Map([
        ['userAgent', { type: 'string', value: 'SeedLang/1.0' }],
        ['platform', { type: 'string', value: 'Win32' }],
        ['language', { type: 'string', value: 'zh-CN' }],
        ['onLine', { type: 'boolean', value: true }],
        ['cookieEnabled', { type: 'boolean', value: true }],
        ['geolocation', { type: 'object', value: null, properties: new Map([
          ['getCurrentPosition', {
            type: 'function',
            value: (success: SeedValue, _error?: SeedValue) => {
              console.log('Getting geolocation...');
              success.value({ type: 'object', value: null, properties: new Map([
                ['latitude', { type: 'number', value: 39.9042 }],
                ['longitude', { type: 'number', value: 116.4074 }]
              ])});
              return { type: 'null', value: null };
            }
          }]
        ])}],
        ['clipboard', { type: 'object', value: null, properties: new Map([
          ['writeText', {
            type: 'function',
            value: async (text: SeedValue) => {
              console.log(`Clipboard write: ${this.stringify(text)}`);
              return { type: 'null', value: null };
            }
          }],
          ['readText', {
            type: 'function',
            value: async () => {
              console.log('Clipboard read');
              return { type: 'string', value: '' };
            }
          }]
        ])}]
      ])
    });

    this.globals.define('screen', {
      type: 'object',
      value: null,
      properties: new Map([
        ['width', { type: 'number', value: 1920 }],
        ['height', { type: 'number', value: 1080 }],
        ['availWidth', { type: 'number', value: 1920 }],
        ['availHeight', { type: 'number', value: 1040 }],
        ['colorDepth', { type: 'number', value: 24 }],
        ['pixelDepth', { type: 'number', value: 24 }]
      ])
    });

    this.globals.define('URL', {
      type: 'function',
      value: (url: SeedValue, base?: SeedValue) => {
        const urlStr = this.stringify(url);
        const baseStr = base ? this.stringify(base) : '';
        console.log(`new URL(${urlStr}, ${baseStr})`);
        return { type: 'object', value: null, properties: new Map([
          ['href', { type: 'string', value: urlStr }],
          ['origin', { type: 'string', value: baseStr || 'http://localhost' }],
          ['protocol', { type: 'string', value: 'http:' }],
          ['hostname', { type: 'string', value: 'localhost' }],
          ['pathname', { type: 'string', value: '/' }]
        ])};
      }
    });

    this.globals.define('URLSearchParams', {
      type: 'function',
      value: (query?: SeedValue) => {
        const queryStr = query ? this.stringify(query) : '';
        console.log(`new URLSearchParams(${queryStr})`);
        return { type: 'object', value: null, properties: new Map([
          ['get', {
            type: 'function',
            value: (_key: SeedValue) => {
              return { type: 'null', value: null };
            }
          }],
          ['set', {
            type: 'function',
            value: (_key: SeedValue, _value: SeedValue) => {
              return { type: 'null', value: null };
            }
          }],
          ['toString', {
            type: 'function',
            value: () => {
              return { type: 'string', value: queryStr };
            }
          }]
        ])};
      }
    });

    this.globals.define('Blob', {
      type: 'function',
      value: (_parts: SeedValue, options?: SeedValue) => {
        console.log('Creating Blob');
        return { type: 'object', value: null, properties: new Map([
          ['size', { type: 'number', value: 0 }],
          ['type', { type: 'string', value: options?.properties?.get('type')?.value || 'text/plain' }]
        ])};
      }
    });

    this.globals.define('FileReader', {
      type: 'function',
      value: () => {
        console.log('Creating FileReader');
        return { type: 'object', value: null, properties: new Map([
          ['readAsText', {
            type: 'function',
            value: (_blob: SeedValue) => {
              console.log('FileReader.readAsText');
              return { type: 'null', value: null };
            }
          }],
          ['readAsDataURL', {
            type: 'function',
            value: (_blob: SeedValue) => {
              console.log('FileReader.readAsDataURL');
              return { type: 'null', value: null };
            }
          }],
          ['onload', { type: 'null', value: null }],
          ['onerror', { type: 'null', value: null }]
        ])};
      }
    });

    this.globals.define('FormData', {
      type: 'function',
      value: () => {
        console.log('Creating FormData');
        return { type: 'object', value: null, properties: new Map([
          ['append', {
            type: 'function',
            value: (key: SeedValue, value: SeedValue) => {
              console.log(`FormData.append(${this.stringify(key)}, ${this.stringify(value)})`);
              return { type: 'null', value: null };
            }
          }],
          ['get', {
            type: 'function',
            value: (_key: SeedValue) => {
              return { type: 'null', value: null };
            }
          }]
        ])};
      }
    });

    this.globals.define('WebSocket', {
      type: 'function',
      value: (url: SeedValue) => {
        const urlStr = this.stringify(url);
        console.log(`Connecting WebSocket to ${urlStr}`);
        return { type: 'object', value: null, properties: new Map([
          ['url', { type: 'string', value: urlStr }],
          ['readyState', { type: 'number', value: 0 }],
          ['send', {
            type: 'function',
            value: (data: SeedValue) => {
              console.log(`WebSocket.send(${this.stringify(data)})`);
              return { type: 'null', value: null };
            }
          }],
          ['close', {
            type: 'function',
            value: () => {
              console.log('WebSocket.close()');
              return { type: 'null', value: null };
            }
          }],
          ['onopen', { type: 'null', value: null }],
          ['onmessage', { type: 'null', value: null }],
          ['onclose', { type: 'null', value: null }],
          ['onerror', { type: 'null', value: null }]
        ])};
      }
    });

    this.globals.define('EventSource', {
      type: 'function',
      value: (url: SeedValue) => {
        const urlStr = this.stringify(url);
        console.log(`Connecting EventSource to ${urlStr}`);
        return { type: 'object', value: null, properties: new Map([
          ['url', { type: 'string', value: urlStr }],
          ['readyState', { type: 'number', value: 0 }],
          ['close', {
            type: 'function',
            value: () => {
              console.log('EventSource.close()');
              return { type: 'null', value: null };
            }
          }],
          ['onmessage', { type: 'null', value: null }],
          ['onerror', { type: 'null', value: null }]
        ])};
      }
    });

    this.globals.define('IntersectionObserver', {
      type: 'function',
      value: (_callback: SeedValue, _options?: SeedValue) => {
        console.log('Creating IntersectionObserver');
        return { type: 'object', value: null, properties: new Map([
          ['observe', {
            type: 'function',
            value: (_element: SeedValue) => {
              console.log('IntersectionObserver.observe()');
              return { type: 'null', value: null };
            }
          }],
          ['unobserve', {
            type: 'function',
            value: (_element: SeedValue) => {
              console.log('IntersectionObserver.unobserve()');
              return { type: 'null', value: null };
            }
          }],
          ['disconnect', {
            type: 'function',
            value: () => {
              console.log('IntersectionObserver.disconnect()');
              return { type: 'null', value: null };
            }
          }]
        ])};
      }
    });

    this.globals.define('MutationObserver', {
      type: 'function',
      value: (_callback: SeedValue) => {
        console.log('Creating MutationObserver');
        return { type: 'object', value: null, properties: new Map([
          ['observe', {
            type: 'function',
            value: (_element: SeedValue, _options?: SeedValue) => {
              console.log('MutationObserver.observe()');
              return { type: 'null', value: null };
            }
          }],
          ['disconnect', {
            type: 'function',
            value: () => {
              console.log('MutationObserver.disconnect()');
              return { type: 'null', value: null };
            }
          }]
        ])};
      }
    });
  }

  private renderToHTML(element: SeedValue): string {
    if (!element.properties) return '';

    const tag = element.properties.get('tag')?.value || 'div';
    const props = element.properties.get('props')?.properties || new Map();
    const children = element.properties.get('children')?.value || [];

    let propString = '';
    props.forEach((value: SeedValue, key: string) => {
      if (key.startsWith('on')) {
        propString += ` ${key}="${this.stringify(value)}"`;
      } else if (key === 'style' && value.type === 'object' && value.properties) {
        const styles: string[] = [];
        value.properties.forEach((v: SeedValue, k: string) => {
          styles.push(`${k}: ${this.stringify(v)}`);
        });
        propString += ` style="${styles.join('; ')}"`;
      } else if (key === 'className') {
        propString += ` class="${this.stringify(value)}"`;
      } else {
        propString += ` ${key}="${this.stringify(value)}"`;
      }
    });

    let childrenString = '';
    for (const child of children as SeedValue[]) {
      if (child.type === 'object' && child.properties) {
        childrenString += this.renderToHTML(child);
      } else {
        childrenString += this.stringify(child);
      }
    }

    if (['input', 'img', 'br', 'hr'].includes(tag)) {
      return `<${tag}${propString} />`;
    }

    return `<${tag}${propString}>${childrenString}</${tag}>`;
  }

  runWeb(source: string): SeedValue[] {
    const program = parse(source);
    return this.interpret(program);
  }

  getComponents(): Map<string, any> {
    return this.components;
  }

  getState(): Map<string, SeedValue> {
    return this.state;
  }

  getEventListeners(): Map<string, Function[]> {
    return this.eventListeners;
  }
}
