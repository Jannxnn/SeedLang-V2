import { Token, TokenType, ProgramNode, StatementNode, ExpressionNode, QuestionStatement, ActionStatement, BlockStatement, FunctionDef, ReturnStatement, IfStatement, WhileStatement, ForStatement, ForInStatement, ImportStatement, ExportStatement, ClassDef, Identifier, BreakStatement, ContinueStatement, TryStatement, ThrowStatement, AsyncFunctionDef, SwitchStatement, InterfaceDef, TypeAlias, TypeNode, CoroutineDef, YieldStatement, WebDirectiveStatement, WebDirectiveBlockStatement, MacroDef, VarDeclStatement } from './ast';
import { Lexer } from './lexer';

export class ParseError extends Error {
  public line: number;
  public column: number;
  public context: string;
  public suggestion: string;

  constructor(message: string, public token: Token, suggestion: string = '') {
    const line = token.line;
    const column = token.column;
    super(`Parse Error at ${line}:${column} - ${message}`);
    this.name = 'ParseError';
    this.line = line;
    this.column = column;
    this.context = `Near line ${line}, column ${column}`;
    this.suggestion = suggestion;
  }

  getFormattedMessage(source: string): string {
    const lines = source.split('\n');
    const errorLine = lines[this.line - 1] || '';
    const pointer = ' '.repeat(this.column - 1) + '^'.repeat(Math.max(1, this.token.value.length));
    
    let msg = `\nParse Error: ${this.message}\n\n`;
    msg += `   ${this.line} | ${errorLine}\n`;
    msg += `     | ${pointer}\n`;
    
    if (this.suggestion) {
      msg += `\nTip: ${this.suggestion}\n`;
    }
    
    return msg;
  }
}

export class Parser {
  private tokens: Token[];
  private current: number = 0;
  private inArgumentList: boolean = false;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ProgramNode {
    const statements: StatementNode[] = [];

    while (!this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }

    return { type: 'Program', statements };
  }

