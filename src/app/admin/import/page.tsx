'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clipboard, Code2, FileText, GraduationCap, Loader2, Shapes, Sparkles, UploadCloud } from 'lucide-react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AdminLessonPicker, type AdminLessonOption } from '@/components/admin/lesson-picker';
import { MOCK_EXAM_CATEGORIES } from '@/features/mock-exams/exam-categories';
import { MathRenderer, formatOptionMath } from '@/features/practice/components/math-renderer';
import { GeometryDiagram } from '@/features/geometry/components/geometry-diagram';
import { buildAiPrompt, buildQuestionJsonSample, parseQuestionJson, type ImportedQuestion, type ImportTarget } from '@/features/question-import/json-import';
import type { QuestionType } from '@/features/mock-exams/question-model';
import { QUESTION_TYPE_LABELS, formatPoints } from '@/features/mock-exams/scoring';
import { getMockExamScoring, previewMockExamImport, importMockExamQuestions, type ScoringDetails } from '@/features/mock-exams/scoring-api';

type ExamOption = { id: string; grade: number; title: string; category: string | null; topic_id: string | null; scoring_mode?: 'legacy_equal' | 'sectioned'; scoring_revision?: number };
type TopicOption = { id: string; grade: number; name: string };

const GEOMETRY_JSON_EXAMPLE = JSON.stringify({
  questions: [
    {
      content: 'Cho tam giác $ABC$ vuông tại $A$, biết $AB = 6\\,cm$, $AC = 8\\,cm$. Độ dài $BC$ bằng:',
      options: ['$10\\,cm$', '$12\\,cm$', '$14\\,cm$', '$48\\,cm$'],
      correct_answer: 0,
      solution: 'Áp dụng định lý Pythagore: $$BC = \\sqrt{AB^2 + AC^2} = \\sqrt{6^2 + 8^2} = 10\\,cm.$$',
      diagram: {
        type: 'geometry',
        width: 360,
        height: 260,
        alt: 'Tam giác ABC vuông tại A, cạnh AB dài 6 cm và AC dài 8 cm.',
        points: [
          { id: 'A', x: 70, y: 205, label: 'A', label_dx: -10, label_dy: 16 },
          { id: 'B', x: 290, y: 205, label: 'B', label_dx: 10, label_dy: 16 },
          { id: 'C', x: 70, y: 55, label: 'C', label_dx: -10, label_dy: -12 },
        ],
        segments: [
          { from: 'A', to: 'B', label: '6 cm', label_dy: 18 },
          { from: 'A', to: 'C', label: '8 cm', label_dx: -20 },
          { from: 'B', to: 'C' },
        ],
        polygons: [{ points: ['A', 'B', 'C'], fill: 'primary', opacity: 0.08 }],
        circles: [],
        arcs: [],
        ellipses: [],
        paths: [],
        angles: [],
        right_angles: [{ at: 'A', from: 'B', to: 'C' }],
        labels: [],
        plots: [],
      },
    },
  ],
}, null, 2);

const isAdminEmail = (email?: string | null) => email === 'vietdang293.vn@gmail.com' || email === 'vietdang293@gmail.com';

