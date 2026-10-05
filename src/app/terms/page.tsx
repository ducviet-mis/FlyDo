import type { Metadata } from 'next';
import { PolicyPage } from '@/features/legal/policy-page';
import { POLICY_DOCUMENTS } from '@/features/legal/policies';

export const metadata: Metadata = {
  title: 'Điều khoản sử dụng | FlyDo',
  description: POLICY_DOCUMENTS.terms.description,
};

export default function TermsPage() {
  return <PolicyPage policyKey="terms" />;
}
