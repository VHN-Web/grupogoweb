import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { approvalBlock, checksState, envBranch, envName, envOfBranch, githubSignatureOk, normalizeChecks, noticeFor, revertPlan } from "./homolog";

const open = { draft: false, mergeable: true, state: "open" as const, merged: false, base: "main" };

describe("homologação: checks e aprovação", () => {
  const checks = normalizeChecks(
    [{ context: "Vercel – atlas", state: "success" }, { context: "Vercel – menupy", state: "failure" }],
    [{ name: "Testes e tipos", status: "completed", conclusion: "success" }, { name: "apk", status: "in_progress", conclusion: null }],
  );
  it("só os checks exigidos contam (menupy e apk ficam de fora)", () => {
    expect(checksState(checks).state).toBe("ok");
    expect(checksState(normalizeChecks([{ context: "Vercel – atlas", state: "pending" }], [{ name: "Testes e tipos", status: "completed", conclusion: "success" }])).state).toBe("pending");
    expect(checksState(normalizeChecks([{ context: "Vercel – atlas", state: "success" }], [{ name: "Testes e tipos", status: "completed", conclusion: "failure" }])).state).toBe("failed");
    expect(checksState(normalizeChecks([{ context: "Vercel – atlas", state: "success" }], [])).state).toBe("missing");
  });
  it("bloqueios de aprovação", () => {
    expect(approvalBlock(open, "ok")).toBeNull();
    expect(approvalBlock({ ...open, draft: true }, "ok")).toBe("Ainda é rascunho.");
    expect(approvalBlock({ ...open, mergeable: false }, "ok")).toMatch(/conflito/);
    expect(approvalBlock({ ...open, mergeable: null }, "ok")).toBeNull();
    expect(approvalBlock(open, "failed")).toMatch(/falharam/);
    expect(approvalBlock(open, "pending")).toMatch(/rodando/);
    expect(approvalBlock({ ...open, base: "dev" }, "ok")).toMatch(/main/);
    expect(approvalBlock({ ...open, merged: true, state: "closed" }, "ok")).toBe("Já publicado.");
  });
});

describe("homologação: ambientes por colaborador", () => {
  it("nome e branch", () => {
    expect(envName("André Maia")).toBe("andre-maia");
    expect(envBranch("Lázaro")).toBe("teste/lazaro");
    expect(envOfBranch("teste/andre")).toBe("andre");
    expect(envOfBranch("instagram")).toBeNull();
    expect(envOfBranch("teste/a/b")).toBeNull();
  });
});

describe("homologação: webhook do GitHub", () => {
  it("assinatura", () => {
    const body = '{"action":"opened"}';
    const sig = `sha256=${createHmac("sha256", "s3").update(body).digest("hex")}`;
    expect(githubSignatureOk(body, sig, "s3")).toBe(true);
    expect(githubSignatureOk(body, sig, "")).toBe(false);
    expect(githubSignatureOk(body, "sha256=00", "s3")).toBe(false);
  });
  it("avisos", () => {
    expect(noticeFor("pull_request", { action: "opened", pull_request: { number: 12, title: "Instagram", user: { login: "dev" } } })).toEqual({ title: "Mudança nova para aprovar: #12", body: "Instagram — por dev" });
    expect(noticeFor("pull_request", { action: "opened", pull_request: { number: 12, draft: true } })).toBeNull();
    expect(noticeFor("pull_request", { action: "closed", pull_request: { number: 12, merged: true, title: "X" } })?.title).toBe("Publicado: #12");
    expect(noticeFor("pull_request", { action: "closed", pull_request: { number: 12, merged: false } })).toBeNull();
    expect(noticeFor("check_suite", { action: "completed", check_suite: { conclusion: "failure", pull_requests: [{ number: 9 }], app: { slug: "github-actions" } } })?.title).toBe("Testes falharam: #9");
    expect(noticeFor("check_suite", { action: "completed", check_suite: { conclusion: "success", pull_requests: [{ number: 9 }], app: { slug: "vercel" } } })).toBeNull();
  });
});

describe("homologação: reversão segura", () => {
  it("só reverte o último merge do main", () => {
    expect(revertPlan("m1", "m1", ["p1", "p2"])).toEqual({ ok: true, treeFrom: "p1" });
    expect(revertPlan("m1", "m2", ["p1", "p2"]).ok).toBe(false);
    expect(revertPlan("m1", "m1", ["p1"]).ok).toBe(false);
  });
});
