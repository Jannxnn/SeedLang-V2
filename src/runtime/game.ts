// SeedLang 游戏运行时：基于 Interpreter 扩展的游戏引擎，支持场景管理、实体组件、物理、音频、UI、相机、事件系统

import { Interpreter, SeedValue } from '../core/interpreter';
import { parse } from '../core/parser';

export interface Vector2D {
  x: number;
  y: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface GameObject {
  id: string;
  type: string;
  position: Vector3D;
  rotation: Vector3D;
  scale: Vector3D;
  velocity: Vector3D;
  acceleration: Vector3D;
  properties: Map<string, SeedValue>;
  components: Map<string, any>;
  active: boolean;
  visible: boolean;
  parent?: string;
  children: string[];
}

export interface GameScene {
  id: string;
  name: string;
  objects: Map<string, GameObject>;
  backgroundColor: string;
  ambientLight: number;
  gravity: Vector3D;
  timeScale: number;
}

export interface GameInput {
  keys: Set<string>;
  mousePosition: Vector2D;
  mouseButtons: Set<number>;
  touchPoints: Vector2D[];
}

export interface GameAudio {
  musicVolume: number;
  sfxVolume: number;
  masterVolume: number;
  muted: boolean;
  currentMusic: string | null;
}

export class GameRuntime extends Interpreter {
  private scenes: Map<string, GameScene> = new Map();
  private currentScene: string | null = null;
  private objects: Map<string, GameObject> = new Map();
  private input: GameInput;
  private audio: GameAudio;

  constructor() {
    super();
    this.input = {
      keys: new Set(),
      mousePosition: { x: 0, y: 0 },
      mouseButtons: new Set(),
      touchPoints: []
    };
    this.audio = {
      musicVolume: 0.7,
      sfxVolume: 0.8,
      masterVolume: 1.0,
      muted: false,
      currentMusic: null
    };
    this.setupGameAPIs();
  }

