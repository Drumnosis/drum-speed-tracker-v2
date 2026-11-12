export function validateSignup(email: string, password: string, confirmation: string): string | null {
  if (!email.trim()) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address, such as name@example.com.";
  if (password.length < 6) return "Use a password with at least 6 characters.";
  if (password !== confirmation) return "Passwords do not match. Enter the same password in both fields.";
  return null;
}

export const alreadyRegisteredMessage = "This email address is already registered. Sign in, or use Forgot password to reset your password.";

export function signupOutcome(data: {
  session: unknown;
  user: { identities?: unknown[] } | null;
}): "signed-in" | "confirm-email" | "already-registered" | "failed" {
  if (data.session) return "signed-in";
  if (!data.user) return "failed";
  if (data.user.identities?.length === 0) return "already-registered";
  return "confirm-email";
}

export function signupErrorMessage(error: unknown): string {
  const detail = error && typeof error === "object" ? error as { code?: string; message?: string; status?: number; reasons?: string[]; name?: string } : {};
  const code = detail.code;
  const message = detail.message ?? "";
  if (code === "user_already_exists" || code === "email_exists" || /already registered/i.test(message)) return alreadyRegisteredMessage;
  if (code === "email_address_invalid" || code === "email_address_not_authorized" || /invalid.*email|email.*invalid/i.test(message)) return "This email address cannot be used. Check the address and try again.";
  if (code === "weak_password" || /password/i.test(message)) {
    const requirements: string[] = [];
    if (detail.reasons?.includes("length")) requirements.push("Use a longer password.");
    if (detail.reasons?.includes("characters")) requirements.push("Include uppercase and lowercase letters, numbers and symbols.");
    if (detail.reasons?.includes("pwned")) requirements.push("Choose a password that has not appeared in a data breach.");
    return `This password does not meet the account security requirements. ${requirements.join(" ") || "Try a longer password with uppercase and lowercase letters, numbers and symbols."}`;
  }
  if (code === "signup_disabled" || code === "email_provider_disabled") return "New account registration is currently unavailable. Please contact your teacher or the app administrator.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || detail.status === 429) return "Too many attempts or emails have been sent. Please wait a few minutes before trying again.";
  if (detail.status === 0 || detail.name === "AuthRetryableFetchError" || /fetch|network|offline/i.test(message)) return "Could not connect to the account service. Check your internet connection and try again.";
  return "We could not create your account. Please try again. If this continues, contact your teacher or the app administrator.";
}
