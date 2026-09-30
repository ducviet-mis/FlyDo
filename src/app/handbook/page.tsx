"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase/client';
import { HandbookPost, HandbookCategory } from '@/features/handbook/types';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PenSquare, Clock, Trash2, Edit, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { getReadPostIds } from '@/features/handbook/utils/reading-status';
import { StudyHeading } from '@/components/shared/study-heading';
import { HandbookCover } from '@/features/handbook/components/handbook-cover';

const CATEGORIES: HandbookCategory[] = ['Toán & Đời sống', 'Phương pháp học toán', 'Bản đồ lý thuyết'];

export default function HandbookHubPage() {
  const [posts, setPosts] = useState<HandbookPost[]>([]);
  const [authorAvatars, setAuthorAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<HandbookCategory | 'Tất cả'>('Tất cả');
  const [readPostIds, setReadPostIds] = useState<string[]>([]);
  const { user } = useAuthStore();
  const router = useRouter();

  const isAdmin = user?.email === "vietdang293.vn@gmail.com" || user?.email === "vietdang293@gmail.com";

  const requestId = useRef(0);
  const fetchPosts = useCallback(async () => {
    const request = ++requestId.current;
    try {
    setLoading(true);
    setLoadError(null);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('handbook_posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      // Fetch avatar profiles for all distinct author names
      const authorNames = Array.from(new Set(data.map((p: any) => p.author_name).filter(Boolean)));
      if (authorNames.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('name, avatar_url')
          .in('name', authorNames);

        const avatarMap: Record<string, string> = {};
        profiles?.forEach((prof: any) => {
          if (prof.name && prof.avatar_url) {
            avatarMap[prof.name] = prof.avatar_url;
          }
        });
        if (user?.name && user?.avatarUrl) {
          avatarMap[user.name] = user.avatarUrl;
        }
        if (request !== requestId.current) return;
        setAuthorAvatars(avatarMap);
      }
      if (request !== requestId.current) return;
      setPosts(data as HandbookPost[]);
    } else if (error) {
      if (request === requestId.current) setLoadError('Không thể tải danh sách bài viết lúc này.');
    }
    } catch {
      if (request === requestId.current) setLoadError('Không thể tải danh sách bài viết. Hãy kiểm tra kết nối và thử lại.');
    } finally { if (request === requestId.current) setLoading(false); }
  }, [user?.name, user?.avatarUrl]);

  useEffect(() => {
    void fetchPosts();
    setReadPostIds(getReadPostIds(user?.id));
    return () => { requestId.current += 1; };
  }, [fetchPosts, user?.id]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Bạn có chắc chắn muốn xóa bài viết này?')) return;

    const supabase = getSupabaseClient();
    const { error } = await supabase.from('handbook_posts').delete().eq('id', id);
    if (!error) {
      setPosts(posts.filter(p => p.id !== id));
    } else {
      alert('Lỗi: ' + error.message);
    }
  };

  const filteredPosts = activeCategory === 'Tất cả'
    ? posts
    : posts.filter(p => p.category === activeCategory);

  const featuredPost = filteredPosts.find(p => p.is_featured) || filteredPosts[0];
  const gridPosts = featuredPost ? filteredPosts.filter(p => p.id !== featuredPost.id) : filteredPosts;

  const formatPublishTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffMin < 1) return 'Vừa xong';
      if (diffMin < 60) return `${diffMin} phút trước`;
      if (diffHour < 24) return `${diffHour} giờ trước`;
      if (diffDay < 7) return `${diffDay} ngày trước`;
      return format(date, 'dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="study-page">
      {/* Header */}
      <StudyHeading eyebrow="Cẩm nang · Nuôi dưỡng sự tò mò" title="Một góc nhìn mới về Toán." description="Những câu chuyện, phương pháp và ý tưởng để việc học trở nên gần gũi hơn.">

        {isAdmin && (
          <Button
            onClick={() => router.push('/handbook/new')}
            className="bg-primary text-primary-foreground shadow-card rounded-md h-11 px-5 font-semibold text-sm hover:opacity-90 self-start sm:self-auto"
          >
            <PenSquare className="w-4 h-4 mr-2" />
            Viết bài mới
          </Button>
        )}
      </StudyHeading>

      {/* Category Filter Pills */}
      <div className="flex flex-row overflow-x-auto snap-x [&::-webkit-scrollbar]:hidden gap-2 sm:gap-2.5 mb-6 sm:mb-8 pb-1">
        <button
          onClick={() => setActiveCategory('Tất cả')}
          className={cn(
            "min-h-11 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all whitespace-nowrap snap-start border",
            activeCategory === 'Tất cả'
              ? "bg-primary text-primary-foreground border-transparent shadow-soft"
              : "bg-card border-border text-muted-foreground hover:bg-muted"
          )}
        >
          Tất cả
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "min-h-11 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all whitespace-nowrap snap-start border",
              activeCategory === cat
                ? "bg-primary text-primary-foreground border-transparent shadow-soft"
                : "bg-card border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Đang tải bài viết...</div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card px-5 py-16 text-center">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" onClick={fetchPosts}>Thử tải lại</Button>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm bg-card rounded-2xl border border-dashed border-border">
          Chưa có bài viết nào trong chuyên mục này.
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-10">
          {/* Featured Hero Post - Compact & Balanced Proportions */}
          {featuredPost && (
            <div className="group relative">
              <Link href={`/handbook/${featuredPost.id}`} className="block">
                <div className="flex flex-col lg:flex-row gap-5 lg:gap-9 bg-card rounded-xl p-3 sm:p-5 border border-border shadow-soft hover:shadow-card hover:border-primary/40 transition-colors duration-200">

                {/* Image (Bounded Height, max 280px on desktop) */}
                <div className="w-full lg:w-[48%] shrink-0">
                  <div className="relative w-full h-52 sm:h-64 lg:h-[280px] rounded-xl lg:rounded-lg overflow-hidden bg-muted">
                    {featuredPost.cover_url ? (
                      <img
                        src={featuredPost.cover_url}
                        alt={featuredPost.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <HandbookCover category={featuredPost.category} />
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 flex flex-col justify-between py-1 sm:py-2 lg:pr-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2.5">
                      <Badge className="w-fit bg-primary-soft text-primary hover:bg-primary-soft rounded-md px-2.5 py-0.5 text-xs font-semibold border-0">
                        {featuredPost.category}
                      </Badge>
                      {readPostIds.includes(featuredPost.id) && <Badge variant="outline" className="gap-1 rounded-md border-success/40 text-success"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Đã đọc</Badge>}
                    </div>

                    <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight text-foreground leading-snug mb-3 group-hover:text-primary transition-colors line-clamp-3">
                      {featuredPost.title}
                    </h2>

                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed line-clamp-3 mb-5">
                      {featuredPost.sapo}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-3 border-t border-border">
                    <Avatar className="w-8 h-8 border border-border shadow-soft">
                      {authorAvatars[featuredPost.author_name] && (
                        <AvatarImage src={authorAvatars[featuredPost.author_name]} alt={featuredPost.author_name} className="object-cover" />
                      )}
                      <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xs">
                        {featuredPost.author_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-xs sm:text-sm font-bold text-foreground">{featuredPost.author_name}</span>
                      <div className="flex items-center text-xs text-muted-foreground font-medium">
                        <span title={new Date(featuredPost.created_at).toLocaleString('vi-VN')}>{formatPublishTime(featuredPost.created_at)}</span>
                        <span className="mx-1.5">•</span>
                        <span className="flex items-center"><Clock className="w-3 h-3 mr-1 text-primary" /> ~{featuredPost.read_time_minutes || 3} phút đọc</span>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </Link>

              {/* Admin Quick Actions */}
              {isAdmin && (
                <div className="absolute top-5 right-5 flex gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                  <Button aria-label="Sửa bài viết" size="icon" variant="secondary" className="h-11 w-11 rounded-md shadow-soft bg-card/95 hover:bg-card text-foreground" onClick={(e) => { e.preventDefault(); router.push(`/handbook/${featuredPost.id}/edit`); }}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button aria-label="Xóa bài viết" size="icon" variant="destructive" className="h-11 w-11 rounded-md shadow-soft" onClick={(e) => handleDelete(featuredPost.id, e)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Standard Card Grid (3 columns) */}
          {gridPosts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
              {gridPosts.map(post => (
                <div key={post.id} className="group relative">
                  <Link href={`/handbook/${post.id}`} className="flex h-full flex-col bg-card rounded-xl border border-border shadow-soft hover:shadow-card hover:border-primary/30 transition-colors duration-200 overflow-hidden">

                  <div className="relative w-full h-44 sm:h-48 bg-muted overflow-hidden shrink-0">
                    {post.cover_url ? (
                      <img src={post.cover_url} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <HandbookCover category={post.category} />
                    )}
                    <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
                      <Badge className="bg-card/95 text-foreground hover:bg-card border-0 shadow-soft backdrop-blur-sm text-xs px-2 py-0.5">
                        {post.category}
                      </Badge>
                      {readPostIds.includes(post.id) && <Badge variant="outline" className="gap-1 rounded-md border-success/40 bg-card/95 text-success shadow-soft"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Đã đọc</Badge>}
                    </div>
                  </div>

                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="text-lg font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                      {post.title}
                    </h3>

                    <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-2">
                      {post.sapo}
                    </p>

                    <div className="mt-auto flex items-center gap-2.5 pt-3 border-t border-border">
                      <Avatar className="w-7 h-7 shadow-soft">
                        {authorAvatars[post.author_name] && (
                          <AvatarImage src={authorAvatars[post.author_name]} alt={post.author_name} className="object-cover" />
                        )}
                        <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xs">
                          {post.author_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-foreground line-clamp-1">{post.author_name}</span>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <span title={new Date(post.created_at).toLocaleString('vi-VN')}>{formatPublishTime(post.created_at)}</span>
                          <span className="mx-1">•</span>
                          <span>~{post.read_time_minutes || 3}p đọc</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  </Link>

                  {/* Admin Quick Actions */}
                  {isAdmin && (
                    <div className="absolute top-3 right-3 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                      <Button aria-label="Sửa bài viết" size="icon" variant="secondary" className="h-11 w-11 rounded-md shadow-soft bg-card/95 hover:bg-card text-foreground" onClick={(e) => { e.preventDefault(); router.push(`/handbook/${post.id}/edit`); }}>
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button aria-label="Xóa bài viết" size="icon" variant="destructive" className="h-11 w-11 rounded-md shadow-soft" onClick={(e) => handleDelete(post.id, e)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
