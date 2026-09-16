import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import matlab from 'highlight.js/lib/languages/matlab'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import { createLowlight } from 'lowlight'

export type CodeLanguage =
  | 'plaintext'
  | 'bash'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'css'
  | 'go'
  | 'html'
  | 'java'
  | 'javascript'
  | 'json'
  | 'kotlin'
  | 'matlab'
  | 'php'
  | 'python'
  | 'r'
  | 'sql'
  | 'typescript'

/**
 * Grammars for the languages students actually keep notes in.
 *
 * A short list rather than lowlight's `common` bundle, because every grammar
 * ships in the notes chunk.
 */
const grammars = createLowlight({
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  kotlin,
  matlab,
  php,
  plaintext,
  python,
  r,
  sql,
  typescript,
  xml,
})

/** What the language picker offers, in the order it offers it. */
export const CODE_LANGUAGES: ReadonlyArray<{ value: CodeLanguage; label: string }> = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'bash', label: 'Bash' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'css', label: 'CSS' },
  { value: 'go', label: 'Go' },
  { value: 'html', label: 'HTML' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'matlab', label: 'MATLAB' },
  { value: 'php', label: 'PHP' },
  { value: 'python', label: 'Python' },
  { value: 'r', label: 'R' },
  { value: 'sql', label: 'SQL' },
  { value: 'typescript', label: 'TypeScript' },
]

/**
 * Short names a block may already carry — from pasted Markdown, or a student who
 * typed ```py — mapped to the picker entry that means the same thing. lowlight
 * highlights every one of these already; this only keeps the label in agreement.
 */
const LANGUAGE_ALIASES: Readonly<Record<string, CodeLanguage>> = {
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  h: 'c',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  golang: 'go',
  htm: 'html',
  xhtml: 'html',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  kt: 'kotlin',
  kts: 'kotlin',
  py: 'python',
  ts: 'typescript',
  tsx: 'typescript',
  text: 'plaintext',
  txt: 'plaintext',
}

/**
 * The picker entry for a block's language: '' for auto-detect, the matching
 * entry for a known name or alias, or null when the list has no such language.
 */
export function pickerValueFor(language: string | null | undefined): string | null {
  if (!language) return ''
  const key = language.toLowerCase()
  const value = LANGUAGE_ALIASES[key] ?? key
  return CODE_LANGUAGES.some((entry) => entry.value === value) ? value : null
}

/** "Java" for `java`; anything unlisted comes back as it was given. */
export function labelFor(value: string): string {
  return CODE_LANGUAGES.find((entry) => entry.value === value)?.label ?? value
}

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * One piece of evidence that text is a particular language, and how much it
 * counts for each language it points at.
 */
interface Signal {
  /** A pattern, or a predicate for evidence one pattern can't express. */
  test: RegExp | ((code: string) => boolean)
  weights: Partial<Record<CodeLanguage, number>>
}

/**
 * Commands people type into a terminal, at the start of a line or chained after
 * `&&`, `||`, `|` or `;`. The ones that are also English words — cat, touch,
 * source, make — only count with a flag or a file after them, so a line of notes
 * starting "make sure…" isn't a shell command.
 */
