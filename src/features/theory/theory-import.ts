import type { DragFillData, TheoryQuestion, TrueFalseData } from './types';
import { validateGeometryDiagram } from '../geometry/geometry-validator';

export const THEORY_JSON_EXAMPLE = JSON.stringify({
  questions: [
    {
      question_type: 'true_false',
      prompt: 'Xét các khẳng định sau về hình bình hành:',
      data: {
        statements: [
          { text: 'Hai đường chéo cắt nhau tại trung điểm của mỗi đường.', answer: true },
          { text: 'Hai đường chéo luôn bằng nhau.', answer: false },
          { text: 'Các cạnh đối song song và bằng nhau.', answer: true },
        ],
      },
      solution: 'Hình bình hành có các cạnh đối song song, bằng nhau và hai đường chéo cắt nhau tại trung điểm. Hai đường chéo không nhất thiết bằng nhau.',
    },
    {
      question_type: 'drag_fill',
      prompt: 'Kéo các từ thích hợp vào chỗ trống:',
      data: {
        template: 'Tổng ba góc trong một tam giác bằng {{1}}. Tam giác có một góc bằng 90° gọi là tam giác {{2}}.',
        options: ['180°', 'vuông', '360°', 'cân'],
        answers: ['180°', 'vuông'],
      },
      solution: 'Tổng ba góc trong một tam giác bằng 180°. Tam giác có một góc 90° là tam giác vuông.',
    },
  ],
}, null, 2);

function readQuestionArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).questions)) {
    return (value as Record<string, unknown>).questions as unknown[];
  }
  return null;
}

function placeholderCount(template: string) {
  const indexes = Array.from(template.matchAll(/\{\{(\d+)\}\}/g)).map((match) => Number(match[1]));
  if (!indexes.length) return 0;
  const expected = Array.from({ length: Math.max(...indexes) }, (_, index) => index + 1);
  return indexes.length === expected.length && indexes.every((value, index) => value === expected[index])
    ? indexes.length
    : -1;
}

