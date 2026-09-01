'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function CaseIndexRedirect() {
  const params = useParams();
  const router = useRouter();
  const caseId = params?.id as string;

  useEffect(() => {
    if (caseId) {
      router.replace(`/cases/${caseId}/editor`);
    } else {
      router.replace('/');
    }
  }, [caseId, router]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: 'var(--color-cream-paper)',
        color: 'var(--color-forest-ink)',
      }}
    >
      <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
      <span style={{ fontSize: 14, fontWeight: 500 }}>Opening Case Pipeline...</span>
    </div>
  );
}
