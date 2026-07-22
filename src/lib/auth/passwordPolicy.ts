// Pure password policy, shared by register / change-password / reset.
// Philosophy: length does the heavy lifting (NIST-style), plus a basic
// character mix and a small denylist of the passwords everyone tries first.

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export const PASSWORD_REQUIREMENTS =
  `At least ${PASSWORD_MIN_LENGTH} characters, with a letter, a number and a special character.`;

const COMMON_PASSWORDS = new Set([
  "password123", "password1234", "password123!", "password2024", "password2025",
  "qwertyuiop1", "1234567890!", "abc123456789", "iloveyou123", "welcome12345",
  "letmein12345", "admin1234567", "sunshine1234", "monkey123456", "dragon123456",
  "football1234", "baseball1234", "superman1234", "qwerty123456", "trustno12345",
]);

/** Returns an error message, or null when the password passes. */
export function validatePassword(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (!/[a-zA-Z]/.test(password)) return "Include at least one letter";
  if (!/[0-9]/.test(password)) return "Include at least one number";
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return "Include at least one special character (e.g. ! ? # …)";
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower.replace(/[^a-z0-9]/g, ""))) {
    return "That password is too common — pick something more unusual";
  }
  if (email) {
    const local = email.toLowerCase().split("@")[0];
    if (local.length >= 4 && lower.includes(local)) {
      return "Don't use your email address in your password";
    }
  }
  return null;
}
