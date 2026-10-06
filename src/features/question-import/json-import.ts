import { validateGeometryDiagram } from '@/features/geometry/geometry-validator';
import type { GeometryDiagram } from '@/features/geometry/types';
import { normalizeQuestionType, normalizeShortAnswer, type QuestionType } from '@/features/mock-exams/question-model';
import { pointUnits } from '@/features/mock-exams/scoring';

export type ImportTarget = 'practice' | 'mock_exam';

type ImportedBase = {
  content: string;
  solution: string;
  diagram?: GeometryDiagram;
  points?: number;
};
export type ImportedStatement = { content: string; correct_answer: boolean; solution?: string };
export type ImportedQuestion = ImportedBase & (
  | { question_type?: 'multiple_choice'; options: string[]; correct_answer: number; accepted_answers?: [] }
  | { question_type: 'short_answer'; options: []; correct_answer: null; accepted_answers: string[] }
  | { question_type: 'true_false'; options: []; correct_answer: null; accepted_answers: []; statements: ImportedStatement[] }
);

export type ImportParseResult = {
  questions: ImportedQuestion[];
  errors: string[];
};

const LETTER_TO_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

function getQuestionArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.questions)) return record.questions;
    if (record.data && typeof record.data === 'object' && Array.isArray((record.data as Record<string, unknown>).questions)) {
      return (record.data as Record<string, unknown>).questions as unknown[];
    }
  }
  return null;
}

function normalizeCorrectAnswer(value: unknown, options: string[]) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^[A-Da-d]$/.test(trimmed)) return LETTER_TO_INDEX[trimmed.toUpperCase()];
    if (/^[0-3]$/.test(trimmed)) return Number(trimmed);
    const matchingOption = options.findIndex((option) => option.trim() === trimmed);
    if (matchingOption >= 0) return matchingOption;
  }
  return -1;
}

