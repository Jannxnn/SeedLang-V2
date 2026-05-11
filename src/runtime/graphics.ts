// SeedLang 图形运行时：基于 Interpreter 扩展的终端 Canvas 渲染引擎，支持像素绘制、图形原语、精灵、动画与图表

import { Interpreter, SeedValue } from '../core/interpreter';
import { parse } from '../core/parser';

export interface Point {
  x: number;
  y: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export class GraphicsRuntime extends Interpreter {
  private canvas: string[][] = [];
  private width: number = 80;
  private height: number = 24;
  private currentColor: string = '█';
  private bgColor: string = ' ';

  constructor() {
    super();
    this.initCanvas();
    this.setupGraphicsAPIs();
  }

  private initCanvas(): void {
    this.canvas = [];
    for (let y = 0; y < this.height; y++) {
      this.canvas.push(new Array(this.width).fill(this.bgColor));
    }
  }

  private setupGraphicsAPIs(): void {
    this.globals.define('canvas', {
      type: 'object',
      value: null,
      properties: new Map([
        ['width', { type: 'number', value: this.width }],
        ['height', { type: 'number', value: this.height }]
      ])
    });

    this.globals.define('clearCanvas', {
      type: 'function',
      value: () => {
        this.initCanvas();
        return { type: 'null', value: null };
      }
    });

    this.globals.define('resize', {
      type: 'function',
      value: (w: SeedValue, h: SeedValue) => {
        this.width = w.value as number;
        this.height = h.value as number;
        this.initCanvas();
        return { type: 'null', value: null };
      }
    });

    this.globals.define('setColor', {
      type: 'function',
      value: (color: SeedValue) => {
        const colorStr = this.stringify(color);
        const colorMap: Record<string, string> = {
          'white': '█',
          'black': ' ',
          'red': '▓',
          'green': '▒',
          'blue': '░',
          'yellow': '▀',
          'cyan': '▄',
          'magenta': '▌',
          'gray': '╬',
          'light': '▐'
        };
        this.currentColor = colorMap[colorStr.toLowerCase()] || colorStr.charAt(0);
        return { type: 'null', value: null };
      }
    });

    this.globals.define('setPixel', {
      type: 'function',
      value: (x: SeedValue, y: SeedValue) => {
        const px = Math.floor(x.value as number);
        const py = Math.floor(y.value as number);
        if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
          this.canvas[py][px] = this.currentColor;
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('getPixel', {
      type: 'function',
      value: (x: SeedValue, y: SeedValue) => {
        const px = Math.floor(x.value as number);
        const py = Math.floor(y.value as number);
        if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
          return { type: 'string', value: this.canvas[py][px] };
        }
        return { type: 'string', value: ' ' };
      }
    });

    this.globals.define('drawLine', {
      type: 'function',
      value: (x1: SeedValue, y1: SeedValue, x2: SeedValue, y2: SeedValue) => {
        this.drawLineBresenham(
          x1.value as number, y1.value as number,
          x2.value as number, y2.value as number
        );
        return { type: 'null', value: null };
      }
    });

    this.globals.define('drawRect', {
      type: 'function',
      value: (x: SeedValue, y: SeedValue, w: SeedValue, h: SeedValue) => {
        const px = Math.floor(x.value as number);
        const py = Math.floor(y.value as number);
        const pw = Math.floor(w.value as number);
        const ph = Math.floor(h.value as number);
        
        for (let i = 0; i < pw; i++) {
          this.setPixelAt(px + i, py);
          this.setPixelAt(px + i, py + ph - 1);
        }
        for (let i = 0; i < ph; i++) {
          this.setPixelAt(px, py + i);
          this.setPixelAt(px + pw - 1, py + i);
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('fillRect', {
      type: 'function',
      value: (x: SeedValue, y: SeedValue, w: SeedValue, h: SeedValue) => {
        const px = Math.floor(x.value as number);
        const py = Math.floor(y.value as number);
        const pw = Math.floor(w.value as number);
        const ph = Math.floor(h.value as number);
        
        for (let dy = 0; dy < ph; dy++) {
          for (let dx = 0; dx < pw; dx++) {
            this.setPixelAt(px + dx, py + dy);
          }
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('drawCircle', {
      type: 'function',
      value: (cx: SeedValue, cy: SeedValue, r: SeedValue) => {
        this.drawCircleMidpoint(
          cx.value as number, cy.value as number, r.value as number
        );
        return { type: 'null', value: null };
      }
    });

    this.globals.define('fillCircle', {
      type: 'function',
      value: (cx: SeedValue, cy: SeedValue, r: SeedValue) => {
        const centerX = cx.value as number;
        const centerY = cy.value as number;
        const radius = r.value as number;
        
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy <= radius * radius) {
              this.setPixelAt(Math.floor(centerX + dx), Math.floor(centerY + dy));
            }
          }
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('drawText', {
      type: 'function',
      value: (x: SeedValue, y: SeedValue, text: SeedValue) => {
        const px = Math.floor(x.value as number);
        const py = Math.floor(y.value as number);
        const txt = this.stringify(text);
        
        for (let i = 0; i < txt.length; i++) {
          if (px + i < this.width && py >= 0 && py < this.height) {
            this.canvas[py][px + i] = txt[i];
          }
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('render', {
      type: 'function',
      value: () => {
        console.log('\n' + '='.repeat(this.width + 2));
        for (const row of this.canvas) {
          console.log('|' + row.join('') + '|');
        }
        console.log('='.repeat(this.width + 2) + '\n');
        return { type: 'null', value: null };
      }
    });

    this.globals.define('drawSprite', {
      type: 'function',
      value: (x: SeedValue, y: SeedValue, sprite: SeedValue) => {
        const px = Math.floor(x.value as number);
        const py = Math.floor(y.value as number);
        const rows = sprite.value as any[];
        
        for (let dy = 0; dy < rows.length; dy++) {
          const row = rows[dy].value as string;
          for (let dx = 0; dx < row.length; dx++) {
            if (row[dx] !== ' ' && row[dx] !== '·') {
              this.setPixelAt(px + dx, py + dy, row[dx]);
            }
          }
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('animate', {
      type: 'function',
      value: (frames: SeedValue, delay: SeedValue) => {
        const frameList = frames.value as any[];
        const delayMs = delay.value as number;
        
        console.log('\n[Animation started]');
        for (let i = 0; i < frameList.length; i++) {
          const frame = frameList[i].value as string;
          console.log('\x1b[2J\x1b[H' + frame);
          this.sleep(delayMs);
        }
        console.log('[Animation ended]\n');
        return { type: 'null', value: null };
      }
    });

    this.globals.define('imageToAscii', {
      type: 'function',
      value: (data: SeedValue) => {
        const chars = ' .:-=+*#%@';
        const pixels = data.value as any[];
        let result = '';
        
        for (const row of pixels) {
          let line = '';
          for (const pixel of row.value) {
            const val = pixel.value as number;
            const charIndex = Math.floor(val / 256 * chars.length);
            line += chars[Math.min(charIndex, chars.length - 1)];
          }
          result += line + '\n';
        }
        
        return { type: 'string', value: result };
      }
    });

    this.globals.define('chart', {
      type: 'function',
      value: (data: SeedValue, _options?: SeedValue) => {
        const values = data.value as any[];
        const maxVal = Math.max(...values.map(v => v.value as number));
        const chartHeight = 10;
        
        console.log('\n+' + '-'.repeat(values.length * 3) + '+');
        
        for (let h = chartHeight; h > 0; h--) {
          let line = '|';
          for (const val of values) {
            const height = Math.floor((val.value as number) / maxVal * chartHeight);
            if (height >= h) {
              line += '###';
            } else if (height >= h - 0.5) {
              line += '---';
            } else {
              line += '   ';
            }
          }
          console.log(line + '|');
        }
        
        console.log('+' + '-'.repeat(values.length * 3) + '+');
        
        let labels = ' ';
        for (let i = 0; i < values.length; i++) {
          labels += ` ${i + 1} `;
        }
        console.log(labels + '\n');
        
        return { type: 'null', value: null };
      }
    });

    this.globals.define('progressBar', {
      type: 'function',
      value: (value: SeedValue, max: SeedValue, width: SeedValue) => {
        const val = value.value as number;
        const maxVal = max.value as number;
        const w = width.value as number;
        
        const percent = val / maxVal;
        const filled = Math.floor(percent * w);
        const empty = w - filled;
        
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        const display = `[${bar}] ${(percent * 100).toFixed(1)}%`;
        
        console.log(display);
        return { type: 'string', value: display };
      }
    });

    this.globals.define('drawBox', {
      type: 'function',
      value: (x: SeedValue, y: SeedValue, w: SeedValue, h: SeedValue, title?: SeedValue) => {
        const px = Math.floor(x.value as number);
        const py = Math.floor(y.value as number);
        const pw = Math.floor(w.value as number);
        const ph = Math.floor(h.value as number);
        const titleText = title ? this.stringify(title) : '';
        
        const top = '+' + '='.repeat(pw - 2) + '+';
        const mid = '|' + ' '.repeat(pw - 2) + '|';
        const bottom = '+' + '='.repeat(pw - 2) + '+';
        
        this.drawTextAt(px, py, top);
        if (titleText) {
          this.drawTextAt(px + 2, py, titleText.substring(0, pw - 4));
        }
        for (let i = 1; i < ph - 1; i++) {
          this.drawTextAt(px, py + i, mid);
        }
        this.drawTextAt(px, py + ph - 1, bottom);
        
        return { type: 'null', value: null };
      }
    });
  }

  private setPixelAt(x: number, y: number, char?: string): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.canvas[y][x] = char || this.currentColor;
    }
  }

  private drawTextAt(x: number, y: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
      if (x + i < this.width && y >= 0 && y < this.height) {
        this.canvas[y][x + i] = text[i];
      }
    }
  }

  private drawLineBresenham(x1: number, y1: number, x2: number, y2: number): void {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (true) {
      this.setPixelAt(x, y);

      if (x === x2 && y === y2) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  private drawCircleMidpoint(cx: number, cy: number, r: number): void {
    let x = r;
    let y = 0;
    let p = 1 - r;

    while (x >= y) {
      this.setPixelAt(cx + x, cy + y);
      this.setPixelAt(cx - x, cy + y);
      this.setPixelAt(cx + x, cy - y);
      this.setPixelAt(cx - x, cy - y);
      this.setPixelAt(cx + y, cy + x);
      this.setPixelAt(cx - y, cy + x);
      this.setPixelAt(cx + y, cy - x);
      this.setPixelAt(cx - y, cy - x);

      y++;
      if (p <= 0) {
        p = p + 2 * y + 1;
      } else {
        x--;
        p = p + 2 * y - 2 * x + 1;
      }
    }
  }

  private sleep(ms: number): void {
    const start = Date.now();
    while (Date.now() - start < ms) {}
  }

  runGraphics(source: string): SeedValue[] {
    const program = parse(source);
    return this.interpret(program);
  }
}
