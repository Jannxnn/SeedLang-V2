import { Token, TokenType } from './ast';

export class LexerError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(`Lexer Error at ${line}:${column} - ${message}`);
    this.name = 'LexerError';
  }
}

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const char = this.source[this.pos];

      if (char === '!' && this.peek(1) === '=') {
        this.tokens.push(this.readComparison());
      } else if (char === '!') {
        const startLine = this.line;
        const startColumn = this.column;
        this.advance();
        this.tokens.push({ type: TokenType.NOT, value: '!', line: startLine, column: startColumn });
      } else if (char === '#') {
        this.tokens.push(this.readSpecialToken());
      } else if (char === '@') {
        this.tokens.push({ type: TokenType.AT, value: '@', line: this.line, column: this.column });
        this.advance();
      } else if (char === '"') {
        this.tokens.push(this.readString());
      } else if (char === "'") {
        this.tokens.push(this.readStringSingle());
      } else if (char === '`') {
        this.tokens.push(this.readStringTemplate());
      } else if (char === '?') {
        this.tokens.push(this.readOperator());
      } else if (char === '-' && this.peek(1) === '>') {
        this.tokens.push({ type: TokenType.ARROW, value: '->', line: this.line, column: this.column });
        this.advance();
        this.advance();
      } else if (char === ':' || char === '(' || char === ')' || char === '{' || char === '}') {
        this.tokens.push(this.readPunctuation());
      } else if (char === ';') {
        this.tokens.push({ type: TokenType.SEMICOLON, value: ';', line: this.line, column: this.column });
        this.advance();
      } else if (char === '|') {
        this.tokens.push(this.readPipeOrBitwise());
      } else if (char === '[' || char === ']') {
        this.tokens.push(this.readBracket());
      } else if (char === ',') {
        this.tokens.push({ type: TokenType.COMMA, value: ',', line: this.line, column: this.column });
        this.advance();
      } else if (char === '.' && this.peek(1) === '.' && this.peek(2) === '.') {
        this.tokens.push({ type: TokenType.SPREAD, value: '...', line: this.line, column: this.column });
        this.advance();
        this.advance();
        this.advance();
      } else if (char === '.' && this.peek(1) === '.') {
        this.tokens.push({ type: TokenType.RANGE, value: '..', line: this.line, column: this.column });
        this.advance();
        this.advance();
      } else if (char === '.') {
        this.tokens.push({ type: TokenType.DOT, value: '.', line: this.line, column: this.column });
        this.advance();
      } else if (char === '+' || char === '-') {
        this.tokens.push(this.readArithmeticOp());
      } else if (char === '*' || char === '/' || char === '%') {
        const startCol = this.column;
        this.advance();
        if (this.peek() === '=') {
          this.advance();
          const ttype = char === '*' ? TokenType.STAR_ASSIGN : (char === '/' ? TokenType.SLASH_ASSIGN : TokenType.PERCENT_ASSIGN);
          this.tokens.push({ type: ttype, value: char + '=', line: this.line, column: startCol });
        } else {
          const ttype = char === '*' ? TokenType.STAR : (char === '/' ? TokenType.SLASH : TokenType.PERCENT);
          this.tokens.push({ type: ttype, value: char, line: this.line, column: startCol });
        }
      } else if (char === '=' && this.peek(1) === '>') {
        this.tokens.push({ type: TokenType.ARROW, value: '=>', line: this.line, column: this.column });
        this.advance();
        this.advance();
      } else if (char === '=') {
        this.tokens.push(this.readComparison());
      } else if (char === '&' || char === '^' || char === '~') {
        this.tokens.push(this.readBitwise());
      } else if (char === '<' || char === '>') {
        this.tokens.push(this.readRelational());
      } else if (/[a-zA-Z_\p{L}]/u.test(char)) {
        this.tokens.push(this.readIdentifierOrKeyword());
      } else if (/[0-9]/.test(char)) {
        this.tokens.push(this.readNumber());
      } else {
        throw new LexerError(`Unexpected character: '${char}'`, this.line, this.column);
      }
    }

    this.tokens.push({ type: TokenType.EOF, value: '', line: this.line, column: this.column });
    return this.tokens;
  }

  private advance(): void {
    if (this.pos < this.source.length) {
      if (this.source[this.pos] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.pos++;
    }
  }

  private peek(offset: number = 0): string {
    return this.source[this.pos + offset] || '';
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const char = this.source[this.pos];
      if (/\s/.test(char)) {
        // 跳过所有空白字符（包括换行）
        this.advance();
      } else if (char === '/' && this.peek(1) === '/') {
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
          this.advance();
        }
      } else if (char === '/' && this.peek(1) === '*') {
        this.advance();
        this.advance();
        while (this.pos < this.source.length && !(this.source[this.pos - 1] === '*' && this.source[this.pos] === '/')) {
          this.advance();
        }
        if (this.pos < this.source.length) this.advance();
      } else {
        break;
      }
    }
  }

  private readSpecialToken(): Token {
    const startCol = this.column;
    this.advance();

    const typeChar = this.source[this.pos];
    this.advance();

    let value = '';
    if (typeChar === 'v' || typeChar === 'n' || typeChar === 't') {
      while (this.pos < this.source.length && /[a-zA-Z0-9]/.test(this.source[this.pos])) {
        value += this.source[this.pos];
        this.advance();
      }
    }

    const tokenValue = `#${typeChar}${value}`;
    let tokenType: TokenType;

    switch (typeChar) {
      case 'v':
        tokenType = TokenType.VERB;
        break;
      case 'n':
        tokenType = TokenType.NOUN;
        break;
      case 't':
        tokenType = TokenType.TEXT;
        break;
      default:
        throw new LexerError(`Unknown special token type: #${typeChar}`, this.line, startCol);
    }

    return { type: tokenType, value: tokenValue, line: this.line, column: startCol };
  }

  private readString(): Token {
    const startCol = this.column;
    this.advance();

    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === '\\') {
        this.advance();
        const escaped = this.source[this.pos];
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case '"': value += '"'; break;
          case '\\': value += '\\'; break;
          default: value += escaped;
        }
      } else {
        value += this.source[this.pos];
      }
      this.advance();
    }

    if (this.pos >= this.source.length) {
      throw new LexerError('Unterminated string literal', this.line, startCol);
    }

    this.advance(); // 跳过结束的 "
    
    return { 
      type: TokenType.STRING_LITERAL, 
      value, 
      line: this.line, 
      column: startCol 
    };
  }

  private readStringSingle(): Token {
    const startCol = this.column;
    this.advance();

    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== "'") {
      if (this.source[this.pos] === '\\') {
        this.advance();
        const escaped = this.source[this.pos];
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case "'": value += "'"; break;
          case '\\': value += '\\'; break;
          default: value += escaped;
        }
      } else {
        value += this.source[this.pos];
      }
      this.advance();
    }

    if (this.pos >= this.source.length) {
      throw new LexerError('Unterminated string literal', this.line, startCol);
    }

    this.advance(); // 跳过结束的 '
    
    return { 
      type: TokenType.STRING_LITERAL, 
      value, 
      line: this.line, 
      column: startCol 
    };
  }

  private readStringTemplate(): Token {
    const startCol = this.column;
    const startLine = this.line;
    this.advance();

    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '`') {
      if (this.source[this.pos] === '\\') {
        this.advance();
        const escaped = this.source[this.pos];
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case '`': value += '`'; break;
          case '\\': value += '\\'; break;
          case '$': value += '$'; break;
          default: value += escaped;
        }
      } else {
        value += this.source[this.pos];
      }
      this.advance();
    }

    if (this.pos >= this.source.length) {
      throw new LexerError('Unterminated template literal', startLine, startCol);
    }

    this.advance(); // 跳过结束的 `
    
    return { 
      type: TokenType.STRING_LITERAL, 
      value, 
      line: startLine, 
      column: startCol 
    };
  }

  private readOperator(): Token {
    const char = this.source[this.pos];
    const startCol = this.column;

    if (char === '?') {
      this.advance();
      return { type: TokenType.QUESTION, value: '?', line: this.line, column: startCol };
    }

    if (char === '>') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        return { type: TokenType.GTE, value: '>=', line: this.line, column: startCol };
      }
      return { type: TokenType.GT, value: '>', line: this.line, column: startCol };
    }

    throw new LexerError(`Unexpected operator: ${char}`, this.line, startCol);
  }

  private readPunctuation(): Token {
    const char = this.source[this.pos];
    const startCol = this.column;
    this.advance();

    const punctuationMap: Record<string, TokenType> = {
      ':': TokenType.COLON,
      '(': TokenType.LPAREN,
      ')': TokenType.RPAREN,
      '{': TokenType.LBRACE,
      '}': TokenType.RBRACE
    };

    return { type: punctuationMap[char], value: char, line: this.line, column: startCol };
  }

  private readPipeOrBitwise(): Token {
    const startCol = this.column;
    this.advance();

    if (this.peek() === '|') {
      this.advance();
      return { type: TokenType.OR, value: '||', line: this.line, column: startCol };
    }

    return { type: TokenType.BITOR, value: '|', line: this.line, column: startCol };
  }

  private readBitwise(): Token {
    const char = this.source[this.pos];
    const startCol = this.column;
    this.advance();

    if (char === '&') {
      if (this.peek() === '&') {
        this.advance();
        return { type: TokenType.AND, value: '&&', line: this.line, column: startCol };
      }
      return { type: TokenType.BITAND, value: '&', line: this.line, column: startCol };
    }

    if (char === '^') {
      return { type: TokenType.BITXOR, value: '^', line: this.line, column: startCol };
    }

    if (char === '~') {
      return { type: TokenType.BITNOT, value: '~', line: this.line, column: startCol };
    }

    throw new LexerError(`Unexpected bitwise operator: ${char}`, this.line, startCol);
  }

  private readBracket(): Token {
    const char = this.source[this.pos];
    const startCol = this.column;
    this.advance();

    return {
      type: char === '[' ? TokenType.LBRACKET : TokenType.RBRACKET,
      value: char,
      line: this.line,
      column: startCol
    };
  }

  private readArithmeticOp(): Token {
    const char = this.source[this.pos];
    const startCol = this.column;
    this.advance();

    if (char === '+') {
      if (this.peek() === '=') {
        this.advance();
        return { type: TokenType.PLUS_ASSIGN, value: '+=', line: this.line, column: startCol };
      }
      return { type: TokenType.PLUS, value: '+', line: this.line, column: startCol };
    }

    if (char === '-' && this.peek() !== '>') {
      if (this.peek() === '=') {
        this.advance();
        return { type: TokenType.MINUS_ASSIGN, value: '-=', line: this.line, column: startCol };
      }
      return { type: TokenType.MINUS, value: '-', line: this.line, column: startCol };
    }

    throw new LexerError(`Unexpected arithmetic operator`, this.line, startCol);
  }

  private readComparison(): Token {
    const char = this.source[this.pos];
    const startCol = this.column;
    this.advance();

    if (char === '=') {
      if (this.peek() === '=') {
        this.advance();
        return { type: TokenType.EQ, value: '==', line: this.line, column: startCol };
      }
      return { type: TokenType.ASSIGN, value: '=', line: this.line, column: startCol };
    }

    if (char === '!') {
      if (this.peek() === '=') {
        this.advance();
        return { type: TokenType.NEQ, value: '!=', line: this.line, column: startCol };
      }
      return { type: TokenType.NOT, value: '!', line: this.line, column: startCol };
    }

    throw new LexerError(`Unexpected comparison operator`, this.line, startCol);
  }

  private readRelational(): Token {
    const char = this.source[this.pos];
    const startCol = this.column;
    this.advance();

    if (char === '<') {
      if (this.peek() === '<') {
        this.advance();
        return { type: TokenType.LSHIFT, value: '<<', line: this.line, column: startCol };
      }
      if (this.peek() === '=') {
        this.advance();
        return { type: TokenType.LTE, value: '<=', line: this.line, column: startCol };
      }
      return { type: TokenType.LT, value: '<', line: this.line, column: startCol };
    }

    if (char === '>') {
      if (this.peek() === '>' && this.peek(1) === '>') {
        this.advance();
        this.advance();
        return { type: TokenType.URSHIFT, value: '>>>', line: this.line, column: startCol };
      }
      if (this.peek() === '>') {
        this.advance();
        return { type: TokenType.RSHIFT, value: '>>', line: this.line, column: startCol };
      }
      if (this.peek() === '=') {
        this.advance();
        return { type: TokenType.GTE, value: '>=', line: this.line, column: startCol };
      }
      return { type: TokenType.GT, value: '>', line: this.line, column: startCol };
    }

    throw new LexerError(`Unexpected relational operator`, this.line, startCol);
  }

  private readIdentifierOrKeyword(): Token {
    const startCol = this.column;
    let value = '';

    while (this.pos < this.source.length && /[a-zA-Z0-9_\p{L}\p{N}]/u.test(this.source[this.pos])) {
      value += this.source[this.pos];
      this.advance();
    }

    const keywords: Record<string, TokenType> = Object.create(null);
    keywords['and'] = TokenType.AND;
    keywords['or'] = TokenType.OR;
    keywords['not'] = TokenType.NOT;
    keywords['true'] = TokenType.TEXT;
    keywords['false'] = TokenType.TEXT;
    keywords['null'] = TokenType.TEXT;
    keywords['macro'] = TokenType.MACRO;
    keywords['proc_macro'] = TokenType.PROC_MACRO;

    return {
      type: keywords[value.toLowerCase()] || TokenType.TEXT,
      value,
      line: this.line,
      column: startCol
    };
  }

  private readNumber(): Token {
    const startCol = this.column;
    let value = '';

    if (this.peek() === '0' && this.pos + 1 < this.source.length) {
      const nextChar = this.source[this.pos + 1].toLowerCase();
      
      if (nextChar === 'b') {
        value += this.source[this.pos];
        this.advance();
        value += this.source[this.pos];
        this.advance();
        while (this.pos < this.source.length && /[01]/.test(this.source[this.pos])) {
          value += this.source[this.pos];
          this.advance();
        }
        if (value.length === 2) {
          throw new LexerError('Invalid binary literal', this.line, startCol);
        }
        return { type: TokenType.NUMBER, value, line: this.line, column: startCol };
      }
      
      if (nextChar === 'o') {
        value += this.source[this.pos];
        this.advance();
        value += this.source[this.pos];
        this.advance();
        while (this.pos < this.source.length && /[0-7]/.test(this.source[this.pos])) {
          value += this.source[this.pos];
          this.advance();
        }
        if (value.length === 2) {
          throw new LexerError('Invalid octal literal', this.line, startCol);
        }
        return { type: TokenType.NUMBER, value, line: this.line, column: startCol };
      }
      
      if (nextChar === 'x') {
        value += this.source[this.pos];
        this.advance();
        value += this.source[this.pos];
        this.advance();
        while (this.pos < this.source.length && /[0-9a-fA-F]/.test(this.source[this.pos])) {
          value += this.source[this.pos];
          this.advance();
        }
        if (value.length === 2) {
          throw new LexerError('Invalid hexadecimal literal', this.line, startCol);
        }
        return { type: TokenType.NUMBER, value, line: this.line, column: startCol };
      }
    }

    while (this.pos < this.source.length && /[0-9]/.test(this.source[this.pos])) {
      value += this.source[this.pos];
      this.advance();
    }

    if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
      value += '.';
      this.advance();
      while (this.pos < this.source.length && /[0-9]/.test(this.source[this.pos])) {
        value += this.source[this.pos];
        this.advance();
      }
    }

    if (this.peek() && /[eE]/.test(this.peek())) {
      value += this.peek();
      this.advance();
      if (this.peek() && /[+-]/.test(this.peek())) {
        value += this.peek();
        this.advance();
      }
      if (!this.peek() || !/[0-9]/.test(this.peek())) {
        throw new LexerError('Invalid scientific notation', this.line, startCol);
      }
      while (this.pos < this.source.length && /[0-9]/.test(this.source[this.pos])) {
        value += this.source[this.pos];
        this.advance();
      }
    }

    return { type: TokenType.NUMBER, value, line: this.line, column: startCol };
  }
}
