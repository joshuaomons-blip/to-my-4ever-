'use client';
import { Alert } from '@aureon/ui';
import type { ReactNode } from 'react';

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="display text-[30px] font-medium leading-tight">{title}</h1>
      {subtitle ? <p className="mt-2 text-[14px] text-muted">{subtitle}</p> : null}
    </div>
  );
}

export function FormError({ error }: { error: string | null }) {
  return error ? <Alert tone="negative" className="mb-4">{error}</Alert> : null;
}
