'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { Card, CardContent } from '@/components/ui/card';
import { AdminCreatePanel } from '@/components/admin/create-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Trash2, Clock, CalendarDays, FileText, FolderTree, AlertCircle, Pencil, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MOCK_EXAM_CATEGORIES, type MockExamCategory } from '@/features/mock-exams/exam-categories';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface MockExamTopic { id: string; name: string; grade: number; }
interface ExamChapterGroup { id: string; title: string; exams: any[]; topic?: MockExamTopic; }
const isAdminEmail = (email?: string | null) => email === 'vietdang293.vn@gmail.com' || email === 'vietdang293@gmail.com';

const createInternalExamCode = () => {
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
  return `FLY-${randomPart}`;
};

const formatCreatedDate = (value?: string) => value
  ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
  : '';

export default function MockExamsAdminPage() {
  const { user, isLoading, initialized } = useAuthStore();
  const [exams, setExams] = useState<any[]>([]);
  const [topics, setTopics] = useState<MockExamTopic[]>([]);
  const [fetching, setFetching] = useState(true);
  const [databaseReady, setDatabaseReady] = useState(true);
  const [grade, setGrade] = useState('8');
  const [category, setCategory] = useState<MockExamCategory>('midterm_1');
  const [topicId, setTopicId] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('45');
  const [saving, setSaving] = useState(false);
  const [editingExam, setEditingExam] = useState<any | null>(null);
  const [listGrade, setListGrade] = useState('8');
  const [openCategories, setOpenCategories] = useState<string[]>(['midterm_1', 'topic']);
  const [editTitle, setEditTitle] = useState('');
  const [editDuration, setEditDuration] = useState('45');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null);

  const topicsForGrade = useMemo(() => topics.filter((topic) => topic.grade === parseInt(grade)), [topics, grade]);
  const examGroups = useMemo(() => MOCK_EXAM_CATEGORIES.map((item) => {
    const categoryExams = exams.filter((exam) => String(exam.grade) === listGrade && (exam.category || 'midterm_1') === item.id);
    const gradeTopics = topics.filter((topic) => String(topic.grade) === listGrade);
    if (categoryExams.length === 0 && (item.id !== 'topic' || gradeTopics.length === 0)) return null;
    const chapters: ExamChapterGroup[] = item.id === 'topic'
      ? [
          ...gradeTopics.map((topic) => ({ id: topic.id, title: topic.name, exams: categoryExams.filter((exam) => exam.topic_id === topic.id), topic })),
          ...Array.from(new Set(categoryExams.map((exam) => exam.topic_id || '__ungrouped__')))
            .filter((id) => id === '__ungrouped__' || !gradeTopics.some((topic) => topic.id === id))
            .map((id) => ({
              id,
              title: id === '__ungrouped__' ? 'Chưa gắn chuyên đề' : 'Chuyên đề đã xóa',
              exams: categoryExams.filter((exam) => (exam.topic_id || '__ungrouped__') === id),
              topic: undefined,
            })),
        ]
      : [{ id: item.id, title: '', exams: categoryExams }];
    return { ...item, count: categoryExams.length, chapters };
  }).filter((item): item is NonNullable<typeof item> => item !== null), [exams, listGrade, topics]);

  const fetchData = async () => {
    const supabase = getSupabaseClient();
    const [examResult, topicResult] = await Promise.all([
      supabase.from('mock_exams').select('*').order('created_at', { ascending: false }),
      supabase.from('mock_exam_topics').select('id, name, grade').order('grade').order('sort_order').order('name'),
    ]);
    if (examResult.error?.code === '42P01' || topicResult.error?.code === '42P01') {
      setDatabaseReady(false);
    } else {
      if (examResult.error) console.error('Không thể tải danh sách đề:', examResult.error);
      if (topicResult.error) console.error('Không thể tải chuyên đề:', topicResult.error);
      setExams(examResult.data || []);
      setTopics((topicResult.data || []) as MockExamTopic[]);
      setDatabaseReady(true);
    }
    setFetching(false);
  };

  useEffect(() => { if (user && isAdminEmail(user.email)) void fetchData(); }, [user]);
  useEffect(() => { setTopicId(''); setNewTopicName(''); }, [grade, category]);

  const handleAddExam = async () => {
    if (!title.trim() || !duration) return alert('Vui lòng điền đầy đủ thông tin bắt buộc.');
    if (category === 'topic' && !topicId && !newTopicName.trim()) return alert('Hãy chọn hoặc tạo chuyên đề cho đề này.');
    setSaving(true);
    const supabase = getSupabaseClient();
    let resolvedTopicId: string | null = null;

    if (category === 'topic') {
      resolvedTopicId = topicId || null;
      if (!resolvedTopicId && newTopicName.trim()) {
        const { data: newTopic, error: topicError } = await supabase.from('mock_exam_topics').insert({ name: newTopicName.trim(), grade: parseInt(grade) }).select('id').single();
        if (topicError || !newTopic) {
          alert('Không thể tạo chuyên đề: ' + (topicError?.message || 'Lỗi không xác định'));
          setSaving(false);
          return;
        }
        resolvedTopicId = newTopic.id;
      }
    }

    const { error } = await supabase.from('mock_exams').insert({ code: createInternalExamCode(), grade: parseInt(grade), title: title.trim(), duration: parseInt(duration), category, topic_id: resolvedTopicId });
    if (error) alert('Không thể tạo đề: ' + error.message);
    else {
      alert('Đã tạo đề. Vào mục "Nhập đề JSON" trong ADMIN để dán JSON và thêm câu hỏi cho đề này.');
      setTitle(''); setTopicId(''); setNewTopicName(''); setListGrade(grade);
      setOpenCategories((current) => current.includes(category) ? current : [...current, category]);
      await fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async (examId: string) => {
    if (!confirm('Bạn có chắc muốn xóa đề này cùng toàn bộ câu hỏi và lịch sử thi liên quan?')) return;
    const { error } = await getSupabaseClient().from('mock_exams').delete().eq('id', examId);
    if (error) alert('Không thể xóa đề: ' + error.message);
    else setExams((current) => current.filter((exam) => exam.id !== examId));
  };

  const handleDeleteTopic = async (topic: MockExamTopic) => {
    if (deletingTopicId || exams.some((exam) => exam.topic_id === topic.id)) return;
    if (!confirm(`Xóa chuyên đề trống “${topic.name}” của lớp ${topic.grade}?`)) return;

    setDeletingTopicId(topic.id);
    const supabase = getSupabaseClient();
    const { data: linkedExams, error: checkError } = await supabase.from('mock_exams').select('id').eq('topic_id', topic.id).limit(1);
    if (checkError || linkedExams?.length) {
      alert(checkError ? `Không thể kiểm tra chuyên đề: ${checkError.message}` : 'Chuyên đề đã có đề thi. Hãy tải lại danh sách trước khi xóa.');
      await fetchData();
      setDeletingTopicId(null);
      return;
    }

    const { error } = await supabase.from('mock_exam_topics').delete().eq('id', topic.id);
    if (error) alert('Không thể xóa chuyên đề: ' + error.message);
    else {
      setTopics((current) => current.filter((item) => item.id !== topic.id));
      if (topicId === topic.id) setTopicId('');
    }
    setDeletingTopicId(null);
  };

  const openEditExam = (exam: any) => {
    setEditingExam(exam);
    setEditTitle(exam.title || '');
    setEditDuration(String(exam.duration || 45));
  };

  const handleSaveExam = async () => {
    if (!editingExam || !editTitle.trim() || !editDuration || Number(editDuration) < 1) {
      alert('Vui lòng nhập tên đề và thời gian hợp lệ.');
      return;
    }

    setSavingEdit(true);
    const { data, error } = await getSupabaseClient()
      .from('mock_exams')
      .update({ title: editTitle.trim(), duration: Number(editDuration) })
      .eq('id', editingExam.id)
      .select()
      .single();

    if (error || !data) {
      alert('Không thể lưu thay đổi: ' + (error?.message || 'Lỗi không xác định'));
    } else {
      setExams((current) => current.map((exam) => exam.id === data.id ? data : exam));
      setEditingExam(null);
    }
    setSavingEdit(false);
  };

  if (!initialized || isLoading || fetching) return <div className="py-20 text-center animate-pulse">Đang tải dữ liệu...</div>;
  if (!user || !isAdminEmail(user.email)) return null;

  return (
    <div className="space-y-6">
      {!databaseReady && <Card className="border-warning bg-warning-soft"><CardContent className="flex gap-4 p-6"><AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-warning" /><div><h2 className="font-bold text-warning">Chưa khởi tạo cấu trúc Thi thử</h2><p className="mt-1 text-sm text-warning">Hãy chạy tệp SQL đi kèm bản cập nhật này trong Supabase SQL Editor, sau đó tải lại trang.</p></div></CardContent></Card>}

      {databaseReady && <>
        <AdminCreatePanel title="Tạo đề thi" description="Chọn lớp, danh mục và chuyên đề. Thêm câu hỏi ở mục Nhập JSON sau khi tạo đề." actionLabel="Tạo đề">
          <CardContent className="p-5 sm:p-6"><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
            <div className="space-y-2 xl:col-span-2"><Label htmlFor="exam-create-grade">Lớp</Label><Select value={grade} onValueChange={setGrade}><SelectTrigger id="exam-create-grade" className="h-11 bg-surface"><SelectValue /></SelectTrigger><SelectContent>{[6, 7, 8, 9].map((value) => <SelectItem key={value} value={String(value)}>Lớp {value}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 xl:col-span-3"><Label htmlFor="exam-create-category">Danh mục</Label><Select value={category} onValueChange={(value) => setCategory(value as MockExamCategory)}><SelectTrigger id="exam-create-category" className="h-11 bg-surface"><SelectValue /></SelectTrigger><SelectContent>{MOCK_EXAM_CATEGORIES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 xl:col-span-5"><Label htmlFor="exam-create-title">Tên đề thi</Label><Input id="exam-create-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="VD: Đề giữa học kì I - Toán 8" className="h-11 bg-surface" /></div>
            {category === 'topic' && <div className="space-y-2 md:col-span-2 xl:col-span-8"><Label htmlFor="exam-create-topic" className="flex items-center gap-2"><FolderTree className="h-4 w-4 text-primary" />Chuyên đề / chương</Label><div className="grid gap-3 sm:grid-cols-2"><Select value={topicId || '__new__'} onValueChange={(value) => { setTopicId(value === '__new__' ? '' : value); if (value !== '__new__') setNewTopicName(''); }}><SelectTrigger id="exam-create-topic" className="h-11 bg-surface"><SelectValue placeholder="Chọn chuyên đề đã có" /></SelectTrigger><SelectContent>{topicsForGrade.map((topic) => <SelectItem key={topic.id} value={topic.id}>{topic.name}</SelectItem>)}<SelectItem value="__new__">＋ Tạo chuyên đề mới</SelectItem></SelectContent></Select>{!topicId && <Input aria-label="Tên chuyên đề mới" value={newTopicName} onChange={(event) => setNewTopicName(event.target.value)} placeholder="VD: Đa thức và các phép toán" className="h-11 bg-surface" />}</div></div>}
            <div className="space-y-2 xl:col-span-2"><Label htmlFor="exam-create-duration">Thời gian (phút)</Label><Input id="exam-create-duration" type="number" min="1" value={duration} onChange={(event) => setDuration(event.target.value)} className="h-11 bg-surface" /></div>
          </div><Button onClick={handleAddExam} disabled={saving} className="mt-6 h-11 w-full rounded-md bg-primary px-8 font-bold text-primary-foreground md:w-auto">{saving ? 'Đang tạo...' : 'Tạo đề thi'}</Button></CardContent>
        </AdminCreatePanel>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="flex items-center gap-2 text-lg font-bold text-foreground"><FileText className="h-5 w-5 text-primary" />Danh sách đề thi thử</h2><p className="mt-1 text-sm text-muted-foreground">Lớp → Danh mục → Chuyên đề → Đề thi</p></div>
            <div className="w-40 space-y-1.5"><Label htmlFor="exam-list-grade">Xem lớp</Label><Select value={listGrade} onValueChange={setListGrade}><SelectTrigger id="exam-list-grade" className="h-11 bg-surface"><SelectValue /></SelectTrigger><SelectContent>{[6, 7, 8, 9].map((value) => <SelectItem key={value} value={String(value)}>Lớp {value}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {examGroups.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center text-muted-foreground">Lớp {listGrade} chưa có đề thi thử.</div> : examGroups.map((group) => (
            <details key={`${listGrade}-${group.id}`} className="group overflow-hidden rounded-2xl border border-border bg-card" open={openCategories.includes(group.id)} onToggle={(event) => { const isOpen = event.currentTarget.open; setOpenCategories((current) => isOpen ? current.includes(group.id) ? current : [...current, group.id] : current.filter((id) => id !== group.id)); }}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-foreground marker:hidden hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden sm:px-5">
                <span className="flex min-w-0 items-center gap-3"><FolderTree className="h-5 w-5 shrink-0 text-primary" /><span className="truncate">{group.label}</span><Badge variant="outline" className="border-border bg-muted text-muted-foreground">{group.count} đề</Badge></span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="space-y-5 border-t border-border px-4 py-5 sm:px-5">
                {group.chapters.map((chapter) => <div key={chapter.id} className="space-y-3">
                  {chapter.title && <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"><span className="h-4 w-0.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span className="break-words">{chapter.title}</span><span className="shrink-0 font-normal text-muted-foreground">({chapter.exams.length} đề)</span></h3>{chapter.topic && chapter.exams.length === 0 && <Button type="button" variant="outline" onClick={() => void handleDeleteTopic(chapter.topic!)} disabled={deletingTopicId !== null} className="min-h-10 border-destructive/30 text-destructive hover:border-destructive hover:bg-destructive-soft hover:text-destructive" aria-label={`Xóa chuyên đề trống ${chapter.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" />{deletingTopicId === chapter.topic.id ? 'Đang xóa...' : 'Xóa chuyên đề trống'}</Button>}</div>}
                  {chapter.exams.length === 0 && <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">Chuyên đề này chưa có đề thi.</p>}
                  <div className="admin-record-list">{chapter.exams.map((exam) => <article key={exam.id} className="admin-record flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1 space-y-2"><h4 className="break-words font-bold text-foreground">{exam.title}</h4><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{exam.duration} phút</span>{exam.created_at && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatCreatedDate(exam.created_at)}</span>}</div></div><div className="flex shrink-0 gap-2"><Button variant="outline" size="icon" onClick={() => openEditExam(exam)} className="h-11 w-11 border-border text-muted-foreground hover:border-primary hover:bg-primary-soft hover:text-primary" aria-label={`Sửa đề ${exam.title}`}><Pencil className="h-4 w-4" /></Button><Button variant="destructive" size="icon" onClick={() => handleDelete(exam.id)} className="h-11 w-11 bg-destructive-soft text-destructive hover:bg-destructive-soft" aria-label={`Xóa đề ${exam.title}`}><Trash2 className="h-4 w-4" /></Button></div></article>)}</div>
                </div>)}
              </div>
            </details>
          ))}
        </section>
      </>}

      <Dialog open={!!editingExam} onOpenChange={(open) => !open && setEditingExam(null)}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sửa thông tin đề thi</DialogTitle>
            <DialogDescription>Việc sửa ở đây không làm mất câu hỏi hoặc lịch sử thi của học sinh.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="edit-exam-title">Tên đề thi</Label><Input id="edit-exam-title" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="h-11" /></div>
            <div className="space-y-2"><Label htmlFor="edit-exam-duration">Thời gian làm bài (phút)</Label><Input id="edit-exam-duration" type="number" min="1" value={editDuration} onChange={(event) => setEditDuration(event.target.value)} className="h-11" /></div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditingExam(null)} disabled={savingEdit}>Hủy</Button>
            <Button type="button" onClick={handleSaveExam} disabled={savingEdit} className="bg-primary text-primary-foreground">{savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
