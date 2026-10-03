'use client';

import { useEffect, useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { normalizeLatexInput } from '@/lib/math/normalize-latex';
import { sanitizeRichHtml } from '@/lib/security/safe-content';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { isTheoryJson, parseTheoryDocument, theoryBlockHtml } from '../theory-document';

function renderMathInHtml(source: string) {
  const container = document.createElement('div');
  container.innerHTML = sanitizeRichHtml(source);

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue ?? '';
    if (!text.includes('$')) return;

    const fragment = document.createDocumentFragment();
    const regex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let hasMath = false;

    while ((match = regex.exec(text))) {
      hasMath = true;
      if (match.index > lastIndex) fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
      const display = Boolean(match[1]);
      const span = document.createElement('span');
      span.className = display ? 'theory-math-display my-4 block overflow-x-auto text-center' : 'theory-math-inline inline-block max-w-full align-middle';
      try {
        span.innerHTML = katex.renderToString(normalizeLatexInput((match[1] ?? match[2]).trim()), {
          displayMode: display,
          throwOnError: false,
          strict: false,
        });
      } catch {
        span.textContent = match[0];
      }
      fragment.append(span);
      lastIndex = regex.lastIndex;
    }

    if (!hasMath) return;
    if (lastIndex < text.length) fragment.append(document.createTextNode(text.slice(lastIndex)));
    textNode.replaceWith(fragment);
  });

  return container.innerHTML;
}

function RichTheoryHtml({ html, className }: { html: string; className?: string }) {
  const [renderedHtml, setRenderedHtml] = useState('');

  useEffect(() => {
    setRenderedHtml(renderMathInHtml(html));
  }, [html]);

  return (
    <div
      className={className ?? 'prose prose-base vivux-prose max-w-none break-words leading-7 prose-headings:font-bold prose-img:mx-auto prose-img:max-w-full prose-img:rounded-2xl sm:prose-lg sm:leading-8'}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}

export function TheoryContent({ html, className }: { html: string; className?: string }) {
  const parsed = useMemo(() => isTheoryJson(html) ? parseTheoryDocument(html) : null, [html]);
  if (!parsed) return <RichTheoryHtml html={html} className={className} />;
  if (!parsed.document) return <p role="alert" className="text-destructive">Không thể hiển thị lý thuyết: {parsed.errors[0]}</p>;

  return (
    <div className={className ?? 'prose prose-base vivux-prose max-w-none break-words leading-7 sm:prose-lg sm:leading-8'}>
      {parsed.document.sections.map((section, index) => (
        <section key={index}>
          <h2>{section.heading}</h2>
          {section.blocks.map((block, blockIndex) => (
            <div key={blockIndex}>
              <RichTheoryHtml html={theoryBlockHtml(block)} className="contents" />
              {block.diagram && <GeometryDiagram data={block.diagram} className="theory-geometry not-prose" showValidationError />}
              {block.diagram && block.caption && <p className="text-center text-sm">{block.caption}</p>}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