function PreviewQuestion({ question, index }: { question: ImportedQuestion; index: number }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge className="bg-primary-soft text-primary hover:bg-primary-soft">Câu {index + 1}</Badge>
        <Badge variant="outline">{QUESTION_TYPE_LABELS[question.question_type ?? 'multiple_choice']}</Badge>
        {question.points !== undefined && <Badge variant="outline">Điểm chỉnh riêng: {formatPoints(question.points)}</Badge>}
        {question.diagram && <Badge variant="outline" className="border-primary/40 bg-primary-soft text-primary">Hình vẽ tự động</Badge>}
      </div>
      <div className="text-base font-semibold leading-7 text-foreground sm:text-lg"><MathRenderer content={question.content} /></div>
      <GeometryDiagram data={question.diagram} showValidationError />
      {question.question_type === 'true_false' ? <ol className="mt-5 space-y-3">{question.statements.map((statement, i) => <li key={i} className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3"><span className="font-semibold text-muted-foreground">{'abcd'[i]}.</span><div className="min-w-0 flex-1"><MathRenderer content={statement.content} /></div><Badge variant="outline" className={statement.correct_answer ? 'text-success' : 'text-destructive'}>{statement.correct_answer ? 'Đúng' : 'Sai'}</Badge></div>
        {statement.solution && <div className="mt-3 text-sm text-muted-foreground"><MathRenderer content={statement.solution} variant="solution" /></div>}
      </li>)}</ol> : question.question_type === 'short_answer' ? <div className="mt-5 rounded-lg border border-success/40 bg-success-soft p-4">
        <p className="mb-3 text-sm font-semibold text-success">Đáp án được chấp nhận</p>
        <ul className="flex flex-wrap gap-2">{question.accepted_answers.map((answer, i) => <li key={i} className="whitespace-pre-wrap break-words rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground">{answer}</li>)}</ul>
      </div> : <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {question.options.map((option, optionIndex) => {
          const isCorrect = optionIndex === question.correct_answer;
          return (
            <div key={`${option}-${optionIndex}`} className={`flex min-h-11 items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${isCorrect ? 'border-success/60 bg-success-soft text-success' : 'border-border bg-muted/40 text-foreground'}`}>
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card text-xs font-bold">{String.fromCharCode(65 + optionIndex)}</span>
              <div className="min-w-0 leading-6"><MathRenderer content={formatOptionMath(option)} /></div>
              {isCorrect && <CheckCircle2 aria-label="Đáp án đúng" className="ml-auto mt-0.5 h-4 w-4 shrink-0" />}
            </div>
          );
        })}
      </div>}
      {question.solution && <div className="mt-5 border-t border-border pt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Lời giải</p><div className="rounded-lg bg-muted/50 p-3 text-sm text-foreground"><MathRenderer content={question.solution} variant="solution" /></div></div>}
    </article>
  );
}

