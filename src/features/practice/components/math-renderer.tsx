'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { normalizeLatexInput } from '@/lib/math/normalize-latex';
import { prepareMathContent, wrapBareMathEnvironments } from '@/lib/math/math-content';

interface MathRendererProps {
  content: string;
  display?: boolean;
  /** Use the reading-friendly layout intended for a detailed solution. */
  variant?: 'inline' | 'solution';
}

type MathPart = {
  type: 'text' | 'inline-math' | 'display-math';
  value: string;
};

function looksLikeProse(value: string) {
  const withoutCommands = value
    .replace(/\\text\s*\{[^{}]*\}/g, '')
    .replace(/\\[a-zA-Z]+/g, '');
  const words = withoutCommands.match(/[A-Za-z]{3,}/g) ?? [];

  return /[À-ỹĐđ]/.test(withoutCommands) || words.length >= 2;
}

function normalizeMathOperators(value: string) {
  return value
    .replace(/>=/g, ' \\ge ')
    .replace(/<=/g, ' \\le ')
    .replace(/!=/g, ' \\neq ')
    .replace(/(\\in|\bin)\s*(?<!\\)\{([^}]+)(?<!\\)\}/g, '$1 \\{$2\\}')
    .replace(/(?<![a-zA-Z\\])in(?![a-zA-Z])/g, '\\in');
}

/**
 * Older AI-generated theory JSON sometimes wraps an entire Vietnamese sentence
 * in $...$. KaTeX treats normal spaces as mathematical spacing, which makes the
 * words appear stuck together. Keep prose as prose and wrap only exponent or
 * subscript atoms that can safely be rendered as inline math.
 */
function wrapRawMathAtoms(value: string) {
  return value.replace(
    /(?:\([^()\n]+\)|[0-9]*[A-Za-z]+)(?:\^(?:\{[^{}\n]+\}|[+-]?\d+)|_(?:\{[^{}\n]+\}|[A-Za-z0-9+-]+))[A-Za-z0-9]*/g,
    '$$$&$$'
  );
}

/**
 * Some imported question JSON mixes Vietnamese prose and raw LaTeX, for
 * examples: "4x^3y^2 và -\\frac{1}{2}x^3y^2" or
 * "\\widehat{DAC}=\\widehat{BAC}=30^\\circ". Keep the prose as normal text
 * while turning raw LaTex fragments into inline math blocks.
 */
function formatRawMathInText(value: string) {
  // Keep all three point labels attached to their command during prose splitting.
  value = value.replace(/\\angle(?![A-Za-z])\s*([A-Z]\s*[A-Z]\s*[A-Z])(?![A-Za-z0-9_'])/g,
    (_match, name: string) => `\\angle{${name.replace(/\s/g, '')}}`);
  const rawLatexExpressionPattern = /[+-]?\s*\\(?:d?frac|tfrac)\s*\{[^{}\n]+\}\s*\{[^{}\n]+\}(?:\s*[A-Za-z](?:\^(?:\{[^{}\n]+\}|[+-]?\d+|\\[A-Za-z]+)|_(?:\{[^{}\n]+\}|[A-Za-z0-9+-]+))?)*|[+-]?\s*\\[A-Za-z]+(?:\s*\{[^{}\n]+\})?(?:\s*(?:=|\+|-|\*|\/)\s*(?:\\[A-Za-z]+(?:\s*\{[^{}\n]+\})?|[0-9A-Za-z]+(?:\^(?:\{[^{}\n]+\}|[+-]?\d+|\\[A-Za-z]+)|_(?:\{[^{}\n]+\}|[A-Za-z0-9+-]+))?))*|[+-]?\d+(?:\^(?:\{[^{}\n]+\}|[+-]?\d+|\\[A-Za-z]+)|_(?:\{[^{}\n]+\}|[A-Za-z0-9+-]+))/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = rawLatexExpressionPattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push(wrapRawMathAtoms(value.slice(lastIndex, match.index)));
    }

    parts.push(`$${match[0]}$`);
    lastIndex = rawLatexExpressionPattern.lastIndex;
  }

  if (lastIndex < value.length) {
    parts.push(wrapRawMathAtoms(value.slice(lastIndex)));
  }

  return parts.join('');
}

/** Keep Vietnamese prose intact while typesetting recognizable Unicode math atoms. */
function formatUnicodeMathInText(value: string) {
  const notation = /(?<![A-Za-zÀ-ỹĐđ0-9])(?:∠\s*[A-Z]{1,4}(?:\s*(?:=|≈|≠)\s*\d+(?:°)?)?|[△∆]\s*[A-Z]{3}|[A-Za-z]{1,4}\s*[⟂∥∈∉≤≥≠≈]\s*(?:[A-Za-z0-9]{1,4}|\{[^{}\n]+\})|√\s*(?:\([^()\n]+\)|[A-Za-z0-9]+)|[A-Za-z0-9]+[⁰¹²³⁴⁵⁶⁷⁸⁹₀-₉]+|\d+(?:[.,]\d+)?°|[½¼¾])(?![A-Za-zÀ-ỹĐđ0-9])/g;
  return splitMathParts(value).map((part) => {
    if (part.type === 'text') return part.value.replace(notation, (match) => `$${match}$`);
    return part.type === 'display-math' ? `$$${part.value}$$` : `$${part.value}$`;
  }).join('');
}

