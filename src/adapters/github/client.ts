// =============================================================================
// GitHub REST — Central de Homologação (PRs, checks, prévias, aprovar/publicar, reversão).
// Token do dono do repositório (fine-grained: Contents, Pull requests = leitura e escrita;
// Commit statuses, Checks, Deployments = leitura), salvo criptografado em Admin → Homologação.
// GITHUB_API_BASE (env) só para testes.
// =============================================================================
const API = () => (process.env.GITHUB_API_BASE ?? "https://api.github.com").replace(/\/$/, "");

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export type Gh = { repo: string; token: string };

async function gh<T>(c: Gh, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API()}/repos/${c.repo}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${c.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "GoWeb-Homologacao", ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GithubError("GitHub fora do ar ou sem conexão.");
  }
  const text = await res.text();
  let j: unknown = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const msg = (j as { message?: string } | null)?.message ?? String(res.status);
    if (res.status === 401) throw new GithubError("Token do GitHub inválido ou vencido.", 401);
    if (res.status === 403 || res.status === 404) throw new GithubError(`GitHub recusou (${res.status}): ${msg}. Confira as permissões do token.`, res.status);
    throw new GithubError(`GitHub: ${msg}`, res.status);
  }
  return j as T;
}

export type GhPull = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  draft: boolean;
  state: "open" | "closed";
  merged: boolean;
  mergeable: boolean | null;
  merge_commit_sha: string | null;
  user: { login: string } | null;
  head: { ref: string; sha: string };
  base: { ref: string };
  created_at: string;
  updated_at: string;
};

export const ghOpenPulls = (c: Gh) => gh<GhPull[]>(c, `/pulls?state=open&base=main&per_page=30&sort=updated&direction=desc`);
export const ghPull = (c: Gh, n: number) => gh<GhPull>(c, `/pulls/${n}`);
export const ghRecentClosed = (c: Gh) => gh<GhPull[]>(c, `/pulls?state=closed&base=main&per_page=15&sort=updated&direction=desc`);

export async function ghChecks(c: Gh, sha: string) {
  const [st, runs] = await Promise.all([
    gh<{ statuses: { context: string; state: string; target_url: string | null }[] }>(c, `/commits/${sha}/status`),
    gh<{ check_runs: { name: string; status: string; conclusion: string | null }[] }>(c, `/commits/${sha}/check-runs?per_page=50`),
  ]);
  return { statuses: st.statuses ?? [], runs: runs.check_runs ?? [] };
}

/** URL da prévia (Vercel) de um commit ou branch, pelas "deployments" que a Vercel registra no GitHub. */
export async function ghPreviewUrl(c: Gh, by: { sha?: string; ref?: string }) {
  const q = by.sha ? `sha=${by.sha}` : `ref=${encodeURIComponent(by.ref ?? "")}`;
  const deps = await gh<{ id: number; environment: string }[]>(c, `/deployments?${q}&per_page=10`);
  for (const d of deps.filter((x) => /preview/i.test(x.environment))) {
    const sts = await gh<{ state: string; environment_url?: string; target_url?: string }[]>(c, `/deployments/${d.id}/statuses?per_page=5`);
    const ok = sts.find((s) => s.state === "success" && (s.environment_url || s.target_url));
    if (ok) return ok.environment_url || ok.target_url || null;
  }
  return null;
}

export const ghReview = (c: Gh, n: number, event: "APPROVE" | "REQUEST_CHANGES", body: string) => gh(c, `/pulls/${n}/reviews`, { method: "POST", body: { event, body } });
export const ghMerge = (c: Gh, n: number, sha: string, title: string) => gh<{ sha: string; merged: boolean }>(c, `/pulls/${n}/merge`, { method: "PUT", body: { merge_method: "merge", sha, commit_title: title } });
export const ghCommit = (c: Gh, sha: string) => gh<{ sha: string; tree: { sha: string }; parents: { sha: string }[] }>(c, `/git/commits/${sha}`);
export const ghBranchHead = (c: Gh, branch: string) => gh<{ object: { sha: string } }>(c, `/git/ref/heads/${encodeURIComponent(branch)}`).then((r) => r.object.sha);
export const ghCreateCommit = (c: Gh, message: string, tree: string, parents: string[]) => gh<{ sha: string }>(c, `/git/commits`, { method: "POST", body: { message, tree, parents } });
export const ghCreateBranch = (c: Gh, branch: string, sha: string) => gh(c, `/git/refs`, { method: "POST", body: { ref: `refs/heads/${branch}`, sha } });
export const ghCreatePull = (c: Gh, title: string, head: string, body: string) => gh<GhPull>(c, `/pulls`, { method: "POST", body: { title, head, base: "main", body } });
export const ghBranches = (c: Gh) => gh<{ name: string; commit: { sha: string } }[]>(c, `/branches?per_page=100`);
export const ghCollaborators = (c: Gh) => gh<{ login: string; role_name?: string }[]>(c, `/collaborators?per_page=100`);
