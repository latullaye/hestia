// Asking GitHub to draw the TV poster now (.github/workflows/poster.yml), instead of waiting for its next half hour:
// when someone says they are on their way home, the TV shows it at once. Needs two secrets: GITHUB_POSTER_TOKEN (a
// fine-grained token for the repository, "Actions: read and write" only) and GITHUB_POSTER_REPO ("owner/name").
// Without them, nothing happens: the poster still follows every 30 minutes.
type Env = (name: string) => string | undefined;

export async function drawPosterNow(env: Env, fetcher: typeof fetch = fetch): Promise<boolean> {
  const token = env("GITHUB_POSTER_TOKEN"), repo = env("GITHUB_POSTER_REPO");
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return false;
  const r = await fetcher(`https://api.github.com/repos/${repo}/actions/workflows/poster.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "hestia" },
    body: JSON.stringify({ ref: "main" }),
  }).catch(() => null);
  return !!r?.ok;
}