/** Recognize simple slash expressions inside prose without touching URLs or dates. */
function formatPlainTextMath(value: string) {
  const slashExpression = /(?<![A-Za-zÀ-ỹĐđ0-9/:.])(?:[+-]?(?:\d+(?:\.\d+)?|[A-Za-z]{1,2}(?:\^\{?[-+]?\d+\}?)?|\([^()\n]+\)))\s*\/\s*(?:\([^()\n]+\)|[A-Za-z]{1,2}(?:\^\{?[-+]?\d+\}?)?|\d+(?:\.\d+)?)(?![A-Za-zÀ-ỹĐđ0-9/])/g;
  return splitMathParts(wrapBareMathEnvironments(value)).map((part) => {
    if (part.type !== 'text') return part.type === 'display-math' ? `$$${part.value}$$` : `$${part.value}$`;
    const withFractions = part.value.replace(slashExpression, (match) => `$${match}$`);
    return splitMathParts(withFractions).map((fractionPart) => {
      if (fractionPart.type === 'text') return formatUnicodeMathInText(formatRawMathInText(fractionPart.value));
      return fractionPart.type === 'display-math' ? `$$${fractionPart.value}$$` : `$${fractionPart.value}$`;
    }).join('');
  }).join('');
}

function splitMathParts(content: string): MathPart[] {
  const parts: MathPart[] = [];
  const pattern = /(\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\$)[\s\S]*?(?<!\$)\$(?!\$))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }

    const value = match[0];
    parts.push({
      type: value.startsWith('$$') ? 'display-math' : 'inline-math',
      value: value.startsWith('$$') ? value.slice(2, -2) : value.slice(1, -1),
    });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return parts;
}

function shouldDisplayFormula(math: string) {
  const equalSigns = (math.match(/=/g) || []).length;
  return (
    math.length >= 72 ||
    equalSigns >= 2 ||
    /\\begin\{|\\\\/.test(math)
  );
}

/**
 * Normalizes mathematical expressions in question options or short text so they render properly with KaTeX.
 * Converts pseudo-math like "n in {3; 4}", "n >= 3", "x <= 4", "n = 3", "{3; 4}" into standard LaTeX.
 */
export function formatOptionMath(opt: string): string {
  if (!opt || typeof opt !== 'string') return opt || '';
  let s = prepareMathContent(opt.trim());

  // If already contains $ ... $, normalize inside the math blocks
  if (s.includes('$')) {
    const repairedBlocks = s.replace(/\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g, (block, displayMath, inlineMath) => {
      const math = displayMath ?? inlineMath;
      const m = normalizeMathOperators(math);

      if (!/\\begin\{/.test(m) && looksLikeProse(m)) return formatPlainTextMath(m);
      return displayMath !== undefined ? '$$' + m + '$$' : '$' + m + '$';
    });

    return splitMathParts(repairedBlocks).map((part) => {
      if (part.type === 'text') return formatPlainTextMath(part.value);
      return part.type === 'display-math' ? `$$${part.value}$$` : `$${part.value}$`;
    }).join('');
  }

  // 1. Check for set membership syntax, e.g. "n in {3; 4}", "x in {1; 2}", "n in \{3; 4\}"
  if (/\bin\s*\{([^}]+)\}/i.test(s) || /\bin\s*\\\{([^}]+)\\\}/i.test(s)) {
    let m = s.replace(/(?<![a-zA-Z\\])in\s*(?:\\\{|\{)([^}]+?)(?:\\\}|\})/gi, '\\in \\{$1\\}');
    return `$${m}$`;
  }

  // 2. Check for inequality / comparison operators, e.g. "n >= 3", "n <= 4", "x != 0"
  if (s.includes('>=') || s.includes('<=') || s.includes('!=')) {
    let m = s
      .replace(/>=/g, ' \\ge ')
      .replace(/<=/g, ' \\le ')
      .replace(/!=/g, ' \\neq ');
    return `$${m}$`;
  }

  // 3. Check for single variable comparison or equation, e.g. "n = 3", "x > 0", "x < 5", "y = -2"
  if (/^[a-zA-Z]\s*[=><]\s*[-0-9/.]+$/.test(s)) {
    return `$${s}$`;
  }

  // 4. Check for standalone set notation like "{3; 4}" or "{1, 2, 3}"
  if (/^\{[0-9;,\s-]+\}$/.test(s)) {
    let inner = s.slice(1, -1);
    return `$\\{${inner}\\}$`;
  }

  // 5. Only wrap a value when the *entire* value is mathematical notation.
  // A theory statement often contains both prose and a formula, for example:
  // "Với A, B là hai biểu thức tùy ý, A^2 - B^2 = ...". Wrapping the
  // whole sentence makes KaTeX discard normal word spacing.
  const withoutLatexCommands = s.replace(/\\[a-zA-Z]+/g, '');
  const isMathOnly = /^[\s0-9A-Za-z\\^_{}()[\]+\-*/⁄∕=<>.,;:|·÷×−≤≥≠≈√∞π∠△∆⟂∥∈∉⊂⊆∪∩∅°²³¹⁴⁵⁶⁷⁸⁹⁰₀-₉⇒⇔→←±∓½¼¾]+$/.test(s)
    && !/(?:https?:\/\/|www\.)/i.test(s)
    && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)
    && !(/\s/.test(withoutLatexCommands) && /[A-Za-z]{3,}/.test(withoutLatexCommands));

  if (isMathOnly && (/[\\^_\/⁄∕×÷−≤≥≠≈√∞π∠△∆⟂∥∈∉⊂⊆∪∩∅°²³¹⁴⁵⁶⁷⁸⁹⁰₀-₉⇒⇔→←±∓½¼¾]/.test(s))) {
    return `$${s}$`;
  }

  // Preserve prose while rendering raw exponent and fraction terms from older question JSON.
  // New content should still use explicit $...$ delimiters for complete formulas.
  return formatPlainTextMath(s);
}