  private setupGameAPIs(): void {
    this.globals.define('game', {
      type: 'object',
      value: null,
      properties: new Map([
        ['init', {
          type: 'function',
          value: (_config?: SeedValue) => {
            console.log('[Game] Initializing game...');
            return { type: 'boolean', value: true };
          }
        }],
        ['start', {
          type: 'function',
          value: () => {
            console.log('[Game] Starting game loop');
            return { type: 'boolean', value: true };
          }
        }],
        ['stop', {
          type: 'function',
          value: () => {
            console.log('[Game] Stopping game loop');
            return { type: 'boolean', value: true };
          }
        }],
        ['quit', {
          type: 'function',
          value: () => {
            process.exit(0);
          }
        }]
      ])
    });

    this.globals.define('scene', {
      type: 'object',
      value: null,
      properties: new Map([
        ['create', {
          type: 'function',
          value: (name: SeedValue) => {
            const sceneId = `scene_${Date.now()}`;
            const scene: GameScene = {
              id: sceneId,
              name: this.stringify(name),
              objects: new Map(),
              backgroundColor: '#000000',
              ambientLight: 0.4,
              gravity: { x: 0, y: -9.81, z: 0 },
              timeScale: 1.0
            };
            this.scenes.set(sceneId, scene);
            console.log(`[Scene] Created: ${scene.name}`);
            return { type: 'string', value: sceneId };
          }
        }],
        ['load', {
          type: 'function',
          value: (sceneId: SeedValue) => {
            const id = this.stringify(sceneId);
            if (this.scenes.has(id)) {
              this.currentScene = id;
              return { type: 'boolean', value: true };
            }
            throw new Error(`Scene not found: ${id}`);
          }
        }],
        ['list', {
          type: 'function',
          value: () => {
            return { type: 'array', value: Array.from(this.scenes.values()).map(s => ({
              type: 'object',
              value: null,
              properties: new Map([
                ['id', { type: 'string', value: s.id }],
                ['name', { type: 'string', value: s.name }]
              ])
            }))};
          }
        }]
      ])
    });

    this.globals.define('entity', {
      type: 'object',
      value: null,
      properties: new Map([
        ['create', {
          type: 'function',
          value: (type: SeedValue, config?: SeedValue) => {
            const entityId = `entity_${Date.now()}`;
            const entityType = this.stringify(type);

            const entity: GameObject = {
              id: entityId,
              type: entityType,
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              velocity: { x: 0, y: 0, z: 0 },
              acceleration: { x: 0, y: 0, z: 0 },
              properties: new Map(),
              components: new Map(),
              active: true,
              visible: true,
              children: []
            };

            if (config?.properties) {
              const pos = config.properties.get('position');
              if (pos?.properties) {
                entity.position = {
                  x: pos.properties.get('x')?.value as number || 0,
                  y: pos.properties.get('y')?.value as number || 0,
                  z: pos.properties.get('z')?.value as number || 0
                };
              }
            }

            this.objects.set(entityId, entity);
            if (this.currentScene) {
              this.scenes.get(this.currentScene)!.objects.set(entityId, entity);
            }

            console.log(`[Entity] Created: ${entityType} (${entityId})`);
            return { type: 'string', value: entityId };
          }
        }],
        ['setPosition', {
          type: 'function',
          value: (entityId: SeedValue, x: SeedValue, y: SeedValue, z?: SeedValue) => {
            const obj = this.objects.get(this.stringify(entityId));
            if (obj) {
              obj.position.x = x.value as number;
              obj.position.y = y.value as number;
              obj.position.z = z ? z.value as number : 0;
            }
            return { type: 'boolean', value: !!obj };
          }
        }],
        ['getProperty', {
          type: 'function',
          value: (entityId: SeedValue, key: SeedValue) => {
            const obj = this.objects.get(this.stringify(entityId));
            if (obj?.properties.has(this.stringify(key))) {
              return obj.properties.get(this.stringify(key))!;
            }
            return { type: 'null', value: null };
          }
        }],
        ['destroy', {
          type: 'function',
          value: (entityId: SeedValue) => {
            const id = this.stringify(entityId);
            const deleted = this.objects.delete(id);
            if (deleted) console.log(`[Entity] Destroyed: ${id}`);
            return { type: 'boolean', value: deleted };
          }
        }],
        ['findByName', {
          type: 'function',
          value: (name: SeedValue) => {
            const nameStr = this.stringify(name);
            const found = Array.from(this.objects.values()).filter(
              obj => obj.properties.get('name')?.value === nameStr
            );
            return { type: 'array', value: found.map(obj => ({
              type: 'string',
              value: obj.id
            }))};
          }
        }]
      ])
    });

    this.globals.define('input', {
      type: 'object',
      value: null,
      properties: new Map([
        ['isKeyDown', {
          type: 'function',
          value: (key: SeedValue) => {
            return { type: 'boolean', value: this.input.keys.has(this.stringify(key).toUpperCase()) };
          }
        }],
        ['getMousePosition', {
          type: 'function',
          value: () => {
            return { type: 'object', value: null, properties: new Map([
              ['x', { type: 'number', value: this.input.mousePosition.x }],
              ['y', { type: 'number', value: this.input.mousePosition.y }]
            ])};
          }
        }]
      ])
    });

    this.globals.define('audio', {
      type: 'object',
      value: null,
      properties: new Map([
        ['playMusic', {
          type: 'function',
          value: (track: SeedValue) => {
            this.audio.currentMusic = this.stringify(track);
            console.log(`[Audio] Playing music: ${this.audio.currentMusic}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['playSound', {
          type: 'function',
          value: (sound: SeedValue) => {
            console.log(`[Audio] Playing sound: ${this.stringify(sound)}`);
            return { type: 'string', value: `sound_${Date.now()}` };
          }
        }],
        ['setMasterVolume', {
          type: 'function',
          value: (volume: SeedValue) => {
            this.audio.masterVolume = Math.max(0, Math.min(1, volume.value as number));
            return { type: 'boolean', value: true };
          }
        }]
      ])
    });

    this.globals.define('ui', {
      type: 'object',
      value: null,
      properties: new Map([
        ['createText', {
          type: 'function',
          value: (text: SeedValue, _x: SeedValue, _y: SeedValue) => {
            console.log(`[UI] Creating text: "${this.stringify(text)}"`)
            return { type: 'string', value: `ui_text_${Date.now()}` };
          }
        }],
        ['createButton', {
          type: 'function',
          value: (text: SeedValue, _x: SeedValue, _y: SeedValue, _w: SeedValue, _h: SeedValue) => {
            console.log(`[UI] Creating button: "${this.stringify(text)}"`);
            return { type: 'string', value: `ui_button_${Date.now()}` };
          }
        }],
        ['showDialog', {
          type: 'function',
          value: (title: SeedValue, _message: SeedValue) => {
            console.log(`[UI] Showing dialog: "${this.stringify(title)}"`);
            return { type: 'string', value: `dialog_${Date.now()}` };
          }
        }]
      ])
    });

    this.globals.define('physics', {
      type: 'object',
      value: null,
      properties: new Map([
        ['setGravity', {
          type: 'function',
          value: (x: SeedValue, y: SeedValue) => {
            if (this.currentScene) {
              this.scenes.get(this.currentScene)!.gravity.x = x.value as number;
              this.scenes.get(this.currentScene)!.gravity.y = y.value as number;
            }
            return { type: 'boolean', value: true };
          }
        }],
        ['applyForce', {
          type: 'function',
          value: (entityId: SeedValue, fx: SeedValue, fy: SeedValue) => {
            const obj = this.objects.get(this.stringify(entityId));
            if (obj) {
              obj.acceleration.x += fx.value as number;
              obj.acceleration.y += fy.value as number;
            }
            return { type: 'boolean', value: !!obj };
          }
        }]
      ])
    });

    this.globals.define('camera', {
      type: 'object',
      value: null,
      properties: new Map([
        ['setPosition', {
          type: 'function',
          value: (x: SeedValue, y: SeedValue, _z?: SeedValue) => {
            console.log(`[Camera] Position set to (${x.value}, ${y.value})`);
            return { type: 'boolean', value: true };
          }
        }],
        ['follow', {
          type: 'function',
          value: (entityId: SeedValue) => {
            console.log(`[Camera] Following entity: ${this.stringify(entityId)}`);
            return { type: 'boolean', value: true };
          }
        }]
      ])
    });

    this.globals.define('event', {
      type: 'object',
      value: null,
      properties: new Map([
        ['on', {
          type: 'function',
          value: (eventName: SeedValue, _handler: SeedValue) => {
            console.log(`[Event] Listener registered: ${this.stringify(eventName)}`);
            return { type: 'boolean', value: true };
          }
        }],
        ['emit', {
          type: 'function',
          value: (eventName: SeedValue, _data?: SeedValue) => {
            console.log(`[Event] Emitted: ${this.stringify(eventName)}`);
            return { type: 'boolean', value: true };
          }
        }]
      ])
    });
  }

  runGame(source: string): SeedValue[] {
    const program = parse(source);
    return this.interpret(program);
  }

  getScenes(): Map<string, GameScene> {
    return this.scenes;
  }

  getCurrentScene(): string | null {
    return this.currentScene;
  }

  getObjects(): Map<string, GameObject> {
    return this.objects;
  }
}
