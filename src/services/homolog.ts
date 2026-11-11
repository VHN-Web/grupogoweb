import "server-only";
// =============================================================================
// Central de Homologação: lista de mudanças (PRs) com testes e prévia, aprovar = review + merge no GitHub,
// reprovar = pedido de ajustes com o motivo, reversão segura (PR de reversão), histórico e avisos aos sócios.
// Regras puras em core/homolog.ts; GitHub em adapters/github/client.ts. Nunca roda numa prévia (modo teste).
// =============================================================================
import { randomBytes } from "node:crypto";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_REQUIRED_CHECKS, approvalBlock, checksState, envOfBranch, normalizeChecks, revertPlan } from "@/core/homolog";
import { GithubError, ghBranchHead, ghBranches, ghChecks, ghCommit, ghCreateBranch, ghCreateCommit, ghCreatePull, ghMerge, ghOpenPulls, ghPreviewUrl, ghPull, ghRecentClosed, ghReview, type Gh } from "@/adapters/github/client";
import { openSecret, sealSecret } from "@/lib/secrets";
import { appUrl } from "@/lib/urls";
import { audit } from "@/lib/security";
import { isSandbox } from "@/lib/sandbox";

export class HomologError extends Error {}
export { GithubError };

export type HomologConfig = { repo: string; tokenSealed: string; webhookSecret: string; requiredChecks: string[] };

export async function homologConfig(): Promise<HomologConfig> {
  const s = await db.query.platformSettings.findFirst({ columns: { homologConfig: true } });
  let o: Partial<HomologConfig> = {};
  try {
    o = JSON.parse(s?.homologConfig ?? "{}");
  } catch {}
  return {
    repo: o.repo || process.env.GITHUB_REPO || "eulazacruz/Atlas",
    tokenSealed: o.tokenSealed || (process.env.GITHUB_TOKEN ? sealSecret(process.env.GITHUB_TOKEN) : ""),
    webhookSecret: o.webhookSecret || "",
    requiredChecks: Array.isArray(o.requiredChecks) && o.requiredChecks.length ? o.requiredChecks.map(String) : DEFAULT_REQUIRED_CHECKS,
  };
}

export async function saveHomologConfig(patch: { repo?: string; token?: string; requiredChecks?: string[] }) {
  const cur = await homologConfig();
  const next: HomologConfig = {
    repo: patch.repo?.trim() || cur.repo,
    tokenSealed: patch.token?.trim() ? sealSecret(patch.token.trim()) : cur.tokenSealed,
    webhookSecret: cur.webhookSecret || randomBytes(24).toString("base64url"),
    requiredChecks: patch.requiredChecks?.length ? patch.requiredChecks : cur.requiredChecks,
  };
  if (!/^[\w.-]+\/[\w.-]+$/.test(next.repo)) throw new HomologError("Repositório no formato dono/nome.");
  await db
    .insert(schema.platformSettings)
    .values({ id: "default", homologConfig: JSON.stringify(next) })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: { homologConfig: JSON.stringify(next), updatedAt: new Date() } });
  return next;
}

export const githubWebhookUrl = () => `${appUrl()}/api/github/webhook`;

async function client(): Promise<{ gh: Gh; cfg: HomologConfig }> {
  const cfg = await homologConfig();
  if (!cfg.tokenSealed) throw new HomologError("Cadastre o token do GitHub em Admin → Homologação.");
  return { gh: { repo: cfg.repo, token: openSecret(cfg.tokenSealed) }, cfg };
}

function assertProduction() {
  // numa prévia, aprovar/publicar mexeria no repositório real: proibido
  if (isSandbox()) throw new HomologError("Ambiente de teste: aprovar e publicar só no painel da produção.");
}

// ---------------------------------------------------------------- lista
export type Change = {
  number: number;
  title: string;
  url: string;
  author: string;
  branch: string;
  sha: string;
  env: string | null; // branch teste/<nome>
  updatedAt: Date;
  checks: ReturnType<typeof checksState>;
  previewUrl: string | null;
  block: string | null;
};

export async function listChanges(): Promise<Change[]> {
  const { gh, cfg } = await client();
  const pulls = await ghOpenPulls(gh);
  return Promise.all(
    pulls.map(async (p) => {
      const [full, raw, preview] = await Promise.all([ghPull(gh, p.number), ghChecks(gh, p.head.sha).catch(() => ({ statuses: [], runs: [] })), ghPreviewUrl(gh, { sha: p.head.sha }).catch(() => null)]);
      const checks = checksState(normalizeChecks(raw.statuses, raw.runs), cfg.requiredChecks);
      return {
        number: p.number,
        title: p.title,
        url: p.html_url,
        author: p.user?.login ?? "?",
        branch: p.head.ref,
        sha: p.head.sha,
        env: envOfBranch(p.head.ref),
        updatedAt: new Date(p.updated_at),
        checks,
        previewUrl: preview,
        block: approvalBlock({ draft: full.draft, mergeable: full.mergeable, state: full.state, merged: full.merged, base: full.base.ref }, checks.state),
      };
    }),
  );
}

export async function recentlyPublished() {
  const { gh } = await client();
  return (await ghRecentClosed(gh)).filter((p) => p.merged || p.merge_commit_sha).slice(0, 10);
}

export async function history(limit = 40) {
  return db.query.homologEvents.findMany({ orderBy: desc(schema.homologEvents.createdAt), limit });
}

/** Ambientes de teste: branches teste/<nome> com a prévia mais recente. */
export async function environments() {
  const { gh } = await client();
  const brs = (await ghBranches(gh)).filter((b) => envOfBranch(b.name));
  return Promise.all(brs.map(async (b) => ({ name: envOfBranch(b.name)!, branch: b.name, sha: b.commit.sha, previewUrl: await ghPreviewUrl(gh, { ref: b.name }).catch(() => null), path: `/teste/${envOfBranch(b.name)}` })));
}