export function parseQuestionJson(raw: string, target: ImportTarget = 'practice'): ImportParseResult {
  if (!raw.trim()) return { questions: [], errors: ['Hãy dán JSON câu hỏi trước khi xem trước.'] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { questions: [], errors: ['JSON chưa đúng định dạng. Hãy kiểm tra dấu ngoặc, dấu phẩy và dấu nháy kép.'] };
  }

  const sourceQuestions = getQuestionArray(parsed);
  if (!sourceQuestions) {
    return { questions: [], errors: ['JSON phải là một mảng câu hỏi hoặc một đối tượng có trường "questions".'] };
  }
  if (sourceQuestions.length === 0) return { questions: [], errors: ['Danh sách câu hỏi đang trống.'] };
  if (sourceQuestions.length > 100) return { questions: [], errors: ['Mỗi lượt chỉ nhập tối đa 100 câu để dễ kiểm tra.'] };

  const errors: string[] = [];
  const questions: ImportedQuestion[] = [];

  sourceQuestions.forEach((item, index) => {
    const row = index + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`Câu ${row}: phải là một đối tượng JSON.`);
      return;
    }

    const record = item as Record<string, unknown>;
    const before = errors.length;
    const type = normalizeQuestionType(record.question_type);
    const content = typeof record.content === 'string'
      ? record.content.trim()
      : typeof record.question === 'string'
        ? record.question.trim()
        : '';
    const rawOptions = Array.isArray(record.options) ? record.options : Array.isArray(record.answers) ? record.answers : [];
    const options = rawOptions.map((option) => typeof option === 'string' ? option.trim() : '');
    const correctAnswer = normalizeCorrectAnswer(record.correct_answer ?? record.correctAnswer ?? record.answer, options);
    const solution = typeof record.solution === 'string'
      ? record.solution.trim()
      : typeof record.explanation === 'string'
        ? record.explanation.trim()
        : '';
    const diagramResult = validateGeometryDiagram(record.diagram);

    if (!content) errors.push(`Câu ${row}: thiếu nội dung (content).`);
    if (!type) errors.push(`Câu ${row}: question_type phải là multiple_choice, true_false hoặc short_answer.`);
    if (record.max_points !== undefined || record.points_override !== undefined) errors.push(`Câu ${row}: dùng points để chỉnh điểm riêng; không nhập max_points hoặc points_override.`);
    if (record.points !== undefined && (target !== 'mock_exam' || pointUnits(record.points, false) === null)) {
      errors.push(`Câu ${row}: points chỉ dùng trong Thi thử, là số lớn hơn 0 đến 10, tối đa 4 chữ số thập phân.`);
    }
    if (type !== 'true_false' && record.statements !== undefined && (!Array.isArray(record.statements) || record.statements.length !== 0)) errors.push(`Câu ${row}: statements chỉ dùng cho câu đúng/sai.`);
    let accepted: string[] = [];
    let statements: ImportedStatement[] = [];
    if (type === 'true_false') {
      if (target !== 'mock_exam') errors.push(`Câu ${row}: đúng/sai 4 ý chỉ dùng trong Thi thử.`);
      if (['options', 'answers', 'accepted_answers'].some((key) => record[key] !== undefined && (!Array.isArray(record[key]) || (record[key] as unknown[]).length !== 0))
        || ['correct_answer', 'correctAnswer', 'answer'].some((key) => record[key] !== undefined && record[key] !== null)) {
        errors.push(`Câu ${row}: đúng/sai không có options hoặc đáp án chung; đặt correct_answer true/false trong từng ý.`);
      }
      if (!Array.isArray(record.statements) || record.statements.length !== 4) errors.push(`Câu ${row}: statements cần đúng 4 ý a, b, c, d.`);
      else record.statements.forEach((value, statementIndex) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`Câu ${row}, ý ${'abcd'[statementIndex]}: nội dung ý phải là một đối tượng.`); return; }
        const s = value as Record<string, unknown>;
        if (typeof s.content !== 'string' || !s.content.trim() || typeof s.correct_answer !== 'boolean'
          || (s.solution !== undefined && typeof s.solution !== 'string')) {
          errors.push(`Câu ${row}, ý ${'abcd'[statementIndex]}: cần content không trống và correct_answer là boolean true hoặc false; solution nếu có phải là chuỗi.`);
        } else statements.push({ content: s.content.trim(), correct_answer: s.correct_answer,
          ...(typeof s.solution === 'string' ? { solution: s.solution.trim() } : {}) });
      });
    } else if (type === 'short_answer') {
      if (target !== 'mock_exam') errors.push(`Câu ${row}: trả lời ngắn chỉ dùng trong Thi thử.`);
      if (['options', 'answers'].some((key) => record[key] !== undefined && (!Array.isArray(record[key]) || (record[key] as unknown[]).length !== 0))
        || ['correct_answer', 'correctAnswer', 'answer'].some((key) => record[key] !== undefined && record[key] !== null)) {
        errors.push(`Câu ${row}: trả lời ngắn không có phương án hoặc correct_answer; dùng accepted_answers.`);
      }
      const list = record.accepted_answers;
      if (!Array.isArray(list) || list.length < 1 || list.length > 20 || list.some((v) => typeof v !== 'string'
        || Array.from(v).length > 200 || !normalizeShortAnswer(v) || Array.from(normalizeShortAnswer(v)).length > 100)) {
        errors.push(`Câu ${row}: accepted_answers cần 1–20 chuỗi, tối đa 200 ký tự thô và 1–100 ký tự sau gộp khoảng trắng.`);
      } else {
        const seen = new Set<string>();
        accepted = list.filter((v: string) => { const key = normalizeShortAnswer(v); if (seen.has(key)) return false; seen.add(key); return true; });
      }
    } else if (type === 'multiple_choice') {
      if (options.length !== 4 || options.some((option) => !option)) errors.push(`Câu ${row}: cần đúng 4 phương án không để trống.`);
      if (correctAnswer < 0 || correctAnswer > 3) errors.push(`Câu ${row}: đáp án đúng phải là 0–3, A–D hoặc đúng nguyên văn một phương án.`);
      if (record.accepted_answers !== undefined && (!Array.isArray(record.accepted_answers) || record.accepted_answers.length !== 0)) errors.push(`Câu ${row}: trắc nghiệm không dùng accepted_answers.`);
    }
    diagramResult.errors.forEach((error) => errors.push(`Câu ${row}: ${error}`));

    if (errors.length === before) {
      const base = { content, solution, diagram: diagramResult.diagram,
        ...(typeof record.points === 'number' ? { points: record.points } : {}) };
      questions.push(type === 'true_false'
        ? { ...base, question_type: type, options: [], correct_answer: null, accepted_answers: [], statements }
        : type === 'short_answer'
        ? { ...base, question_type: type, options: [], correct_answer: null, accepted_answers: accepted }
        : { ...base, options, correct_answer: correctAnswer });
    }
  });

  return { questions, errors };
}

