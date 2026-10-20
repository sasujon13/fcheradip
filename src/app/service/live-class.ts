import { formatDate } from '@angular/common';

export interface LiveClass {
  id: number; title: string; subject: string; level: string; topic: string; teacher_name: string;
  description: string; starts_at: string; ends_at: string; join_url: string; status: string;
}
export interface LiveClassSchedule { classes: LiveClass[]; nextClass: LiveClass | null; timezone: string; }

export function nextClassTime(item: LiveClass | null, loading: boolean, unavailable: boolean): string {
  if (loading) return 'Loading…';
  if (unavailable) return 'Schedule unavailable';
  if (!item) return 'Not scheduled';
  const value = new Date(item.starts_at);
  return Number.isFinite(value.getTime()) ? formatDate(value, 'dd-MMM h:mm a', 'en-US', '+0600') : 'Schedule unavailable';
}