const SHELL_COMMAND_LINES =
  /(^|&&|\|\||[|;])[ \t]*(sudo[ \t]+)?((cd|ls|mkdir|rm|cp|mv|chmod|chown|grep|npm|npx|yarn|pnpm|git|pip3?|brew|apt(-get)?|curl|wget|docker|ssh|javac|gcc)([ \t]+[-~./\w"'$*]|[ \t]*$)|(cat|touch|source|make)([ \t]+([-~./$]|[\w-]+\.\w)|[ \t]*$))/gm
const SHELL_COMMAND_LINE = new RegExp(SHELL_COMMAND_LINES.source, 'm')

/**
 * What a person would look for: `System.out.println` means Java, `<-` means R,
 * a CSS property ending in a semicolon means CSS. Each signal is specific enough
 * to be worth counting and none is decisive alone at weight 1-2; weight 4+ is
 * something only that language writes.
 *
 * Signals shared by a language and the one built on top of it (JavaScript and
 * TypeScript, C and C++) are credited to both; only the extras separate them.
 */
const SIGNALS: Signal[] = [
  // ── Java ──
  { test: /\bSystem\.(out|err)\.print(ln|f)?\s*\(/, weights: { java: 4 } },
  { test: /\bpublic\s+static\s+void\s+main\s*\(\s*String\s*(\[\]|\.\.\.)/, weights: { java: 4 } },
  { test: /^\s*import\s+javax?\.[\w.]+(\.\*)?\s*;/m, weights: { java: 4 } },
  { test: /\bnew\s+Scanner\s*\(\s*System\.in\s*\)/, weights: { java: 4 } },
  { test: /^\s*package\s+[\w.]+\s*;\s*$/m, weights: { java: 3 } },
  { test: /@Override\b/, weights: { java: 3 } },
  { test: /\b(ArrayList|HashMap|HashSet|LinkedList)\s*</, weights: { java: 3 } },
  { test: /\bString\[\]\s+\w+/, weights: { java: 3 } },
  // Members named Java's way: `private Object value;`, `public void set(...)`.
  // C# names its members in PascalCase instead.
  {
    test: /^\s*(public|private|protected)\s+(static\s+)?(final\s+)?[A-Z]\w*(<[^>\n]*>)?(\[\])*\s+[a-z]\w*\s*[;=]/m,
    weights: { java: 3 },
  },
  {
    test: /^\s*(public|private|protected)\s+(static\s+)?(final\s+|abstract\s+|synchronized\s+)?[\w<>[\], ?]+\s+[a-z]\w*\s*\([^)\n]*\)\s*(throws\s+[\w., ]+)?\s*\{/m,
    weights: { java: 3 },
  },
  { test: /^\s*(void|int|double|float|long|boolean|String|char)\s+[a-z]\w*\s*\([^)\n]*\)\s*;\s*$/m, weights: { java: 2, csharp: 1 } },
  { test: /^\s*(public\s+)?interface\s+[A-Z]\w*(<[^>\n]+>)?(\s+extends\s+[\w<>, .]+)?\s*\{/m, weights: { java: 1, csharp: 1, typescript: 1 } },
  {
    test: /\b(Integer\.parseInt|Double\.parseDouble|String\.valueOf|Arrays\.(sort|toString|asList|fill)|Collections\.\w+)\s*\(|\.printStackTrace\s*\(\s*\)|\.equals(IgnoreCase)?\s*\(/,
    weights: { java: 3 },
  },
  // catch (IOException e) — C# writes it the same way.
  { test: /\bcatch\s*\(\s*\w*(Exception|Error)\s+\w+\s*\)/, weights: { java: 2, csharp: 2 } },
  { test: /\bboolean\b/, weights: { java: 1 } },
  // for (Type item : items) — also valid C++11.
  { test: /\bfor\s*\(\s*(final\s+)?[\w<>[\]]+\s+\w+\s*:\s*[\w.()]+\s*\)/, weights: { java: 2, cpp: 2 } },
  {
    test: /\b(public|private|protected)\s+((static|final|abstract|sealed|partial)\s+)*(class|interface|enum)\s+[A-Z]\w*/,
    weights: { java: 2, csharp: 2 },
  },

  // ── C# ──
  { test: /^\s*using\s+System(\.[\w.]+)?\s*;/m, weights: { csharp: 4 } },
  { test: /\bConsole\.(WriteLine|Write|ReadLine|ReadKey)\s*\(/, weights: { csharp: 4 } },
  { test: /\{\s*get\s*;\s*((private|protected|internal)\s+)?(set|init)?\s*;?\s*\}/, weights: { csharp: 4 } },
  { test: /\bstatic\s+(async\s+)?(void|int|Task)\s+Main\s*\(/, weights: { csharp: 4 } },
  { test: /\bforeach\s*\(\s*[\w<>[\]]+\s+\w+\s+in\s+/, weights: { csharp: 4 } },
  // PascalCase members typed with C#'s lower-case built-ins: `public string Name`.
  {
    test: /\b(public|private|protected|internal)\s+(static\s+)?((override|virtual|async|readonly|abstract)\s+)?(string|int|bool|double|decimal|float|long|char|object|void|var|Task(<[^>\n]*>)?)\s+[A-Z]\w*\s*[({=;]/,
    weights: { csharp: 3 },
  },
  { test: /^\s*namespace\s+[\w.]+\s*[{;]?\s*$/m, weights: { csharp: 2 } },
  { test: /\$"/, weights: { csharp: 2 } },
  { test: /\bvar\s+\w+\s*=\s*new\s+[A-Z]\w*/, weights: { csharp: 2 } },

  // ── Kotlin ──
  { test: /^\s*((private|public|internal|override|suspend|inline)\s+)*fun\s+(<[^>\n]+>\s*)?[\w.]+\s*\(/m, weights: { kotlin: 4 } },
  { test: /\bdata\s+class\s+\w+/, weights: { kotlin: 4 } },
  // class Person(val name: String) — properties declared in the constructor.
  { test: /\bclass\s+\w+\s*\(\s*((private|public|protected|internal)\s+)?(val|var)\s+\w+\s*:/, weights: { kotlin: 4 } },
  { test: /\b(listOf|mutableListOf|mapOf|mutableMapOf|setOf|arrayOf)\s*\(/, weights: { kotlin: 4 } },
  { test: /\bval\s+\w+\s*(:\s*[\w<>?, ]+)?\s*=/, weights: { kotlin: 3 } },
  { test: /\bwhen\s*(\([^)\n]*\))?\s*\{/, weights: { kotlin: 3 } },
  { test: /(?<![.\w])println\s*\(/, weights: { kotlin: 2 } },
  { test: /\b\d+\s*\.\.\s*\d+\b/, weights: { kotlin: 2 } },

  // ── JavaScript, and TypeScript, which accepts all of it ──
  { test: /\bconsole\.(log|error|warn|info|table)\s*\(/, weights: { javascript: 4, typescript: 4 } },
  {
    test: /\b(document\.(querySelector(All)?|getElementById|createElement)|addEventListener)\s*\(|\bwindow\./,
    weights: { javascript: 4, typescript: 4 },
  },
  // JSX: markup returned from a component is JavaScript, not HTML.
  { test: /\breturn\s*\(?\s*<[A-Za-z]/, weights: { javascript: 4, typescript: 4 } },
  {
    test: /\b(setTimeout|setInterval|alert|fetch)\s*\(|\blocalStorage\.|\bJSON\.(parse|stringify)\s*\(/,
    weights: { javascript: 3, typescript: 3 },
  },
  {
    test: /\brequire\s*\(\s*['"]|\bmodule\.exports\b|^\s*export\s+(default\s+)?(async\s+)?(function|const|let|class)\b|^\s*import\s+.+\s+from\s+['"]/m,
    weights: { javascript: 3, typescript: 3 },
  },
  { test: /^\s*constructor\s*\(/m, weights: { javascript: 3, typescript: 3 } },
  // `const name =` with no type in front is JavaScript's; C and C# write `const int x =`.
  { test: /\bconst\s+(\w+|\{[^}\n]*\}|\[[^\]\n]*\])\s*=/, weights: { javascript: 3, typescript: 3 } },
  { test: /\blet\s+(\w+|\{[^}\n]*\}|\[[^\]\n]*\])\s*=/, weights: { javascript: 2, typescript: 2 } },
  // A plain `function name(a, b) {` — PHP writes its parameters with `$`.
  { test: /\bfunction\s*\*?\s*\w*\s*\((?![^)]*\$)[^)]*\)\s*\{/, weights: { javascript: 2, typescript: 2 } },
  { test: /\.(forEach|map|filter|reduce|find|some|every)\s*\(\s*(\(|\w+\s*=>|async)/, weights: { javascript: 2, typescript: 2 } },
  // A template literal: a backtick string with ${...} in it.
  { test: /\x60[^\x60]*\$\{/, weights: { javascript: 2, typescript: 2 } },
  { test: /=>/, weights: { javascript: 1, typescript: 1 } },
  { test: /===|!==/, weights: { javascript: 1, typescript: 1 } },

  // ── TypeScript only ──
  {
    test: /^\s*(export\s+)?interface\s+\w+(<[^>\n]+>)?(\s+extends\s+[\w<>, .]+)?\s*\{[^}]*?\b\w+\??\s*:\s*[\w[\]<>|'" ]+;?/m,
    weights: { typescript: 4 },
  },
  { test: /\)\s*:\s*(string|number|boolean|void|any|unknown|never|Promise<[^>\n]*>)(\[\])?\s*(\{|=>)/, weights: { typescript: 4 } },
  { test: /^\s*(export\s+)?type\s+\w+(<[^>\n]+>)?\s*=/m, weights: { typescript: 4 } },
  { test: /\b(let|const)\s+\w+\s*:\s*[A-Z]\w*(<[^>\n]*>)?(\[\])?\s*=/, weights: { typescript: 4 } },
  { test: /\b\w+\s*\??:\s*(string|number|boolean|any|unknown)(\[\])?\s*[,;)=]/, weights: { typescript: 3 } },
  { test: /\bas\s+(const|string|number|unknown|any)\b|\breadonly\s+\w+\s*[:;]/, weights: { typescript: 2 } },

  // ── Python ──
  { test: /^\s*(async\s+)?def\s+\w+\s*\([^)]*\)\s*(->\s*[^:\n]+)?:/m, weights: { python: 4 } },
  { test: /^\s*class\s+\w+(\([^)\n]*\))?\s*:\s*$/m, weights: { python: 4 } },
  { test: /\bfor\s+\w+(\s*,\s*\w+)?\s+in\s+(range|enumerate|zip|sorted|reversed)\s*\(/, weights: { python: 4 } },
  {
    test: /^\s*(from\s+[\w.]+\s+import\s+[\w*, ()]+|import\s+[\w.]+(\s+as\s+\w+)?)\s*$/m,
    weights: { python: 3 },
  },
  { test: /\bself\.\w+/, weights: { python: 3 } },
  { test: /^\s*(if|elif|else|for|while|with|try|except|finally)\b[^\n]*:\s*$/m, weights: { python: 3 } },
  { test: /\blambda\s+[\w, ]*:/, weights: { python: 3 } },
  // name = input("...") — MATLAB has input() too, but ends the line with a semicolon.
  { test: /^\s*\w+\s*=\s*(int|float|str)?\(?\s*input\s*\((?![^\n]*;\s*$)/m, weights: { python: 3 } },
  { test: /\bf["'][^"'\n]*\{/, weights: { python: 2 } },
  { test: /__\w+__/, weights: { python: 2 } },
  { test: /\b(None|True|False)\b/, weights: { python: 1 } },
  { test: /(?<![.\w])(print|input|len|range)\s*\(/, weights: { python: 1 } },
  // A line that is just print(...), no semicolon: Python, or sometimes R.
  { test: /^[ \t]*print\s*\((?![^\n]*;[ \t]*$)[^\n]*\)[ \t]*$/m, weights: { python: 2, r: 1 } },

  // ── C, and C++, which inherits it ──
  {
    test: /^\s*#\s*include\s*<(stdio|stdlib|string|math|stdbool|stdint|ctype|time|limits|assert|unistd)\.h>/m,
    weights: { c: 4, cpp: 1 },
  },
  { test: /\b(printf|scanf|fprintf|malloc|calloc|realloc|free|strcpy|strlen|strcmp)\s*\(/, weights: { c: 3, cpp: 1 } },
  { test: /\bint\s+main\s*\(\s*(void|int\s+argc[^)]*)?\s*\)/, weights: { c: 2, cpp: 2 } },
  { test: /\bstruct\s+\w+\s*[{*]/, weights: { c: 2, cpp: 1 } },
  { test: /\b(int|char|float|double|void|long|short)\s*\*+\s*\w+\s*[=;,)]/, weights: { c: 2, cpp: 1 } },
  // Working through a pointer: `*a = *b;`, `int temp = *a;`, `p = &x;`.
  { test: /(^|[;{])\s*\*\w+\s*=[^=]|=\s*[*&]\w+\s*;/m, weights: { c: 2, cpp: 1 } },
  { test: /\bNULL\b/, weights: { c: 1, cpp: 1 } },

  // ── C++ only ──
  {
    test: /^\s*#\s*include\s*<(iostream|vector|string|map|set|algorithm|memory|fstream|sstream|unordered_map|unordered_set|queue|stack|cmath|cstdio|cstdlib|bits\/stdc\+\+\.h)>/m,
    weights: { cpp: 4 },
  },
  { test: /\bstd::\w+/, weights: { cpp: 4 } },
  { test: /\b(cout|cin|cerr)\s*(<<|>>)|<<\s*(std::)?endl\b/, weights: { cpp: 4 } },
  { test: /^\s*using\s+namespace\s+\w+\s*;/m, weights: { cpp: 4 } },
  { test: /^\s*(public|private|protected)\s*:\s*$/m, weights: { cpp: 4 } },
  { test: /\btemplate\s*<|\bnullptr\b|\bconstexpr\b|\bvirtual\s+[\w:<>~]+/, weights: { cpp: 3 } },

  // ── Go ──
  { test: /^\s*package\s+\w+\s*$/m, weights: { go: 4 } },
  { test: /^\s*func\s+(\([^)\n]*\)\s*)?\w+\s*\(/m, weights: { go: 4 } },
  { test: /\bfmt\.(Print|Sprint|Fprint|Errorf|Scan)\w*\s*\(/, weights: { go: 4 } },
  { test: /^\s*type\s+\w+\s+(struct|interface)\s*\{/m, weights: { go: 4 } },
  { test: /\bif\s+err\s*!=\s*nil\b/, weights: { go: 4 } },
  { test: /^\s*import\s+(\(\s*$|"[\w/.-]+"\s*$)/m, weights: { go: 3 } },
  // Slice and map literals: []int{1, 2}, map[string]int{}.
  { test: /\[\][\w.*]+\s*\{|\bmap\[[\w.*]+\][\w.*]+\s*\{/, weights: { go: 4 } },
  { test: /:=/, weights: { go: 2 } },

  // ── PHP ──
  { test: /<\?(php|=)/, weights: { php: 7 } },
  { test: /\$this->\w+/, weights: { php: 4 } },
  { test: /\bfunction\s+\w+\s*\([^)]*\$\w+/, weights: { php: 4 } },
  { test: /\bforeach\s*\(\s*\$[\w\->[\]'"]+\s+as\s+\$/, weights: { php: 4 } },
  { test: /\b(public|private|protected)\s+(static\s+)?\$\w+/, weights: { php: 3 } },
  { test: /^\s*\$\w+\s*=[^=\n]*;\s*$/m, weights: { php: 2 } },
  { test: /\b(array_\w+|str_\w+|in_array|isset|explode|implode)\s*\(/, weights: { php: 2 } },
  { test: /\becho\s+["'$]/, weights: { php: 1, bash: 1 } },

  // ── R ──
  { test: /<-\s*function\s*\(/, weights: { r: 4 } },
  { test: /\blibrary\s*\(\s*[\w.]+\s*\)/, weights: { r: 4 } },
  { test: /%>%|%in%/, weights: { r: 4 } },
  { test: /\bfor\s*\(\s*\w+\s+in\s+[\w.]+\s*:\s*[\w.()]+\s*\)/, weights: { r: 4 } },
  { test: /(^|[\s(])[\w.]+\s*<-\s*\S/m, weights: { r: 3 } },
  {
    test: /(?<![.\w])(data\.frame|ggplot|aes|geom_\w+|read\.csv|write\.csv|summary|rnorm|runif|sapply|lapply|rowMeans|colMeans|nrow|ncol|head|tail)\s*\(/,
    weights: { r: 3 },
  },
  // c(1, 2, 3) is how R makes a vector; nothing else here calls a bare `c`.
  { test: /\bc\s*\(\s*[-\d"']/, weights: { r: 3 } },
  { test: /\b[a-zA-Z_][\w.]*\$[a-zA-Z_]\w*/, weights: { r: 2 } },
  { test: /\|>/, weights: { r: 2 } },

  // ── MATLAB ──
  { test: /^\s*for\s+\w+\s*=\s*[^:\n]+:[^\n]+$/m, weights: { matlab: 4 } },
  // A range assigned and silenced: x = 0:0.1:2*pi;
  { test: /^\s*\w+\s*=\s*-?[\w.]+\s*:\s*[\w.*()]+(\s*:\s*[\w.*()]+)?\s*;/m, weights: { matlab: 3 } },
  { test: /^\s*function\s+(\[[^\]\n]*\]|\w+)\s*=\s*\w+\s*\(/m, weights: { matlab: 4 } },
  { test: /^\s*elseif\s+(?!\()/m, weights: { matlab: 3 } },
  { test: /\bfprintf\s*\(\s*'/, weights: { matlab: 3 } },
  // Element-wise operators: x.^2, a.*b — followed by an operand, so `java.util.*;` doesn't count.
  { test: /(?<=[\w)\]])\.(\^|\*|\/)\s*[\w([]/, weights: { matlab: 3 } },
  { test: /\[[\d\s.,-]+;[\d\s.,;-]+\]/, weights: { matlab: 3 } },
  { test: /^\s*end\s*;?\s*$/m, weights: { matlab: 2 } },
  { test: /(?<![.\w])(linspace|zeros|ones|eye|numel|meshgrid|randn|repmat|cumsum)\s*\(/, weights: { matlab: 2 } },
  { test: /(?<![.\w])(disp|fprintf|figure|xlabel|ylabel|legend|subplot)\s*\(|^\s*(clc|clear|close all)\s*;?\s*$|^\s*(hold|grid|axis)\s+(on|off)\b/m, weights: { matlab: 2 } },
  { test: /(?<![.\w])plot\s*\(/, weights: { matlab: 2 } },
  // Matrix functions given a matrix or a size: det(A), inv(A), rand(3). C's rand() takes nothing.
  { test: /(?<![.\w])(det|inv|rank|eig|rand)\s*\(\s*[\w(]/, weights: { matlab: 2 } },
  { test: /^\s*%(?!%)/m, weights: { matlab: 1 } },

  // ── SQL ──
  // Upper-case keywords are how SQL is written and how sentences never are. In lower
  // case a statement has to be shaped like one, because SQL reads like English:
  // "create table of results" and "select one option from the dropdown" are notes.
  {
    test: /^\s*(CREATE\s+(TABLE|INDEX|VIEW|DATABASE)|INSERT\s+INTO|UPDATE\s+[\w.]+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE)\b/m,
    weights: { sql: 4 },
  },
  {
    test: /^\s*(create\s+(table|index|view|database)\s+(if\s+not\s+exists\s+)?[\w.]+\s*(\(|;|$)|insert\s+into\s+[\w.]+\s*(\(|values\b)|update\s+[\w.]+\s+set\s+\w+\s*=|delete\s+from\s+[\w.]+\s*(where\b|;|$)|alter\s+table\s+[\w.]+\s+(add|drop|modify|rename|alter)\b|drop\s+table\s+(if\s+exists\s+)?[\w.]+\s*(;|$))/m,
    weights: { sql: 4 },
  },
  { test: /^\s*SELECT\s[\s\S]{0,400}?\bFROM\s+[\w.]+/m, weights: { sql: 2 } },
  // A lower-case select names columns — `*`, `name, age`, `count(*)` — not "one option".
  {
    test: /^\s*select\s+(distinct\s+)?(\*|\w+\s*\([^)\n]*\)|[\w.]+(\s*,\s*[\w.]+)*)(\s+as\s+\w+)?\s+from\s+[\w.]+/m,
    weights: { sql: 2 },
  },
  // What follows the table. Lower case needs a clause or a semicolon, since "from the
  // dropdown" ends a sentence the same way `FROM students` ends a query.
  {
    test: /\bFROM\s+[\w.]+(\s+(AS\s+)?\w+)?\s*(WHERE|JOIN|INNER|LEFT|RIGHT|GROUP\s+BY|ORDER\s+BY|LIMIT|;|$)|\bfrom\s+[\w.]+(\s+(as\s+)?\w+)?\s*(where|join|inner|left|right|group\s+by|order\s+by|limit|;)/m,
    weights: { sql: 2 },
  },
  {
    test: /\b(GROUP\s+BY|ORDER\s+BY|INNER\s+JOIN|LEFT\s+JOIN|PRIMARY\s+KEY|FOREIGN\s+KEY|NOT\s+NULL|AUTO_INCREMENT)\b|\b(VARCHAR|varchar)\s*\(|\b(primary|foreign)\s+key\b|\bauto_increment\b/,
    weights: { sql: 2 },
  },

  // ── Bash ──
  { test: /^#!\s*\/(usr\/)?bin\/(env\s+)?(ba|z)?sh\b/, weights: { bash: 5 } },
  { test: /^\s*(then|fi|done|esac)\s*(;|<|>|\||&|$)/m, weights: { bash: 3 } },
  { test: /;\s*(then|do)\s*$/m, weights: { bash: 3 } },
  { test: /^\s*if\s+\[\[?\s/m, weights: { bash: 3 } },
  { test: /^\s*export\s+[A-Z_][A-Z0-9_]*=/m, weights: { bash: 3 } },
  { test: (code) => (code.match(SHELL_COMMAND_LINES) ?? []).length >= 2, weights: { bash: 3 } },
  { test: SHELL_COMMAND_LINE, weights: { bash: 1 } },

  // ── CSS ──
  {
    test: /^\s*(color|background(-color|-image)?|margin(-\w+)?|padding(-\w+)?|border(-\w+)*|font(-\w+)?|display|position|width|height|max-width|min-width|max-height|min-height|flex(-\w+)*|grid(-\w+)*|gap|align-items|align-self|justify-content|text-align|text-decoration|line-height|letter-spacing|z-index|opacity|transition|transform|box-shadow|box-sizing|overflow(-[xy])?|top|left|right|bottom|cursor|content|animation)\s*:\s*[^;{}\n]+;/m,
    weights: { css: 4 },
  },
  {
    test: /@media\s*[(\w]|@import\s+(url|["'])|@keyframes\s+\w+|@font-face\b|:(hover|focus|active|first-child|last-child|nth-child\([^)]*\))\b|::(before|after|placeholder)\b/,
    weights: { css: 4 },
  },
  { test: /:\s*[^;{}\n]*\b\d*\.?\d+(px|rem|em|vh|vw)\b[^;{}\n]*;/, weights: { css: 2 } },
  { test: /:\s*#[0-9a-fA-F]{3,8}\s*;/, weights: { css: 2 } },

  // ── HTML ──
  { test: /<!DOCTYPE\s+html/i, weights: { html: 5 } },
  {
    test: /<(html|head|body|div|span|p|a|img|ul|ol|li|h[1-6]|table|tr|td|th|form|input|button|label|select|option|textarea|section|article|nav|header|footer|main|script|style|link|meta|br|hr)\b[^>]*>/i,
    weights: { html: 3 },
  },
  {
    test: /<\/(html|head|body|div|span|p|a|ul|ol|li|h[1-6]|table|tr|td|th|form|button|label|select|option|textarea|section|article|nav|header|footer|main|script|style)\s*>/i,
    weights: { html: 3 },
  },
]

/** Below this, the evidence is too thin to colour anything. */
const MIN_SCORE = 3

/**
 * When two languages score the same, the evidence fits both — which in practice
 * means the text uses nothing but the part they share. Name the base language
 * then: JavaScript before TypeScript, C before C++, Java before C# or Kotlin.
 */
const TIE_ORDER: CodeLanguage[] = [
  'python',
  'java',
  'javascript',
  'c',
  'html',
  'css',
  'sql',
  'bash',
  'json',
  'r',
  'matlab',
  'php',
  'go',
  'kotlin',
  'csharp',
  'cpp',
  'typescript',
]

/** Signals read the start of a long block; what follows rarely changes the answer. */
const SAMPLE_LIMIT = 4000

function isJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function detect(code: string): CodeLanguage | null {
  const text = code.trim()
  if (!text) return null

  // JSON needs no guessing: it either parses or it doesn't.
  if ((text.startsWith('{') || text.startsWith('[')) && isJson(text)) return 'json'

  const sample = text.length > SAMPLE_LIMIT ? text.slice(0, SAMPLE_LIMIT) : text
  const scores = new Map<CodeLanguage, number>()
  for (const signal of SIGNALS) {
    const matched = typeof signal.test === 'function' ? signal.test(sample) : signal.test.test(sample)
    if (!matched) continue
    for (const [language, weight] of Object.entries(signal.weights) as Array<[CodeLanguage, number]>) {
      scores.set(language, (scores.get(language) ?? 0) + weight)
    }
  }

  let best: CodeLanguage | null = null
  let bestScore = 0
  for (const language of TIE_ORDER) {
    const score = scores.get(language) ?? 0
    if (score > bestScore) {
      best = language
      bestScore = score
    }
  }
  return bestScore >= MIN_SCORE ? best : null
}

/**
 * Both the highlighter and the language label ask about the same text on the
 * same keystroke; remember the last few answers rather than work them out twice.
 */
const detections = new Map<string, CodeLanguage | null>()

/**
 * The language a block of code is written in, or null when there isn't enough
 * to go on — in which case it is better left plain than coloured as the wrong
 * thing.
 *
 * Replaces highlight.js's own auto-detection, which picks whichever grammar
 * scores highest. Measured on realistic student snippets that got 28 of 44
 * right: it called the Java `Box` class TypeScript, let CSS claim anything with
 * braces and colons, and coloured plain sentences as Bash.
 */
export function detectLanguage(code: string): CodeLanguage | null {
  const known = detections.get(code)
  if (known !== undefined) return known
  const language = detect(code)
  detections.set(code, language)
  if (detections.size > 64) detections.delete(detections.keys().next().value!)
  return language
}

type HighlightTree = ReturnType<typeof grammars.highlight>

/**
 * lowlight, with auto-detection answered by `detectLanguage`, so the colours
 * and the language label can never disagree. Text it can't place gets no
 * highlighting at all rather than a guess.
 */
export const lowlight = {
  ...grammars,
  highlightAuto(value: string): HighlightTree {
    const language = detectLanguage(value)
    if (language) return grammars.highlight(language, value)
    return { type: 'root', children: [], data: { relevance: 0 } }
  },
}