export function buildQuestionJsonSample(target: ImportTarget, questionType: QuestionType = 'multiple_choice'): string {
  return JSON.stringify({ questions: [target === 'mock_exam' && questionType === 'true_false'
    ? { question_type: 'true_false', content: 'Cho hình chữ nhật $ABCD$. Xác định tính đúng/sai của mỗi ý.', statements: [
      { content: '$AB = CD$.', correct_answer: true, solution: 'Hai cạnh đối của hình chữ nhật bằng nhau.' },
      { content: '$AC = BD$.', correct_answer: true, solution: 'Hai đường chéo của hình chữ nhật bằng nhau.' },
      { content: 'Mọi hình chữ nhật đều có $AB = BC$.', correct_answer: false, solution: 'Chỉ hình vuông mới có bốn cạnh bằng nhau.' },
      { content: 'Hình chữ nhật có bốn góc vuông.', correct_answer: true, solution: 'Theo định nghĩa hình chữ nhật.' },
    ], solution: 'Dùng định nghĩa và tính chất của hình chữ nhật.', diagram: null }
    : target === 'mock_exam' && questionType === 'short_answer'
    ? { question_type: 'short_answer', content: 'Giải phương trình $x + 7 = 12$. Nhập giá trị của x.', accepted_answers: ['5'], solution: 'Ta có $x = 12 - 7 = 5$.', diagram: null }
    : { content: 'Giá trị của $2 + 3$ bằng bao nhiêu?', options: ['3', '4', '5', '6'], correct_answer: 2, solution: '$2 + 3 = 5$.', diagram: null }] }, null, 2);
}

