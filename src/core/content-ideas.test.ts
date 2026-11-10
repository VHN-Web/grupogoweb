import { describe, expect, it } from "vitest";
import { anonymize, parseContentIdeas } from "./content-ideas";

describe("ideias de conteúdo", () => {
  it("tira telefone, e-mail e link das perguntas", () => {
    expect(anonymize("me chama no 81 99999-0000 ou ze@x.com, vi em https://a.com quanto custa?")).toBe("me chama no [telefone] ou [email], vi em [link] quanto custa?");
  });
  it("lê o JSON da IA e descarta itens vazios", () => {
    const raw = '```json\n{"posts":[{"titulo":"Sem comissão","legenda":"Venda direto","formato":"carrossel"},{"titulo":""}],"reels":[{"gancho":"Você paga 27%?","cenas":["a","b"],"cta":"Link na bio"}],"faq":["Quanto custa?"]}\n```';
    const r = parseContentIdeas(raw, 5, new Date("2026-11-10T12:00:00Z"))!;
    expect(r.posts).toHaveLength(1);
    expect(r.reels[0].scenes).toEqual(["a", "b"]);
    expect(r.faq).toEqual(["Quanto custa?"]);
    expect(parseContentIdeas("nada", 0, new Date())).toBeNull();
  });
});
