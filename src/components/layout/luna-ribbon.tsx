import { Moon } from 'lucide-react';

const labels: Record<string, string> = {
  theory: 'Kho tri thức',
  practice: 'Tự luyện',
  'mock-exams': 'Thi thử',
  handbook: 'Cẩm nang',
  'personal-exams': 'Đề cá nhân',
  profile: 'Hồ sơ',
  pricing: 'Gói FlyDo',
  notifications: 'Thông báo',
  admin: 'Trạm điều hành',
};

export function LunaRibbon({ pageContext }: { pageContext: string }) {
  const label = labels[pageContext];
  if (!label) return null;

  return (
    <div className="luna-ribbon" aria-label={`Luna: ${label}`}>
      <span className="luna-ribbon-mark"><Moon aria-hidden="true" size={15} /></span>
      <span className="luna-ribbon-path">LUNA <span aria-hidden="true">/</span> <strong>{label}</strong></span>
      <span className="luna-ribbon-rule" aria-hidden="true" />
      <span className="luna-ribbon-signature" aria-hidden="true">FLYDO · ĐÀI QUAN SÁT</span>
    </div>
  );
}
