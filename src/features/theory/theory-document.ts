import { validateGeometryDiagram } from '../geometry/geometry-validator';
import type { TheoryContentBlock, TheoryDocument } from './types';

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Recover text pasted into the legacy editor. Never execute or render imported markup. */
export function theoryJsonSource(source: string) {
  let text = source.trim();
  if (text.startsWith('<')) {
    // Only the editor's text-formatting wrappers are accepted. Images/scripts or
    // mixed article content must not be silently discarded to extract JSON.
    if (/<\/?(?!p\b|div\b|br\b|span\b|strong\b|em\b|b\b|i\b|u\b|s\b|code\b|pre\b)[a-z][^>]*>/i.test(text)) return source;
    text = text.replace(/<br\s*\/?\s*>|<\/(?:p|div|pre)\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&(#x[0-9a-f]+|#\d+|quot|apos|lt|gt|amp|nbsp);/gi, (entity, key: string) => {
        const named: Record<string, string> = { quot: '"', apos: "'", lt: '<', gt: '>', amp: '&', nbsp: ' ' };
        if (!key.startsWith('#')) return named[key.toLowerCase()] ?? entity;
        const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
      }).trim();
  }
  return text.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
}

export function isTheoryJson(source: string) {
  const text = theoryJsonSource(source);
  return text.startsWith('{') && (source.trimStart().startsWith('{') || /"sections"\s*:/.test(text));
}

export function parseTheoryDocument(raw: string): { document?: TheoryDocument; errors: string[] } {
  let value: unknown;
  try { value = JSON.parse(theoryJsonSource(raw)); }
  catch { return { errors: ['JSON lý thuyết chưa đúng định dạng. Kiểm tra dấu ngoặc, dấu phẩy và dấu nháy kép.'] }; }
  if (!record(value) || !Array.isArray(value.sections) || !value.sections.length || value.sections.length > 50) {
    return { errors: ['JSON lý thuyết cần mảng sections gồm 1–50 mục.'] };
  }

  const errors: string[] = [];
  const sections: TheoryDocument['sections'] = [];
  value.sections.forEach((section, index) => {
    const prefix = `Mục ${index + 1}`;
    if (!record(section) || typeof section.heading !== 'string' || !section.heading.trim()) {
      errors.push(`${prefix}: cần heading là tên mục.`);
      return;
    }
    if (!Array.isArray(section.blocks) || !section.blocks.length || section.blocks.length > 20) {
      errors.push(`${prefix}: cần mảng blocks gồm 1–20 phần nội dung.`);
      return;
    }
    const blocks: TheoryContentBlock[] = [];
    section.blocks.forEach((block, blockIndex) => {
      const label = `${prefix}, phần ${blockIndex + 1}`;
      if (!record(block) || typeof block.content !== 'string' || !block.content.trim()) {
        errors.push(`${label}: cần content là nội dung văn bản.`);
        return;
      }
      const normalized: TheoryContentBlock = { content: block.content.trim() };
      for (const key of ['example', 'caption'] as const) {
        if (block[key] !== undefined && typeof block[key] !== 'string') errors.push(`${label}: ${key} phải là văn bản.`);
        else if (typeof block[key] === 'string' && block[key].trim()) normalized[key] = block[key].trim();
      }
      if (block.items !== undefined) {
        if (!Array.isArray(block.items) || block.items.length > 40 || block.items.some((item) => typeof item !== 'string' || !item.trim())) {
          errors.push(`${label}: items phải là mảng các dòng văn bản không rỗng.`);
        } else normalized.items = block.items.map((item: string) => item.trim());
      }
      if (block.diagram !== undefined) {
        const checked = validateGeometryDiagram(block.diagram);
        if (!checked.diagram || checked.errors.length) errors.push(`${label}: hình chưa hợp lệ — ${checked.errors[0] ?? 'thiếu dữ liệu hình.'}`);
        else normalized.diagram = checked.diagram;
      }
      blocks.push(normalized);
    });
    sections.push({ heading: section.heading.trim(), blocks });
  });
  if (errors.length) return { errors };
  return {
    document: {
      ...(typeof value.title === 'string' ? { title: value.title.trim() } : {}),
      ...(typeof value.summary === 'string' ? { summary: value.summary.trim() } : {}),
      sections,
    },
    errors,
  };
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function paragraphs(text: string) {
  return text.split(/\n\s*\n/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('');
}

/** JSON prose is plain text; the existing HTML/math renderer handles only our escaped markup. */
export function theoryBlockHtml(block: TheoryContentBlock) {
  return paragraphs(block.content)
    + (block.items?.length ? `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '')
    + (block.example ? `<p><strong>Ví dụ:</strong> ${escapeHtml(block.example).replace(/\n/g, '<br>')}</p>` : '');
}