export function parseTheoryQuestionJson(raw: string): { questions: TheoryQuestion[]; errors: string[] } {
  if (!raw.trim()) return { questions: [], errors: ['Hãy dán JSON câu hỏi trước khi xem trước.'] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { questions: [], errors: ['JSON chưa đúng định dạng. Hãy kiểm tra dấu ngoặc, dấu phẩy và dấu nháy kép.'] };
  }

  const source = readQuestionArray(parsed);
  if (!source) return { questions: [], errors: ['JSON phải là một mảng hoặc một đối tượng có trường "questions".'] };
  if (!source.length) return { questions: [], errors: ['Danh sách câu hỏi đang trống.'] };
  if (source.length > 100) return { questions: [], errors: ['Mỗi lượt chỉ nhập tối đa 100 câu.'] };

  const errors: string[] = [];
  const questions: TheoryQuestion[] = [];

  source.forEach((item, index) => {
    const row = index + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push('Câu ' + row + ': phải là một đối tượng JSON.');
      return;
    }

    const record = item as Record<string, unknown>;
    const questionType = record.question_type;
    const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
    const solution = typeof record.solution === 'string' ? record.solution.trim() : '';
    const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
      ? record.data as Record<string, unknown>
      : null;

    if (questionType !== 'true_false' && questionType !== 'drag_fill') {
      errors.push('Câu ' + row + ': question_type phải là "true_false" hoặc "drag_fill".');
      return;
    }
    if (!prompt) errors.push('Câu ' + row + ': thiếu nội dung prompt.');
    if (!data) {
      errors.push('Câu ' + row + ': thiếu đối tượng data.');
      return;
    }

    // Store the imported root-level diagram inside the existing JSONB data column.
    const checkedDiagram = validateGeometryDiagram(record.diagram ?? data.diagram);
    if (checkedDiagram.errors.length) {
      errors.push('Câu ' + row + ': ' + checkedDiagram.errors.join(' '));
      return;
    }
    const diagramData = checkedDiagram.diagram ? { diagram: checkedDiagram.diagram } : {};

    if (questionType === 'true_false') {
      const statements = Array.isArray(data.statements) ? data.statements : [];
      const normalized = statements.flatMap((statement) => {
        if (!statement || typeof statement !== 'object' || Array.isArray(statement)) return [];
        const entry = statement as Record<string, unknown>;
        if (typeof entry.text !== 'string' || !entry.text.trim() || typeof entry.answer !== 'boolean') return [];
        return [{ text: entry.text.trim(), answer: entry.answer }];
      });
      if (statements.length < 2 || statements.length > 6 || normalized.length !== statements.length) {
        errors.push('Câu ' + row + ': Đúng/Sai cần từ 2–6 mệnh đề, mỗi mệnh đề có text và answer dạng true/false.');
      }
      if (prompt && statements.length >= 2 && statements.length <= 6 && normalized.length === statements.length) {
        questions.push({ question_type: questionType, prompt, data: { statements: normalized, ...diagramData } satisfies TrueFalseData, solution });
      }
      return;
    }

    const template = typeof data.template === 'string' ? data.template.trim() : '';
    const options = Array.isArray(data.options)
      ? data.options.map((value) => typeof value === 'string' ? value.trim() : '').filter(Boolean)
      : [];
    const answers = Array.isArray(data.answers)
      ? data.answers.map((value) => typeof value === 'string' ? value.trim() : '').filter(Boolean)
      : [];
    const slots = placeholderCount(template);

    if (!template || slots <= 0) errors.push('Câu ' + row + ': template phải có các ô liên tiếp {{1}}, {{2}}…');
    if (options.length < 2) errors.push('Câu ' + row + ': cần ít nhất 2 lựa chọn kéo-thả.');
    if (slots > 0 && answers.length !== slots) errors.push('Câu ' + row + ': số answers phải bằng số ô trống trong template.');
    if (answers.some((answer) => !options.includes(answer))) errors.push('Câu ' + row + ': mọi đáp án phải xuất hiện trong options.');

    if (prompt && template && slots > 0 && options.length >= 2 && answers.length === slots && answers.every((answer) => options.includes(answer))) {
      questions.push({ question_type: questionType, prompt, data: { template, options, answers, ...diagramData } satisfies DragFillData, solution });
    }
  });

  return { questions, errors };
}

export function buildTheoryAiPrompt(lessonName: string) {
  return [
    'Hãy tạo bộ câu hỏi kiểm tra lý thuyết Toán THCS cho bài "' + lessonName + '".',
    'Chỉ trả về JSON hợp lệ, không dùng markdown và không giải thích ngoài JSON.',
    'Chỉ sử dụng hai loại question_type: "true_false" và "drag_fill".',
    'Khi cần hình minh họa, thêm trường diagram cùng cấp với prompt; diagram.type là "geometry", chứa điểm, đoạn thẳng và nhãn theo mẫu FlyDo.',
    '',
    'Quy tắc Đúng/Sai:',
    '- data.statements có 2–6 mệnh đề.',
    '- answer bắt buộc là true hoặc false, không đặt trong dấu nháy.',
    '- Trong câu chữ, chỉ đặt công thức trong dấu $...$; không đặt cả câu văn trong dấu $...$.',
    '',
    'Quy tắc kéo-thả:',
    '- Đánh dấu chỗ trống trong template lần lượt bằng {{1}}, {{2}}, {{3}}…',
    '- data.answers xếp đúng thứ tự các ô trống.',
    '- Mọi đáp án phải có trong data.options; thêm 1–3 phương án gây nhiễu hợp lý.',
    '- Không dùng hai ô trống có cùng một đáp án.',
    '- Nếu template, options hoặc solution có công thức, chỉ đặt riêng công thức trong dấu $...$.',
    '',
    'Mẫu chuẩn:',
    THEORY_JSON_EXAMPLE,
  ].join('\n');
}
