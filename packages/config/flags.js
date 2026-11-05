// Risky features ship behind a flag (section 14.1). A value of "false" turns one off without a deploy.
export const FEATURE_FLAGS = ["FEATURE_AI"];

export function isEnabled(name, env) {
  return env[name] !== "false";
}
