// SeedLang AST 节点类型定义：Token 类型枚举、AST 节点接口（Statement / Expression / Type / Pattern 等）

export enum TokenType {
  AT = 'AT',
  VERB = 'VERB',
  NOUN = 'NOUN',
  TEXT = 'TEXT',
  STRING_LITERAL = 'STRING_LITERAL',
  NUMBER = 'NUMBER',
  ASSIGN = 'ASSIGN',
  ARROW = 'ARROW',
  QUESTION = 'QUESTION',
  COLON = 'COLON',
  SEMICOLON = 'SEMICOLON',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  COMMA = 'COMMA',
  DOT = 'DOT',
  RANGE = 'RANGE',
  SPREAD = 'SPREAD',
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  STAR = 'STAR',
  SLASH = 'SLASH',
  PERCENT = 'PERCENT',
  PLUS_ASSIGN = 'PLUS_ASSIGN',
  MINUS_ASSIGN = 'MINUS_ASSIGN',
  STAR_ASSIGN = 'STAR_ASSIGN',
  SLASH_ASSIGN = 'SLASH_ASSIGN',
  PERCENT_ASSIGN = 'PERCENT_ASSIGN',
  EQ = 'EQ',
  NEQ = 'NEQ',
  LT = 'LT',
  GT = 'GT',
  LTE = 'LTE',
  GTE = 'GTE',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  PIPE = 'PIPE',
  BITAND = 'BITAND',
  BITOR = 'BITOR',
  BITXOR = 'BITXOR',
  BITNOT = 'BITNOT',
  LSHIFT = 'LSHIFT',
  RSHIFT = 'RSHIFT',
  URSHIFT = 'URSHIFT',
  MACRO = 'MACRO',
  PROC_MACRO = 'PROC_MACRO',
  EOF = 'EOF'
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export interface ASTNode {
  type: string;
  line?: number;
}

export interface ProgramNode extends ASTNode {
  type: 'Program';
  statements: StatementNode[];
}

export interface StatementNode extends ASTNode {
  type: string;
}

export interface WebDirectiveStatement extends StatementNode {
  type: 'WebDirective';
  namespace: string;
  name: string;
  args: ExpressionNode[];
  namedArgs?: { key: string; value: ExpressionNode }[];
}

export interface WebDirectiveBlockStatement extends StatementNode {
  type: 'WebDirectiveBlock';
  namespace: string;
  directives: WebDirectiveStatement[];
}

export interface DeclarationStatement extends StatementNode {
  type: 'Declaration';
  prefix: string;
  subject?: ExpressionNode;
  verb?: VerbExpression;
  object?: ExpressionNode;
}

export interface VarDeclStatement extends StatementNode {
  type: 'VarDecl';
  name: string;
  value?: ExpressionNode;
}

export interface QuestionStatement extends StatementNode {
  type: 'Question';
  condition: ExpressionNode;
  thenBranch?: StatementNode[];
  elseBranch: StatementNode[] | undefined;
}

export interface ActionStatement extends StatementNode {
  type: 'Action';
  action: string;
  target?: ExpressionNode;
  content?: ExpressionNode;
}

export interface VerbExpression {
  type: 'Verb';
  name: string;
  modifier?: string;
}

export interface NounReference extends ASTNode {
  type: 'NounRef';
  index: number;
}

export interface TextLiteral extends ASTNode {
  type: 'TextLiteral';
  value: string;
}

export interface NumberLiteral extends ASTNode {
  type: 'NumberLiteral';
  value: number;
  raw?: string;
}

export interface BooleanLiteral extends ASTNode {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface NullLiteral extends ASTNode {
  type: 'NullLiteral';
}

export interface BinaryExpression extends ASTNode {
  type: 'BinaryOp';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface ArrowFunction extends ASTNode {
  type: 'ArrowFunction';
  params: string[];
  body: ExpressionNode;
}

export interface CallExpression extends ASTNode {
  type: 'Call';
  callee: ExpressionNode;
  args: ExpressionNode[];
  typeArgs?: TypeNode[];
}

export interface SuperCallExpression extends ASTNode {
  type: 'SuperCallExpression';
  method: string;
  args: ExpressionNode[];
}

export interface GenericCallExpression extends ASTNode {
  type: 'GenericCall';
  callee: ExpressionNode;
  typeArgs: TypeNode[];
  args: ExpressionNode[];
}

export interface BlockStatement extends StatementNode {
  type: 'Block';
  statements: StatementNode[];
}

export interface FunctionDef extends StatementNode {
  type: 'FunctionDef';
  name: string;
  params: string[];
  paramTypes?: TypeNode[];
  returnType?: TypeNode;
  genericParams?: string[];
  body: StatementNode[];
  isStatic?: boolean;
}

export interface ReturnStatement extends StatementNode {
  type: 'Return';
  value?: ExpressionNode;
}

export interface IfStatement extends StatementNode {
  type: 'If';
  condition: ExpressionNode;
  thenBranch: StatementNode[];
  elseBranch?: StatementNode[];
}

export interface WhileStatement extends StatementNode {
  type: 'While';
  condition: ExpressionNode;
  body: StatementNode[];
}

export interface ForStatement extends StatementNode {
  type: 'For';
  init?: StatementNode;
  condition?: ExpressionNode;
  update?: StatementNode;
  body: StatementNode[];
}

export interface ForInStatement extends StatementNode {
  type: 'ForIn';
  variable: string;
  iterable: ExpressionNode;
  body: StatementNode[];
}

export interface BreakStatement extends StatementNode {
  type: 'Break';
}

export interface ContinueStatement extends StatementNode {
  type: 'Continue';
}

export interface ImportStatement extends StatementNode {
  type: 'Import';
  module: string;
  alias?: string;
  items?: string[];
}

export interface ExportStatement extends StatementNode {
  type: 'Export';
  declaration: StatementNode;
}

export interface ClassDef extends StatementNode {
  type: 'ClassDef';
  name: string;
  superClass?: string;
  genericParams?: string[];
  properties: { name: string; value?: ExpressionNode; type?: TypeNode }[];
  methods: FunctionDef[];
}

export interface TryStatement extends StatementNode {
  type: 'Try';
  body: StatementNode[];
  catchClause?: CatchClause;
  finallyBlock?: StatementNode[];
}

export interface ThrowStatement extends StatementNode {
  type: 'Throw';
  value: ExpressionNode;
}

export interface CatchClause {
  param?: string;
  body: StatementNode[];
}

export interface AsyncFunctionDef extends StatementNode {
  type: 'AsyncFunctionDef' | 'FunctionDef';
  name?: string;
  params: string[];
  body: StatementNode[];
}

export interface CoroutineDef extends StatementNode {
  type: 'CoroutineDef';
  name: string;
  params: string[];
  body: StatementNode[];
}

export interface YieldStatement extends StatementNode {
  type: 'Yield';
  value?: ExpressionNode;
}

export interface YieldExpression extends ASTNode {
  type: 'YieldExpr';
  value?: ExpressionNode;
}

export interface MacroDef extends StatementNode {
  type: 'MacroDef';
  name: string;
  params: string[];
  body: StatementNode[];
}

export interface MacroCall extends ASTNode {
  type: 'MacroCall';
  name: string;
  args: ExpressionNode[];
}

export interface AwaitExpression {
  type: 'Await';
  expression: ExpressionNode;
  line: number;
}

export interface SwitchStatement extends StatementNode {
  type: 'Switch';
  expression: ExpressionNode;
  cases: CaseClause[];
  defaultCase?: StatementNode[];
}

export interface CaseClause {
  value: ExpressionNode;
  body: StatementNode[];
}

export interface InterfaceDef extends StatementNode {
  type: 'InterfaceDef';
  name: string;
  genericParams?: string[];
  properties: { name: string; typeExpr: TypeNode }[];
  methods: FunctionDef[];
}

export interface TypeAnnotation {
  type: 'TypeAnnotation';
  targetType: string;
  typeExpr: TypeNode;
}

export interface TypeAlias extends StatementNode {
  type: 'TypeAlias';
  name: string;
  genericParams?: string[];
  typeExpr: TypeNode;
}

export type TypeNode =
  | PrimitiveType
  | ArrayType
  | ObjectType
  | UnionType
  | FunctionType
  | GenericType
  | NamedType;

export interface PrimitiveType {
  kind: 'primitive';
  name: 'string' | 'number' | 'boolean' | 'null' | 'any' | 'void';
}

export interface ArrayType {
  kind: 'array';
  elementType: TypeNode;
}

export interface ObjectType {
  kind: 'object';
  properties: Map<string, TypeNode>;
}

export interface UnionType {
  kind: 'union';
  types: TypeNode[];
}

export interface FunctionType {
  kind: 'function';
  params: TypeNode[];
  returnType: TypeNode;
}

export interface GenericType {
  kind: 'generic';
  name: string;
}

export interface NamedType {
  kind: 'named';
  name: string;
  typeArgs?: TypeNode[];
}

export interface ObjectLiteral extends ASTNode {
  type: 'ObjectLiteral';
  properties: Map<string, ExpressionNode>;
  entries?: Array<
    | { kind: 'property'; key: string; value: ExpressionNode }
    | { kind: 'computed'; key: ExpressionNode; value: ExpressionNode }
    | { kind: 'spread'; value: ExpressionNode }
  >;
}

export interface ArrayLiteral extends ASTNode {
  type: 'ArrayLiteral';
  elements: ExpressionNode[];
}

export interface MemberExpression extends ASTNode {
  type: 'Member';
  object: ExpressionNode;
  property: string | ExpressionNode;
  computed?: boolean;
}

export interface AssignmentExpression extends ASTNode {
  type: 'Assignment';
  target: ExpressionNode;
  value: ExpressionNode;
  operator?: string;
}

export interface LogicalExpression extends ASTNode {
  type: 'Logical';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface ConditionalExpression extends ASTNode {
  type: 'Conditional';
  condition: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
}

export interface UnaryExpression extends ASTNode {
  type: 'Unary';
  operator: string;
  operand: ExpressionNode;
}

export interface Identifier extends ASTNode {
  type: 'Identifier';
  name: string;
}

export interface BlockExpression extends ASTNode {
  type: 'Block';
  statements: StatementNode[];
}

export interface MatchExpression extends ASTNode {
  type: 'Match';
  expression: ExpressionNode;
  cases: MatchCase[];
}

export interface MatchCase {
  pattern: Pattern;
  guard?: ExpressionNode;
  body: StatementNode[];
}

export type Pattern =
  | LiteralPattern
  | IdentifierPattern
  | WildcardPattern
  | ObjectPattern
  | ArrayPattern
  | OrPattern
  | RangePattern
  | TypePattern;

export interface LiteralPattern {
  kind: 'literal';
  value: number | string | boolean | null;
}

export interface IdentifierPattern {
  kind: 'identifier';
  name: string;
}

export interface WildcardPattern {
  kind: 'wildcard';
}

export interface ObjectPattern {
  kind: 'object';
  properties: { key: string; pattern: Pattern; default?: ExpressionNode }[];
  rest?: string;
}

export interface ArrayPattern {
  kind: 'array';
  elements: Pattern[];
  rest?: { start?: number; end?: number };
}

export interface OrPattern {
  kind: 'or';
  patterns: Pattern[];
}

export interface RangePattern {
  kind: 'range';
  start: number;
  end: number;
  inclusive: boolean;
}

export interface TypePattern {
  kind: 'type';
  typeName: string;
  pattern?: Pattern;
}

export type ExpressionNode =
  | NounReference
  | TextLiteral
  | NumberLiteral
  | BooleanLiteral
  | NullLiteral
  | BinaryExpression
  | ArrowFunction
  | CallExpression
  | SuperCallExpression
  | GenericCallExpression
  | ObjectLiteral
  | ArrayLiteral
  | MemberExpression
  | AssignmentExpression
  | LogicalExpression
  | ConditionalExpression
  | UnaryExpression
  | Identifier
  | AwaitExpression
  | YieldExpression
  | MacroCall
  | BlockExpression
  | MatchExpression;

export interface WebComponent {
  type: 'WebComponent';
  tag: string;
  props: Map<string, ExpressionNode>;
  children: (ExpressionNode | WebComponent)[];
}

export interface AgentTask {
  type: 'AgentTask';
  action: string;
  params: Map<string, ExpressionNode>;
}

export interface GameEntity {
  type: 'GameEntity';
  entityType: string;
  props: Map<string, ExpressionNode>;
}
