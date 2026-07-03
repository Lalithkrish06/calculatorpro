import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Moon, Sun, History as HistoryIcon, Trash2, X, Copy, Check,
  Volume2, VolumeX, FlaskConical, Calculator as CalcIcon,
} from "lucide-react";
import { evaluate, formatNumber, balanceParens, type AngleMode } from "@/lib/calculator";

type HistoryItem = { id: string; expression: string; result: string; at: number };

const LS = {
  theme: "calc:theme",
  history: "calc:history",
  last: "calc:last",
  mode: "calc:mode",
  sci: "calc:sci",
  angle: "calc:angle",
  sound: "calc:sound",
};

function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

function playClick(enabled: boolean) {
  if (!enabled) return;
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 660;
    g.gain.value = 0.04;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    o.stop(ctx.currentTime + 0.09);
    setTimeout(() => ctx.close(), 200);
  } catch {}
}

function vibrate(ms = 8) {
  try { (navigator as any).vibrate?.(ms); } catch {}
}

type BtnKind = "num" | "op" | "fn" | "eq" | "util" | "danger";

function Button({
  label, ariaLabel, onPress, kind = "num", className = "", title,
}: {
  label: React.ReactNode;
  ariaLabel: string;
  onPress: () => void;
  kind?: BtnKind;
  className?: string;
  title?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const styles: Record<BtnKind, string> = {
    num: "bg-surface hover:bg-card text-foreground shadow-soft",
    op: "bg-operator text-operator-foreground hover:brightness-110 shadow-soft",
    fn: "bg-muted/60 text-muted-foreground hover:bg-muted text-sm",
    eq: "gradient-equals text-equals-foreground shadow-glow",
    util: "bg-secondary text-secondary-foreground hover:brightness-110",
    danger: "bg-destructive/10 text-destructive hover:bg-destructive/20",
  };

  const handle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = ref.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const span = document.createElement("span");
      span.className = "ripple";
      span.style.width = span.style.height = `${size}px`;
      span.style.left = `${e.clientX - rect.left - size / 2}px`;
      span.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(span);
      setTimeout(() => span.remove(), 600);
    }
    onPress();
  };

  return (
    <button
      ref={ref}
      onClick={handle}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className={`calc-btn h-14 sm:h-16 text-lg sm:text-xl ${styles[kind]} ${className}`}
    >
      {label}
    </button>
  );
}

