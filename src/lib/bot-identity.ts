/**
 * The automation bot's identity, shared by the browser and the server.
 *
 * The bot is its own user, not an impersonation of anyone. It is a
 * @cre8advisors.com address so staff-only routes (the assistant) accept it, but
 * it has no row in `brokers`, so every deal lookup keyed on the caller's broker
 * record (Flow, and the assistant's deal RLS) finds nothing. To let it see every
 * deal in the assistant, add this address to ASSISTANT_OWNER_EMAILS.
 */

export const BOT_EMAIL = "admin-bot@cre8advisors.com";
export const BOT_DISPLAY_NAME = "Automation bot";

export function isBotEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === BOT_EMAIL;
}