  private parseStatement(): StatementNode | null {
    if (this.check(TokenType.AT)) return this.parseWebDirective();
    if (this.check(TokenType.QUESTION)) return this.parseQuestion();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'if') return this.parseIfStatement();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'while') return this.parseWhileStatement();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'for') return this.parseForStatement();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'async') return this.parseAsyncFunctionDef();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'fn') return this.parseFunctionDef();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'coro') return this.parseCoroutineDef();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'yield') return this.parseYieldStatement();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'return') return this.parseReturnStatement();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'import') return this.parseImport();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'export') return this.parseExport();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'class') return this.parseClassDef();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'break') return this.parseBreakStatement();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'continue') return this.parseContinueStatement();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'try') return this.parseTryStatement();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'throw') return this.parseThrowStatement();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'switch') return this.parseSwitchStatement();
    if (this.check(TokenType.TEXT) && (this.peekValue() === 'let' || this.peekValue() === 'var' || this.peekValue() === 'const')) return this.parseVarDecl();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'interface') return this.parseInterfaceDef();
    if (this.check(TokenType.TEXT) && this.peekValue() === 'type' && this.isTypeAlias()) return this.parseTypeAlias();
    if (this.check(TokenType.MACRO)) return this.parseMacroDef();
    if (this.check(TokenType.PROC_MACRO)) return this.parseProcMacroDef();

    if (this.check(TokenType.LBRACE)) {
      if (this.isObjectLiteral()) {
        const expr = this.parseExpression();
        return { type: 'Action', action: 'expr', target: expr } as ActionStatement;
      }
      return this.parseBlock();
    }

    const expr = this.parseExpression();
    if (expr) {
      return { type: 'Action', action: 'expr', target: expr } as ActionStatement;
    }

    return null;
  }

  private parseWebDirective(): WebDirectiveStatement | WebDirectiveBlockStatement {
    const atToken = this.advance();
    const namespace = this.expect(TokenType.TEXT, "Expected directive namespace after '@'").value;
    if (this.match(TokenType.DOT)) {
      const name = this.expect(TokenType.TEXT, 'Expected directive name').value;
      return this.parseWebDirectiveCall(namespace, name, atToken.line);
    }
    if (this.check(TokenType.LBRACE)) {
      return this.parseWebDirectiveBlock(namespace, atToken.line);
    }
    throw new ParseError("Expected '.' or '{' after directive namespace", this.peek());
  }

  private parseWebDirectiveCall(namespace: string, name: string, line: number): WebDirectiveStatement {
    this.expect(TokenType.LPAREN, "Expected '(' after directive name");
    const args: ExpressionNode[] = [];
    const namedArgs: { key: string; value: ExpressionNode }[] = [];
    if (!this.check(TokenType.RPAREN)) {
      if (this.check(TokenType.TEXT) && (this.peekType(1) === TokenType.ASSIGN || this.peekType(1) === TokenType.EQ)) {
        do {
          const key = this.expect(TokenType.TEXT, "Expected named argument key").value;
          if (!(this.match(TokenType.ASSIGN) || this.match(TokenType.EQ))) {
            throw new ParseError("Expected '=' after named argument key", this.peek());
          }
          const value = this.parseExpression();
          namedArgs.push({ key, value });
          if (this.match(TokenType.COMMA)) continue;
        } while (
          this.check(TokenType.TEXT) &&
          (this.peekType(1) === TokenType.ASSIGN || this.peekType(1) === TokenType.EQ) &&
          !this.check(TokenType.RPAREN)
        );
      } else {
        const previousInArgs = this.inArgumentList;
        this.inArgumentList = true;
        args.push(this.parseExpression());
        while (this.match(TokenType.COMMA)) {
          args.push(this.parseExpression());
        }
        while (this.isNextValueStart() && !this.check(TokenType.RPAREN)) {
          args.push(this.parseExpression());
        }
        this.inArgumentList = previousInArgs;
      }
    }
    this.expect(TokenType.RPAREN, "Expected ')' after directive arguments");
    return {
      type: 'WebDirective',
      namespace,
      name,
      args,
      namedArgs: namedArgs.length ? namedArgs : undefined,
      line
    };
  }

  private parseWebDirectiveBlock(namespace: string, line: number): WebDirectiveBlockStatement {
    this.expect(TokenType.LBRACE, "Expected '{' after directive namespace");
    const directives: WebDirectiveStatement[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const nameToken = this.expect(TokenType.TEXT, 'Expected directive name in block');
      const item = this.parseWebDirectiveCall(namespace, nameToken.value, nameToken.line);
      directives.push(item);
      this.match(TokenType.SEMICOLON);
    }
    this.expect(TokenType.RBRACE, "Expected '}' after directive block");
    return {
      type: 'WebDirectiveBlock',
      namespace,
      directives,
      line
    };
  }

  private parseQuestion(): QuestionStatement {
    const questionToken = this.advance();
    const condition = this.parseExpression();

    let thenBranch: StatementNode[] = [];
    let elseBranch: StatementNode[] = [];

    if (this.check(TokenType.LBRACE)) {
      thenBranch = this.parseBlock().statements;
    }

    if (this.check(TokenType.TEXT) && this.peekValue() === 'else') {
      this.advance();
      if (this.check(TokenType.LBRACE)) {
        elseBranch = this.parseBlock().statements;
      }
    }

    return {
      type: 'Question',
      condition,
      thenBranch,
      elseBranch: elseBranch || undefined,
      line: questionToken.line
    } as QuestionStatement;
  }

  private parseIfStatement(): IfStatement {
    const ifToken = this.advance();
    const condition = this.parseExpression();

    if (this.check(TokenType.TEXT) && this.peekValue() === 'then') {
      this.advance();
    }

    const thenBranch = this.parseBlock().statements;
    let elseBranch: StatementNode[] | undefined;

    if (this.check(TokenType.TEXT) && this.peekValue() === 'else') {
      this.advance();
      if (this.check(TokenType.TEXT) && this.peekValue() === 'if') {
        const elseIf = this.parseIfStatement();
        elseBranch = [elseIf];
      } else {
        if (this.check(TokenType.TEXT) && this.peekValue() === 'then') {
          this.advance();
        }
        elseBranch = this.parseBlock().statements;
      }
    }

    return {
      type: 'If',
      condition,
      thenBranch,
      elseBranch,
      line: ifToken.line
    };
  }

  private parseWhileStatement(): WhileStatement {
    const whileToken = this.advance();
    const condition = this.parseExpression();
    const body = this.parseBlock().statements;

    return {
      type: 'While',
      condition,
      body,
      line: whileToken.line
    };
  }

  private parseForStatement(): ForStatement | ForInStatement {
    const forToken = this.advance();
    
    // 检查是否是 for-in 循环: for x in arr { ... }
    // 检查下一个 token 是否是标识符，然后是 'in'
    if (this.check(TokenType.TEXT) && this.peekValue() !== 'in') {
      const savedPos = this.current;
      const potentialVar = this.advance().value;
      if (this.check(TokenType.TEXT) && this.peekValue() === 'in') {
        // 这是 for-in 循环
        this.advance(); // 跳过 'in'
        const iterable = this.parseExpression();
        const body = this.parseBlock().statements;
        
        return {
          type: 'ForIn',
          variable: potentialVar,
          iterable,
          body,
          line: forToken.line
        };
      }
      // 回退位置
      this.current = savedPos;
    }
    
    // C 风格的 for 循环: for (init; condition; update) { ... }
    this.expect(TokenType.LPAREN, "Expected '(' after 'for'", "for loop syntax: for (init; condition; update) { ... }");

    let init: StatementNode | undefined;
    let condition: ExpressionNode | undefined;
    let update: StatementNode | undefined;

    if (!this.check(TokenType.RPAREN)) {
      init = this.parseForInit() || undefined;
      this.match(TokenType.SEMICOLON);
      if (!this.check(TokenType.SEMICOLON) && !this.check(TokenType.RPAREN)) {
        condition = this.parseExpression();
      }
      this.match(TokenType.SEMICOLON);
      if (!this.check(TokenType.RPAREN)) {
        update = this.parseForUpdate() || undefined;
      }
    }

    this.expect(TokenType.RPAREN, "Expected ')' after for clauses", "Ensure for loop parts are separated by semicolons and end with ')'");
    const body = this.parseBlock().statements;

    return {
      type: 'For',
      init,
      condition,
      update,
      body,
      line: forToken.line
    };
  }

  private parseForInit(): StatementNode | null {
    const expr = this.parsePrimary();
    if (expr && (this.match(TokenType.ASSIGN) || this.match(TokenType.EQ))) {
      const value = this.parseForExpr();
      return { type: 'Action', action: 'expr', target: { type: 'Assignment', target: expr, value, line: expr.line } } as ActionStatement;
    }
    if (expr) {
      return { type: 'Action', action: 'expr', target: expr } as ActionStatement;
    }
    return null;
  }

  private parseForUpdate(): StatementNode | null {
    const expr = this.parsePrimary();
    if (expr && (this.match(TokenType.ASSIGN) || this.match(TokenType.EQ))) {
      const value = this.parseForExpr();
      return { type: 'Action', action: 'expr', target: { type: 'Assignment', target: expr, value, line: expr.line } } as ActionStatement;
    }
    if (expr) {
      return { type: 'Action', action: 'expr', target: expr } as ActionStatement;
    }
    return null;
  }

  private parseForExpr(): ExpressionNode {
    let expr = this.parseFactor();

    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const op = this.advance().value;
      if (this.check(TokenType.RPAREN) || this.check(TokenType.LBRACE)) {
        this.current--;
        break;
      }
      const right = this.parseFactor();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parsePropertyValue(): ExpressionNode {
    return this.parseExpression();
  }

  private parseAsyncFunctionDef(): AsyncFunctionDef {
    const asyncToken = this.advance();
    this.expect(TokenType.TEXT, 'Expected fn after async', "async function syntax: async fn name(params) { ... }");
    const nameToken = this.expect(TokenType.TEXT, 'Expected function name', "Function needs a name, e.g.: async fn myFunc() { ... }");
    const name = nameToken.value;

    this.expect(TokenType.LPAREN, "Expected '(' after function name", "Parentheses needed after function name, e.g.: fn myFunc(params) { ... }");
    const params: string[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        params.push(this.expect(TokenType.TEXT, 'Expected parameter name', "Parameter name should be a valid identifier").value);
      } while (this.match(TokenType.COMMA) || (this.check(TokenType.TEXT) && !this.check(TokenType.RPAREN)));
    }
    this.expect(TokenType.RPAREN, "Expected ')' after parameters", "Parameter list must end with ')'");

    const body = this.parseBlock().statements;

    return {
      type: 'AsyncFunctionDef',
      name,
      params,
      body,
      line: asyncToken.line
    };
  }

  private parseFunctionDef(): FunctionDef {
    const fnToken = this.advance();
    const nameToken = this.expect(TokenType.TEXT, 'Expected function name', "Function needs a name, e.g.: fn myFunc() { ... }");
    const name = nameToken.value;

    let genericParams: string[] | undefined;
    if (this.match(TokenType.LT)) {
      genericParams = [];
      do {
        genericParams.push(this.expect(TokenType.TEXT, 'Expected generic parameter').value);
      } while (this.check(TokenType.TEXT));
      this.expect(TokenType.GT, "Expected '>' after generic parameters");
    }

    this.expect(TokenType.LPAREN, "Expected '(' after function name", "Parentheses needed after function name, e.g.: fn myFunc(params) { ... }");
    const params: string[] = [];
    const paramTypes: TypeNode[] = [];
    
    if (!this.check(TokenType.RPAREN)) {
      do {
        const paramName = this.expect(TokenType.TEXT, 'Expected parameter name', "Parameter name should be a valid identifier").value;
        params.push(paramName);
        
        if (this.match(TokenType.COLON)) {
          const paramType = this.parseTypeExpression();
          paramTypes.push(paramType);
        }
      } while (this.match(TokenType.COMMA) || (this.check(TokenType.TEXT) && !this.check(TokenType.RPAREN)));
    }
    this.expect(TokenType.RPAREN, "Expected ')' after parameters", "Parameter list must end with ')'");

    let returnType: TypeNode | undefined;
    if (this.match(TokenType.COLON)) {
      returnType = this.parseTypeExpression();
    }

    const body = this.parseBlock().statements;

    return {
      type: 'FunctionDef',
      name,
      params,
      paramTypes: paramTypes.length > 0 ? paramTypes : undefined,
      returnType,
      genericParams,
      body,
      line: fnToken.line
    };
  }

  private parseCoroutineDef(): CoroutineDef {
    const coroToken = this.advance();
    const nameToken = this.expect(TokenType.TEXT, 'Expected coroutine name', "Coroutine needs a name, e.g.: coro myCoro() { ... }");
    const name = nameToken.value;

    this.expect(TokenType.LPAREN, "Expected '(' after coroutine name", "Parentheses needed after coroutine name, e.g.: coro myCoro(params) { ... }");
    const params: string[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        params.push(this.expect(TokenType.TEXT, 'Expected parameter name', "Parameter name should be a valid identifier").value);
      } while (this.match(TokenType.COMMA) || (this.check(TokenType.TEXT) && !this.check(TokenType.RPAREN)));
    }
    this.expect(TokenType.RPAREN, "Expected ')' after parameters", "Parameter list must end with ')'");

    const body = this.parseBlock().statements;

    return {
      type: 'CoroutineDef',
      name,
      params,
      body,
      line: coroToken.line
    };
  }

  private parseMacroDef(): MacroDef {
    const macroToken = this.advance();
    const nameToken = this.expect(TokenType.TEXT, 'Expected macro name', "Macro needs a name, e.g.: macro myMacro(x) { ... }");
    const name = nameToken.value;

    this.expect(TokenType.LPAREN, "Expected '(' after macro name", "Parentheses needed after macro name, e.g.: macro myMacro(params) { ... }");
    const params: string[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        params.push(this.expect(TokenType.TEXT, 'Expected parameter name', "Parameter name should be a valid identifier").value);
      } while (this.check(TokenType.TEXT) && !this.check(TokenType.RPAREN));
    }
    this.expect(TokenType.RPAREN, "Expected ')' after parameters", "Parameter list must end with ')'");

    const body = this.parseBlock().statements;

    return {
      type: 'MacroDef',
      name,
      params,
      body,
      line: macroToken.line
    };
  }

  private parseProcMacroDef(): any {
    const macroToken = this.advance();
    const nameToken = this.expect(TokenType.TEXT, 'Expected proc_macro name', "proc_macro needs a name, e.g.: proc_macro myMacro(x) { ... }");
    const name = nameToken.value;

    this.expect(TokenType.LPAREN, "Expected '(' after proc_macro name", "Parentheses needed after proc_macro name, e.g.: proc_macro myMacro(params) { ... }");
    const params: string[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        params.push(this.expect(TokenType.TEXT, 'Expected parameter name', "Parameter name should be a valid identifier").value);
      } while (this.check(TokenType.TEXT) && !this.check(TokenType.RPAREN));
    }
    this.expect(TokenType.RPAREN, "Expected ')' after proc_macro parameters", "Close the parameter list with ')', e.g.: proc_macro myMacro(x y) { ... }");

    const body = this.parseBlock();

    return {
      type: 'ProcMacroDef',
      name,
      params,
      body: body.statements || (Array.isArray(body) ? body : [body]),
      line: macroToken.line
    };
  }

  private parseYieldStatement(): YieldStatement {
    const yieldToken = this.advance();
    let value: ExpressionNode | undefined;

    if (!this.check(TokenType.RBRACE) && !this.check(TokenType.EOF)) {
      value = this.parseExpression();
    }

    return { type: 'Yield', value, line: yieldToken.line };
  }

  private parseReturnStatement(): ReturnStatement {
    const returnToken = this.advance();
    let value: ExpressionNode | undefined;

    if (!this.check(TokenType.RBRACE)) {
      value = this.parseExpression();
    }

    return { type: 'Return', value, line: returnToken.line };
  }

  private parseBreakStatement(): BreakStatement {
    const breakToken = this.advance();
    return { type: 'Break', line: breakToken.line };
  }

  private parseContinueStatement(): ContinueStatement {
    const continueToken = this.advance();
    return { type: 'Continue', line: continueToken.line };
  }

  private parseTryStatement(): TryStatement {
    const tryToken = this.advance();
    const body = this.parseBlock().statements;

    let catchClause;
    if (this.check(TokenType.TEXT) && this.peekValue() === 'catch') {
      this.advance();
      let param: string | undefined;
      if (this.check(TokenType.LPAREN)) {
        this.advance();
        param = this.expect(TokenType.TEXT, 'Expected error parameter').value;
        this.expect(TokenType.RPAREN, "Expected ')' after catch parameter");
      }
      const catchBody = this.parseBlock().statements;
      catchClause = { param, body: catchBody };
    }

    let finallyBlock;
    if (this.check(TokenType.TEXT) && this.peekValue() === 'finally') {
      this.advance();
      finallyBlock = this.parseBlock().statements;
    }

    return { type: 'Try', body, catchClause, finallyBlock, line: tryToken.line };
  }

  private parseVarDecl(): VarDeclStatement {
    const keyword = this.advance();
    const nameToken = this.expect(TokenType.TEXT, 'Expected variable name after ' + keyword.value, "Variable declaration: let x = value");
    const name = nameToken.value;
    let value: ExpressionNode | undefined;
    if (this.match(TokenType.ASSIGN) || this.match(TokenType.EQ)) {
      value = this.parseExpression();
    }
    return { type: 'VarDecl', name, value, line: keyword.line };
  }

  private parseThrowStatement(): ThrowStatement {
    const throwToken = this.advance();
    const value = this.parseExpression();
    return { type: 'Throw', value, line: throwToken.line };
  }

  private parseSwitchStatement(): SwitchStatement {
    const switchToken = this.advance();
    this.expect(TokenType.LPAREN, "Expected '(' after switch");
    const expression = this.parseExpression();
    this.expect(TokenType.RPAREN, "Expected ')' after switch expression");
    this.expect(TokenType.LBRACE, "Expected '{' for switch body");

    const cases: { value: ExpressionNode; body: StatementNode[] }[] = [];
    let defaultCase: StatementNode[] | undefined;

    while (!this.check(TokenType.RBRACE)) {
      if (this.check(TokenType.TEXT) && this.peekValue() === 'case') {
        this.advance();
        const caseValue = this.parseExpression();
        this.expect(TokenType.COLON, "Expected ':' after case value");

        const caseBody: StatementNode[] = [];
        while (!this.check(TokenType.TEXT) || (this.peekValue() !== 'case' && this.peekValue() !== 'default')) {
          if (this.check(TokenType.RBRACE)) break;
          const stmt = this.parseStatement();
          if (stmt) caseBody.push(stmt);
        }
        cases.push({ value: caseValue, body: caseBody });
      } else if (this.check(TokenType.TEXT) && this.peekValue() === 'default') {
        this.advance();
        this.expect(TokenType.COLON, "Expected ':' after default");

        const defaultBody: StatementNode[] = [];
        while (!this.check(TokenType.RBRACE)) {
          if (this.check(TokenType.TEXT) && (this.peekValue() === 'case')) break;
          const stmt = this.parseStatement();
          if (stmt) defaultBody.push(stmt);
        }
        defaultCase = defaultBody;
      } else {
        break;
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close switch");
    return { type: 'Switch', expression, cases, defaultCase, line: switchToken.line };
  }

  private parseInterfaceDef(): InterfaceDef {
    const interfaceToken = this.advance();
    const nameToken = this.expect(TokenType.TEXT, 'Expected interface name');
    const name = nameToken.value;

    let genericParams: string[] | undefined;
    if (this.check(TokenType.LT)) {
      this.advance();
      genericParams = [];
      do {
        genericParams.push(this.expect(TokenType.TEXT, 'Expected generic parameter').value);
      } while (this.check(TokenType.TEXT));
      this.expect(TokenType.GT, "Expected '>' after generic parameters");
    }

    this.expect(TokenType.LBRACE, "Expected '{' for interface body");

    const properties: { name: string; typeExpr: any }[] = [];
    const methods: FunctionDef[] = [];

    while (!this.check(TokenType.RBRACE)) {
      if (this.check(TokenType.TEXT) && (this.peekValue() === 'fn' || this.peekValue() === 'async')) {
        methods.push(this.parseFunctionDef());
      } else if (this.check(TokenType.TEXT)) {
        const propName = this.advance().value;
        this.expect(TokenType.COLON, "Expected ':' after property name");
        const typeExpr = this.parseTypeExpression();
        properties.push({ name: propName, typeExpr });
      } else {
        break;
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close interface");
    return { type: 'InterfaceDef', name, genericParams, properties, methods, line: interfaceToken.line };
  }

  private parseTypeAlias(): TypeAlias {
    const typeToken = this.advance();
    const nameToken = this.expect(TokenType.TEXT, 'Expected type alias name');
    const name = nameToken.value;

    let genericParams: string[] | undefined;
    if (this.check(TokenType.LT)) {
      this.advance();
      genericParams = [];
      do {
        genericParams.push(this.expect(TokenType.TEXT, 'Expected generic parameter').value);
      } while (this.check(TokenType.TEXT));
      this.expect(TokenType.GT, "Expected '>' after generic parameters");
    }

    this.expect(TokenType.ASSIGN, "Expected '=' after type alias name");
    const typeExpr = this.parseTypeExpression();

    return { type: 'TypeAlias', name, genericParams, typeExpr, line: typeToken.line };
  }

  private parseTypeExpression(): any {
    let typeNode = this.parseBaseType();

    while (this.check(TokenType.BITOR)) {
      this.advance();
      const rightType = this.parseBaseType();
      typeNode = {
        kind: 'union',
        types: [typeNode, rightType]
      };
    }

    while (this.check(TokenType.LBRACKET)) {
      this.advance();
      this.expect(TokenType.RBRACKET, "Expected ']' for array type");
      typeNode = { kind: 'array', elementType: typeNode };
    }

    return typeNode;
  }

  private parseBaseType(): any {
    if (this.check(TokenType.LBRACKET)) {
      this.advance();
      const elementType = this.parseTypeExpression();
      this.expect(TokenType.RBRACKET, "Expected ']' for array type");
      return { kind: 'array', elementType };
    }

    if (this.check(TokenType.LBRACE)) {
      this.advance();
      const properties = new Map<string, any>();
      while (!this.check(TokenType.RBRACE)) {
        const propName = this.expect(TokenType.TEXT, 'Expected property name').value;
        this.expect(TokenType.COLON, "Expected ':' after property name");
        const propType = this.parseTypeExpression();
        properties.set(propName, propType);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACE, "Expected '}' for object type");
      return { kind: 'object', properties };
    }

    if (this.check(TokenType.LPAREN)) {
      this.advance();
      const params: any[] = [];
      if (!this.check(TokenType.RPAREN)) {
        do {
          params.push(this.parseTypeExpression());
        } while (this.match(TokenType.COMMA));
      }
      this.expect(TokenType.RPAREN, "Expected ')' for function params");
      this.expect(TokenType.ARROW, "Expected '->' for function return type");
      const returnType = this.parseTypeExpression();
      return { kind: 'function', params, returnType };
    }

    if (this.check(TokenType.TEXT)) {
      const typeName = this.advance().value;

      if (typeName === 'string' || typeName === 'number' || typeName === 'boolean' ||
          typeName === 'null' || typeName === 'any' || typeName === 'void') {
        return { kind: 'primitive', name: typeName as any };
      }

      if (this.check(TokenType.LT)) {
        this.advance();
        const typeArgs: any[] = [];
        do {
          typeArgs.push(this.parseTypeExpression());
        } while (this.match(TokenType.COMMA));
        this.expect(TokenType.GT, "Expected '>' after type arguments");
        return { kind: 'named', name: typeName, typeArgs };
      }

      return { kind: 'generic', name: typeName };
    }

    throw new ParseError('Expected type expression', this.peek());
  }

  private parseImport(): ImportStatement {
    this.advance();
    let module: string;
    if (this.check(TokenType.STRING_LITERAL)) {
      module = this.advance().value;
    } else {
      const moduleToken = this.expect(TokenType.TEXT, 'Expected module path');
      module = moduleToken.value;
    }

    let alias: string | undefined;
    if (this.matchText('as')) {
      alias = this.expect(TokenType.TEXT, 'Expected alias name').value;
    }

    let items: string[] | undefined;
    if (this.check(TokenType.LBRACE)) {
      this.advance();
      items = [];
      while (!this.check(TokenType.RBRACE)) {
        items.push(this.expect(TokenType.TEXT, 'Expected import item').value);
        if (this.check(TokenType.RBRACE)) break;
        this.match(TokenType.COMMA);
      }
      this.expect(TokenType.RBRACE, "Expected '}'");
    }

    return { type: 'Import', module, alias, items };
  }

  private parseExport(): ExportStatement {
    this.advance();
    const declaration = this.parseStatement() as StatementNode;
    return { type: 'Export', declaration };
  }

  private parseClassDef(): ClassDef {
    const classToken = this.advance();
    const nameToken = this.expect(TokenType.TEXT, 'Expected class name');
    const name = nameToken.value;

    let superClass: string | undefined;
    if (this.check(TokenType.TEXT) && this.peekValue() === 'extends') {
      this.advance();
      superClass = this.expect(TokenType.TEXT, 'Expected parent class name').value;
    }

    let genericParams: string[] | undefined;
    if (this.match(TokenType.LT)) {
      genericParams = [];
      do {
        genericParams.push(this.expect(TokenType.TEXT, 'Expected generic parameter').value);
      } while (this.check(TokenType.TEXT));
      this.expect(TokenType.GT, "Expected '>' after generic parameters");
    }

    this.expect(TokenType.LBRACE, "Expected '{' before class body");

    const properties: { name: string; value?: ExpressionNode }[] = [];
    const methods: FunctionDef[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.TEXT) && this.peekValue() === 'fn' && this.peekValue(1) === 'static') {
        this.advance();
        this.advance();
        const nameToken = this.expect(TokenType.TEXT, 'Expected static method name');
        this.expect(TokenType.LPAREN, "Expected '(' after method name");
        const params: string[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            params.push(this.expect(TokenType.TEXT, 'Expected parameter name').value);
          } while (this.match(TokenType.COMMA) || (this.check(TokenType.TEXT) && !this.check(TokenType.RPAREN)));
        }
        this.expect(TokenType.RPAREN, "Expected ')' after parameters");
        const body = this.parseBlock().statements;
        methods.push({
          type: 'FunctionDef',
          name: nameToken.value,
          params,
          body,
          isStatic: true,
          line: classToken.line
        });
      } else if (this.check(TokenType.TEXT) && this.peekValue() === 'fn') {
        const methodDef = this.parseFunctionDef();
        methods.push({ ...methodDef, isStatic: false });
      } else if (this.check(TokenType.TEXT) && this.peekType(1) === TokenType.LPAREN) {
        const methodName = this.advance().value;
        this.expect(TokenType.LPAREN, "Expected '(' after method name");
        const params: string[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            params.push(this.expect(TokenType.TEXT, 'Expected parameter name').value);
          } while (this.match(TokenType.COMMA) || (this.check(TokenType.TEXT) && !this.check(TokenType.RPAREN)));
        }
        this.expect(TokenType.RPAREN, "Expected ')' after parameters");
        const body = this.parseBlock().statements;
        methods.push({
          type: 'FunctionDef',
          name: methodName,
          params,
          body,
          isStatic: false,
          line: classToken.line
        });
      } else if (this.check(TokenType.TEXT) && this.peekValue(1) === 'fn') {
        methods.push(this.parseFunctionDef());
      } else {
        const propName = this.expect(TokenType.TEXT, 'Expected property name').value;
        let propValue: ExpressionNode | undefined;
        if (this.match(TokenType.ASSIGN)) {
          propValue = this.parseExpression();
        }
        properties.push({ name: propName, value: propValue });
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' after class body");

    return {
      type: 'ClassDef',
      name,
      superClass,
      genericParams,
      properties,
      methods,
      line: classToken.line
    };
  }

  private parseBlock(): BlockStatement {
    this.expect(TokenType.LBRACE, "Expected '{'");
    const statements: StatementNode[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }

    this.expect(TokenType.RBRACE, "Expected '}'");
    return { type: 'Block', statements };
  }

  private parseExpression(): ExpressionNode {
    return this.parseAssignment();
  }

  private parseAssignment(): ExpressionNode {
    const expr = this.parseConditional();

    if (this.match(TokenType.ASSIGN) || this.match(TokenType.EQ)) {
      const value = this.parseAssignment();
      return { type: 'Assignment', target: expr, value, line: expr.line };
    }

    const compoundOps: [TokenType, string][] = [
      [TokenType.PLUS_ASSIGN, '+'],
      [TokenType.MINUS_ASSIGN, '-'],
      [TokenType.STAR_ASSIGN, '*'],
      [TokenType.SLASH_ASSIGN, '/'],
      [TokenType.PERCENT_ASSIGN, '%'],
    ];
    for (const [tt, op] of compoundOps) {
      if (this.match(tt)) {
        const value = this.parseAssignment();
        return {
          type: 'Assignment',
          target: expr,
          value: { type: 'BinaryOp', operator: op, left: expr, right: value, line: expr.line },
          operator: op + '=',
          line: expr.line,
        };
      }
    }

    return expr;
  }

  private parseConditional(): ExpressionNode {
    let expr = this.parseLogicalOr();

    if (this.match(TokenType.QUESTION)) {
      const consequent = this.parseExpression();
      this.expect(TokenType.COLON, "Expected ':' in conditional expression");
      const alternate = this.parseConditional();
      expr = { type: 'Conditional', condition: expr, consequent, alternate, line: expr.line };
    }

    return expr;
  }

  private parseLogicalOr(): ExpressionNode {
    let expr = this.parseLogicalAnd();

    while (this.matchText('or') || this.check(TokenType.OR)) {
      if (this.check(TokenType.OR)) this.advance();
      const right = this.parseLogicalAnd();
      expr = { type: 'Logical', operator: 'or', left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseLogicalAnd(): ExpressionNode {
    let expr = this.parseBitwiseOr();

    while (this.matchText('and') || this.check(TokenType.AND)) {
      if (this.check(TokenType.AND)) this.advance();
      const right = this.parseBitwiseOr();
      expr = { type: 'Logical', operator: 'and', left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseBitwiseOr(): ExpressionNode {
    let expr = this.parseBitwiseXor();

    while (this.check(TokenType.BITOR)) {
      const op = this.advance().value;
      const right = this.parseBitwiseXor();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseBitwiseXor(): ExpressionNode {
    let expr = this.parseBitwiseAnd();

    while (this.check(TokenType.BITXOR)) {
      const op = this.advance().value;
      const right = this.parseBitwiseAnd();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseBitwiseAnd(): ExpressionNode {
    let expr = this.parseEquality();

    while (this.check(TokenType.BITAND)) {
      const op = this.advance().value;
      const right = this.parseEquality();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseEquality(): ExpressionNode {
    let expr = this.parseComparison();

    while (this.check(TokenType.EQ) || this.check(TokenType.NEQ)) {
      const op = this.advance().value;
      const right = this.parseComparison();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseComparison(): ExpressionNode {
    let expr = this.parseShift();

    while (this.check(TokenType.LT) || this.check(TokenType.GT) || this.check(TokenType.LTE) || this.check(TokenType.GTE)) {
      const op = this.advance().value;
      const right = this.parseShift();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseShift(): ExpressionNode {
    let expr = this.parseTerm();

    while (this.check(TokenType.LSHIFT) || this.check(TokenType.RSHIFT) || this.check(TokenType.URSHIFT)) {
      const op = this.advance().value;
      const right = this.parseTerm();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseTerm(): ExpressionNode {
    let expr = this.parseFactor();

    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      if (this.shouldSplitNegativeArgument(expr)) {
        break;
      }
      const op = this.advance().value;
      const right = this.parseFactor();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private isNumericLiteralLike(expr: ExpressionNode): boolean {
    if (!expr) return false;
    if (expr.type === 'NumberLiteral') return true;
    return expr.type === 'Unary' && expr.operator === '-' && expr.operand?.type === 'NumberLiteral';
  }

  private shouldSplitNegativeArgument(expr: ExpressionNode): boolean {
    if (!this.inArgumentList || !this.check(TokenType.MINUS)) return false;
    const minusToken = this.tokens[this.current];
    const next = this.tokens[this.current + 1];
    if (!next || next.type !== TokenType.NUMBER) return false;
    if (minusToken && next && minusToken.column != null && next.column != null) {
      if (next.column > minusToken.column + 1) return false;
    }
    const prev = this.current > 0 ? this.tokens[this.current - 1] : null;
    if (prev && prev.column != null && minusToken && minusToken.column != null) {
      const prevEnd = prev.column + (prev.value || '').length;
      if (minusToken.column <= prevEnd) return false;
    }
    if (this.isNumericLiteralLike(expr)) return true;
    if (expr.type === 'Identifier') return true;
    if (expr.type === 'Member') return true;
    if (expr.type === 'Call') return true;
    return false;
  }

  private parseFactor(): ExpressionNode {
    let expr = this.parseUnary();

    while (this.check(TokenType.STAR) || this.check(TokenType.SLASH) || this.check(TokenType.PERCENT)) {
      const op = this.advance().value;
      const right = this.parseUnary();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseUnary(): ExpressionNode {
    if (this.check(TokenType.MINUS) || this.check(TokenType.NOT) || this.check(TokenType.BITNOT)) {
      const op = this.advance().value;
      const operand = this.parseUnary();
      return { type: 'Unary', operator: op, operand, line: operand.line };
    }

    if (this.check(TokenType.TEXT) && this.peekValue() === 'await') {
      const awaitToken = this.advance();
      const expression = this.parseUnary();
      return { type: 'Await', expression, line: awaitToken.line };
    }

    return this.parseCall();
  }

  private parseCall(): ExpressionNode {
    let expr = this.parsePrimary();
    const isNonCallableLiteral = (node: ExpressionNode): boolean =>
      !!node && (
        node.type === 'TextLiteral' ||
        node.type === 'NumberLiteral' ||
        node.type === 'BooleanLiteral' ||
        node.type === 'NullLiteral' ||
        node.type === 'ArrayLiteral' ||
        node.type === 'ObjectLiteral'
      );

    while (true) {
      if (expr.type === 'Identifier' && this.check(TokenType.NOT) && this.peekType(1) === TokenType.LPAREN) {
        const macroName = (expr as Identifier).name;
        this.advance();
        this.advance();
        const args: ExpressionNode[] = [];
        if (!this.check(TokenType.RPAREN)) {
          const previousInArgs = this.inArgumentList;
          this.inArgumentList = true;
          args.push(this.parseExpression());
          while (this.isNextValueStart() && !this.check(TokenType.RPAREN)) {
            args.push(this.parseExpression());
          }
          this.inArgumentList = previousInArgs;
        }
        this.expect(TokenType.RPAREN, "Expected ')' after macro arguments");
        expr = { type: 'MacroCall', name: macroName, args, line: expr.line };
      } else if (this.check(TokenType.LT) && this.isGenericCallStart()) {
        this.advance();
        const typeArgs: TypeNode[] = [];
        do {
          typeArgs.push(this.parseTypeExpression());
        } while (this.match(TokenType.COMMA));
        this.expect(TokenType.GT, "Expected '>' after type arguments");
        
        this.expect(TokenType.LPAREN, "Expected '(' after type arguments");
        const args: ExpressionNode[] = [];
        if (!this.check(TokenType.RPAREN)) {
          const previousInArgs = this.inArgumentList;
          this.inArgumentList = true;
          args.push(this.parseExpression());
          while (this.match(TokenType.COMMA)) {
            args.push(this.parseExpression());
          }
          while (this.isNextValueStart() && !this.check(TokenType.RPAREN)) {
            args.push(this.parseExpression());
          }
          this.inArgumentList = previousInArgs;
        }
        this.expect(TokenType.RPAREN, "Expected ')' after arguments");
        expr = { type: 'GenericCall', callee: expr, typeArgs, args, line: expr.line };
      } else if (this.check(TokenType.LPAREN)) {
        if (this.isArrowFunctionAt(this.current)) {
          break;
        }
        if (this.inArgumentList && isNonCallableLiteral(expr)) {
          break;
        }
        this.advance();
        const args: ExpressionNode[] = [];
        if (!this.check(TokenType.RPAREN)) {
          const previousInArgs = this.inArgumentList;
          this.inArgumentList = true;
          args.push(this.parseExpression());
          while (this.match(TokenType.COMMA)) {
            args.push(this.parseExpression());
          }
          while (this.isNextValueStart() && !this.check(TokenType.RPAREN)) {
            args.push(this.parseExpression());
          }
          this.inArgumentList = previousInArgs;
        }
        this.expect(TokenType.RPAREN, "Expected ')' after arguments");
        expr = { type: 'Call', callee: expr, args, line: expr.line };
      } else if (this.match(TokenType.DOT)) {
        const property = this.expect(TokenType.TEXT, 'Expected property name').value;
        expr = { type: 'Member', object: expr, property, computed: false, line: expr.line };
      } else if (this.check(TokenType.LBRACKET) && expr.type !== 'NumberLiteral' && expr.type !== 'TextLiteral' && expr.type !== 'BooleanLiteral' && expr.type !== 'NullLiteral' && expr.type !== 'ArrayLiteral') {
        if (this.inArgumentList && expr.type === 'ObjectLiteral') {
          break;
        }
        this.advance();
        const indexExpr = this.parseExpression();
        this.expect(TokenType.RBRACKET, "Expected ']'");
        expr = { type: 'Member', object: expr, property: indexExpr, computed: true, line: expr.line };
      } else {
        break;
      }
    }

    return expr;
  }
  
  private isGenericCallStart(): boolean {
    let lookahead = this.current;
    let depth = 0;
    
    while (lookahead < this.tokens.length) {
      const token = this.tokens[lookahead];
      if (token.type === TokenType.LT) depth++;
      else if (token.type === TokenType.GT) {
        depth--;
        if (depth === 0) {
          if (lookahead + 1 >= this.tokens.length || this.tokens[lookahead + 1].type !== TokenType.LPAREN) {
            return false;
          }
          let parenDepth = 1;
          let j = lookahead + 2;
          while (j < this.tokens.length && parenDepth > 0) {
            if (this.tokens[j].type === TokenType.LPAREN) parenDepth++;
            else if (this.tokens[j].type === TokenType.RPAREN) parenDepth--;
            j++;
          }
          if (j < this.tokens.length) {
            const after = this.tokens[j];
            if (after.type === TokenType.LBRACE) {
              return false;
            }
          }
          return true;
        }
      }
      else if (depth === 1) {
        if (token.type === TokenType.LTE || token.type === TokenType.GTE ||
            token.type === TokenType.EQ || token.type === TokenType.NEQ ||
            token.type === TokenType.AND || token.type === TokenType.OR ||
            token.type === TokenType.PLUS || token.type === TokenType.MINUS ||
            token.type === TokenType.STAR || token.type === TokenType.SLASH ||
            token.type === TokenType.PERCENT ||
            token.type === TokenType.LBRACE ||
            token.type === TokenType.LSHIFT || token.type === TokenType.RSHIFT ||
            token.type === TokenType.URSHIFT ||
            token.type === TokenType.PIPE || token.type === TokenType.BITAND ||
            token.type === TokenType.BITXOR || token.type === TokenType.BITNOT) {
          return false;
        }
        if (token.type === TokenType.TEXT) {
          const kw = token.value.toLowerCase();
          if (kw === 'if' || kw === 'else' || kw === 'while' || kw === 'for' ||
              kw === 'fn' || kw === 'let' || kw === 'var' || kw === 'return' ||
              kw === 'break' || kw === 'continue' || kw === 'class' || kw === 'struct' ||
              kw === 'type' || kw === 'import' || kw === 'export' || kw === 'match' ||
              kw === 'and' || kw === 'or' || kw === 'not' || kw === 'in' ||
              kw === 'true' || kw === 'false' || kw === 'null' || kw === 'new') {
            return false;
          }
        }
      }
      else if (token.type === TokenType.LPAREN && depth === 0) break;
      else if ((token.type === TokenType.RPAREN || token.type === TokenType.RBRACE) && depth === 0) break;
      lookahead++;
    }
    return false;
  }

  private parsePrimary(): ExpressionNode {
    if (this.match(TokenType.NOUN)) {
      const nounToken = this.previous();
      const index = parseInt(nounToken.value.substring(2));
      return { type: 'NounRef', index, line: nounToken.line };
    }

    if (this.match(TokenType.STRING_LITERAL)) {
      const strToken = this.previous();
      return { type: 'TextLiteral', value: strToken.value, line: strToken.line };
    }

    if (this.match(TokenType.TEXT)) {
      const textToken = this.previous();
      const value = textToken.value;

      if (value === 'true') return { type: 'BooleanLiteral', value: true, line: textToken.line };
      if (value === 'false') return { type: 'BooleanLiteral', value: false, line: textToken.line };
      if (value === 'null') return { type: 'NullLiteral', line: textToken.line };
      if (value === 'match') return this.parseMatchExpression(textToken.line);
      if (value === 'fn' && this.isAnonymousFunctionLiteralStart()) {
        return this.parseAnonymousFunction(textToken.line);
      }
      if (value === 'new') {
        const className = this.expect(TokenType.TEXT, 'Expected class name after new');
        this.expect(TokenType.LPAREN, "Expected '(' after class name");
        const args: ExpressionNode[] = [];
        while (!this.check(TokenType.RPAREN)) {
          args.push(this.parseExpression());
        }
        this.expect(TokenType.RPAREN, "Expected ')' after arguments");
        return { type: 'NewExpression', className: className.value, args, line: textToken.line } as any;
      }

      if (value === 'super') {
        if (this.check(TokenType.LPAREN)) {
          this.advance();
          const args: ExpressionNode[] = [];
          while (!this.check(TokenType.RPAREN)) {
            args.push(this.parseExpression());
          }
          this.expect(TokenType.RPAREN, "Expected ')' after arguments");
          return { type: 'SuperCallExpression', method: 'init', args, line: textToken.line } as any;
        }
        this.expect(TokenType.DOT, "Expected '.' after super");
        const methodName = this.expect(TokenType.TEXT, 'Expected method name after super.').value;
        this.expect(TokenType.LPAREN, "Expected '(' after method name");
        const args: ExpressionNode[] = [];
        while (!this.check(TokenType.RPAREN)) {
          args.push(this.parseExpression());
        }
        this.expect(TokenType.RPAREN, "Expected ')' after arguments");
        return { type: 'SuperCallExpression', method: methodName, args, line: textToken.line } as any;
      }

      return { type: 'Identifier', name: value, line: textToken.line };
    }

    if (this.match(TokenType.NUMBER)) {
      const numToken = this.previous();
      const strValue = numToken.value;
      let numValue: number;
      
      if (strValue.startsWith('0b') || strValue.startsWith('0B')) {
        numValue = parseInt(strValue.slice(2), 2);
      } else if (strValue.startsWith('0o') || strValue.startsWith('0O')) {
        numValue = parseInt(strValue.slice(2), 8);
      } else if (strValue.startsWith('0x') || strValue.startsWith('0X')) {
        numValue = parseInt(strValue.slice(2), 16);
      } else {
        numValue = parseFloat(strValue);
      }
      
      return { type: 'NumberLiteral', value: numValue, raw: strValue, line: numToken.line };
    }

    if (this.check(TokenType.LPAREN)) {
      if (this.isArrowFunction()) {
        this.advance();
        return this.parseArrowFunction();
      }
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN, "Expected ')' after expression");
      return expr;
    }

    if (this.match(TokenType.LBRACKET)) {
      const elements: ExpressionNode[] = [];
      if (!this.check(TokenType.RBRACKET)) {
        do {
          elements.push(this.parseArrayElement());
        } while (this.match(TokenType.COMMA) || this.isNextValueStart());
      }
      this.expect(TokenType.RBRACKET, "Expected ']'");
      return { type: 'ArrayLiteral', elements, line: this.previous().line };
    }

    if (this.match(TokenType.LBRACE)) {
      const properties = new Map<string, ExpressionNode>();
      const entries: Array<
        | { kind: 'property'; key: string; value: ExpressionNode }
        | { kind: 'computed'; key: ExpressionNode; value: ExpressionNode }
        | { kind: 'spread'; value: ExpressionNode }
      > = [];
      if (!this.check(TokenType.RBRACE)) {
        do {
          if (this.match(TokenType.SPREAD)) {
            const spreadValue = this.parsePropertyValue();
            const split = this.trySplitSpreadAndComputedEntry(spreadValue);
            if (split) {
              entries.push({ kind: 'spread', value: split.base });
              this.expect(TokenType.COLON, "Expected ':' after computed property key");
              const computedValue = this.parsePropertyValue();
              entries.push({ kind: 'computed', key: split.computedKey, value: computedValue });
            } else {
              entries.push({ kind: 'spread', value: spreadValue });
            }
            continue;
          }
          if (this.check(TokenType.LBRACKET)) {
            this.advance();
            const keyExpr = this.parseExpression();
            this.expect(TokenType.RBRACKET, "Expected ']' after computed property key");
            this.expect(TokenType.COLON, "Expected ':' after computed property key");
            const value = this.parsePropertyValue();
            entries.push({ kind: 'computed', key: keyExpr, value });
            continue;
          }
          if (!this.check(TokenType.TEXT) && !this.check(TokenType.STRING_LITERAL)) {
            throw new ParseError(
              "Expected property key (identifier, string literal, spread, or computed key)",
              this.peek()
            );
          }
          const keyToken = this.advance();
          const key = keyToken.value;
          let value: ExpressionNode;
          if (this.match(TokenType.COLON)) {
            value = this.parsePropertyValue();
          } else if (keyToken.type === TokenType.TEXT) {
            value = { type: 'Identifier', name: key, line: keyToken.line } as Identifier;
          } else {
            throw new ParseError("Expected ':' after string-literal property key", this.peek());
          }
          entries.push({ kind: 'property', key, value });
          properties.set(key, value);
        } while (
          this.match(TokenType.COMMA) ||
          (
            (
              this.check(TokenType.TEXT) ||
              this.check(TokenType.STRING_LITERAL) ||
              this.check(TokenType.SPREAD) ||
              this.check(TokenType.LBRACKET)
            ) &&
            !this.check(TokenType.RBRACE)
          )
        );
      }
      this.expect(TokenType.RBRACE, "Expected '}'");
      return { type: 'ObjectLiteral', properties, entries, line: this.previous().line };
    }

    throw new ParseError(`Unexpected token: ${this.peek().value}`, this.peek());
  }

  private parseMatchExpression(line: number): any {
    const expression = this.parseMatchSubject();
    
    this.expect(TokenType.LBRACE, "Expected '{' after match expression");
    
    const cases: any[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const case_ = this.parseMatchCase();
      cases.push(case_);
    }
    
    this.expect(TokenType.RBRACE, "Expected '}' after match cases");
    
    return {
      type: 'Match',
      expression,
      cases,
      line
    };
  }

  private parseMatchSubject(): any {
    if (this.check(TokenType.LPAREN)) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN, "Expected ')' after expression");
      return expr;
    }
    
    if (this.check(TokenType.MINUS)) {
      this.advance();
      if (this.check(TokenType.NUMBER)) {
        const numToken = this.advance();
        return { type: 'NumberLiteral', value: -parseFloat(numToken.value), raw: '-' + numToken.value, line: numToken.line };
      }
    }
    
    if (this.check(TokenType.NUMBER)) {
      const numToken = this.advance();
      return { type: 'NumberLiteral', value: parseFloat(numToken.value), raw: numToken.value, line: numToken.line };
    }
    
    if (this.check(TokenType.STRING_LITERAL)) {
      const strToken = this.advance();
      return { type: 'TextLiteral', value: strToken.value, line: strToken.line };
    }
    
    if (this.check(TokenType.TEXT)) {
      const textToken = this.advance();
      const value = textToken.value;
      
      if (value === 'true') return { type: 'BooleanLiteral', value: true, line: textToken.line };
      if (value === 'false') return { type: 'BooleanLiteral', value: false, line: textToken.line };
      if (value === 'null') return { type: 'NullLiteral', line: textToken.line };
      
      return { type: 'Identifier', name: value, line: textToken.line };
    }
    
    if (this.check(TokenType.LBRACKET)) {
      return this.parseArrayLiteral();
    }
    
    if (this.check(TokenType.LBRACE)) {
      return this.parseObjectLiteral();
    }
    
    throw new ParseError(`Expected expression after 'match'`, this.peek());
  }

  private parseArrayLiteral(): any {
    this.advance();
    const elements: any[] = [];
    
    while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
      elements.push(this.parseArrayElement());
      if (!this.match(TokenType.COMMA) && !this.isNextValueStart()) break;
    }
    
    this.expect(TokenType.RBRACKET, "Expected ']'");
    return { type: 'ArrayLiteral', elements, line: this.previous().line };
  }

  private parseObjectLiteral(): any {
    this.advance();
    const properties = new Map<string, any>();
    const entries: Array<
      { kind: 'property'; key: string; value: any } |
      { kind: 'computed'; key: any; value: any } |
      { kind: 'spread'; value: any }
    > = [];
    
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.SPREAD)) {
        const spreadValue = this.parseExpression();
        const split = this.trySplitSpreadAndComputedEntry(spreadValue);
        if (split) {
          entries.push({ kind: 'spread', value: split.base });
          this.expect(TokenType.COLON, "Expected ':' after computed property key");
          const computedValue = this.parseExpression();
          entries.push({ kind: 'computed', key: split.computedKey, value: computedValue });
        } else {
          entries.push({ kind: 'spread', value: spreadValue });
        }
        if (!this.match(TokenType.COMMA) && !this.check(TokenType.TEXT) && !this.check(TokenType.STRING_LITERAL) && !this.check(TokenType.SPREAD) && !this.check(TokenType.LBRACKET)) break;
        continue;
      }
      if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const keyExpr = this.parseExpression();
        this.expect(TokenType.RBRACKET, "Expected ']' after computed property key");
        this.expect(TokenType.COLON, "Expected ':' after computed property key");
        const value = this.parseExpression();
        entries.push({ kind: 'computed', key: keyExpr, value });
        if (!this.match(TokenType.COMMA) && !this.check(TokenType.TEXT) && !this.check(TokenType.STRING_LITERAL) && !this.check(TokenType.SPREAD) && !this.check(TokenType.LBRACKET)) break;
        continue;
      }
      if (!this.check(TokenType.TEXT) && !this.check(TokenType.STRING_LITERAL)) {
        throw new ParseError(
          "Expected property key (identifier, string literal, spread, or computed key)",
          this.peek()
        );
      }
      const keyToken = this.advance();
      const key = keyToken.value;
      let value: any;
      if (this.match(TokenType.COLON)) {
        value = this.parseExpression();
      } else if (keyToken.type === TokenType.TEXT) {
        value = { type: 'Identifier', name: key, line: keyToken.line };
      } else {
        throw new ParseError("Expected ':' after string-literal property key", this.peek());
      }
      entries.push({ kind: 'property', key, value });
      properties.set(key, value);
      
      if (!this.match(TokenType.COMMA) && !this.check(TokenType.TEXT) && !this.check(TokenType.STRING_LITERAL) && !this.check(TokenType.SPREAD) && !this.check(TokenType.LBRACKET)) break;
    }
    
    this.expect(TokenType.RBRACE, "Expected '}'");
    return { type: 'ObjectLiteral', properties, entries, line: this.previous().line };
  }

  private trySplitSpreadAndComputedEntry(spreadValue: any): { base: any; computedKey: any } | null {
    if (
      this.check(TokenType.COLON) &&
      spreadValue &&
      spreadValue.type === 'Member' &&
      spreadValue.computed
    ) {
      return { base: spreadValue.object, computedKey: spreadValue.property };
    }
    return null;
  }

  private parseMatchCase(): any {
    const pattern = this.parsePattern();
    
    let guard: any = undefined;
    if (this.matchText('if')) {
      guard = this.parseExpression();
    }
    
    this.expect(TokenType.ARROW, "Expected '=>' after pattern");
    
    let body: any[] = [];
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock().statements;
    } else {
      const expr = this.parseExpression();
      body = [{ type: 'Action', action: 'expr', target: expr }];
    }
    
    return { pattern, guard, body };
  }

  private parsePattern(): any {
    return this.parseOrPattern();
  }

  private parseOrPattern(): any {
    let pattern = this.parsePrimaryPattern();
    
    while (this.match(TokenType.PIPE) || this.match(TokenType.BITOR)) {
      const right = this.parsePrimaryPattern();
      pattern = { kind: 'or', patterns: [pattern, right] };
    }
    
    return pattern;
  }

  private parsePrimaryPattern(): any {
    if (this.check(TokenType.TEXT) && this.peek().value === '_') {
      this.advance();
      return { kind: 'wildcard' };
    }
    
    if (this.check(TokenType.NUMBER)) {
      const numToken = this.advance();
      const value = parseFloat(numToken.value);
      
      if (this.match(TokenType.RANGE)) {
        const endToken = this.expect(TokenType.NUMBER, "Expected number after '..'");
        const end = parseFloat(endToken.value);
        return { kind: 'range', start: value, end, inclusive: true };
      }
      
      return { kind: 'literal', value };
    }
    
    if (this.check(TokenType.STRING_LITERAL)) {
      const strToken = this.advance();
      return { kind: 'literal', value: strToken.value };
    }
    
    if (this.matchText('true')) {
      return { kind: 'literal', value: true };
    }
    
    if (this.matchText('false')) {
      return { kind: 'literal', value: false };
    }
    
    if (this.matchText('null')) {
      return { kind: 'literal', value: null };
    }
    
    if (this.check(TokenType.LBRACKET)) {
      return this.parseArrayPattern();
    }
    
    if (this.check(TokenType.LBRACE)) {
      return this.parseObjectPattern();
    }
    
    if (this.check(TokenType.TEXT)) {
      const name = this.advance().value;
      
      if (this.matchText('is')) {
        const typeName = this.expect(TokenType.TEXT, "Expected type name").value;
        return { kind: 'type', typeName, pattern: { kind: 'identifier', name } };
      }
      
      if (this.match(TokenType.COLON)) {
        const typeName = this.expect(TokenType.TEXT, "Expected type name").value;
        return { kind: 'type', typeName, pattern: { kind: 'identifier', name } };
      }
      
      return { kind: 'identifier', name };
    }
    
    throw new ParseError(`Invalid pattern: ${this.peek().value}`, this.peek());
  }

  private parseArrayPattern(): any {
    this.advance();
    const elements: any[] = [];
    let rest: string | undefined;
    
    while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
      if (this.match(TokenType.SPREAD)) {
        rest = this.expect(TokenType.TEXT, "Expected identifier after '...'").value;
        break;
      }
      elements.push(this.parsePattern());
      if (!this.match(TokenType.COMMA) && !(this.check(TokenType.TEXT) || this.check(TokenType.NUMBER) || this.check(TokenType.STRING_LITERAL) || this.check(TokenType.LBRACKET) || this.check(TokenType.LBRACE) || this.check(TokenType.SPREAD))) break;
    }
    
    this.expect(TokenType.RBRACKET, "Expected ']' after array pattern");
    
    return { kind: 'array', elements, rest };
  }

  private parseObjectPattern(): any {
    this.advance();
    const properties: { key: string; pattern: any; default?: any }[] = [];
    let rest: string | undefined;
    
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.SPREAD)) {
        rest = this.expect(TokenType.TEXT, "Expected identifier after '...'").value;
        break;
      }
      
      const key = this.expect(TokenType.TEXT, "Expected property name").value;
      let pattern: any = { kind: 'identifier', name: key };
      let defaultValue: any = undefined;
      
      if (this.match(TokenType.COLON)) {
        pattern = this.parsePattern();
      }
      
      if (this.match(TokenType.ASSIGN)) {
        defaultValue = this.parseExpression();
      }
      
      properties.push({ key, pattern, default: defaultValue });
      
      if (!this.match(TokenType.COMMA) && !this.check(TokenType.TEXT)) break;
    }
    
    this.expect(TokenType.RBRACE, "Expected '}' after object pattern");
    
    return { kind: 'object', properties, rest };
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private matchText(value: string): boolean {
    if (this.check(TokenType.TEXT) && this.peek().value === value) {
      this.advance();
      return true;
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private peekValue(offset: number = 0): string {
    return this.tokens[this.current + offset]?.value || '';
  }

  private peekType(offset: number = 0): TokenType {
    return this.tokens[this.current + offset]?.type || TokenType.EOF;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private expect(type: TokenType, message: string, suggestion: string = ''): Token {
    if (this.check(type)) return this.advance();
    throw new ParseError(message, this.peek(), suggestion);
  }

  private parseArrayElement(): ExpressionNode {
    if (this.match(TokenType.MINUS)) {
      if (this.check(TokenType.NUMBER)) {
        const numToken = this.advance();
        return { type: 'NumberLiteral', value: -numToken.value, raw: '-' + numToken.value, line: numToken.line };
      }
      this.current--;
    }
    return this.parseArrayElementExpr();
  }

  private parseArrayElementExpr(): ExpressionNode {
    return this.parseArrayElementComparison();
  }

  private parseArrayElementComparison(): ExpressionNode {
    let expr = this.parseArrayElementTerm();

    while (this.check(TokenType.LT) || this.check(TokenType.GT) || 
           this.check(TokenType.LTE) || this.check(TokenType.GTE) ||
           this.check(TokenType.EQ) || this.check(TokenType.NEQ)) {
      const op = this.advance().value;
      const right = this.parseArrayElementTerm();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private parseArrayElementTerm(): ExpressionNode {
    let expr = this.parseFactor();

    while (this.check(TokenType.PLUS)) {
      const op = this.advance().value;
      const right = this.parseFactor();
      expr = { type: 'BinaryOp', operator: op, left: expr, right, line: expr.line };
    }

    return expr;
  }

  private isNextValueStart(): boolean {
    if (this.isAtEnd()) return false;
    const type = this.peek().type;
    return [
      TokenType.NUMBER,
      TokenType.STRING_LITERAL,
      TokenType.TEXT,
      TokenType.LBRACKET,
      TokenType.LBRACE,
      TokenType.LPAREN,
      TokenType.NOUN,
      TokenType.VERB,
      TokenType.NOT,
      TokenType.MINUS
    ].includes(type);
  }

  private isTypeAlias(): boolean {
    if (this.isAtEnd()) return false;
    const nextToken = this.tokens[this.current + 1];
    if (!nextToken || nextToken.type !== TokenType.TEXT) return false;
    const afterName = this.tokens[this.current + 2];
    return afterName && afterName.type === TokenType.ASSIGN;
  }

  private isObjectLiteral(): boolean {
    if (this.isAtEnd()) return false;
    const nextToken = this.tokens[this.current + 1];
    
    if (!nextToken) return false;
    
    if (nextToken.type === TokenType.RBRACE) return true;
    
    if (nextToken.type === TokenType.SPREAD || nextToken.type === TokenType.LBRACKET) return true;

    if (nextToken.type === TokenType.TEXT || nextToken.type === TokenType.STRING_LITERAL) {
      const afterKey = this.tokens[this.current + 2];
      return afterKey && afterKey.type === TokenType.COLON;
    }
    
    return false;
  }

  private isArrowFunction(): boolean {
    let lookahead = this.current + 1;
    let parenCount = 1;
    
    while (lookahead < this.tokens.length && parenCount > 0) {
      const token = this.tokens[lookahead];
      if (token.type === TokenType.LPAREN) parenCount++;
      if (token.type === TokenType.RPAREN) parenCount--;
      lookahead++;
    }
    
    if (lookahead < this.tokens.length && this.tokens[lookahead].type === TokenType.ARROW) {
      return true;
    }
    
    return false;
  }

  private isArrowFunctionAt(pos: number): boolean {
    let lookahead = pos + 1;
    let parenCount = 1;
    
    while (lookahead < this.tokens.length && parenCount > 0) {
      const token = this.tokens[lookahead];
      if (token.type === TokenType.LPAREN) parenCount++;
      if (token.type === TokenType.RPAREN) parenCount--;
      lookahead++;
    }
    
    if (lookahead < this.tokens.length && this.tokens[lookahead].type === TokenType.ARROW) {
      return true;
    }
    
    return false;
  }

  private isAnonymousFunctionLiteralStart(): boolean {
    if (!this.check(TokenType.LPAREN)) return false;
    let lookahead = this.current;
    let parenCount = 0;
    while (lookahead < this.tokens.length) {
      const token = this.tokens[lookahead];
      if (token.type === TokenType.LPAREN) parenCount++;
      if (token.type === TokenType.RPAREN) {
        parenCount--;
        if (parenCount === 0) {
          return lookahead + 1 < this.tokens.length &&
                 this.tokens[lookahead + 1].type === TokenType.LBRACE;
        }
      }
      lookahead++;
    }
    return false;
  }

  private parseArrowBodyExpression(): ExpressionNode {
    if (this.check(TokenType.TEXT) && this.peekValue() === 'if') {
      return this.parseInlineIfExpression();
    }
    return this.parseExpression();
  }

  private parseInlineIfExpression(): ExpressionNode {
    const ifStmt = this.parseIfStatement();
    return this.ifStatementToConditionalExpression(ifStmt);
  }

  private ifStatementToConditionalExpression(ifStmt: IfStatement): ExpressionNode {
    const ifLine = ifStmt.line ?? ifStmt.condition.line ?? this.peek().line;
    const consequent = this.extractSingleExpressionFromBranch(
      ifStmt.thenBranch,
      'then'
    );

    if (!ifStmt.elseBranch || ifStmt.elseBranch.length === 0) {
      throw new ParseError("Arrow if-expression requires an else branch", this.peek());
    }

    let alternate: ExpressionNode;
    if (ifStmt.elseBranch.length === 1 && ifStmt.elseBranch[0].type === 'If') {
      alternate = this.ifStatementToConditionalExpression(ifStmt.elseBranch[0] as IfStatement);
    } else {
      alternate = this.extractSingleExpressionFromBranch(ifStmt.elseBranch, 'else');
    }

    return {
      type: 'Conditional',
      condition: ifStmt.condition,
      consequent,
      alternate,
      line: ifLine
    };
  }

  private extractSingleExpressionFromBranch(
    branch: StatementNode[],
    branchName: 'then' | 'else'
  ): ExpressionNode {
    if (!branch || branch.length !== 1) {
      throw new ParseError(
        `Arrow if-expression ${branchName} branch must contain exactly one expression`,
        this.peek()
      );
    }

    const stmt = branch[0] as any;
    if (stmt.type === 'Action' && stmt.action === 'expr' && stmt.target) {
      return stmt.target as ExpressionNode;
    }

    if (stmt.type === 'Return' && stmt.value) {
      return stmt.value as ExpressionNode;
    }

    throw new ParseError(
      `Arrow if-expression ${branchName} branch must be an expression`,
      this.peek()
    );
  }

  private parseAnonymousFunction(line: number): ExpressionNode {
    this.expect(TokenType.LPAREN, "Expected '(' after fn");
    const params: string[] = [];

    if (!this.check(TokenType.RPAREN)) {
      do {
        if (this.check(TokenType.TEXT)) {
          params.push(this.advance().value);
        }
      } while (this.match(TokenType.COMMA) || (this.check(TokenType.TEXT) && !this.check(TokenType.RPAREN)));
    }

    this.expect(TokenType.RPAREN, "Expected ')' after anonymous function parameters");

    let body: ExpressionNode;

    if (this.check(TokenType.LBRACE)) {
      this.advance();
      const statements: StatementNode[] = [];
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        const stmt = this.parseStatement();
        if (stmt) statements.push(stmt);
      }
      this.expect(TokenType.RBRACE, "Expected '}' after anonymous function body");
      body = { type: 'Block', statements, line: this.previous().line } as any;
    } else {
      body = this.parseArrowBodyExpression();
    }

    return {
      type: 'ArrowFunction',
      params,
      body,
      line
    };
  }

  private parseArrowFunction(): ExpressionNode {
    const params: string[] = [];
    
    if (!this.check(TokenType.RPAREN)) {
      do {
        if (this.check(TokenType.TEXT)) {
          params.push(this.advance().value);
        }
      } while (this.match(TokenType.COMMA) || (this.check(TokenType.TEXT) && !this.check(TokenType.RPAREN)));
    }
    
    this.expect(TokenType.RPAREN, "Expected ')' after arrow function parameters");
    this.expect(TokenType.ARROW, "Expected '=>' after parameters");
    
    let body: ExpressionNode;
    
    if (this.check(TokenType.LBRACE)) {
      this.advance();
      const statements: StatementNode[] = [];
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        const stmt = this.parseStatement();
        if (stmt) statements.push(stmt);
      }
      this.expect(TokenType.RBRACE, "Expected '}' after arrow function body");
      body = { type: 'Block', statements, line: this.previous().line } as any;
    } else {
      body = this.parseArrowBodyExpression();
    }
    
    return {
      type: 'ArrowFunction',
      params,
      body,
      line: this.previous().line
    };
  }
}

export function parse(source: string): ProgramNode {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}
