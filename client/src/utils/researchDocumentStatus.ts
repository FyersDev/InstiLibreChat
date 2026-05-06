import { cn } from '~/utils';

/** Pipeline document status: PENDING, UPLOADED, PROCESSING, COMPLETED, FAILED */
export function formatDocumentPipelineStatus(raw: string | undefined | null): string {
  if (raw == null || String(raw).trim() === '') {
    return 'PENDING';
  }
  return String(raw).trim().toUpperCase();
}

export function pipelineStatusBadgeClass(displayUpper: string): string {
  switch (displayUpper) {
    case 'COMPLETED':
      return 'bg-fig-Surface-one-success text-fig-Subject-success';
    case 'FAILED':
      return 'bg-fig-Surface-one-danger text-fig-Subject-danger';
    case 'PENDING':
    case 'UPLOADED':
    case 'PROCESSING':
      return 'bg-fig-Surface-one-warning text-fig-Subject-warning';
    default:
      return 'bg-fig-Surface-neutral text-fig-Subject-standard';
  }
}

export function pipelineStatusBadgeClassName(displayUpper: string): string {
  return cn(
    'fy-typography-body-tiny inline-block max-w-full truncate rounded-full px-2 py-0.5',
    pipelineStatusBadgeClass(displayUpper),
  );
}
