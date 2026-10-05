import type { Metadata } from 'next';
import { PolicyPage } from '@/features/legal/policy-page';
import { POLICY_DOCUMENTS } from '@/features/legal/policies';

export const metadata: Metadata = {
  title: 'Chính sách bảo mật | FlyDo',
  description: POLICY_DOCUMENTS.privacy.description,
};

export default function PrivacyPage() {
  return <PolicyPage policyKey="privacy" />;
}
