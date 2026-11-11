"use server";
// Admin → Homologação. Aprovar/reprovar/reverter: só o dono da plataforma.
import { redirect } from "next/navigation";
import { adminActor, requirePlatformOwner } from "@/lib/auth";
import { rateLimit } from "@/lib/security";
import { GithubError, HomologError, approve, openRevert, reject, saveHomologConfig } from "@/services/homolog";

const back = (kind: "ok" | "err", msg: string): never => redirect(`/admin/homologacao?${kind}=${encodeURIComponent(msg)}`);
const known = (e: unknown) => (e instanceof HomologError || e instanceof GithubError ? e.message : "Erro inesperado.");

export async function homologSaveAction(f: FormData) {
  await requirePlatformOwner();
  const checks = String(f.get("checks") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  let err = "";
  try {
    await saveHomologConfig({ repo: String(f.get("repo") ?? ""), token: String(f.get("token") ?? ""), requiredChecks: checks });
  } catch (e) {
    err = known(e);
  }
  if (err) back("err", err);
  back("ok", "Configuração salva ✓");
}

export async function approveAction(n: number, sha: string) {
  const a = await requirePlatformOwner();
  if (!(await rateLimit(`homolog:${a.id ?? "platform"}`, 20, 600))) back("err", "Muitas ações seguidas. Aguarde um pouco.");
  let err = "";
  try {
    await approve(n, sha, await adminActor());
  } catch (e) {
    err = known(e);
  }
  if (err) back("err", `#${n}: ${err}`);
  back("ok", `#${n} aprovado e publicado ✓ A Vercel publica a produção em alguns minutos.`);
}

export async function rejectAction(n: number, f: FormData) {
  await requirePlatformOwner();
  let err = "";
  try {
    await reject(n, String(f.get("reason") ?? ""), await adminActor());
  } catch (e) {
    err = known(e);
  }
  if (err) back("err", `#${n}: ${err}`);
  back("ok", `#${n}: ajustes pedidos ao autor ✓`);
}

export async function revertAction(n: number) {
  await requirePlatformOwner();
  let msg = "";
  let err = "";
  try {
    const rv = await openRevert(n, await adminActor());
    msg = `PR de reversão #${rv} aberto: aprove-o aqui para desfazer o #${n}.`;
  } catch (e) {
    err = known(e);
  }
  if (err) back("err", `#${n}: ${err}`);
  back("ok", msg);
}
