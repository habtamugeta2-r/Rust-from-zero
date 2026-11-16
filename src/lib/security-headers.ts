/** Build the CSP without relaxing production's script restrictions. */
export function contentSecurityPolicy(isDevelopment: boolean): string {
  const scriptSources = ["'self'", "'unsafe-inline'"];
  // React uses eval to reconstruct useful stack traces in development only.
  if (isDevelopment) scriptSources.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://play.rust-lang.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