export const MathRenderer = React.memo(function MathRenderer({ content, display = false, variant = 'inline' }: MathRendererProps) {
  const renderMath = (math: string, displayMode: boolean, key: React.Key) => {
    const html = katex.renderToString(normalizeLatexInput(math), { displayMode, throwOnError: false });
    return <span key={key} dangerouslySetInnerHTML={{ __html: html }} />;
  };

  const renderedContent = useMemo(() => {
    try {
      if (variant === 'inline') {
        const normalized = formatOptionMath(content);
        const parts = splitMathParts(normalized);

        return parts.map((part, index) => {
          if (part.type === 'display-math') {
            return renderMath(part.value, true, index);
          }
          if (part.type === 'inline-math') {
            return renderMath(part.value, false, index);
          }
          return <span key={index}>{part.value}</span>;
        });
      }

      const normalized = formatOptionMath(content.replace(/\r\n?/g, '\n'));
      const parts = splitMathParts(normalized);
      const blocks: React.ReactNode[] = [];
      let paragraph: React.ReactNode[] = [];
      let key = 0;

      const flushParagraph = () => {
        if (!paragraph.some(node => typeof node !== 'string' || node.trim().length > 0)) return;
        blocks.push(
          <p key={`paragraph-${key++}`} className="max-w-[72ch] break-words leading-7 text-pretty">
            {paragraph}
          </p>
        );
        paragraph = [];
      };

      const appendText = (value: string) => {
        const segments = value.split(/(\n\s*\n+)/);
        segments.forEach((segment) => {
          if (/^\n\s*\n+$/.test(segment)) {
            flushParagraph();
            return;
          }

          const lines = segment.split('\n');
          lines.forEach((line, lineIndex) => {
            if (lineIndex > 0) paragraph.push(<br key={`break-${key++}`} />);
            if (line) paragraph.push(line);
          });
        });
      };

      parts.forEach((part, index) => {
        if (part.type === 'text') {
          appendText(part.value);
          return;
        }

        const isDisplay = part.type === 'display-math' || shouldDisplayFormula(part.value);
        if (!isDisplay) {
          paragraph.push(renderMath(part.value, false, `inline-${key++}`));
          return;
        }

        flushParagraph();

        let punctuation = '';
        const followingPart = parts[index + 1];
        if (followingPart?.type === 'text') {
          const punctuationMatch = followingPart.value.match(/^\s*([.,;:])\s*/);
          if (punctuationMatch) {
            punctuation = punctuationMatch[1];
            followingPart.value = followingPart.value.slice(punctuationMatch[0].length);
          }
        }

        blocks.push(
          <div key={`formula-${key++}`} className="-mx-1 overflow-x-auto px-1 py-2 text-center [&_.katex-display]:my-0">
            {renderMath(part.value, true, `display-${key++}`)}{punctuation}
          </div>
        );
      });

      flushParagraph();
      return blocks;
    } catch (e) {
      console.error("Math rendering error:", e);
      return <>{content}</>;
    }
  }, [content, variant]);

  if (variant === 'inline' && !display) {
    return <span className="math-renderer inline">{renderedContent}</span>;
  }

  return <div className={`math-renderer ${variant === 'solution' ? 'space-y-3 sm:space-y-4' : 'my-4 text-center'}`}>{renderedContent}</div>;
});
