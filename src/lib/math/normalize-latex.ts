const SIZING_DELIMITER_CHARACTERS = new Set(['(', ')', '[', ']', '{', '}', '|', '.', '/', '<', '>']);

const SIZING_DELIMITER_COMMANDS = new Set([
  '{', '}', '|',
  'lbrace', 'rbrace', 'langle', 'rangle',
  'lfloor', 'rfloor', 'lceil', 'rceil',
  'lgroup', 'rgroup', 'lmoustache', 'rmoustache',
  'vert', 'Vert', 'lvert', 'rvert', 'lVert', 'rVert', 'backslash',
  'uparrow', 'downarrow', 'updownarrow',
  'Uparrow', 'Downarrow', 'Updownarrow',
]);

const GROUP_PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSING_GROUPS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const MATH_ATOM = /[A-Za-z0-9.πΠ∞α-ωΑ-Ω]/;

function matchingClose(source: string, start: number) {
  const stack: string[] = [];
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (source[index - 1] === '\\') continue;
    if (GROUP_PAIRS[character]) stack.push(GROUP_PAIRS[character]);
    else if (CLOSING_GROUPS[character]) {
      if (stack.pop() !== character) return -1;
      if (stack.length === 0) return index;
    }
  }
  return -1;
}

function matchingOpen(source: string, end: number) {
  const stack: string[] = [];
  for (let index = end; index >= 0; index -= 1) {
    const character = source[index];
    if (index > 0 && source[index - 1] === '\\') continue;
    if (CLOSING_GROUPS[character]) stack.push(CLOSING_GROUPS[character]);
    else if (GROUP_PAIRS[character]) {
      if (stack.pop() !== character) return -1;
      if (stack.length === 0) return index;
    }
  }
  return -1;
}

type Atom = { start: number; end: number; value: string };

function leftAtom(source: string, before: number): Atom | null {
  let end = before;
  while (end >= 0 && /\s/.test(source[end])) end -= 1;
  if (end < 0) return null;
  let start = end;

  if (CLOSING_GROUPS[source[end]]) {
    start = matchingOpen(source, end);
    if (start < 0) return null;

    if (source[end] === '}') {
      // Treat both arguments of \frac{a}{b} as a single left operand.
      const previousEnd = start - 1;
      if (source[previousEnd] === '^' || source[previousEnd] === '_') {
        const base = leftAtom(source, previousEnd - 1);
        if (base) start = base.start;
      } else if (source[previousEnd] === '}') {
        const previousStart = matchingOpen(source, previousEnd);
        if (previousStart >= 0) {
          const command = source.slice(0, previousStart).match(/\\(?:dfrac|tfrac|frac|binom)$/);
          if (command) start = previousStart - command[0].length;
        }
      } else {
        const command = source.slice(0, start).match(/\\[A-Za-z]+$/);
        if (command) start -= command[0].length;
      }
    }
  } else if (MATH_ATOM.test(source[end])) {
    while (start > 0 && MATH_ATOM.test(source[start - 1])) start -= 1;
    if (source[start - 1] === '\\') {
      start -= 1;
    } else if (start > 0 && /[\^_]/.test(source[start - 1])) {
      const base = leftAtom(source, start - 2);
      if (base) start = base.start;
    }
  } else {
    return null;
  }

  return { start, end: end + 1, value: source.slice(start, end + 1) };
}

function rightAtom(source: string, after: number): Atom | null {
  let start = after;
  while (start < source.length && /\s/.test(source[start])) start += 1;
  if (start >= source.length) return null;
  let end = start;

  if (source[end] === '-' || source[end] === '+') end += 1;
  if (GROUP_PAIRS[source[end]]) {
    end = matchingClose(source, end);
    if (end < 0) return null;
    end += 1;
  } else if (source[end] === '\\') {
    const command = source.slice(end).match(/^\\[A-Za-z]+/);
    if (!command) return null;
    end += command[0].length;
    for (let count = 0; count < (/^\\(?:dfrac|tfrac|frac|binom)$/.test(command[0]) ? 2 : 1); count += 1) {
      if (source[end] !== '{') break;
      const close = matchingClose(source, end);
      if (close < 0) return null;
      end = close + 1;
    }
  } else if (MATH_ATOM.test(source[end])) {
    while (end < source.length && MATH_ATOM.test(source[end])) end += 1;
  } else {
    return null;
  }

  while (source[end] === '^' || source[end] === '_') {
    end += 1;
    if (source[end] === '{') {
      const close = matchingClose(source, end);
      if (close < 0) return null;
      end = close + 1;
    } else {
      if (source[end] === '-' || source[end] === '+') end += 1;
      while (end < source.length && MATH_ATOM.test(source[end])) end += 1;
    }
  }

  return { start, end, value: source.slice(start, end) };
}

