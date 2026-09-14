export type TelegramLinkStatus = { telegram_id: number | null; can_unlink: boolean };
export type TelegramLinkCode = { code: string; expires_at: string };

export function activeLinkCode(value: TelegramLinkCode | null, now: number): TelegramLinkCode | null {
  return value && /^[0-9]{6}$/.test(value.code) && Date.parse(value.expires_at) > now ? value : null;
}
