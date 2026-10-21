/**
 * Turns Supabase Auth errors into instructions a person can act on.
 * See https://supabase.com/docs/guides/auth/debugging/error-codes
 */
export function friendlyAuthError(error: { code?: string; status?: number; message?: string } | null): string {
  if (!error) return "Something went wrong signing you in. Try again.";

  switch (error.code) {
    case "otp_expired":
    case "invalid_credentials":
      return "That code is wrong or has expired. Check the SMS, or send a new code.";
    case "over_sms_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many codes requested. Wait a minute, then try again.";
    case "sms_send_failed":
      return "We couldn't send the SMS. Check the number, then try again.";
    case "phone_provider_disabled":
    case "signup_disabled":
      return "Phone sign-in is switched off right now. Try again later.";
    case "user_banned":
      return "This account has been suspended. Contact support to restore it.";
  }

  if (error.status === 429) return "Too many attempts. Wait a minute, then try again.";
  // Supabase asks for a pause between codes ("…you can only request this after 47 seconds").
  const wait = error.message?.match(/after (\d+) seconds?/i);
  if (wait) return `Wait ${wait[1]} seconds before requesting another code.`;

  return "Something went wrong signing you in. Try again.";
}