export function buildAiPrompt(target: ImportTarget, destination: string, level?: string, questionType: QuestionType = 'multiple_choice') {
  const scope = target === 'practice'
    ? `bài tự luyện "${destination}"${level ? `, Level ${level}` : ''}`
    : `đề thi thử "${destination}"`;

  const short = target === 'mock_exam' && questionType === 'short_answer';
  const trueFalse = target === 'mock_exam' && questionType === 'true_false';
  const schema = short || trueFalse ? buildQuestionJsonSample(target, questionType) : `{
  "questions": [{ "content": "Nội dung câu hỏi. Công thức đặt trong $...$ hoặc $$...$$.", "options": ["Phương án A", "Phương án B", "Phương án C", "Phương án D"], "correct_answer": 0, "solution": "Lời giải rõ ràng.", "diagram": null }]
}`;
  return `Hãy tạo câu hỏi ${trueFalse ? 'đúng/sai 4 ý' : short ? 'trả lời ngắn' : 'trắc nghiệm'} Toán THCS cho ${scope}.
Chỉ trả về JSON hợp lệ, không markdown, không giải thích bên ngoài JSON.
Mỗi câu dùng đúng cấu trúc sau:
${schema}
${trueFalse ? 'question_type là true_false. Mỗi bài có đúng 4 statements cùng một ngữ cảnh; mỗi ý có content và correct_answer là BOOLEAN true hoặc false (không phải chuỗi, số). Có thể thêm solution cho từng ý. Không có options, accepted_answers hay correct_answer chung. Một bài là một câu: đúng 1/2/3/4 ý được 10%/25%/50%/100% điểm tối đa của câu.' : short ? 'accepted_answers là 1–20 CHUỖI đáp án, không phải số JSON. Liệt kê rõ các biến thể được chấp nhận, ví dụ ["0,5", "0.5", "1/2"]. Chỉ gộp khoảng trắng; không tự quy đổi toán học hay chữ hoa/thường. Không options/correct_answer. Mỗi đáp án tối đa 100 ký tự sau gộp khoảng trắng.' : 'Quy ước: correct_answer là vị trí đáp án đúng, A = 0, B = 1, C = 2, D = 3. Mỗi câu phải có đúng 4 phương án và một đáp án đúng.'}
${target === 'mock_exam' ? 'Điểm mặc định được hệ thống tự chia từ tổng điểm từng phần. Chỉ thêm points (số JSON dương, tối đa 4 chữ số thập phân) khi ADMIN yêu cầu chỉnh điểm riêng; không tạo max_points, points_override hoặc ID. Không tự đổi tổng điểm phần.' : ''}
Lời giải rõ ràng, xuống dòng khi cần. Công thức dài đặt trong $$...$$.

Nếu câu hỏi cần hình, thay diagram bằng đối tượng hình học có cấu trúc dưới đây. Nếu không cần hình, dùng null. Tuyệt đối không chèn SVG, HTML, mã Python hoặc URL ảnh.
{
  "type": "geometry",
  "width": 360,
  "height": 260,
  "alt": "Mô tả đầy đủ nội dung hình",
  "points": [{"id":"A","x":70,"y":210},{"id":"B","x":300,"y":210},{"id":"C","x":70,"y":50},{"id":"O","x":255,"y":105}],
  "segments": [{"from":"A","to":"B","style":"solid","label":"6 cm","ticks":0,"parallel_marks":0},{"from":"B","to":"C"},{"from":"C","to":"A"}],
  "polygons": [{"points":["A","B","C"],"fill":"primary","opacity":0.08}],
  "circles": [{"center":"O","radius":70}],
  "arcs": [{"center":"O","radius":45,"start_angle":0,"end_angle":90,"label":"90°"}],
  "ellipses": [{"cx":180,"cy":70,"rx":80,"ry":22,"style":"dashed"}],
  "paths": [{"d":"M 40 180 Q 180 40 320 180","fill":"none"}],
  "angles": [{"from":"B","vertex":"A","to":"C","radius":24,"label":"60°"}],
  "right_angles": [{"at":"A","from":"B","to":"C"}],
  "labels": [{"x":180,"y":245,"text":"Hình minh họa","align":"middle"}],
  "axes": null,
  "plots": []
}
Quy tắc vẽ hình:
- Tọa độ SVG có gốc ở góc trên trái; x tăng sang phải, y tăng xuống dưới. Mọi chi tiết phải nằm trong width × height và chừa lề tối thiểu 24 px.
- Các điểm được tham chiếu bằng id. segments cũng chấp nhận arrows: none/start/end/both; style: solid/dashed/dotted; tone: default/primary/muted/success/warning.
- Dùng right_angles cho dấu vuông, angles cho cung góc, ticks cho các đoạn bằng nhau, parallel_marks cho các đoạn song song.
- Dùng circles/arcs cho đường tròn, ellipses + segments + paths nét đứt cho hình không gian, polygons cho vùng tô.
- Với mặt phẳng tọa độ, axes gồm origin_x, origin_y, unit_x, unit_y, x_min, x_max, y_min, y_max, grid; plots là danh sách các điểm [x,y] trong hệ tọa độ toán học.
- Chỉ điền các mảng thực sự cần; các mảng còn lại để []. Sắp nhãn tránh đè lên đường và nhau. Hình phải đủ dữ kiện của đề nhưng không vô tình tiết lộ đáp án.`;
}
