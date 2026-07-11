import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    typeof date === 'string' ? new Date(date) : date,
  );
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  return phone.replace(/(\d{2})(\d{5})(\d{5})/, '+$1 $2 $3');
}
