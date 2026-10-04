'use client';

import { useState, useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { AdminCreatePanel } from '@/components/admin/create-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Trash2, Database, AlertCircle, ChevronDown, ChevronRight, BookOpen, Pencil, GripVertical, ListX, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type SortDragItem = {
  kind: 'lesson' | 'chapter';
  id: string;
  grade: number;
  chapter?: string;
};

const PRACTICE_LEVELS = [
  { value: 1, label: 'Level 1 - Nhận biết' },
  { value: 2, label: 'Level 2 - Thông hiểu' },
  { value: 3, label: 'Level 3 - Vận dụng' },
  { value: 4, label: 'Level 4 - Vận dụng cao' },
] as const;

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoading, initialized } = useAuthStore();
  const [lessons, setLessons] = useState<any[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, Record<number, number>>>({});
  const [dbError, setDbError] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Form states
  const [grade, setGrade] = useState('8');
  const [chapter, setChapter] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [isNewChapter, setIsNewChapter] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<any | null>(null);
  const [editLessonChapter, setEditLessonChapter] = useState('');
  const [editLessonTitle, setEditLessonTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingChapter, setEditingChapter] = useState<{ grade: number; name: string } | null>(null);
  const [editChapterName, setEditChapterName] = useState('');
  const [savingChapter, setSavingChapter] = useState(false);
  const [reorderingLessonId, setReorderingLessonId] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<SortDragItem | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [sortStatus, setSortStatus] = useState('');
  const [managingLesson, setManagingLesson] = useState<any | null>(null);
  const [pendingLevelDelete, setPendingLevelDelete] = useState<number | null>(null);
  const [deletingLevel, setDeletingLevel] = useState<number | null>(null);
  const [levelDeleteStatus, setLevelDeleteStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const pointerDragRef = useRef<SortDragItem | null>(null);

  const sortLessons = (items: any[]) => [...items].sort((a, b) => {
    const orderA = typeof a.sort_order === 'number' ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.sort_order === 'number' ? b.sort_order : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) return orderA - orderB;
    return (a.title || '').localeCompare(b.title || '', 'vi', { numeric: true, sensitivity: 'base' });
  });

  const sortChapters = (items: [string, any[]][]) => [...items].sort(([titleA, lessonsA], [titleB, lessonsB]) => {
    const orderA = typeof lessonsA[0]?.chapter_sort_order === 'number'
      ? lessonsA[0].chapter_sort_order
      : Number.MAX_SAFE_INTEGER;
    const orderB = typeof lessonsB[0]?.chapter_sort_order === 'number'
      ? lessonsB[0].chapter_sort_order
      : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) return orderA - orderB;
    return titleA.localeCompare(titleB, 'vi', { numeric: true, sensitivity: 'base' });
  });

  const createInternalLessonId = (gradeNumber: string) => {
    const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12).toLowerCase()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.toLowerCase();
    return `lesson-${gradeNumber}-${randomPart}`;
  };

  const existingChaptersForGrade = Array.from(new Set(
    lessons.filter(l => l.grade.toString() === grade.toString()).map(l => (l.chapter || '').trim())
  ));

  useEffect(() => {
    if (initialized && !isLoading) {
      if (!user || (user.email !== 'vietdang293.vn@gmail.com' && user.email !== 'vietdang293@gmail.com')) {
        router.replace('/home');
      }
    }
  }, [user, isLoading, initialized, router]);

  useEffect(() => {
    async function fetchLessons() {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('practice_lessons').select('*').order('grade').order('chapter').order('id');

      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          setDbError(true);
        } else {
          console.error('Error fetching lessons:', error);
        }
      } else if (data) {
        setLessons(data);
      }

      const nextCounts: Record<string, Record<number, number>> = {};
      const pageSize = 1000;
      let offset = 0;
      let questionFetchFailed = false;

      while (!questionFetchFailed) {
        const { data: questionRows, error: questionError } = await supabase
          .from('practice_questions')
          .select('id, lesson_id, difficulty_level')
          .order('lesson_id')
          .order('difficulty_level')
          .order('id')
          .range(offset, offset + pageSize - 1);

        if (questionError) {
          console.error('Error fetching practice question counts:', questionError);
          questionFetchFailed = true;
          break;
        }

        (questionRows || []).forEach((question: { lesson_id: string; difficulty_level?: number }) => {
          const level = question.difficulty_level || 1;
          if (!nextCounts[question.lesson_id]) nextCounts[question.lesson_id] = {};
          nextCounts[question.lesson_id][level] = (nextCounts[question.lesson_id][level] || 0) + 1;
        });

        if (!questionRows || questionRows.length < pageSize) break;
        offset += pageSize;
      }

      if (!questionFetchFailed) setQuestionCounts(nextCounts);
      setFetching(false);
    }

    if (user && (user.email === 'vietdang293.vn@gmail.com' || user.email === 'vietdang293@gmail.com')) {
      fetchLessons();
    }
  }, [user]);

  const handleAddLesson = async () => {
    if (!grade || !chapter || !title) {
      alert('Vui lòng điền đầy đủ thông tin');
      return;
    }

    setSaving(true);
    const supabase = getSupabaseClient();
    const nextSortOrder = lessons
      .filter((lesson) => lesson.grade === parseInt(grade) && (lesson.chapter || '').trim() === chapter.trim())
      .reduce((max, lesson) => Math.max(max, typeof lesson.sort_order === 'number' ? lesson.sort_order : 0), 0) + 1;
    const lessonsInChapter = lessons.filter((lesson) => lesson.grade === parseInt(grade) && (lesson.chapter || '').trim() === chapter.trim());
    const existingChapterSortOrder = lessonsInChapter.find((lesson) => typeof lesson.chapter_sort_order === 'number')?.chapter_sort_order;
    const nextChapterSortOrder = existingChapterSortOrder ?? (lessons
      .filter((lesson) => lesson.grade === parseInt(grade))
      .reduce((max, lesson) => Math.max(max, typeof lesson.chapter_sort_order === 'number' ? lesson.chapter_sort_order : 0), 0) + 1);
    const { error } = await supabase.from('practice_lessons').insert([
      {
        id: createInternalLessonId(grade),
        grade: parseInt(grade),
        chapter: chapter.trim(),
        title: title.trim(),
        sort_order: nextSortOrder,
        chapter_sort_order: nextChapterSortOrder,
      }
    ]);

    if (error) {
      alert(error.message.includes('sort_order') || error.message.includes('chapter_sort_order')
        ? 'Bạn cần chạy SQL “Sắp xếp bài tự luyện” trước khi thêm bài mới.'
        : 'Lỗi: ' + error.message);
    } else {
      alert('Thêm chuyên đề thành công!');
      // Refresh list
      const { data } = await supabase.from('practice_lessons').select('*').order('grade').order('chapter').order('id');
      if (data) setLessons(data);

      // Reset form
      setChapter('');
      setTitle('');
    }
    setSaving(false);
  };

  const handleDelete = async (lessonId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa chuyên đề này VÀ TẤT CẢ câu hỏi, tiến độ liên quan?')) return;

    const supabase = getSupabaseClient();

    // Xóa dữ liệu liên quan trước (để tránh rác trong DB nếu không có ON DELETE CASCADE)
    await supabase.from('practice_questions').delete().eq('lesson_id', lessonId);
    await supabase.from('practice_progress').delete().eq('lesson_id', lessonId);
    await supabase.from('saved_questions').delete().eq('lesson_id', lessonId);

    // Sau đó xóa chuyên đề
    const { error } = await supabase.from('practice_lessons').delete().eq('id', lessonId);

    if (error) {
      alert('Lỗi: ' + error.message);
    } else {
      setLessons(prev => prev.filter(l => l.id !== lessonId));
      setQuestionCounts((current) => {
        const next = { ...current };
        delete next[lessonId];
        return next;
      });
      if (managingLesson?.id === lessonId) setManagingLesson(null);
    }
  };

  const openLevelManager = (lesson: any) => {
    setManagingLesson(lesson);
    setPendingLevelDelete(null);
    setLevelDeleteStatus(null);
  };

  const handleDeleteLevel = async () => {
    if (!managingLesson || pendingLevelDelete === null) return;

    const lessonId = managingLesson.id as string;
    const level = pendingLevelDelete;
    setDeletingLevel(level);
    setLevelDeleteStatus(null);

    const { data, error } = await getSupabaseClient().rpc('delete_practice_level', {
      p_lesson_id: lessonId,
      p_level: level,
    });

    if (error) {
      setLevelDeleteStatus({
        type: 'error',
        text: error.message.includes('delete_practice_level')
          ? 'Chưa có hàm xóa theo Level. Hãy chạy tệp SQL “practice-level-management.sql” trong Supabase.'
          : 'Không thể xóa câu hỏi: ' + error.message,
      });
    } else {
      const deletedCount = Number(data ?? questionCounts[lessonId]?.[level] ?? 0);
      setQuestionCounts((current) => ({
        ...current,
        [lessonId]: { ...current[lessonId], [level]: 0 },
      }));
      setLevelDeleteStatus({
        type: 'success',
        text: `Đã xóa ${deletedCount} câu hỏi của Level ${level}. Các Level khác được giữ nguyên.`,
      });
    }

    setDeletingLevel(null);
    setPendingLevelDelete(null);
  };

  const openEditLesson = (lesson: any) => {
    setEditingLesson(lesson);
    setEditLessonChapter(lesson.chapter || '');
    setEditLessonTitle(lesson.title || '');
  };

  const handleSaveLesson = async () => {
    if (!editingLesson || !editLessonChapter.trim() || !editLessonTitle.trim()) {
      alert('Vui lòng điền đầy đủ tên chương và tên bài.');
      return;
    }

    setSavingEdit(true);
    const supabase = getSupabaseClient();
    const nextChapter = editLessonChapter.trim();
    const nextTitle = editLessonTitle.trim();
    const isChangingChapter = nextChapter !== (editingLesson.chapter || '').trim();
    const chapterPeers = lessons.filter((lesson) => lesson.grade === editingLesson.grade
      && lesson.id !== editingLesson.id
      && (lesson.chapter || '').trim() === nextChapter);
    const existingChapterSortOrder = chapterPeers.find((lesson) => typeof lesson.chapter_sort_order === 'number')?.chapter_sort_order;
    const nextChapterSortOrder = isChangingChapter
      ? existingChapterSortOrder ?? (lessons
        .filter((lesson) => lesson.grade === editingLesson.grade)
        .reduce((max, lesson) => Math.max(max, typeof lesson.chapter_sort_order === 'number' ? lesson.chapter_sort_order : 0), 0) + 1)
      : editingLesson.chapter_sort_order;
    const nextLessonSortOrder = isChangingChapter
      ? chapterPeers.reduce((max, lesson) => Math.max(max, typeof lesson.sort_order === 'number' ? lesson.sort_order : 0), 0) + 1
      : editingLesson.sort_order;
    const { error } = await supabase
      .from('practice_lessons')
      .update({
        chapter: nextChapter,
        title: nextTitle,
        sort_order: nextLessonSortOrder,
        chapter_sort_order: nextChapterSortOrder,
      })
      .eq('id', editingLesson.id);

    if (error) {
      alert('Không thể lưu thay đổi: ' + error.message);
    } else {
      setLessons((current) => current.map((lesson) => lesson.id === editingLesson.id
        ? {
          ...lesson,
          chapter: nextChapter,
          title: nextTitle,
          sort_order: nextLessonSortOrder,
          chapter_sort_order: nextChapterSortOrder,
        }
        : lesson
      ));
      setEditingLesson(null);
    }
    setSavingEdit(false);
  };

  const openEditChapter = (gradeNum: number, chapterName: string) => {
    setEditingChapter({ grade: gradeNum, name: chapterName });
    setEditChapterName(chapterName);
  };

  const handleSaveChapter = async () => {
    if (!editingChapter || !editChapterName.trim()) {
      alert('Vui lòng nhập tên chương.');
      return;
    }

    const nextChapter = editChapterName.trim();
    setSavingChapter(true);
    const { error } = await getSupabaseClient()
      .from('practice_lessons')
      .update({ chapter: nextChapter })
      .eq('grade', editingChapter.grade)
      .eq('chapter', editingChapter.name);

    if (error) {
      alert('Không thể đổi tên chương: ' + error.message);
    } else {
      setLessons((current) => current.map((lesson) => lesson.grade === editingChapter.grade && lesson.chapter === editingChapter.name
        ? { ...lesson, chapter: nextChapter }
        : lesson
      ));
      setEditingChapter(null);
    }
    setSavingChapter(false);
  };

  const handleMoveLesson = async (lesson: any, targetLesson: any) => {
    if (!('sort_order' in lesson) || !('sort_order' in targetLesson)) {
      alert('Bạn cần chạy lại SQL “Sắp xếp bài tự luyện” trong Supabase trước khi dùng tính năng này.');
      return;
    }

    setReorderingLessonId(lesson.id);
    const { error } = await getSupabaseClient().rpc('reorder_practice_lesson', {
      p_lesson_id: lesson.id,
      p_target_lesson_id: targetLesson.id,
    });

    if (error) {
      alert(error.message.includes('reorder_practice_lesson')
        ? 'Bạn cần chạy lại SQL “Sắp xếp bài tự luyện” trong Supabase trước khi dùng tính năng này.'
        : 'Không thể đổi vị trí bài học: ' + error.message);
    } else {
      setLessons((current) => current.map((item) => {
        if (item.id === lesson.id) return { ...item, sort_order: targetLesson.sort_order };
        if (item.grade !== lesson.grade || (item.chapter || '').trim() !== (lesson.chapter || '').trim()) return item;
        if (lesson.sort_order < targetLesson.sort_order
          && item.sort_order > lesson.sort_order
          && item.sort_order <= targetLesson.sort_order) {
          return { ...item, sort_order: item.sort_order - 1 };
        }
        if (lesson.sort_order > targetLesson.sort_order
          && item.sort_order >= targetLesson.sort_order
          && item.sort_order < lesson.sort_order) {
          return { ...item, sort_order: item.sort_order + 1 };
        }
        return item;
      }));
      setSortStatus('Đã đổi vị trí bài ' + lesson.title + '.');
    }
    setReorderingLessonId(null);
  };

  const handleMoveChapter = async (gradeNum: number, chapterName: string, targetChapterName: string) => {
    const sourceLesson = lessons.find((lesson) => lesson.grade === gradeNum && (lesson.chapter || '').trim() === chapterName);
    const targetLesson = lessons.find((lesson) => lesson.grade === gradeNum && (lesson.chapter || '').trim() === targetChapterName);
    if (!sourceLesson || !targetLesson || !('chapter_sort_order' in sourceLesson) || !('chapter_sort_order' in targetLesson)) {
      alert('Bạn cần chạy lại SQL “Sắp xếp bài tự luyện” trong Supabase trước khi dùng tính năng này.');
      return;
    }

    setReorderingLessonId('chapter-' + gradeNum + '-' + chapterName);
    const { error } = await getSupabaseClient().rpc('reorder_practice_chapter', {
      p_grade: gradeNum,
      p_chapter: chapterName,
      p_target_chapter: targetChapterName,
    });

    if (error) {
      alert(error.message.includes('reorder_practice_chapter')
        ? 'Bạn cần chạy lại SQL “Sắp xếp bài tự luyện” trong Supabase trước khi dùng tính năng này.'
        : 'Không thể đổi vị trí chương: ' + error.message);
    } else {
      setLessons((current) => current.map((lesson) => {
        if (lesson.grade !== gradeNum) return lesson;
        if ((lesson.chapter || '').trim() === chapterName) {
          return { ...lesson, chapter_sort_order: targetLesson.chapter_sort_order };
        }
        if (sourceLesson.chapter_sort_order < targetLesson.chapter_sort_order
          && lesson.chapter_sort_order > sourceLesson.chapter_sort_order
          && lesson.chapter_sort_order <= targetLesson.chapter_sort_order) {
          return { ...lesson, chapter_sort_order: lesson.chapter_sort_order - 1 };
        }
        if (sourceLesson.chapter_sort_order > targetLesson.chapter_sort_order
          && lesson.chapter_sort_order >= targetLesson.chapter_sort_order
          && lesson.chapter_sort_order < sourceLesson.chapter_sort_order) {
          return { ...lesson, chapter_sort_order: lesson.chapter_sort_order + 1 };
        }
        return lesson;
      }));
      setSortStatus('Đã đổi vị trí chương ' + chapterName + '.');
    }
    setReorderingLessonId(null);
  };

  const findDropTarget = (event: PointerEvent<HTMLButtonElement>, item: SortDragItem) => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const selector = '[data-sort-kind="' + item.kind + '"][data-sort-grade="' + item.grade + '"]';
    const target = element?.closest<HTMLElement>(selector);
    const id = target?.dataset.sortId;
    if (item.kind === 'lesson' && target?.dataset.sortChapter !== item.chapter) return null;
    return id && id !== item.id ? id : null;
  };

  const handleSortPointerDown = (event: PointerEvent<HTMLButtonElement>, item: SortDragItem) => {
    if (reorderingLessonId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDragRef.current = item;
    setDraggingItem(item);
    setDragOverId(null);
  };

  const handleSortPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const item = pointerDragRef.current;
    if (!item) return;
    setDragOverId(findDropTarget(event, item));
  };

  const handleSortPointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const item = pointerDragRef.current;
    const targetId = item ? findDropTarget(event, item) : null;
    pointerDragRef.current = null;
    setDraggingItem(null);
    setDragOverId(null);

    if (!item || !targetId) return;
    if (item.kind === 'lesson') {
      const targetLesson = lessons.find((lesson) => lesson.id === targetId);
      const lesson = lessons.find((currentLesson) => currentLesson.id === item.id);
      if (lesson && targetLesson) void handleMoveLesson(lesson, targetLesson);
      return;
    }

    void handleMoveChapter(item.grade, item.id, targetId);
  };

  const handleSortKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    item: SortDragItem,
    siblingIds: string[],
  ) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const currentIndex = siblingIds.indexOf(item.id);
    const targetIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblingIds.length) return;

    event.preventDefault();
    if (item.kind === 'lesson') {
      const lesson = lessons.find((currentLesson) => currentLesson.id === item.id);
      const targetLesson = lessons.find((currentLesson) => currentLesson.id === siblingIds[targetIndex]);
      if (lesson && targetLesson) void handleMoveLesson(lesson, targetLesson);
      return;
    }
    void handleMoveChapter(item.grade, item.id, siblingIds[targetIndex]);
  };

  const groupedLessons = useMemo(() => {
    const grades = new Map<number, Map<string, any[]>>();
    lessons.forEach(l => {
      const g = l.grade;
      const c = (l.chapter || 'Chuyên đề khác').trim();
      if (!grades.has(g)) grades.set(g, new Map());
      const chapters = grades.get(g)!;
      if (!chapters.has(c)) chapters.set(c, []);
      chapters.get(c)!.push(l);
    });

    return Array.from(grades.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([gradeNum, chapters]) => ({
        gradeNum,
        chapters: sortChapters(Array.from(chapters.entries())).map(([title, items]) => ({
          title,
          items: sortLessons(items)
        }))
      }));
  }, [lessons]);

  if (!initialized || isLoading || fetching) return <div className="py-20 text-center animate-pulse">Đang tải dữ liệu...</div>;
  if (!user || (user.email !== 'vietdang293.vn@gmail.com' && user.email !== 'vietdang293@gmail.com')) return null;

  return (
    <div className="space-y-6">

      {dbError && (
        <Card className="mt-8 border-warning bg-warning-soft">
          <CardContent className="p-6 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-warning mt-1" />
            <div>
              <h3 className="font-bold text-warning mb-2">Bảng dữ liệu chưa được khởi tạo</h3>
              <p className="text-warning text-sm mb-4">
                Bạn cần chạy đoạn SQL sau trong Supabase SQL Editor để tạo bảng lưu trữ chuyên đề (practice_lessons) trước khi có thể thêm chuyên đề mới từ giao diện này.
              </p>
              <pre className="bg-card p-4 rounded-xl text-xs overflow-x-auto border border-warning/50 text-foreground">
{`CREATE TABLE IF NOT EXISTS public.practice_lessons (
  id TEXT PRIMARY KEY,
  grade INTEGER NOT NULL,
  chapter TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  chapter_sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bật Row Level Security nhưng cho phép mọi người đọc, chỉ Admin sửa
ALTER TABLE public.practice_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.practice_lessons FOR SELECT USING (true);
CREATE POLICY "Allow admin all access" ON public.practice_lessons FOR ALL USING (auth.jwt()->>'email' = 'vietdang293.vn@gmail.com');

-- Chèn một số chuyên đề mặc định hiện tại
INSERT INTO public.practice_lessons (id, grade, chapter, title) VALUES
('l6-1', 6, 'Số tự nhiên', 'Tập hợp các số tự nhiên'),
('l7-1', 7, 'Số hữu tỉ', 'Các phép toán với số hữu tỉ'),
('l8-1', 8, 'Phép nhân và phép chia đa thức', 'Nhân đơn thức với đa thức'),
('l8-2-1', 8, 'ÔN TẬP ĐA THỨC', 'Bài tập trắc nghiệm'),
('l9-1', 9, 'Căn bậc hai', 'Khái niệm về căn bậc hai');
`}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {!dbError && (
        <div className="space-y-6">
          <AdminCreatePanel title="Thêm bài học" description="Chọn lớp và chương trước, sau đó nhập tên bài." actionLabel="Thêm bài">
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-4 items-end">
                <div className="space-y-2 xl:col-span-2">
                  <Label htmlFor="practice-create-grade">Lớp</Label>
                  <Input id="practice-create-grade" type="number" value={grade} onChange={e => { setGrade(e.target.value); setChapter(''); setIsNewChapter(false); }} placeholder="VD: 8" />
                </div>
                <div className="space-y-2 xl:col-span-5">
                  <Label htmlFor="practice-create-chapter">Chương</Label>
                  {!isNewChapter ? (
                    <Select
                      value={chapter}
                      onValueChange={(val) => {
                        if (val === '__new__') {
                          setIsNewChapter(true);
                          setChapter('');
                        } else {
                          setChapter(val);
                        }
                      }}
                    >
                      <SelectTrigger id="practice-create-chapter">
                        <SelectValue placeholder="Chọn chương..." />
                      </SelectTrigger>
                      <SelectContent>
                        {existingChaptersForGrade.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                        <SelectItem value="__new__" className="text-primary font-bold">
                          ＋ Tạo chương mới
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        id="practice-create-chapter"
                        value={chapter}
                        onChange={e => setChapter(e.target.value)}
                        placeholder="Tên chương mới..."
                        autoFocus
                      />
                      <Button
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          setIsNewChapter(false);
                          setChapter('');
                        }}
                      >
                        Hủy
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2 sm:col-span-2 xl:col-span-5">
                  <Label htmlFor="practice-create-title">Bài học</Label>
                  <Input id="practice-create-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="VD: Phép cộng phân thức" />
                </div>
                <div className="sm:col-span-2 xl:col-span-12 border-t border-border pt-4 flex justify-end">
                  <Button onClick={handleAddLesson} disabled={saving} className="min-h-11 w-full sm:w-auto">
                    {saving ? 'Đang thêm...' : 'Thêm mới'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </AdminCreatePanel>

          <Card className="rounded-xl shadow-soft">
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2 text-lg">
                <Database className="w-5 h-5 text-primary" />
                Danh sách chương và bài ({lessons.length} bài)
              </CardTitle>
              <p className="text-sm text-muted-foreground">Lớp → Chương → Bài. Dùng tay kéo hoặc phím mũi tên để sắp xếp.</p>
            </CardHeader>
            <CardContent>
              <p className="sr-only" aria-live="polite" aria-atomic="true">{sortStatus}</p>
              {groupedLessons.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground bg-muted rounded-2xl">
                  Chưa có chuyên đề nào trong CSDL.
                </div>
              ) : (
                <div className="space-y-8">
                  {groupedLessons.map(gradeGroup => (
                    <div key={gradeGroup.gradeNum}>
                      <h3 className="text-base font-semibold mb-3 text-foreground">Toán Lớp {gradeGroup.gradeNum}</h3>
                      <div className="space-y-4">
                        {gradeGroup.chapters.map((ch) => {
                          const chapterId = `g${gradeGroup.gradeNum}-c${ch.title}`;
                          const isExpanded = expandedId === chapterId;
                          const chapterDragItem: SortDragItem = { kind: 'chapter', id: ch.title, grade: gradeGroup.gradeNum };
                          const isChapterDragTarget = draggingItem?.kind === 'chapter' && dragOverId === ch.title;

                          return (
                            <div
                              key={chapterId}
                              data-sort-kind="chapter"
                              data-sort-grade={gradeGroup.gradeNum}
                              data-sort-id={ch.title}
                              className={'border rounded-xl bg-card overflow-hidden transition-colors ' + (isChapterDragTarget ? 'border-primary ring-2 ring-primary/30 bg-primary-soft' : 'border-border')}
                            >
                              <div className="flex items-center gap-2 p-2">
                                <button
                                  type="button"
                                  onPointerDown={(event) => handleSortPointerDown(event, chapterDragItem)}
                                  onPointerMove={handleSortPointerMove}
                                  onPointerUp={handleSortPointerEnd}
                                  onPointerCancel={handleSortPointerEnd}
                                  onKeyDown={(event) => handleSortKeyDown(event, chapterDragItem, gradeGroup.chapters.map((chapter) => chapter.title))}
                                  disabled={reorderingLessonId !== null}
                                  className="flex h-11 w-11 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 active:cursor-grabbing"
                                  style={{ touchAction: 'none' }}
                                  title="Nhấn giữ và kéo để sắp xếp chương"
                                  aria-label={'Kéo để sắp xếp chương ' + ch.title + '. Dùng phím mũi tên lên hoặc xuống để đổi vị trí.'}
                                >
                                  <GripVertical className="h-5 w-5" aria-hidden="true" />
                                </button>
                                <button
                                  className="min-h-11 min-w-0 flex-1 flex items-center justify-between rounded-lg p-2 hover:bg-muted transition-colors"
                                  onClick={() => setExpandedId(isExpanded ? null : chapterId)}
                                  aria-expanded={isExpanded}
                                >
                                  <div className="min-w-0 flex items-center gap-2">
                                    {isExpanded ? <ChevronDown className="w-5 h-5 text-primary" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                                    <span className="font-semibold text-foreground text-left break-words text-sm">{ch.title}</span>
                                  </div>
                                  <Badge variant="secondary" className="ml-2 shrink-0 bg-muted text-muted-foreground">
                                    {ch.items.length} bài
                                  </Badge>
                                </button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => openEditChapter(gradeGroup.gradeNum, ch.title)}
                                  className="h-11 w-11 shrink-0 rounded-md border-border text-muted-foreground hover:border-primary hover:bg-primary-soft hover:text-primary"
                                  title="Sửa tên chương"
                                  aria-label={`Sửa tên chương ${ch.title}`}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </div>

                              {isExpanded && (
                                <div className="p-4 pt-0 border-t border-border bg-muted/50">
                                  <div className="space-y-2 mt-4">
                                    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                                      <GripVertical className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                                      <span>Nhấn giữ biểu tượng rồi kéo thả bài học đến vị trí mong muốn.</span>
                                    </div>
                                    {ch.items.map((lesson) => (
                                      <div
                                        key={lesson.id}
                                        data-sort-kind="lesson"
                                        data-sort-grade={gradeGroup.gradeNum}
                                        data-sort-id={lesson.id}
                                        data-sort-chapter={ch.title}
                                        className={'admin-practice-row rounded-lg transition-colors ' + (draggingItem?.kind === 'lesson' && dragOverId === lesson.id ? 'bg-primary-soft ring-2 ring-primary/30' : '')}
                                      >
                                        <button
                                          type="button"
                                          onPointerDown={(event) => handleSortPointerDown(event, { kind: 'lesson', id: lesson.id, grade: gradeGroup.gradeNum, chapter: ch.title })}
                                          onPointerMove={handleSortPointerMove}
                                          onPointerUp={handleSortPointerEnd}
                                          onPointerCancel={handleSortPointerEnd}
                                          onKeyDown={(event) => handleSortKeyDown(event, { kind: 'lesson', id: lesson.id, grade: gradeGroup.gradeNum, chapter: ch.title }, ch.items.map((item) => item.id))}
                                          disabled={reorderingLessonId !== null}
                                          className="flex h-11 w-11 shrink-0 touch-none cursor-grab items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 active:cursor-grabbing"
                                          style={{ touchAction: 'none' }}
                                          title="Nhấn giữ và kéo để sắp xếp bài học"
                                          aria-label={'Kéo để sắp xếp bài ' + lesson.title + '. Dùng phím mũi tên lên hoặc xuống để đổi vị trí.'}
                                        >
                                          <GripVertical className="h-5 w-5" aria-hidden="true" />
                                        </button>
                                        <div className="min-w-0 py-2">
                                          <div className="flex items-center gap-3">
                                            <div className="hidden sm:block text-primary shrink-0">
                                              <BookOpen className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                              <div className="break-words text-sm font-semibold text-foreground">{lesson.title}</div>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="admin-practice-actions">
                                        <Button
                                          variant="outline"
                                          onClick={() => openLevelManager(lesson)}
                                          className="h-11 shrink-0 rounded-md border-border px-3 text-muted-foreground transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary"
                                          aria-label={`Quản lý câu hỏi theo Level của ${lesson.title}`}
                                        >
                                          <ListX className="h-5 w-5" aria-hidden="true" />
                                          <span>Câu hỏi ({PRACTICE_LEVELS.reduce((total, level) => total + (questionCounts[lesson.id]?.[level.value] || 0), 0)})</span>
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          onClick={() => openEditLesson(lesson)}
                                          className="rounded-md shrink-0 border-border hover:bg-primary-soft hover:border-primary hover:text-primary text-muted-foreground transition-colors h-11 w-11"
                                          title="Sửa bài học"
                                          aria-label={`Sửa ${lesson.title}`}
                                        >
                                          <Pencil className="w-5 h-5" />
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          onClick={() => handleDelete(lesson.id)}
                                          className="rounded-md shrink-0 border-border hover:bg-destructive-soft hover:border-destructive hover:text-destructive text-destructive transition-colors h-11 w-11"
                                          title="Xóa bài học"
                                          aria-label={`Xóa ${lesson.title}`}
                                        >
                                          <Trash2 className="w-5 h-5" />
                                        </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={!!managingLesson} onOpenChange={(open) => {
        if (!open && deletingLevel === null) {
          setManagingLesson(null);
          setPendingLevelDelete(null);
          setLevelDeleteStatus(null);
        }
      }}>
        <DialogContent className="rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Quản lý câu hỏi theo Level</DialogTitle>
            <DialogDescription>
              {managingLesson?.title}. Chọn đúng Level cần dọn; bài học và các Level còn lại sẽ không bị ảnh hưởng.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {PRACTICE_LEVELS.map((level) => {
              const count = managingLesson ? questionCounts[managingLesson.id]?.[level.value] || 0 : 0;
              const isDeleting = deletingLevel === level.value;

              return (
                <div key={level.value} className="flex flex-col gap-3 rounded-xl border border-border bg-muted/35 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{level.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{count} câu hỏi</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={count === 0 || deletingLevel !== null}
                    onClick={() => setPendingLevelDelete(level.value)}
                    className="h-11 w-full shrink-0 border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive-soft hover:text-destructive sm:w-auto"
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                    {isDeleting ? 'Đang xóa...' : count > 0 ? `Xóa ${count} câu` : 'Không có câu hỏi'}
                  </Button>
                </div>
              );
            })}
          </div>

          {levelDeleteStatus && (
            <p
              role={levelDeleteStatus.type === 'error' ? 'alert' : 'status'}
              className={`rounded-xl border p-3 text-sm font-medium ${levelDeleteStatus.type === 'error' ? 'border-destructive/40 bg-destructive-soft text-destructive' : 'border-success/40 bg-success-soft text-success'}`}
            >
              {levelDeleteStatus.text}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManagingLesson(null)} disabled={deletingLevel !== null}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingLevelDelete !== null} onOpenChange={(open) => !open && deletingLevel === null && setPendingLevelDelete(null)}>
        <AlertDialogContent className="rounded-2xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa toàn bộ câu hỏi của Level {pendingLevelDelete}?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              Thao tác này sẽ xóa {pendingLevelDelete !== null && managingLesson ? questionCounts[managingLesson.id]?.[pendingLevelDelete] || 0 : 0} câu hỏi trong <strong>{managingLesson?.title}</strong>, cùng tiến độ và câu đã lưu liên quan. Không thể hoàn tác sau khi xác nhận.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingLevel !== null}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteLevel();
              }}
              disabled={deletingLevel !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingLevel !== null ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
              {deletingLevel !== null ? 'Đang xóa...' : 'Xóa Level này'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editingLesson} onOpenChange={(open) => !open && setEditingLesson(null)}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sửa bài tự luyện</DialogTitle>
            <DialogDescription>ID bài học được FlyDo quản lý nội bộ; bạn chỉ cần cập nhật nội dung hiển thị.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="edit-lesson-chapter">Tên chương</Label><Input id="edit-lesson-chapter" value={editLessonChapter} onChange={(event) => setEditLessonChapter(event.target.value)} className="h-11" /></div>
            <div className="space-y-2"><Label htmlFor="edit-lesson-title">Tên bài</Label><Input id="edit-lesson-title" value={editLessonTitle} onChange={(event) => setEditLessonTitle(event.target.value)} className="h-11" /></div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditingLesson(null)} disabled={savingEdit}>Hủy</Button>
            <Button type="button" onClick={handleSaveLesson} disabled={savingEdit} className="bg-primary text-primary-foreground">{savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingChapter} onOpenChange={(open) => !open && setEditingChapter(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sửa tên chương</DialogTitle>
            <DialogDescription>Tên mới sẽ áp dụng cho tất cả bài thuộc chương này của cùng một lớp.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label htmlFor="edit-chapter-name">Tên chương</Label>
            <Input id="edit-chapter-name" value={editChapterName} onChange={(event) => setEditChapterName(event.target.value)} className="h-11" />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditingChapter(null)} disabled={savingChapter}>Hủy</Button>
            <Button type="button" onClick={handleSaveChapter} disabled={savingChapter} className="bg-primary text-primary-foreground">{savingChapter ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
