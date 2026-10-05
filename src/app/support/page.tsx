import type { Metadata } from 'next';
import { PolicyPage } from '@/features/legal/policy-page';
import { POLICY_DOCUMENTS } from '@/features/legal/policies';

export const metadata: Metadata = {
  title: 'Hỗ trợ & khiếu nại | FlyDo',
  description: POLICY_DOCUMENTS.support.description,
};

export default function SupportPage() {
  return <PolicyPage policyKey="support" />;
}
