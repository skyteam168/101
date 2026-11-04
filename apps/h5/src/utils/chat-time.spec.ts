import { describe, expect, it } from 'vitest';
import { formatChatTime } from './chat-time';

describe('formatChatTime', () => {
  const t = (key: string, values?: Record<string, unknown>) => {
    if (key === 'chat.time.justNow') return '刚刚';
    if (key === 'chat.time.minutesAgo') return `${values?.n}分钟前`;
    if (key === 'chat.time.hoursAgo') return `${values?.n}小时前`;
    return key;
  };

  it('returns empty for blank', () => {
    expect(formatChatTime(null, t)).toBe('');
    expect(formatChatTime(undefined, t)).toBe('');
  });

  it('renders justNow / minutesAgo', () => {
    const now = new Date('2026-11-03T12:00:00+07:00').getTime();
    expect(formatChatTime(new Date(now - 10_000).toISOString(), t, now)).toBe('刚刚');
    expect(formatChatTime(new Date(now - 5 * 60_000).toISOString(), t, now)).toBe('5分钟前');
  });
});