function ungroup(value: string) {
  if ((value.startsWith('(') && value.endsWith(')')) ||
      (value.startsWith('[') && value.endsWith(']'))) {
    return value.slice(1, -1);
  }
  return value;
}

/** Turn ordinary math slash notation into stacked fractions without changing grouping. */
export function normalizeSlashFractions(source: string): string {
  let expanded = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (!GROUP_PAIRS[character] || source[index - 1] === '\\') {
      expanded += character;
      continue;
    }

    const close = matchingClose(source, index);
    if (close < 0) {
      expanded += character;
      continue;
    }
    const command = source.slice(0, index).match(/\\(?:text|textbf|mathrm|operatorname)$/);
    const inner = source.slice(index + 1, close);
    expanded += character + (command ? inner : normalizeSlashFractions(inner)) + source[close];
    index = close;
  }

  let cursor = 0;
  while (cursor < expanded.length) {
    if (GROUP_PAIRS[expanded[cursor]] && expanded[cursor - 1] !== '\\') {
      const close = matchingClose(expanded, cursor);
      if (close >= 0) {
        cursor = close + 1;
        continue;
      }
    }
    if (expanded[cursor] !== '/') {
      cursor += 1;
      continue;
    }
    // Never interpret URL separators or incomplete expressions as division.
    if (expanded[cursor - 1] === '/' || expanded[cursor + 1] === '/' || expanded[cursor - 1] === ':') {
      cursor += 1;
      continue;
    }

    const numerator = leftAtom(expanded, cursor - 1);
    const denominator = rightAtom(expanded, cursor + 1);
    if (!numerator || !denominator) {
      cursor += 1;
      continue;
    }
    const replacement = `\\frac{${ungroup(numerator.value)}}{${ungroup(denominator.value)}}`;
    expanded = expanded.slice(0, numerator.start) + replacement + expanded.slice(denominator.end);
    cursor = numerator.start + replacement.length;
  }

  return expanded;
}

/**
 * Removes only malformed \left / \right sizing commands while preserving the
 * mathematical expression that follows. For example, AI-authored `\leftx`
 * and `\right=` become `x` and `=` instead of a red KaTeX error.
 */
function removeMalformedSizingCommands(latex: string) {
  return latex.replace(/\\(left|right)/g, (token, _side, offset: number, source: string) => {
    let cursor = offset + token.length;
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;

    const nextCharacter = source[cursor];
    if (nextCharacter && SIZING_DELIMITER_CHARACTERS.has(nextCharacter)) return token;
    if (nextCharacter !== '\\') return '';

    const commandStart = cursor + 1;
    const commandMatch = source.slice(commandStart).match(/^[A-Za-z]+|^./);
    return commandMatch && SIZING_DELIMITER_COMMANDS.has(commandMatch[0]) ? token : '';
  });
}

