import { cn } from '~/utils';
import type { CSSProperties } from 'react';

/** Pipeline document status: PENDING, UPLOADED, PROCESSING, COMPLETED, FAILED */
export function formatDocumentPipelineStatus(raw: string | undefined | null): string {
  if (raw == null || String(raw).trim() === '') {
    return 'PENDING';
  }
  return String(raw).trim().toUpperCase();
}

export function isPipelineStatusCompleted(raw: string | undefined | null): boolean {
  return formatDocumentPipelineStatus(raw) === 'COMPLETED';
}

export function isPipelineStatusFailed(raw: string | undefined | null): boolean {
  return formatDocumentPipelineStatus(raw) === 'FAILED';
}

export function pipelineStatusBadgeClass(displayUpper: string): string {
  switch (displayUpper) {
    case 'COMPLETED':
      return '!bg-fig-Surface-one-success !text-fig-Subject-one-success';
    case 'FAILED':
      return '!bg-fig-Surface-one-danger !text-fig-Subject-one-danger';
    case 'PENDING':
    case 'UPLOADED':
    case 'PROCESSING':
      return '!bg-fig-Surface-one-warning !text-fig-Subject-one-warning';
    default:
      return '!bg-fig-Surface-neutral !text-fig-Subject-one-standard';
  }
}

export function pipelineStatusBadgeStyle(displayUpper: string): CSSProperties {
  switch (displayUpper) {
    case 'COMPLETED':
      return {
        backgroundColor: 'var(--Surface-one-success)',
        color: 'var(--Subject-one-success)',
      };
    case 'FAILED':
      return {
        backgroundColor: 'var(--Surface-one-danger)',
        color: 'var(--Subject-one-danger)',
      };
    case 'PENDING':
    case 'UPLOADED':
    case 'PROCESSING':
      return {
        backgroundColor: 'var(--Surface-one-warning)',
        color: 'var(--Subject-one-warning)',
      };
    default:
      return {
        backgroundColor: 'var(--Surface-neutral)',
        color: 'var(--Subject-one-standard)',
      };
  }
}

export function pipelineStatusBadgeClassName(displayUpper: string): string {
  return cn(
    'fy-status-pill inline-flex max-w-full items-center justify-center truncate',
    'px-[var(--Padding-zero-spacer)] py-[var(--Padding-zero-boundary)]',
    'text-[length:var(--Font-Label-tiny)] leading-[var(--Font-Label-Lineheight-tiny)] font-[var(--Font-Weight-medium)]',
    pipelineStatusBadgeClass(displayUpper),
  );
}
