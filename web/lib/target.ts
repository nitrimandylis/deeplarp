// Turns what a visitor types (or the URL path) into a scan target: "user" or "owner/repo".
// Accepts a pasted github.com URL too, and refuses reserved and opted-out names.

// Top-level paths the site uses itself, so no user report can live there.
export const RESERVED = ["api", "about"];

// People who asked (through a GitHub issue) not to be scannable. Lowercase.
export const OPTED_OUT: string[] = [];

// GitHub logins: letters, digits and single hyphens, no hyphen at either end, max 39.
const LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
// Repo names: letters, digits, dot, hyphen, underscore.
const REPO = /^[\w.-]{1,100}$/;

export type ParsedTarget = { target: string } | { error: string };

export function parseTarget(input: string): ParsedTarget {
  let text = input.trim();
  text = text.replace(/^https?:\/\//i, "");
  text = text.replace(/^(www\.)?github\.com\//i, "");
  text = text.replace(/^@/, "");

  // Anything after owner/repo (/tree/main, ?tab=..., #readme) is dropped.
  const parts = text.split(/[?#]/)[0]!.split("/").filter((p) => p !== "");
  if (parts.length === 0) return { error: "Type a GitHub user or owner/repo." };

  const login = parts[0]!;
  if (!LOGIN.test(login)) return { error: `"${login}" isn't a valid GitHub username.` };
  if (RESERVED.includes(login.toLowerCase())) return { error: `"${login}" isn't a GitHub user.` };
  if (OPTED_OUT.includes(login.toLowerCase())) return { error: `${login} opted out of deeplarp.` };

  if (parts.length === 1) return { target: login };

  const repo = parts[1]!.replace(/\.git$/, "");
  if (!REPO.test(repo)) return { error: `"${repo}" isn't a valid repo name.` };
  return { target: `${login}/${repo}` };
}