/** Use the Vietnamese textbook convention for complete three-point angle names. */
function normalizeNamedAngles(source: string) {
  const tokens = /\\(?:text|textbf|textit|textrm|textsf|texttt|mathrm|operatorname)\s*\{|\\angle(?![A-Za-z])/g;
  let normalized = '';
  let lastIndex = 0;
  let token: RegExpExecArray | null;

  while ((token = tokens.exec(source)) !== null) {
    if (token[0].endsWith('{')) {
      // Literal text, including nested groups, is not an angle expression.
      const close = matchingClose(source, tokens.lastIndex - 1);
      if (close < 0) break;
      tokens.lastIndex = close + 1;
      continue;
    }

    const name = source.slice(tokens.lastIndex).match(/^\s*(?:\{\s*([A-Z]\s*[A-Z]\s*[A-Z])\s*\}|([A-Z]\s*[A-Z]\s*[A-Z])(?![A-Za-z0-9_']))/);
    if (!name) continue;

    normalized += source.slice(lastIndex, token.index);
    normalized += `\\widehat{${(name[1] ?? name[2]).replace(/\s/g, '')}}`;
    tokens.lastIndex += name[0].length;
    lastIndex = tokens.lastIndex;
  }

  return normalized + source.slice(lastIndex);
}

/** Normalize common AI/JSON LaTeX mistakes before rendering with KaTeX. */
export function normalizeLatexInput(latex: string) {
  let fixed = latex;

  // A doubled slash may be a JSON-escaped command or an aligned-row separator.
  // Preserve row separators when the source already has a real math environment.
  const escapedEnvironment = /\\\\begin\{/.test(fixed);
  const hasMathEnvironment = /\\begin\{/.test(fixed);
  if (escapedEnvironment || !hasMathEnvironment) {
    fixed = fixed.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
  }

  fixed = fixed.replace(/(?<![a-zA-Z\\])LeftRightarrow(?![a-zA-Z])/g, '\\Leftrightarrow');
  fixed = fixed.replace(/(?<![a-zA-Z\\])cdot([a-zA-Z])/g, '\\cdot $1');
  fixed = fixed.replace(/(?<![a-zA-Z\\])text([a-zA-Z]+)/g, '\\text{$1}');
  fixed = fixed.replace(/(?<![a-zA-Z\\])Rightarrow([a-zA-Z])/g, '\\Rightarrow $1');
  fixed = fixed.replace(/(?<![a-zA-Z\\])Leftrightarrow([a-zA-Z])/g, '\\Leftrightarrow $1');
  fixed = fixed.replace(/(?<![a-zA-Z\\])neq([a-zA-Z0-9])/g, '\\neq $1');

  fixed = fixed.replace(/(\\in|\bin)\s*(?<!\\)\{([^}]+)(?<!\\)\}/g, '$1 \\{$2\\}');
  fixed = fixed.replace(/>=/g, ' \\ge ');
  fixed = fixed.replace(/<=/g, ' \\le ');
  fixed = fixed.replace(/!=/g, ' \\neq ');
  fixed = fixed
    .replace(/[−–]/g, '-')
    .replace(/⇔/g, ' \\Leftrightarrow ')
    .replace(/⇒/g, ' \\Rightarrow ')
    .replace(/→/g, ' \\rightarrow ')
    .replace(/←/g, ' \\leftarrow ')
    .replace(/∠/g, ' \\angle ')
    .replace(/[△∆]/g, ' \\triangle ')
    .replace(/⟂/g, ' \\perp ')
    .replace(/∥/g, ' \\parallel ')
    .replace(/∈/g, ' \\in ')
    .replace(/∉/g, ' \\notin ')
    .replace(/⊆/g, ' \\subseteq ')
    .replace(/⊂/g, ' \\subset ')
    .replace(/∪/g, ' \\cup ')
    .replace(/∩/g, ' \\cap ')
    .replace(/∅/g, ' \\emptyset ')
    .replace(/≡/g, ' \\equiv ')
    .replace(/≅/g, ' \\cong ')
    .replace(/∝/g, ' \\propto ')
    .replace(/±/g, ' \\pm ')
    .replace(/∓/g, ' \\mp ')
    .replace(/√\s*\(([^()]*)\)/g, '\\sqrt{$1}')
    .replace(/√\s*([A-Za-z0-9]+)/g, '\\sqrt{$1}')
    .replace(/√/g, '\\sqrt ')
    .replace(/½/g, '\\frac{1}{2}')
    .replace(/¼/g, '\\frac{1}{4}')
    .replace(/¾/g, '\\frac{3}{4}')
    .replace(/[⁄∕]/g, '/')
    .replace(/×/g, ' \\times ')
    .replace(/÷/g, ' \\div ')
    .replace(/≤/g, ' \\le ')
    .replace(/≥/g, ' \\ge ')
    .replace(/≠/g, ' \\neq ')
    .replace(/≈/g, ' \\approx ')
    .replace(/∞/g, ' \\infty ')
    .replace(/Δ/g, ' \\Delta ')
    .replace(/θ/g, ' \\theta ')
    .replace(/μ/g, ' \\mu ')
    .replace(/σ/g, ' \\sigma ')
    .replace(/φ/g, ' \\varphi ')
    .replace(/°/g, '^\\circ')
    .replace(/π/g, ' \\pi ');

  const superscriptDigits: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
  fixed = fixed.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (digits) => `^{${digits.split('').map((digit) => superscriptDigits[digit]).join('')}}`);
  fixed = fixed.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (digits) => `_{${digits.split('').map((digit) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(digit))).join('')}}`);

  const commands = [
    'cdot', 'frac', 'text', 'Rightarrow', 'Leftrightarrow', 'leftarrow', 'rightarrow', 'neq', 'circ', 'widehat',
    'sqrt', 'pi', 'alpha', 'beta', 'gamma', 'Delta', 'times', 'div', 'leq', 'geq', 'pm', 'infty', 'approx',
    'sin', 'cos', 'tan', 'cot', 'log', 'ln', 'lim', 'sum', 'prod', 'int', 'in', 'subset', 'cup', 'cap', 'emptyset',
    'triangle', 'angle', 'perp', 'parallel', 'Leftarrow', 'notin', 'subseteq', 'equiv', 'cong', 'propto',
    'theta', 'mu', 'sigma', 'varphi',
  ];

  commands.forEach((command) => {
    const pattern = new RegExp(`(?<![a-zA-Z\\\\])${command}(?![a-zA-Z])`, 'g');
    fixed = fixed.replace(pattern, `\\${command}`);
  });

  fixed = normalizeNamedAngles(fixed);
  fixed = removeMalformedSizingCommands(fixed);
  if (fixed.includes('/')) {
    // Sized parentheses are visual only; remove their commands so the grouped
    // expression can become one numerator or denominator without orphaning \right.
    fixed = fixed.replace(/\\left\s*(?=[(\[])/g, '').replace(/\\right\s*(?=[)\]])/g, '');
  }
  return normalizeSlashFractions(fixed);
}