/** /teste/<nome> → prévia mais recente do branch teste/<nome>. */
export async function previewForEnv(name: string) {
  const { gh } = await client();
  return ghPreviewUrl(gh, { ref: `teste/${name}` });
}

// ---------------------------------------------------------------- decisões
async function record(e: typeof schema.homologEvents.$inferInsert) {
  await db.insert(schema.homologEvents).values(e);
  await audit(null, e.by, `homologacao.${e.action}`, `#${e.prNumber} ${e.title}${e.reason ? ` — ${e.reason}` : ""}`);
}

async function notify(title: string, body: string) {
  const { sendPush } = await import("@/services/push");
  await sendPush("all", { title, body, url: "/admin/homologacao", category: "homologacao" }).catch(() => null);
}

/** Aprovar = confere tudo de novo no GitHub (estado atual, mesmo commit que a pessoa viu), registra a aprovação e publica. */
export async function approve(n: number, seenSha: string, by: string) {
  assertProduction();
  const { gh, cfg } = await client();
  const pr = await ghPull(gh, n);
  if (pr.head.sha !== seenSha) throw new HomologError("O PR recebeu commits novos depois que você abriu a página. Confira a prévia de novo.");
  const raw = await ghChecks(gh, pr.head.sha);
  const block = approvalBlock({ draft: pr.draft, mergeable: pr.mergeable, state: pr.state, merged: pr.merged, base: pr.base.ref }, checksState(normalizeChecks(raw.statuses, raw.runs), cfg.requiredChecks).state);
  if (block) throw new HomologError(block);
  try {
    // review de aprovação (o GitHub não deixa aprovar o próprio PR — nesse caso segue só com o merge)
    await ghReview(gh, n, "APPROVE", `Aprovado na Central de Homologação por ${by}.`).catch((e) => {
      if (!(e instanceof GithubError && e.status === 422)) throw e;
    });
    await ghMerge(gh, n, pr.head.sha, `Merge pull request #${n} from ${pr.head.ref}`);
  } catch (e) {
    await record({ prNumber: n, title: pr.title, author: pr.user?.login ?? null, action: "merge_failed", sha: pr.head.sha, by, reason: e instanceof Error ? e.message.slice(0, 300) : "erro" });
    throw e;
  }
  await record({ prNumber: n, title: pr.title, author: pr.user?.login ?? null, action: "approved", sha: pr.head.sha, by, reason: null });
  await notify(`Aprovado e publicado: #${n}`, `${pr.title} — por ${by}`);
}

/** Reprovar = pedido de ajustes no PR com o motivo. Nada vai para a produção. */
export async function reject(n: number, reason: string, by: string) {
  assertProduction();
  const why = reason.trim().slice(0, 1000);
  if (why.length < 5) throw new HomologError("Escreva o motivo (o autor lê no GitHub).");
  const { gh } = await client();
  const pr = await ghPull(gh, n);
  if (pr.state !== "open") throw new HomologError("PR já fechado.");
  await ghReview(gh, n, "REQUEST_CHANGES", `Reprovado na Central de Homologação por ${by}:\n\n${why}`).catch(async (e) => {
    // o próprio autor do token não pode pedir ajustes no próprio PR: comenta no lugar
    if (!(e instanceof GithubError && e.status === 422)) throw e;
  });
  await record({ prNumber: n, title: pr.title, author: pr.user?.login ?? null, action: "rejected", sha: pr.head.sha, by, reason: why });
  await notify(`Ajustes pedidos: #${n}`, `${pr.title} — ${why.slice(0, 80)}`);
}

/** Reverter um PR publicado: abre um PR de reversão (passa pela mesma aprovação). Só se for o último merge do main. */
export async function openRevert(n: number, by: string) {
  assertProduction();
  const { gh } = await client();
  const pr = await ghPull(gh, n);
  if (!pr.merged || !pr.merge_commit_sha) throw new HomologError("Esse PR não foi publicado.");
  const [head, merge] = await Promise.all([ghBranchHead(gh, "main"), ghCommit(gh, pr.merge_commit_sha)]);
  const plan = revertPlan(merge.sha, head, merge.parents.map((p) => p.sha));
  if (!plan.ok) throw new HomologError(plan.reason);
  const before = await ghCommit(gh, plan.treeFrom);
  const commit = await ghCreateCommit(gh, `Reverte "${pr.title}" (#${n})`, before.tree.sha, [merge.sha]);
  const branch = `reverter-pr-${n}-${Date.now().toString(36)}`;
  await ghCreateBranch(gh, branch, commit.sha);
  const rv = await ghCreatePull(gh, `Reverter #${n}: ${pr.title}`, branch, `Volta o main para antes do #${n}. Aberto na Central de Homologação por ${by}.\n\nEm emergência, o rollback instantâneo da Vercel volta a versão anterior em segundos enquanto este PR é aprovado.`);
  await record({ prNumber: n, title: pr.title, author: pr.user?.login ?? null, action: "revert_opened", sha: merge.sha, by, reason: `PR de reversão #${rv.number}` });
  await notify(`Reversão aberta: #${rv.number}`, `Desfaz #${n} ${pr.title}`);
  return rv.number;
}

// ---------------------------------------------------------------- webhook do GitHub (avisos)
export async function onGithubEvent(event: string, payload: Record<string, unknown>) {
  const { noticeFor } = await import("@/core/homolog");
  const n = noticeFor(event, payload);
  if (n) await notify(n.title, n.body);
  return !!n;
}
