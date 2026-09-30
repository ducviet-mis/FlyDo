import { LoginForm } from '@/features/auth/components/login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GraduationCap } from 'lucide-react';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ oauth_error?: string; session_replaced?: string; device_limit?: string; device_setup?: string }>;
}) {
  const query = await searchParams;
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-float border-border bg-card/70 backdrop-blur-md rounded-xl overflow-hidden">
        <CardHeader className="space-y-1 text-center pt-8">
          <div className="flex justify-center mb-4">
            <div className="bg-primary-soft p-4 rounded-full">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle as="h1" className="text-2xl font-bold text-foreground">Chào mừng trở lại</CardTitle>
          <CardDescription className="text-muted-foreground font-medium">Đăng nhập để tiếp tục học tập</CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <LoginForm
            oauthError={query?.oauth_error === '1'}
            sessionReplaced={query?.session_replaced === '1'}
            deviceLimit={query?.device_limit === '1'}
            deviceSetup={query?.device_setup === '1'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
