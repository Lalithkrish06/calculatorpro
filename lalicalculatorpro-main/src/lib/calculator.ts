// Calculator expression evaluator with safe tokenizer/parser.
// Supports: + - * / % , parentheses, ^ (power), unary -, functions,
// constants pi/e, factorial !, and degree/radian modes for trig.

export type AngleMode = "deg" | "rad";

const FUNCTIONS = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan",
  "ln", "log", "sqrt", "cbrt", "abs", "exp", "fact",
]);

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: string }
  | { type: "fn"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

function tokenize(input: string): Token[] {
  const src = input
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/,/g, "");

  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = parseFloat(src.slice(i, j));
      if (isNaN(n)) throw new Error("Invalid number");
      tokens.push({ type: "num", value: n });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
      const word = src.slice(i, j).toLowerCase();
      if (word === "pi") tokens.push({ type: "num", value: Math.PI });
      else if (word === "e") tokens.push({ type: "num", value: Math.E });
      else if (FUNCTIONS.has(word)) tokens.push({ type: "fn", value: word });
      else throw new Error(`Unknown identifier: ${word}`);
      i = j;
      continue;
    }
    if ("+-*/%^".includes(c)) { tokens.push({ type: "op", value: c }); i++; continue; }
    if (c === "!") { tokens.push({ type: "op", value: "!" }); i++; continue; }
    if (c === "(") { tokens.push({ type: "lparen" }); i++; continue; }
    if (c === ")") { tokens.push({ type: "rparen" }); i++; continue; }
    if (c === ",") { tokens.push({ type: "comma" }); i++; continue; }
    throw new Error(`Unexpected character: ${c}`);
  }
  return tokens;
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new Error("Factorial needs non-negative integer");
  if (n > 170) throw new Error("Factorial overflow");
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function toRad(deg: number) { return (deg * Math.PI) / 180; }
function fromRad(rad: number) { return (rad * 180) / Math.PI; }

// Recursive descent parser
class Parser {
  pos = 0;
  constructor(public tokens: Token[], public mode: AngleMode) {}

  peek(): Token | undefined { return this.tokens[this.pos]; }
  consume(): Token { return this.tokens[this.pos++]; }

  parse(): number {
    const v = this.parseExpr();
    if (this.pos < this.tokens.length) throw new Error("Unexpected trailing input");
    return v;
  }

  parseExpr(): number { return this.parseAdd(); }

  parseAdd(): number {
    let left = this.parseMul();
    while (this.peek()?.type === "op" && (this.peek() as any).value === "+" || (this.peek() as any)?.value === "-") {
      const op = (this.consume() as any).value;
      const right = this.parseMul();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  parseMul(): number {
    let left = this.parsePow();
    while (true) {
      const t = this.peek();
      if (t?.type === "op" && ["*", "/", "%"].includes((t as any).value)) {
        const op = (this.consume() as any).value;
        const right = this.parsePow();
        if (op === "*") left *= right;
        else if (op === "/") {
          if (right === 0) throw new Error("Cannot divide by zero");
          left /= right;
        } else left %= right;
      } else break;
    }
    return left;
  }

  parsePow(): number {
    const base = this.parseUnary();
    const t = this.peek();
    if (t?.type === "op" && (t as any).value === "^") {
      this.consume();
      const exp = this.parsePow();
      return Math.pow(base, exp);
    }
    return base;
  }

  parseUnary(): number {
    const t = this.peek();
    if (t?.type === "op" && ((t as any).value === "-" || (t as any).value === "+")) {
      const op = (this.consume() as any).value;
      const v = this.parseUnary();
      return op === "-" ? -v : v;
    }
    return this.parsePostfix();
  }

  parsePostfix(): number {
    let v = this.parsePrimary();
    while (this.peek()?.type === "op" && (this.peek() as any).value === "!") {
      this.consume();
      v = factorial(v);
    }
    return v;
  }

  parsePrimary(): number {
    const t = this.consume();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.type === "num") return t.value;
    if (t.type === "lparen") {
      const v = this.parseExpr();
      const close = this.consume();
      if (!close || close.type !== "rparen") throw new Error("Missing closing parenthesis");
      return v;
    }
    if (t.type === "fn") {
      const open = this.consume();
      if (!open || open.type !== "lparen") throw new Error(`Expected '(' after ${t.value}`);
      const arg = this.parseExpr();
      const close = this.consume();
      if (!close || close.type !== "rparen") throw new Error("Missing closing parenthesis");
      return this.applyFn(t.value, arg);
    }
    throw new Error("Unexpected token");
  }

  applyFn(name: string, x: number): number {
    switch (name) {
      case "sin": return Math.sin(this.mode === "deg" ? toRad(x) : x);
      case "cos": return Math.cos(this.mode === "deg" ? toRad(x) : x);
      case "tan": return Math.tan(this.mode === "deg" ? toRad(x) : x);
      case "asin": { const r = Math.asin(x); return this.mode === "deg" ? fromRad(r) : r; }
      case "acos": { const r = Math.acos(x); return this.mode === "deg" ? fromRad(r) : r; }
      case "atan": { const r = Math.atan(x); return this.mode === "deg" ? fromRad(r) : r; }
      case "ln": if (x <= 0) throw new Error("ln domain error"); return Math.log(x);
      case "log": if (x <= 0) throw new Error("log domain error"); return Math.log10(x);
      case "sqrt": if (x < 0) throw new Error("sqrt of negative"); return Math.sqrt(x);
      case "cbrt": return Math.cbrt(x);
      case "abs": return Math.abs(x);
      case "exp": return Math.exp(x);
      case "fact": return factorial(x);
    }
    throw new Error(`Unknown function: ${name}`);
  }
}

export function evaluate(expression: string, mode: AngleMode = "rad"): number {
  if (!expression.trim()) throw new Error("Empty expression");
  const tokens = tokenize(expression);
  const result = new Parser(tokens, mode).parse();
  if (!isFinite(result)) throw new Error("Result is not finite");
  // precision control
  return Math.round(result * 1e12) / 1e12;
}

export function formatNumber(n: number): string {
  if (!isFinite(n)) return "Error";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) return n.toExponential(6);
  const [intPart, decPart] = n.toString().split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart ? `${withCommas}.${decPart}` : withCommas;
}

export function balanceParens(expr: string): string {
  let open = 0;
  for (const c of expr) {
    if (c === "(") open++;
    else if (c === ")") open = Math.max(0, open - 1);
  }
  return expr + ")".repeat(open);
}
