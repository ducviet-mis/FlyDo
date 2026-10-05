import type { Metadata } from 'next';
import { PolicyPage } from '@/features/legal/policy-page';
import { POLICY_DOCUMENTS } from '@/features/legal/policies';

export const metadata: Metadata = {
  title: 'Thanh toán & hoàn tiền | FlyDo',
  description: POLICY_DOCUMENTS.payment.description,
};

export default function PaymentPolicyPage() {
  return <PolicyPage policyKey="payment" />;
}
