import { redirect } from "next/navigation";
import { envName } from "@/core/homolog";
import { previewForEnv } from "@/services/homolog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ambiente de teste — GoWeb", robots: { index: false } };

/** /teste/<colaborador> → prévia mais recente do branch teste/<colaborador> (Vercel). Nada de produção roda aqui. */
export default async function TesteRedirect({ params }: { params: Promise<{ nome: string }> }) {
  const nome = envName(decodeURIComponent((await params).nome));
  const url = nome ? await previewForEnv(nome).catch(() => null) : null;
  if (url && /^https:\/\//.test(url)) redirect(url);
  return (
    <main className="mx-auto max-w-lg p-8 text-sm">
      <h1 className="text-xl font-bold">Ambiente de teste: {nome || "?"}</h1>
      <p className="mt-3">Ainda não há prévia publicada para o branch <code>teste/{nome}</code>.</p>
      <p className="mt-2 text-muted">Envie um commit para esse branch no GitHub: a Vercel gera a prévia (com banco de teste e modo teste ligado) e este endereço passa a abrir direto nela.</p>
    </main>
  );
}
