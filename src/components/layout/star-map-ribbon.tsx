import { Orbit } from 'lucide-react';

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

export function StarMapRibbon({ pageContext }: { pageContext: string }) {
  const label = labels[pageContext];
  if (!label) return null;

  return (
    <div className="atlas-ribbon" aria-label={`Bản đồ Sao: ${label}`}>
      <span className="atlas-ribbon-mark"><Orbit aria-hidden="true" size={15} /></span>
      <span className="atlas-ribbon-path">BẢN ĐỒ SAO <span aria-hidden="true">/</span> <strong>{label}</strong></span>
      <span className="atlas-ribbon-rule" aria-hidden="true" />
      <span className="atlas-ribbon-signature" aria-hidden="true">FLYDO · ATLAS</span>
    </div>
  );
}
