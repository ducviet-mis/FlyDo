"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { HandbookCategory } from '@/features/handbook/types';
import { RichTextEditor } from '@/features/handbook/components/rich-text-editor';
import { uploadHandbookImage } from '@/features/handbook/utils/upload';
import { readLocalCache, writeLocalCache } from '@/lib/security/safe-storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Save, UploadCloud } from 'lucide-react';

const CATEGORIES: HandbookCategory[] = ['Toán & Đời sống', 'Phương pháp học toán', 'Bản đồ lý thuyết'];

export default function EditHandbookPostPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [category, setCategory] = useState<HandbookCategory>('Toán & Đời sống');
  const [title, setTitle] = useState('');
  const [sapo, setSapo] = useState('');
  const [content, setContent] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [readTime, setReadTime] = useState('3');
  const [isFeatured, setIsFeatured] = useState(false);
  const [authorBio, setAuthorBio] = useState('');

  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const url = await uploadHandbookImage(file);
    if (url) {
      setCoverUrl(url);
    }
    setUploadingCover(false);
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const isAdmin = user?.email === "vietdang293.vn@gmail.com" || user?.email === "vietdang293@gmail.com";

  useEffect(() => {
    async function fetchPost() {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('handbook_posts').select('*').eq('id', params.id).single();

      if (data) {
        setCategory(data.category as HandbookCategory);
        setTitle(data.title);
        setSapo(data.sapo);
        setContent(data.content);
        setCoverUrl(data.cover_url || '');
        setReadTime(data.read_time_minutes?.toString() || '3');
        setIsFeatured(data.is_featured);

        const cachedBio = typeof window !== 'undefined' ? readLocalCache(`handbook_author_bio_${params.id}`) : null;
        setAuthorBio((data as any).author_bio || cachedBio || '');
      }
      setLoading(false);
    }

    if (isAdmin) {
      fetchPost();
    }
  }, [params.id, isAdmin]);

  // Auto-calculate reading time based on word count (~200 words per minute)
  useEffect(() => {
    if (content) {
      const clean = content.replace(/<[^>]*>/g, ' ').trim();
      const words = clean.split(/\s+/).filter(Boolean).length;
      const minutes = Math.max(1, Math.ceil(words / 200));
      setReadTime(minutes.toString());
    }
  }, [content]);

  if (!isAdmin && user) {
    return (
      <div className="container py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Không có quyền truy cập</h1>
        <Button onClick={() => router.push('/handbook')}>Quay lại Cẩm nang</Button>
      </div>
    );
  }

  if (loading) {
    return <div className="container py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>;
  }

  const handlePublish = async () => {
    if (!title.trim() || !sapo.trim() || !content.trim()) {
      alert("Vui lòng nhập đầy đủ Tiêu đề, Tóm tắt và Nội dung bài viết.");
      return;
    }

    setSaving(true);
    const supabase = getSupabaseClient();

    if (isFeatured) {
      await supabase.from('handbook_posts').update({ is_featured: false }).neq('id', params.id);
    }

    if (typeof window !== 'undefined') {
      writeLocalCache(`handbook_author_bio_${params.id}`, authorBio);
    }

    const updatePayload: any = {
      category,
      title,
      sapo,
      content,
      cover_url: coverUrl || null,
      read_time_minutes: parseInt(readTime) || 3,
      is_featured: isFeatured,
      author_bio: authorBio
    };

    let { error } = await supabase.from('handbook_posts').update(updatePayload).eq('id', params.id);
    if (error && error.message?.includes('author_bio')) {
      delete updatePayload.author_bio;
      const res = await supabase.from('handbook_posts').update(updatePayload).eq('id', params.id);
      error = res.error;
    }

    setSaving(false);

    if (error) {
      alert('Lỗi khi cập nhật bài: ' + error.message);
    } else {
      router.push('/handbook');
      router.refresh();
    }
  };

  return (
    <div className="container max-w-5xl py-8 mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-md h-11 w-11 bg-muted hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Chỉnh sửa bài viết
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.back()} className="rounded-md px-6">
            Hủy
          </Button>
          <Button onClick={handlePublish} disabled={saving} className="bg-primary text-primary-foreground shadow-card rounded-md px-8">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Cập nhật
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Editor Area */}
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-2">
            <Label className="text-base font-semibold">Tiêu đề bài báo</Label>
            <Input
              placeholder="Nhập tiêu đề thật cuốn hút..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="text-xl md:text-2xl font-bold h-14 bg-card border-control rounded-md"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold">Đoạn Sa-pô (Tóm tắt ngắn)</Label>
            <Textarea
              placeholder="1-2 câu tóm tắt nội dung bài viết..."
              value={sapo}
              onChange={e => setSapo(e.target.value)}
              className="text-base leading-relaxed h-24 bg-card border-control rounded-md resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold">Nội dung chi tiết</Label>
            <RichTextEditor content={content} onChange={setContent} />
          </div>
        </div>

        {/* Sidebar Settings */}
        <div className="space-y-6">
          <div className="bg-card rounded-2xl border border-border p-6 shadow-soft space-y-6">
            <div className="space-y-2">
              <Label className="font-semibold">Chuyên mục</Label>
              <Select value={category} onValueChange={(val) => setCategory(val as HandbookCategory)}>
                <SelectTrigger className="h-12 bg-surface border-control rounded-md">
                  <SelectValue placeholder="Chọn chuyên mục" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Ảnh bìa (Cover)</Label>
              <input
                type="file"
                ref={coverInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleCoverUpload}
              />
              <div
                role="button"
                tabIndex={0}
                aria-label="Tải ảnh bìa bài viết lên"
                className="mt-3 aspect-[16/9] w-full rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted transition-colors overflow-hidden relative group"
                onClick={() => coverInputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coverInputRef.current?.click(); } }}
              >
                {uploadingCover ? (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin mb-2 text-primary" />
                    <span className="text-sm font-medium">Đang tải ảnh...</span>
                  </div>
                ) : coverUrl ? (
                  <>
                    <img src={coverUrl} alt="Cover Preview" className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                      <UploadCloud className="w-8 h-8 text-primary-foreground mb-2" />
                      <span className="text-primary-foreground font-medium text-sm">Đổi ảnh bìa</span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <UploadCloud className="w-8 h-8 mb-2 opacity-50" />
                    <span className="text-sm font-medium">Tải ảnh lên</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Thời gian đọc ước tính (phút)</Label>
                <span className="text-xs text-primary font-medium">Tự động tính</span>
              </div>
              <Input
                type="number"
                min="1"
                value={readTime}
                onChange={e => setReadTime(e.target.value)}
                className="h-12 bg-surface border-control rounded-md"
              />
              <p className="text-xs text-muted-foreground">
                Ước tính người học mất khoảng {readTime} phút để đọc hết bài này.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Lời nhắn từ tác giả</Label>
              <Textarea
                placeholder="Viết một lời nhắn riêng cho người đọc bài viết này..."
                value={authorBio}
                onChange={e => setAuthorBio(e.target.value)}
                className="text-sm leading-relaxed h-24 bg-surface border-control rounded-md resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Lời nhắn này sẽ hiển thị riêng ở cuối bài viết.
              </p>
            </div>

            <div className="flex items-center gap-3 p-3 bg-primary-soft rounded-xl border border-primary cursor-pointer" onClick={() => setIsFeatured(!isFeatured)}>
              <input type="checkbox" checked={isFeatured} onChange={() => {}} className="w-5 h-5 rounded border-primary text-primary focus:ring-primary" />
              <div className="flex flex-col">
                <span className="font-bold text-primary text-sm">Đặt làm Tiêu điểm</span>
                <span className="text-xs text-primary">Hiển thị bài viết to nhất ở đầu trang</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
