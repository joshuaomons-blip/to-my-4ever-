import { Alert } from '@aureon/ui';
import type { ApiError } from '@/lib/api';

/** Never render "no data" when the request failed — say so, with the request reference for support. */
export function LoadError({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return <Alert tone="negative" className="m-4" title="We couldn't load this">{error.message}. Please retry; if it persists, contact support.</Alert>;
}