export default function Calculator() {
  const [theme, setTheme] = useLocalStorage<"light" | "dark">(LS.theme, "dark");
  const [expr, setExpr] = useLocalStorage<string>(LS.last, "");
  const [history, setHistory] = useLocalStorage<HistoryItem[]>(LS.history, []);
  const [sci, setSci] = useLocalStorage<boolean>(LS.sci, false);
  const [angle, setAngle] = useLocalStorage<AngleMode>(LS.angle, "deg");
  const [sound, setSound] = useLocalStorage<boolean>(LS.sound, false);

  const [previous, setPrevious] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  // Live preview
  const preview = useMemo(() => {
    const e = expr.trim();
    if (!e) return "";
    try {
      const balanced = balanceParens(e);
      const r = evaluate(balanced, angle);
      const f = formatNumber(r);
      if (f === e) return "";
      return f;
    } catch { return ""; }
  }, [expr, angle]);

  const displayExpr = useMemo(() => {
    // add thousands commas to standalone integer runs
    return expr.replace(/\d+(\.\d+)?/g, (m) => {
      const [i, d] = m.split(".");
      return (i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")) + (d ? "." + d : "");
    });
  }, [expr]);

  const press = useCallback((value: string) => {
    playClick(sound); vibrate(6);
    setError(null);
    setExpr((prev) => {
      const last = prev.slice(-1);
      const ops = "+-*/%^×÷−";
      // prevent consecutive operators
      if (ops.includes(value) && ops.includes(last)) {
        return prev.slice(0, -1) + value;
      }
      // prevent multiple decimals in current number
      if (value === ".") {
        const m = prev.match(/(\d+\.?\d*)$/);
        if (m && m[0].includes(".")) return prev;
        if (!m) return prev + "0.";
      }
      return prev + value;
    });
  }, [setExpr, sound]);

  const pressFn = useCallback((fn: string) => {
    playClick(sound); vibrate(6);
    setError(null);
    setExpr((prev) => prev + `${fn}(`);
  }, [setExpr, sound]);

  const clearAll = useCallback(() => {
    playClick(sound); vibrate(10);
    setExpr(""); setPrevious(""); setError(null);
  }, [setExpr, sound]);

  const backspace = useCallback(() => {
    playClick(sound); vibrate(4);
    setError(null);
    setExpr((p) => {
      // remove trailing function name with paren e.g. "sin(" as a unit
      const fnMatch = p.match(/(sin|cos|tan|asin|acos|atan|ln|log|sqrt|cbrt|abs|exp|fact)\($/);
      if (fnMatch) return p.slice(0, -fnMatch[0].length);
      return p.slice(0, -1);
    });
  }, [setExpr, sound]);

  const toggleSign = useCallback(() => {
    playClick(sound); vibrate(6);
    setExpr((p) => {
      const m = p.match(/(-?\d+\.?\d*)$/);
      if (!m) return p;
      const num = m[0];
      const start = p.length - num.length;
      const flipped = num.startsWith("-") ? num.slice(1) : "-" + num;
      // Wrap in parens if mid-expression and negative to keep evaluator happy
      const before = p.slice(0, start);
      if (before && flipped.startsWith("-") && !/[+\-*/%^(]$/.test(before)) {
        return before + "(" + flipped + ")";
      }
      return before + flipped;
    });
  }, [setExpr, sound]);

  const compute = useCallback(() => {
    if (!expr.trim()) return;
    playClick(sound); vibrate(12);
    try {
      const balanced = balanceParens(expr);
      const result = evaluate(balanced, angle);
      const f = formatNumber(result);
      setPrevious(`${displayExpr} =`);
      setHistory((h) => [
        { id: crypto.randomUUID(), expression: expr, result: f, at: Date.now() },
        ...h,
      ].slice(0, 100));
      setExpr(f.replace(/,/g, ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setShake(true);
      setTimeout(() => setShake(false), 450);
    }
  }, [expr, angle, displayExpr, setExpr, setHistory, sound]);

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) { e.preventDefault(); press(k); return; }
      if (k === ".") { e.preventDefault(); press("."); return; }
      if (["+", "-", "*", "/", "%", "^", "(", ")"].includes(k)) { e.preventDefault(); press(k); return; }
      if (k === "Enter" || k === "=") { e.preventDefault(); compute(); return; }
      if (k === "Backspace") { e.preventDefault(); backspace(); return; }
      if (k === "Delete" || k === "Escape") { e.preventDefault(); clearAll(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, compute, backspace, clearAll]);

  const copyResult = async () => {
    const text = preview || expr;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  const removeHistory = (id: string) => setHistory((h) => h.filter((x) => x.id !== id));
  const reuseHistory = (item: HistoryItem) => {
    setExpr(item.expression);
    setShowHistory(false);
  };

  // Display font size auto-adjust
  const displaySize = useMemo(() => {
    const len = displayExpr.length;
    if (len < 12) return "text-5xl sm:text-6xl";
    if (len < 18) return "text-4xl sm:text-5xl";
    if (len < 26) return "text-3xl sm:text-4xl";
    return "text-2xl sm:text-3xl";
  }, [displayExpr]);

  return (
    <main className="min-h-dvh w-full flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        {/* Top bar */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl gradient-equals text-equals-foreground shadow-glow">
              <CalcIcon className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight">Nova Calculator</h1>
              <p className="truncate text-xs text-muted-foreground">Premium scientific suite</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <IconBtn
              label={sound ? "Mute sounds" : "Enable sounds"}
              onClick={() => setSound((s) => !s)}
            >
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </IconBtn>
            <IconBtn
              label="Show history"
              onClick={() => setShowHistory(true)}
            >
              <HistoryIcon className="h-4 w-4" />
            </IconBtn>
            <IconBtn
              label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </IconBtn>
          </div>
        </header>

        {/* Calculator card */}
        <section className={`glass rounded-3xl shadow-elegant p-4 sm:p-5 ${shake ? "animate-shake" : ""}`}>
          {/* Mode row */}
          <div className="flex items-center justify-between mb-3 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSci((s) => !s)}
                aria-pressed={sci}
                className={`calc-btn px-3 py-1.5 rounded-full text-xs ${sci ? "gradient-equals text-equals-foreground" : "bg-muted text-muted-foreground"}`}
              >
                <FlaskConical className="h-3.5 w-3.5 mr-1" /> Scientific
              </button>
              <button
                onClick={() => setAngle((a) => (a === "deg" ? "rad" : "deg"))}
                className="calc-btn px-3 py-1.5 rounded-full text-xs bg-muted text-muted-foreground"
                aria-label={`Angle mode: ${angle}`}
              >
                {angle.toUpperCase()}
              </button>
            </div>
            <button
              onClick={copyResult}
              className="calc-btn px-2.5 py-1.5 rounded-full text-xs bg-muted text-muted-foreground"
              aria-label="Copy result to clipboard"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Display */}
          <div className="rounded-2xl bg-card/40 border border-border/50 p-4 mb-4 min-h-[120px] flex flex-col justify-end overflow-hidden">
            <div className="text-right text-xs text-muted-foreground font-mono-num h-4 truncate" aria-live="polite">
              {previous}
            </div>
            <div
              className={`text-right font-mono-num font-semibold text-foreground overflow-x-auto whitespace-nowrap ${displaySize}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {displayExpr || "0"}
            </div>
            <div className="text-right text-sm text-muted-foreground font-mono-num h-5 truncate">
              {error ? <span className="text-destructive animate-pop">{error}</span>
                : preview ? <span className="animate-pop">= {preview}</span> : null}
            </div>
          </div>

          {/* Scientific row */}
          {sci && (
            <div className="grid grid-cols-5 gap-2 mb-2 animate-pop">
              <Button kind="fn" label="sin" ariaLabel="sine" onPress={() => pressFn("sin")} />
              <Button kind="fn" label="cos" ariaLabel="cosine" onPress={() => pressFn("cos")} />
              <Button kind="fn" label="tan" ariaLabel="tangent" onPress={() => pressFn("tan")} />
              <Button kind="fn" label="ln" ariaLabel="natural log" onPress={() => pressFn("ln")} />
              <Button kind="fn" label="log" ariaLabel="log base 10" onPress={() => pressFn("log")} />

              <Button kind="fn" label={<span>x²</span>} ariaLabel="square" onPress={() => press("^2")} />
              <Button kind="fn" label={<span>x³</span>} ariaLabel="cube" onPress={() => press("^3")} />
              <Button kind="fn" label={<span>xʸ</span>} ariaLabel="power" onPress={() => press("^")} />
              <Button kind="fn" label="√" ariaLabel="square root" onPress={() => pressFn("sqrt")} />
              <Button kind="fn" label="∛" ariaLabel="cube root" onPress={() => pressFn("cbrt")} />

              <Button kind="fn" label="1/x" ariaLabel="reciprocal" onPress={() => press("^-1")} />
              <Button kind="fn" label="|x|" ariaLabel="absolute value" onPress={() => pressFn("abs")} />
              <Button kind="fn" label="n!" ariaLabel="factorial" onPress={() => press("!")} />
              <Button kind="fn" label="eˣ" ariaLabel="exponential" onPress={() => pressFn("exp")} />
              <Button kind="fn" label="mod" ariaLabel="modulus" onPress={() => press("%")} />

              <Button kind="fn" label="π" ariaLabel="pi" onPress={() => press("π")} />
              <Button kind="fn" label="e" ariaLabel="euler number" onPress={() => press("e")} />
              <Button kind="fn" label="(" ariaLabel="open parenthesis" onPress={() => press("(")} />
              <Button kind="fn" label=")" ariaLabel="close parenthesis" onPress={() => press(")")} />
              <Button kind="fn" label="±" ariaLabel="toggle sign" onPress={toggleSign} />
            </div>
          )}

          {/* Main pad */}
          <div className="grid grid-cols-4 gap-2.5">
            <Button kind="danger" label="AC" ariaLabel="all clear" onPress={clearAll} />
            <Button kind="util" label="⌫" ariaLabel="backspace" onPress={backspace} />
            <Button kind="util" label="%" ariaLabel="percent" onPress={() => press("%")} />
            <Button kind="op" label="÷" ariaLabel="divide" onPress={() => press("/")} />

            <Button label="7" ariaLabel="seven" onPress={() => press("7")} />
            <Button label="8" ariaLabel="eight" onPress={() => press("8")} />
            <Button label="9" ariaLabel="nine" onPress={() => press("9")} />
            <Button kind="op" label="×" ariaLabel="multiply" onPress={() => press("*")} />

            <Button label="4" ariaLabel="four" onPress={() => press("4")} />
            <Button label="5" ariaLabel="five" onPress={() => press("5")} />
            <Button label="6" ariaLabel="six" onPress={() => press("6")} />
            <Button kind="op" label="−" ariaLabel="subtract" onPress={() => press("-")} />

            <Button label="1" ariaLabel="one" onPress={() => press("1")} />
            <Button label="2" ariaLabel="two" onPress={() => press("2")} />
            <Button label="3" ariaLabel="three" onPress={() => press("3")} />
            <Button kind="op" label="+" ariaLabel="add" onPress={() => press("+")} />

            <Button kind="util" label="±" ariaLabel="toggle sign" onPress={toggleSign} />
            <Button label="0" ariaLabel="zero" onPress={() => press("0")} />
            <Button label="." ariaLabel="decimal" onPress={() => press(".")} />
            <Button kind="eq" label="=" ariaLabel="equals" onPress={compute} />
          </div>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Tip: use your keyboard — numbers, + − × ÷, Enter, Backspace, Esc
          </p>
        </section>
      </div>

      {/* History drawer */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm flex justify-end animate-pop"
          onClick={() => setShowHistory(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Calculation history"
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-sm glass border-l shadow-elegant p-5 flex flex-col"
          >
            <header className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">History</h2>
              <div className="flex items-center gap-1">
                {history.length > 0 && (
                  <button
                    onClick={() => setHistory([])}
                    className="calc-btn px-3 py-1.5 rounded-full text-xs bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear all
                  </button>
                )}
                <button
                  onClick={() => setShowHistory(false)}
                  className="calc-btn h-9 w-9 rounded-full bg-muted"
                  aria-label="Close history"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {history.length === 0 && (
                <p className="text-sm text-muted-foreground text-center mt-12">
                  No calculations yet. Your history will appear here.
                </p>
              )}
              {history.map((h) => (
                <article
                  key={h.id}
                  className="group rounded-2xl bg-card/50 border border-border/50 p-3 hover:bg-card transition"
                >
                  <button
                    onClick={() => reuseHistory(h)}
                    className="w-full text-left"
                    aria-label={`Reuse ${h.expression}`}
                  >
                    <div className="text-xs text-muted-foreground font-mono-num truncate">{h.expression}</div>
                    <div className="text-lg font-semibold font-mono-num truncate">= {h.result}</div>
                  </button>
                  <div className="flex justify-end mt-1">
                    <button
                      onClick={() => removeHistory(h.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                      aria-label="Delete entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function IconBtn({
  children, onClick, label,
}: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="calc-btn glass h-10 w-10 rounded-full text-foreground hover:bg-card"
    >
      {children}
    </button>
  );
}