export default function JsonQuestionImportPage() {
  const router = useRouter();
  const { user, initialized, isLoading } = useAuthStore();
  const [target, setTarget] = useState<ImportTarget>('practice');
  const [sampleQuestionType, setSampleQuestionType] = useState<QuestionType>('multiple_choice');
  const effectiveType = target === 'mock_exam' ? sampleQuestionType : 'multiple_choice';
  const [lessons, setLessons] = useState<AdminLessonOption[]>([]);
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [examId, setExamId] = useState('');
  const [examGrade, setExamGrade] = useState('');
  const [examCategory, setExamCategory] = useState('');
  const [examTopicId, setExamTopicId] = useState('');
  const [level, setLevel] = useState('1');
  const [jsonText, setJsonText] = useState('');
  const [questions, setQuestions] = useState<ImportedQuestion[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [loadingDestinations, setLoadingDestinations] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [scoringPreview, setScoringPreview] = useState<ScoringDetails | null>(null);
  const previewGeneration = useRef(0);
  const [message, setMessage] = useState('');
  const [showGeometryExample, setShowGeometryExample] = useState(false);

  useEffect(() => {
    if (initialized && !isLoading && (!user || !isAdminEmail(user.email))) router.replace('/home');
  }, [initialized, isLoading, router, user]);

  useEffect(() => {
    if (!user || !isAdminEmail(user.email)) return;
    const loadDestinations = async () => {
      const supabase = getSupabaseClient();
      const [lessonsResult, examsResult, topicsResult] = await Promise.all([
        supabase.from('practice_lessons').select('*').order('grade').order('chapter').order('id'),
        supabase.from('mock_exams').select('id, grade, title, category, topic_id, scoring_mode, scoring_revision').order('created_at', { ascending: false }),
        supabase.from('mock_exam_topics').select('id, grade, name').order('grade').order('sort_order'),
      ]);
      if (lessonsResult.error) setErrors(['Không tải được danh sách bài tự luyện. Hãy kiểm tra Supabase.']);
      if (examsResult.error) setErrors((current) => [...current, 'Không tải được danh sách đề thi thử. Hãy kiểm tra Supabase.']);
      if (topicsResult.error) setErrors((current) => [...current, 'Không tải được danh sách chuyên đề thi thử. Hãy kiểm tra Supabase.']);
      setLessons((lessonsResult.data || []) as AdminLessonOption[]);
      setExams((examsResult.data || []) as ExamOption[]);
      setTopics((topicsResult.data || []) as TopicOption[]);
      setLoadingDestinations(false);
    };
    void loadDestinations();
  }, [user]);

  const destinationName = useMemo(() => {
    if (target === 'practice') {
      const lesson = lessons.find((item) => item.id === lessonId);
      return lesson ? `Lớp ${lesson.grade} · ${lesson.chapter} · ${lesson.title}` : 'bài tự luyện đã chọn';
    }
    const exam = exams.find((item) => item.id === examId);
    return exam ? `Lớp ${exam.grade} · ${exam.title}` : 'đề thi thử đã chọn';
  }, [examId, exams, lessonId, lessons, target]);

  const examGrades = useMemo(() => Array.from(new Set(exams.map((exam) => exam.grade))).sort((a, b) => a - b), [exams]);
  const examCategories = useMemo(() => MOCK_EXAM_CATEGORIES.filter((item) => exams.some((exam) => String(exam.grade) === examGrade && (exam.category || 'midterm_1') === item.id)), [examGrade, exams]);
  const examTopics = useMemo(() => topics.filter((topic) => String(topic.grade) === examGrade && exams.some((exam) => exam.topic_id === topic.id)), [examGrade, exams, topics]);
  const filteredExams = useMemo(() => exams.filter((exam) => String(exam.grade) === examGrade && (exam.category || 'midterm_1') === examCategory && (examCategory !== 'topic' || (exam.topic_id || '__ungrouped__') === examTopicId)), [examCategory, examGrade, examTopicId, exams]);

  const clearPreview = () => { previewGeneration.current++; setQuestions([]); setScoringPreview(null); setErrors([]); setMessage(''); };
  const selectedExam = exams.find((exam) => exam.id === examId);
  const isSectioned = target === 'mock_exam' && selectedExam?.scoring_mode === 'sectioned';

  const handlePreview = async () => {
    const generation = ++previewGeneration.current;
    const result = parseQuestionJson(jsonText, target);
    setQuestions(result.questions);
    setScoringPreview(null);
    setErrors(result.errors);
    setPreviewIndex(0);
    setMessage(result.errors.length ? '' : `Đã kiểm tra ${result.questions.length} câu hỏi. Hãy xem trước rồi duyệt nhập.`);
    if (result.errors.length) return;
    if (target === 'mock_exam' && !isSectioned && result.questions.some((q) => q.question_type === 'true_false' || q.points !== undefined)) {
      setErrors(['Đề này đang chấm điểm theo kiểu cũ. Mở “Điểm & cấu trúc” trong Quản lý Thi thử và chuyển sang chia điểm theo phần trước khi nhập đúng/sai hoặc điểm chỉnh riêng.']); return;
    }
    if (!isSectioned) return;
    setPreviewing(true);
    try {
      const current = await getMockExamScoring(examId);
      const preview = await previewMockExamImport(examId, result.questions, current.revision);
      if (generation !== previewGeneration.current) return;
      setScoringPreview(preview);
      setMessage(`Đã kiểm tra ${result.questions.length} câu mới. Bảng dưới cho biết điểm của toàn bộ đề sau khi nhập.`);
    } catch (error) {
      if (generation === previewGeneration.current) { setErrors([error instanceof Error ? error.message : 'Không xem trước được điểm. Hãy thử lại.']); setMessage(''); }
    } finally { setPreviewing(false); }
  };

  const handleCopyPrompt = async () => {
    const prompt = buildAiPrompt(target, destinationName, target === 'practice' ? level : undefined, effectiveType);
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage('Đã sao chép prompt. Hãy gửi prompt cho AI rồi dán JSON nhận được vào đây.');
    } catch {
      setMessage('Không thể tự sao chép. Bạn có thể xem prompt trong bảng hướng dẫn bên dưới.');
    }
  };

  const handleCopyGeometryExample = async () => {
    try {
      await navigator.clipboard.writeText(GEOMETRY_JSON_EXAMPLE);
      setMessage('Đã sao chép mẫu JSON hình học. Bạn có thể gửi nguyên mẫu này cho AI để AI làm theo.');
    } catch {
      setMessage('Không thể tự sao chép. Bạn có thể bôi đen và sao chép mẫu JSON bên dưới.');
    }
  };

  const handleCopyQuestionSample = async () => {
    try {
      await navigator.clipboard.writeText(buildQuestionJsonSample(target, effectiveType));
      setMessage('Đã sao chép mẫu câu hỏi. Dán JSON vào bên dưới để xem trước.');
    } catch { setMessage('Không thể tự sao chép. Mẫu có trong ô gợi ý JSON bên dưới.'); }
  };

  const handleImport = async () => {
    if (target === 'practice' && !lessonId) {
      setErrors(['Hãy chọn bài tự luyện trước khi nhập.']);
      return;
    }
    if (target === 'mock_exam' && !examId) {
      setErrors(['Hãy chọn đề thi thử trước khi nhập.']);
      return;
    }
    const result = parseQuestionJson(jsonText, target);
    setQuestions(result.questions);
    setErrors(result.errors);
    if (result.errors.length || result.questions.length === 0) return;
    if (target === 'mock_exam' && !isSectioned && result.questions.some((q) => q.question_type === 'true_false' || q.points !== undefined)) {
      setErrors(['Hãy chuyển đề sang chia điểm theo phần tại Quản lý Thi thử trước khi nhập dạng này.']); return;
    }
    if (isSectioned && !scoringPreview) { setErrors(['Hãy kiểm tra và xem trước điểm của bản JSON hiện tại trước khi nhập.']); return; }
    if (!window.confirm(`Xác nhận nhập ${result.questions.length} câu vào ${destinationName}? Các câu sẽ được thêm sau những câu đã có.`)) return;

    setSaving(true);
    setMessage('Đang lưu toàn bộ câu hỏi...');
    try {
    const imported = isSectioned ? await importMockExamQuestions(examId, result.questions, scoringPreview!.revision) : null;
    const { data, error } = isSectioned ? { data: imported?.count ?? result.questions.length, error: null } : await getSupabaseClient().rpc('import_questions_json', {
      p_target: target,
      p_lesson_id: target === 'practice' ? lessonId : null,
      p_exam_id: target === 'mock_exam' ? examId : null,
      p_level: target === 'practice' ? Number(level) : null,
      p_questions: result.questions,
    });

    if (error) {
      setErrors([`Không thể nhập đề: ${error.message}. ${result.questions.some((q) => q.question_type === 'short_answer') ? 'Nếu chưa nâng cấp, ADMIN cần chạy mock-exam-short-answer.sql trước.' : 'Hãy chắc rằng bạn đã chạy tệp SQL của tính năng Nhập đề JSON.'}`]);
      setMessage('');
    } else {
      setErrors([]);
      setMessage(`Đã nhập thành công ${data ?? result.questions.length} câu vào ${destinationName}.`);
      setJsonText('');
      setQuestions([]);
      setScoringPreview(null);
      setPreviewIndex(0);
    }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Không nhập được câu hỏi. Bản JSON vẫn được giữ để kiểm tra lại.']);
      setScoringPreview(null); setMessage('');
    } finally { setSaving(false); }
  };

  if (!initialized || isLoading || loadingDestinations) return <div className="py-20 text-center animate-pulse">Đang chuẩn bị trình nhập đề...</div>;
  if (!user || !isAdminEmail(user.email)) return null;

  const currentPreview = questions[previewIndex];
  const canPreview = target === 'practice' ? Boolean(lessonId) : Boolean(examId);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-xl border-border">
        <CardHeader className="border-b border-border bg-muted/50">
          <CardTitle as="h2" className="flex items-center gap-2 text-lg"><UploadCloud className="h-5 w-5 text-primary" />Nhập câu hỏi</CardTitle>
          <CardDescription>Dán JSON AI tạo, kiểm tra cách hiển thị công thức rồi duyệt để lưu hàng loạt vào đúng nơi đã chọn.</CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6"><fieldset disabled={saving || previewing} className="min-w-0 space-y-6">
          <section data-admin-step aria-labelledby="import-destination-heading">
          <h3 id="import-destination-heading" className="admin-step-heading font-semibold"><span className="admin-step-number" aria-hidden="true">1</span>Nơi lưu câu hỏi</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="content-target">Loại nội dung</Label><Select value={target} onValueChange={(value) => { setTarget(value as ImportTarget); clearPreview(); }}><SelectTrigger id="content-target" className="h-11 bg-surface"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="practice">Tự luyện</SelectItem><SelectItem value="mock_exam">Thi thử</SelectItem></SelectContent></Select></div>
            {target === 'practice' ? <div className="space-y-4 lg:col-span-2"><p className="text-sm font-semibold text-foreground">Chọn Lớp → Chương → Bài tự luyện</p><AdminLessonPicker lessons={lessons} value={lessonId} onChange={(id) => { setLessonId(id); clearPreview(); }} idPrefix="import-practice" /><div className="max-w-sm space-y-2"><Label htmlFor="practice-level">Level câu hỏi</Label><Select value={level} onValueChange={(next) => { setLevel(next); clearPreview(); }}><SelectTrigger id="practice-level" className="h-11 bg-surface"><SelectValue /></SelectTrigger><SelectContent>{[['1', 'Level 1 · Nhận biết'], ['2', 'Level 2 · Thông hiểu'], ['3', 'Level 3 · Vận dụng'], ['4', 'Level 4 · Vận dụng cao']].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div> : <div className="space-y-4 lg:col-span-2"><p className="text-sm font-semibold text-foreground">Chọn Lớp → Danh mục → Đề thi</p><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div className="space-y-2"><Label htmlFor="exam-grade">Lớp</Label><Select value={examGrade} onValueChange={(next) => { setExamGrade(next); setExamCategory(''); setExamTopicId(''); setExamId(''); clearPreview(); }}><SelectTrigger id="exam-grade" className="h-11 bg-surface"><SelectValue placeholder="Chọn lớp" /></SelectTrigger><SelectContent>{examGrades.map((item) => <SelectItem key={item} value={String(item)}>Lớp {item}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="exam-category">Danh mục</Label><Select value={examCategory} onValueChange={(next) => { setExamCategory(next); setExamTopicId(''); setExamId(''); clearPreview(); }} disabled={!examGrade}><SelectTrigger id="exam-category" className="h-11 bg-surface"><SelectValue placeholder="Chọn danh mục" /></SelectTrigger><SelectContent>{examCategories.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>{examCategory === 'topic' && <div className="space-y-2"><Label htmlFor="exam-topic">Chương / chuyên đề</Label><Select value={examTopicId} onValueChange={(next) => { setExamTopicId(next); setExamId(''); clearPreview(); }}><SelectTrigger id="exam-topic" className="h-11 bg-surface"><SelectValue placeholder="Chọn chuyên đề" /></SelectTrigger><SelectContent>{examTopics.map((topic) => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}{exams.some((exam) => String(exam.grade) === examGrade && exam.category === 'topic' && !exam.topic_id) && <SelectItem value="__ungrouped__">Chưa gắn chuyên đề</SelectItem>}</SelectContent></Select></div>}<div className="space-y-2"><Label htmlFor="exam-target">Đề thi</Label><Select value={examId} onValueChange={(next) => { setExamId(next); clearPreview(); }} disabled={!examCategory || (examCategory === 'topic' && !examTopicId)}><SelectTrigger id="exam-target" className="h-11 bg-surface"><SelectValue placeholder="Chọn đề để thêm câu hỏi" /></SelectTrigger><SelectContent>{filteredExams.map((exam) => <SelectItem key={exam.id} value={exam.id}>{exam.title}</SelectItem>)}</SelectContent></Select></div></div></div>}
          </div>

          </section>
          <section data-admin-step aria-labelledby="import-input-heading" className="space-y-4 border-t border-border pt-6">
          <h3 id="import-input-heading" className="admin-step-heading font-semibold"><span className="admin-step-number" aria-hidden="true">2</span>Nội dung JSON</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {target === 'mock_exam' && <div className="max-w-sm flex-1 space-y-2"><Label htmlFor="sample-question-type">Loại câu cho mẫu / prompt</Label><Select value={sampleQuestionType} onValueChange={(value) => setSampleQuestionType(value as QuestionType)}><SelectTrigger id="sample-question-type" className="h-11 bg-surface"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="multiple_choice">Trắc nghiệm</SelectItem><SelectItem value="true_false">Đúng / Sai</SelectItem><SelectItem value="short_answer">Trả lời ngắn</SelectItem></SelectContent></Select></div>}
            <Button type="button" variant="outline" onClick={handleCopyQuestionSample} className="h-11"><Clipboard className="mr-2 h-4 w-4" />Sao chép mẫu câu hỏi</Button>
          </div>
          {target === 'mock_exam' && <div className="space-y-2 text-sm leading-6 text-muted-foreground"><p>Một đề có thể trộn ABCD, đúng/sai và trả lời ngắn. Câu đúng/sai có đúng 4 ý; đúng 1 / 2 / 3 / 4 ý được 10% / 25% / 50% / 100% điểm tối đa của câu.</p><p>Điểm được tự chia theo tổng điểm phần trong <a href="/admin/mock-exams" className="font-semibold text-primary underline underline-offset-4">Điểm &amp; cấu trúc</a>. Thêm <code>points: 0.25</code> nếu muốn khóa điểm riêng; các câu còn lại tự chia phần điểm còn lại. Với <code>accepted_answers</code>, liệt kê các cách viết được chấp nhận, ví dụ <code>{'["0,5", "0.5", "1/2"]'}</code>; không tự quy đổi biểu thức. Bộ chọn trên chỉ đổi mẫu.</p></div>}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-bold text-foreground">Tạo JSON với AI theo mẫu FlyDo</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Hệ thống tự gắn bài/đề và Level bạn đã chọn; AI không cần tạo ID hay mã đề.</p></div></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => setShowGeometryExample((visible) => !visible)} className="h-11 shrink-0 border-primary text-primary hover:bg-primary-soft" aria-expanded={showGeometryExample} aria-controls="geometry-json-example"><Shapes className="mr-2 h-4 w-4" />Mẫu JSON hình học{showGeometryExample ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}</Button>
                <Button type="button" variant="outline" onClick={handleCopyPrompt} disabled={!canPreview} className="h-11 shrink-0 border-primary text-primary hover:bg-primary-soft"><Clipboard className="mr-2 h-4 w-4" />Sao chép prompt</Button>
              </div>
            </div>
            {showGeometryExample && <section id="geometry-json-example" className="mt-4 border-t border-primary/20 pt-4" aria-labelledby="geometry-example-heading">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><h3 id="geometry-example-heading" className="font-bold text-foreground">Mẫu câu hỏi có hình học</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Sao chép mẫu này cùng prompt rồi yêu cầu AI giữ nguyên cấu trúc <code>diagram</code>, chỉ thay nội dung và dữ kiện hình. Mẫu có thể dán trực tiếp để kiểm tra.</p></div>
                <Button type="button" variant="outline" onClick={handleCopyGeometryExample} className="h-11 shrink-0 border-primary text-primary hover:bg-primary-soft"><Clipboard className="mr-2 h-4 w-4" />Sao chép mẫu</Button>
              </div>
              <pre className="mt-4 overflow-hidden rounded-xl border border-border bg-surface p-3 text-left text-xs leading-5 text-foreground whitespace-pre-wrap break-words sm:p-4"><code>{GEOMETRY_JSON_EXAMPLE}</code></pre>
            </section>}
          </div>

          <div className="space-y-2"><Label htmlFor="question-json">Dán JSON câu hỏi</Label><Textarea id="question-json" value={jsonText} onChange={(event) => { setJsonText(event.target.value); clearPreview(); }} placeholder={buildQuestionJsonSample(target, effectiveType)} className="min-h-72 resize-y bg-surface font-mono text-sm leading-6" spellCheck={false} /></div>
          <div className="flex flex-col gap-3 sm:flex-row"><Button type="button" onClick={handlePreview} disabled={!canPreview || previewing || saving} className="h-11 bg-primary text-primary-foreground"><Code2 className="mr-2 h-4 w-4" />Kiểm tra và xem trước</Button><Button type="button" variant="outline" onClick={() => { setJsonText(''); clearPreview(); }} disabled={!jsonText && !questions.length} className="h-11">Xóa bản nháp</Button></div>
          </section>
        </fieldset>
        </CardContent>
      </Card>

      {(message || errors.length > 0) && <div role={errors.length ? 'alert' : 'status'} aria-live="polite" className={`rounded-xl border p-4 ${errors.length ? 'border-destructive/50 bg-destructive-soft text-destructive' : 'border-success/50 bg-success-soft text-success'}`}><div className="flex gap-3">{errors.length ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}<div><p className="font-bold">{errors.length ? 'Cần sửa trước khi nhập' : 'Sẵn sàng'}</p>{errors.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">{errors.map((error) => <li key={error}>{error}</li>)}</ul> : <p className="mt-1 text-sm leading-6">{message}</p>}</div></div></div>}

      <section data-admin-step aria-labelledby="import-review-heading">
        <h2 id="import-review-heading" className="admin-step-heading text-lg font-semibold"><span className="admin-step-number" aria-hidden="true">3</span>Kiểm tra và duyệt</h2>
        {previewing && <p role="status" className="mb-4 text-sm text-muted-foreground">Đang kiểm tra điểm trên máy chủ…</p>}
        {scoringPreview && <div data-import-scoring-preview className="mb-5 rounded-xl border border-border bg-card p-4 sm:p-5"><h3 className="font-semibold">Điểm sau khi nhập</h3><p className="mt-1 text-sm text-muted-foreground">Gồm cả câu đã có và câu mới. Chỉ xem trước, chưa lưu dữ liệu.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{(['multiple_choice','true_false','short_answer'] as const).map((type) => <div key={type} className="rounded-lg border border-border p-3"><p className="text-sm text-muted-foreground">{QUESTION_TYPE_LABELS[type]}</p><p className="mt-1 font-semibold">{formatPoints(scoringPreview.exam.section_points[type])} điểm <span className="font-normal text-muted-foreground">· {scoringPreview.questions.filter((q) => q.question_type === type).length} câu</span></p></div>)}</div>
          <ol className="mt-4 max-h-72 space-y-2 overflow-y-auto">{scoringPreview.questions.map((q,i) => <li key={q.id} className="flex items-start gap-3 border-b border-border py-2 text-sm"><span className="shrink-0 text-muted-foreground">{i+1}.</span><div className="min-w-0 flex-1"><MathRenderer content={q.content} />{i >= scoringPreview.questions.length - questions.length && <span className="text-xs text-primary">Câu mới</span>}</div><span className="shrink-0 text-right font-semibold">{q.max_points == null ? 'Chưa chia' : `${formatPoints(q.max_points)} đ`}<span className="block text-xs font-normal text-muted-foreground">{q.points_override == null ? 'Tự động' : 'Chỉnh riêng'}</span></span></li>)}</ol>
          {scoringPreview.errors.length > 0 && <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm"><p className="font-semibold">Đề vẫn là bản nháp sau khi nhập</p><ul className="mt-2 list-disc pl-5">{scoringPreview.errors.map((e) => <li key={e}>{e}</li>)}</ul><p className="mt-2">Bạn có thể nhập nội dung trước, rồi hoàn thiện điểm trong Quản lý Thi thử.</p></div>}
        </div>}
        {!currentPreview && <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">Chọn nơi lưu, dán JSON rồi bấm “Kiểm tra và xem trước”. Câu hỏi chỉ được lưu sau khi bạn duyệt nhập.</p>}
      {currentPreview && <Card className="rounded-xl border-border">
        <CardHeader className="flex flex-col gap-4 border-b border-border sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Xem trước nội dung</CardTitle><CardDescription className="mt-1">Đáp án đúng hiển thị màu xanh chỉ để Admin kiểm tra, học sinh sẽ không thấy trạng thái này.</CardDescription></div><Badge variant="outline" className="w-fit border-primary bg-primary-soft px-3 py-1 text-primary">{questions.length} câu hợp lệ</Badge></CardHeader>
        <CardContent className="p-5 sm:p-6"><div className="mb-4 flex flex-wrap gap-2">{questions.map((_, index) => <Button key={index} type="button" variant={index === previewIndex ? 'default' : 'outline'} onClick={() => setPreviewIndex(index)} className="h-11 min-w-11 px-3" aria-label={`Xem trước câu ${index + 1}`}>{index + 1}</Button>)}</div>
          <PreviewQuestion question={currentPreview} index={previewIndex} />
          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Đề sẽ được thêm sau các câu đã có tại <span className="font-semibold text-foreground">{destinationName}</span>.</p><Button type="button" onClick={handleImport} disabled={saving || previewing || errors.length > 0 || (isSectioned && !scoringPreview)} className="h-11 bg-primary px-6 font-bold text-primary-foreground">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Đang nhập...</> : <><UploadCloud className="mr-2 h-4 w-4" />Duyệt và nhập {questions.length} câu</>}</Button></div>
        </CardContent>
      </Card>}
      </section>

      <Card className="rounded-2xl border-border bg-muted/30"><CardContent className="flex gap-3 p-5 text-sm leading-6 text-muted-foreground"><GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>Chấp nhận JSON là mảng <code>[…]</code> hoặc dạng <code>{'{ "questions": […] }'}</code>. Đáp án đúng có thể là <code>0–3</code>, <code>A–D</code> hoặc nguyên văn phương án. Với công thức, dùng <code>$…$</code> cho công thức trong dòng và <code>$$…$$</code> cho công thức riêng dòng.</p></CardContent></Card>
    </div>
  );
}
