// Central de Homologação — regras PURAS: situação de cada PR (testes, prévia, pode aprovar?),
// ambientes de teste por colaborador (branch teste/<nome>), assinatura do webhook do GitHub e reversão segura.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Checks que precisam estar verdes para aprovar. Projeto `menupy` (ligado ao mesmo repositório) fica de fora. */
export const DEFAULT_REQUIRED_CHECKS = ["Testes e tipos", "Vercel – atlas"];

export type CheckState = "ok" | "pending" | "failed" | "missing";
export type CheckInput = { name: string; state: "success" | "pending" | "failure" | "error" | "neutral" | "skipped" | "cancelled" | "in_progress" | "queued" | null };

/** GitHub mistura "statuses" (Vercel) e "check runs" (Actions). Normaliza para um estado por nome. */
export function normalizeChecks(statuses: { context: string; state: string }[], runs: { name: string; status: string; conclusion: string | null }[]): CheckInput[] {
  const out = new Map<string, CheckInput>();
  for (const s of statuses) if (!out.has(s.context)) out.set(s.context, { name: s.context, state: (s.state as CheckInput["state"]) ?? null });
  for (const r of runs) {
    const st = r.status !== "completed" ? "pending" : ((r.conclusion ?? "neutral") as CheckInput["state"]);
    if (!out.has(r.name)) out.set(r.name, { name: r.name, state: st });
  }
  return [...out.values()];
}

/** Estado dos checks exigidos: falhou > pendente > faltando > ok. */
export function checksState(checks: CheckInput[], required = DEFAULT_REQUIRED_CHECKS): { state: CheckState; detail: { name: string; state: CheckState }[] } {
  const detail = required.map((name) => {
    const c = checks.find((x) => x.name === name);
    const state: CheckState = !c ? "missing" : c.state === "success" || c.state === "neutral" || c.state === "skipped" ? "ok" : c.state === "failure" || c.state === "error" || c.state === "cancelled" ? "failed" : "pending";
    return { name, state };
  });
  const state: CheckState = detail.some((d) => d.state === "failed") ? "failed" : detail.some((d) => d.state === "pending") ? "pending" : detail.some((d) => d.state === "missing") ? "missing" : "ok";
  return { state, detail };
}

export type PrInfo = { draft: boolean; mergeable: boolean | null; state: "open" | "closed"; merged: boolean; base: string };

/** Pode aprovar e publicar? Só PR aberto, não rascunho, sem conflito, contra o main e com os checks verdes. */
export function approvalBlock(pr: PrInfo, checks: CheckState): string | null {
  if (pr.merged) return "Já publicado.";
  if (pr.state !== "open") return "PR fechado.";
  if (pr.base !== "main") return "Este PR não vai para o main.";
  if (pr.draft) return "Ainda é rascunho.";
  if (pr.mergeable === false) return "Tem conflito com o main: o autor precisa atualizar o branch.";
  if (checks === "failed") return "Testes ou build falharam.";
  if (checks === "pending") return "Testes e prévia ainda rodando.";
  if (checks === "missing") return "Faltam os testes ou a prévia deste PR.";
  return null;
}

// ---------------------------------------------------------------- ambientes por colaborador
/** Nome usado em /teste/<nome> e no branch teste/<nome>: minúsculas, letras/números/hífen. */
export function envName(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const envBranch = (name: string) => `teste/${envName(name)}`;

/** Branch teste/<nome> → nome (null se não for ambiente de colaborador). */
export function envOfBranch(branch: string) {
  const m = /^teste\/([a-z0-9-]{1,40})$/.exec(branch);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- webhook do GitHub
export function githubSignatureOk(rawBody: string, header: string | null, secret: string) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const exp = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7), "hex");
  const b = Buffer.from(exp, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type GhNotice = { title: string; body: string } | null;

/** Quais eventos do GitHub viram aviso para os sócios. */
export function noticeFor(event: string, p: Record<string, unknown>): GhNotice {
  const pr = p.pull_request as { number?: number; title?: string; user?: { login?: string }; merged?: boolean; draft?: boolean } | undefined;
  if (event === "pull_request" && pr?.number) {
    const who = pr.user?.login ?? "alguém";
    if (p.action === "opened" || p.action === "ready_for_review") return pr.draft ? null : { title: `Mudança nova para aprovar: #${pr.number}`, body: `${pr.title ?? ""} — por ${who}` };
    if (p.action === "closed" && pr.merged) return { title: `Publicado: #${pr.number}`, body: pr.title ?? "" };
    return null;
  }
  const cs = p.check_suite as { conclusion?: string | null; pull_requests?: { number?: number }[]; app?: { slug?: string } } | undefined;
  if (event === "check_suite" && p.action === "completed" && cs?.pull_requests?.length && cs.app?.slug === "github-actions") {
    const n = cs.pull_requests[0].number;
    return cs.conclusion === "success" ? { title: `Testes passaram: #${n}`, body: "Pronto para conferir a prévia e aprovar." } : { title: `Testes falharam: #${n}`, body: "O autor precisa corrigir antes da aprovação." };
  }
  return null;
}

// ---------------------------------------------------------------- reversão
/**
 * Reverter um merge com segurança: só quando ele ainda é o último commit do main (senão desfaria mudanças
 * posteriores). O commit de reversão usa a árvore do 1º pai do merge (= main antes do merge) e vira um PR
 * que passa pela mesma aprovação.
 */
export function revertPlan(mergeSha: string, mainHead: string, mergeParents: string[]): { ok: true; treeFrom: string } | { ok: false; reason: string } {
  if (mergeParents.length < 2) return { ok: false, reason: "Esse commit não é um merge de PR." };
  if (mergeSha !== mainHead) return { ok: false, reason: "Já entraram outras mudanças depois desta: reverta pelo GitHub (botão Revert no PR) ou use o rollback da Vercel." };
  return { ok: true, treeFrom: mergeParents[0] };
}
