/** GoTrue's bcrypt policy caps passwords at 72 UTF-8 bytes. Never truncate a password. */
export function assertNewPassword(password: string): void {
  if (password.length < 16 || password.length > 72)
    throw new Error("Use a password between 16 and 72 characters.");
  if (new TextEncoder().encode(password).length > 72)
    throw new Error(
      "Use a shorter password. Some symbols count as more than one character.",
    );
  const hasSymbol = Array.from("!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~").some(
    (symbol) => password.includes(symbol),
  );
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !hasSymbol
  )
    throw new Error(
      "Include uppercase, lowercase, a number and a symbol such as ! or @.",
    );
}
