/** One chat message as the browser sees it. */
export type ChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  flags: string[];
};

export const MESSAGE_COLUMNS = "id, sender_id, body, created_at, read_at, flags" as const;

/** First words a buyer usually needs; tapping one fills the box, it doesn't send. */
export const QUICK_REPLIES = [
  "Is this car still available?",
  "Can I come and see it this week?",
  "What is your best price?",
  "Has it been in any accidents?",
] as const;

export const MAX_MESSAGE_LENGTH = 2000;
