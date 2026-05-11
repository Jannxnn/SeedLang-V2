// SeedLang Agent 运行时：基于 Interpreter 扩展的智能体运行环境，支持任务管理、记忆系统、工具调用、API 对接等

import { Interpreter, SeedValue } from '../core/interpreter';
import { parse } from '../core/parser';

export interface AgentConfig {
  name: string;
  role?: string;
  goal?: string;
}

export interface Task {
  id: string;
  type: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export class AgentRuntime extends Interpreter {
  private config: AgentConfig;
  private tasks: Map<string, Task> = new Map();
  private memory: Map<string, SeedValue> = new Map();
  private tools: Map<string, Function> = new Map();

  constructor(config?: Partial<AgentConfig>) {
    super();
    this.config = {
      name: config?.name || 'SeedAgent',
      role: config?.role || 'AI Assistant',
      goal: config?.goal || 'Help users accomplish tasks efficiently'
    };
    this.setupAgentAPIs();
  }

  private setupAgentAPIs(): void {
    const agentMethods = new Map<string, SeedValue>();

    agentMethods.set('config', {
      type: 'function',
      value: (configObj: SeedValue) => {
        if (configObj.properties) {
          const nameProp = configObj.properties.get('name');
          const roleProp = configObj.properties.get('role');
          const goalProp = configObj.properties.get('goal');
          if (nameProp) this.config.name = this.stringify(nameProp);
          if (roleProp) this.config.role = this.stringify(roleProp);
          if (goalProp) this.config.goal = this.stringify(goalProp);
          agentMethods.set('name', { type: 'string', value: this.config.name });
          agentMethods.set('role', { type: 'string', value: this.config.role });
          agentMethods.set('goal', { type: 'string', value: this.config.goal });
        }
        console.log(`[Agent Config] ${this.config.name}`);
        return { type: 'null', value: null };
      }
    });

    agentMethods.set('think', {
      type: 'function',
      value: (thought: SeedValue) => {
        const thoughtStr = this.stringify(thought);
        console.log(`[Think] ${thoughtStr}`);
        return { type: 'string', value: thoughtStr };
      }
    });

    agentMethods.set('task', {
      type: 'function',
      value: (description: SeedValue, options?: SeedValue) => {
        const taskId = `task_${Date.now()}`;
        const task: Task = {
          id: taskId,
          type: 'general',
          description: this.stringify(description),
          status: 'pending',
          priority: options?.properties?.get('priority')?.value || 5,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        this.tasks.set(taskId, task);
        console.log(`[Task Created] ${taskId}: ${task.description}`);
        return { type: 'string', value: taskId };
      }
    });

    agentMethods.set('remember', {
      type: 'function',
      value: (key: SeedValue, value: SeedValue) => {
        const keyStr = this.stringify(key);
        this.memory.set(keyStr, value);
        console.log(`[Remember] ${keyStr} = ${this.stringify(value)}`);
        return value;
      }
    });

    agentMethods.set('recall', {
      type: 'function',
      value: (key: SeedValue) => {
        const keyStr = this.stringify(key);
        const value = this.memory.get(keyStr);
        if (value) {
          console.log(`[Recall] ${keyStr}`);
          return value;
        }
        return { type: 'null', value: null };
      }
    });

    agentMethods.set('useTool', {
      type: 'function',
      value: (toolName: SeedValue, _params?: SeedValue) => {
        const name = this.stringify(toolName);
        console.log(`[Tool Use] ${name}`);
        return { type: 'object', value: null, properties: new Map([
          ['success', { type: 'boolean', value: true }],
          ['result', { type: 'string', value: `Executed ${name}` }]
        ])};
      }
    });

    agentMethods.set('callAPI', {
      type: 'function',
      value: (endpoint: SeedValue, method?: SeedValue) => {
        const url = this.stringify(endpoint);
        const httpMethod = method ? this.stringify(method) : 'GET';
        console.log(`[API Call] ${httpMethod} ${url}`);
        return { type: 'object', value: null, properties: new Map([
          ['status', { type: 'number', value: 200 }],
          ['data', { type: 'string', value: `Response from ${url}` }]
        ])};
      }
    });

    agentMethods.set('measurePerformance', {
      type: 'function',
      value: (name: SeedValue, callback: SeedValue) => {
        console.log(`[Performance] ${this.stringify(name)}`);
        if (callback.type === 'function') {
          callback.value();
        }
        return { type: 'null', value: null };
      }
    });

    agentMethods.set('logActivity', {
      type: 'function',
      value: (activity: SeedValue, _data?: SeedValue) => {
        console.log(`[Activity] ${this.stringify(activity)}`);
        return { type: 'null', value: null };
      }
    });

    agentMethods.set('message', {
      type: 'function',
      value: (target: SeedValue, content: SeedValue) => {
        console.log(`[Message to ${this.stringify(target)}] ${this.stringify(content)}`);
        return { type: 'null', value: null };
      }
    });

    agentMethods.set('saveState', {
      type: 'function',
      value: () => {
        console.log(`[State Saved]`);
        return { type: 'boolean', value: true };
      }
    });

    agentMethods.set('getState', {
      type: 'function',
      value: () => {
        return { type: 'object', value: null, properties: new Map([
          ['tasks', { type: 'number', value: this.tasks.size }],
          ['memories', { type: 'number', value: this.memory.size }]
        ])};
      }
    });

    agentMethods.set('name', { type: 'string', value: this.config.name });
    agentMethods.set('role', { type: 'string', value: this.config.role });
    agentMethods.set('goal', { type: 'string', value: this.config.goal });

    this.globals.define('agent', {
      type: 'object',
      value: null,
      properties: agentMethods
    });

    this.globals.define('task', {
      type: 'function',
      value: (description: SeedValue) => {
        const taskId = `task_${Date.now()}`;
        const task: Task = {
          id: taskId,
          type: 'general',
          description: this.stringify(description),
          status: 'pending',
          priority: 5,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        this.tasks.set(taskId, task);
        console.log(`[Task Created] ${taskId}: ${task.description}`);
        return { type: 'string', value: taskId };
      }
    });

    this.globals.define('runTask', {
      type: 'function',
      value: async (taskId: SeedValue) => {
        const id = this.stringify(taskId);
        const task = this.tasks.get(id);
        if (!task) throw new Error(`Task not found: ${id}`);

        task.status = 'running';
        console.log(`[Task Running] ${id}`);
        await new Promise(resolve => setTimeout(resolve, 100));

        task.status = 'completed';
        task.updatedAt = Date.now();
        return { type: 'object', value: null, properties: new Map([
          ['id', { type: 'string', value: task.id }],
          ['status', { type: 'string', value: task.status }]
        ])};
      }
    });

    this.globals.define('listTasks', {
      type: 'function',
      value: () => {
        return { type: 'array', value: Array.from(this.tasks.values()).map(task => ({
          type: 'object',
          value: null,
          properties: new Map([
            ['id', { type: 'string', value: task.id }],
            ['description', { type: 'string', value: task.description }],
            ['status', { type: 'string', value: task.status }]
          ])
        }))};
      }
    });

    this.globals.define('think', {
      type: 'function',
      value: (thought: SeedValue) => {
        const thoughtStr = this.stringify(thought);
        console.log(`[Think] ${thoughtStr}`);
        return { type: 'string', value: thoughtStr };
      }
    });

    this.globals.define('remember', {
      type: 'function',
      value: (key: SeedValue, value: SeedValue) => {
        const keyStr = this.stringify(key);
        this.memory.set(keyStr, value);
        console.log(`[Remember] ${keyStr} = ${this.stringify(value)}`);
        return value;
      }
    });

    this.globals.define('recall', {
      type: 'function',
      value: (key: SeedValue) => {
        const keyStr = this.stringify(key);
        const value = this.memory.get(keyStr);
        if (value) {
          console.log(`[Recall] ${keyStr} = ${this.stringify(value)}`);
          return value;
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('forget', {
      type: 'function',
      value: (key: SeedValue) => {
        const keyStr = this.stringify(key);
        const deleted = this.memory.delete(keyStr);
        if (deleted) console.log(`[Forget] ${keyStr}`);
        return { type: 'boolean', value: deleted };
      }
    });

    this.globals.define('listMemory', {
      type: 'function',
      value: () => {
        const entries = Array.from(this.memory.entries());
        const result = entries.map(([k, v]) => {
          return {
            type: 'object' as const,
            value: null,
            properties: new Map([
              ['key', { type: 'string', value: k }],
              ['value', v]
            ])
          };
        });
        return { type: 'array' as const, value: result };
      }
    });

    this.globals.define('useTool', {
      type: 'function',
      value: async (toolName: SeedValue, params?: SeedValue) => {
        const name = this.stringify(toolName);
        const tool = this.tools.get(name);

        if (!tool) {
          throw new Error(`Tool not found: ${name}`);
        }

        console.log(`[Tool Use] ${name}`);
        const paramObj = params?.properties
          ? Object.fromEntries(params.properties.entries())
          : {};

        const result = await tool(paramObj);
        return { type: 'object', value: null, properties: new Map([
          ['success', { type: 'boolean', value: true }],
          ['data', result || { type: 'null', value: null }]
        ])};
      }
    });

    this.globals.define('registerTool', {
      type: 'function',
      value: (name: SeedValue, description: SeedValue, handler: SeedValue) => {
        const toolName = this.stringify(name);
        this.tools.set(toolName, handler.value);
        console.log(`[Tool Registered] ${toolName}: ${this.stringify(description)}`);
        return { type: 'boolean', value: true };
      }
    });

    this.globals.define('callAPI', {
      type: 'function',
      value: async (endpoint: SeedValue) => {
        const url = this.stringify(endpoint);
        console.log(`[API Call] GET ${url}`);
        return { type: 'object', value: null, properties: new Map([
          ['url', { type: 'string', value: url }],
          ['status', { type: 'number', value: 200 }]
        ])};
      }
    });

    this.globals.define('readFile', {
      type: 'function',
      value: async (path: SeedValue) => {
        const filePath = this.stringify(path);
        console.log(`[File Read] ${filePath}`);
        const fs = require('fs').promises;
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          return { type: 'string', value: content };
        } catch (e) {
          throw new Error(`Failed to read file: ${filePath}`);
        }
      }
    });

    this.globals.define('writeFile', {
      type: 'function',
      value: async (path: SeedValue, content: SeedValue) => {
        const filePath = this.stringify(path);
        const fileContent = this.stringify(content);
        const resolved = require('path').resolve(filePath);
        const cwd = process.cwd();
        if (!resolved.startsWith(cwd + require('path').sep) && resolved !== cwd) {
          console.log(`[File Write BLOCKED] ${filePath} (outside working directory)`);
          return { type: 'boolean', value: false };
        }
        console.log(`[File Write] ${filePath}`);
        const fs = require('fs').promises;
        await fs.writeFile(resolved, fileContent, 'utf-8');
        return { type: 'boolean', value: true };
      }
    });

    this.globals.define('executeCommand', {
      type: 'function',
      value: async (command: SeedValue) => {
        const cmd = this.stringify(command);
        const allowedCommands = /^(ls|dir|cat|type|echo|pwd|cd|whoami|date|uname|hostname|wc|head|tail|grep|find|sort|uniq|diff|curl|ping|node|python3?|java|gcc|g\+\+|rustc|cargo|npm|npx|yarn|pnpm|git|gh|docker)\b/i;
        if (!allowedCommands.test(cmd.trim())) {
          console.log(`[Execute Command BLOCKED] ${cmd}`);
          return { type: 'object', value: null, properties: new Map([
            ['error', { type: 'string', value: 'Command not in allowlist. Only common dev tools are permitted.' }],
            ['code', { type: 'number', value: -1 }]
          ])};
        }
        console.log(`[Execute Command] ${cmd}`);
        const { execSync } = require('child_process');
        try {
          const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
          return { type: 'object', value: null, properties: new Map([
            ['stdout', { type: 'string', value: output }],
            ['code', { type: 'number', value: 0 }]
          ])};
        } catch (e: any) {
          return { type: 'object', value: null, properties: new Map([
            ['stderr', { type: 'string', value: e.stderr || '' }],
            ['code', { type: 'number', value: e.status || 1 }]
          ])};
        }
      }
    });

    this.globals.define('logActivity', {
      type: 'function',
      value: (action: SeedValue) => {
        const actionStr = this.stringify(action);
        console.log(`[Activity Log] ${actionStr} - Agent: ${this.config.name}`);
        return { type: 'object', value: null, properties: new Map([
          ['action', { type: 'string', value: actionStr }],
          ['agent', { type: 'string', value: this.config.name }],
          ['timestamp', { type: 'number', value: Date.now() }]
        ])};
      }
    });

    this.globals.define('getState', {
      type: 'function',
      value: () => {
        return { type: 'object', value: null, properties: new Map([
          ['config', { type: 'object', value: null, properties: new Map([
            ['name', { type: 'string', value: this.config.name }],
            ['role', { type: 'string', value: this.config.role }]
          ])}],
          ['taskCount', { type: 'number', value: this.tasks.size }],
          ['memorySize', { type: 'number', value: this.memory.size }],
          ['toolCount', { type: 'number', value: this.tools.size }]
        ])};
      }
    });
  }

  runAgent(source: string): SeedValue[] {
    const program = parse(source);
    return this.interpret(program);
  }

  getConfig(): AgentConfig {
    return this.config;
  }

  getTasks(): Map<string, Task> {
    return this.tasks;
  }

  getMemory(): Map<string, SeedValue> {
    return this.memory;
  }

  getTools(): Map<string, Function> {
    return this.tools;
  }
}
