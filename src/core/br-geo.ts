// Geografia do Brasil para a busca de leads: todos os 5.570 municípios (pacote estados-cidades, dados do IBGE),
// capitais e grandes cidades (para começar por onde há mais negócios) e o catálogo de categorias.
import { cities as ufCities } from "estados-cidades";

export const UFS: { uf: string; name: string; capital: string }[] = [
  { uf: "AC", name: "Acre", capital: "Rio Branco" },
  { uf: "AL", name: "Alagoas", capital: "Maceió" },
  { uf: "AP", name: "Amapá", capital: "Macapá" },
  { uf: "AM", name: "Amazonas", capital: "Manaus" },
  { uf: "BA", name: "Bahia", capital: "Salvador" },
  { uf: "CE", name: "Ceará", capital: "Fortaleza" },
  { uf: "DF", name: "Distrito Federal", capital: "Brasília" },
  { uf: "ES", name: "Espírito Santo", capital: "Vitória" },
  { uf: "GO", name: "Goiás", capital: "Goiânia" },
  { uf: "MA", name: "Maranhão", capital: "São Luís" },
  { uf: "MT", name: "Mato Grosso", capital: "Cuiabá" },
  { uf: "MS", name: "Mato Grosso do Sul", capital: "Campo Grande" },
  { uf: "MG", name: "Minas Gerais", capital: "Belo Horizonte" },
  { uf: "PA", name: "Pará", capital: "Belém" },
  { uf: "PB", name: "Paraíba", capital: "João Pessoa" },
  { uf: "PR", name: "Paraná", capital: "Curitiba" },
  { uf: "PE", name: "Pernambuco", capital: "Recife" },
  { uf: "PI", name: "Piauí", capital: "Teresina" },
  { uf: "RJ", name: "Rio de Janeiro", capital: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte", capital: "Natal" },
  { uf: "RS", name: "Rio Grande do Sul", capital: "Porto Alegre" },
  { uf: "RO", name: "Rondônia", capital: "Porto Velho" },
  { uf: "RR", name: "Roraima", capital: "Boa Vista" },
  { uf: "SC", name: "Santa Catarina", capital: "Florianópolis" },
  { uf: "SP", name: "São Paulo", capital: "São Paulo" },
  { uf: "SE", name: "Sergipe", capital: "Aracaju" },
  { uf: "TO", name: "Tocantins", capital: "Palmas" },
];
export const UF_CODES = UFS.map((u) => u.uf);

/** Cidades grandes (aprox. 200 mil+ habitantes), fora as capitais — buscadas logo depois das capitais. */
export const BIG_CITIES: Record<string, string[]> = {
  AL: ["Arapiraca"],
  AP: ["Santana"],
  BA: ["Feira de Santana", "Vitória da Conquista", "Camaçari", "Juazeiro", "Itabuna", "Lauro de Freitas", "Ilhéus"],
  CE: ["Caucaia", "Juazeiro do Norte", "Maracanaú", "Sobral"],
  ES: ["Serra", "Vila Velha", "Cariacica", "Cachoeiro de Itapemirim"],
  GO: ["Aparecida de Goiânia", "Anápolis", "Rio Verde"],
  MA: ["Imperatriz", "São José de Ribamar", "Timon"],
  MT: ["Várzea Grande", "Rondonópolis", "Sinop"],
  MS: ["Dourados"],
  MG: ["Uberlândia", "Contagem", "Juiz de Fora", "Betim", "Montes Claros", "Ribeirão das Neves", "Uberaba", "Governador Valadares", "Ipatinga", "Sete Lagoas", "Divinópolis", "Santa Luzia"],
  PA: ["Ananindeua", "Santarém", "Marabá", "Parauapebas", "Castanhal"],
  PB: ["Campina Grande", "Santa Rita", "Patos", "Bayeux", "Cabedelo"],
  PR: ["Londrina", "Maringá", "Ponta Grossa", "Cascavel", "São José dos Pinhais", "Foz do Iguaçu", "Colombo", "Guarapuava"],
  PE: ["Jaboatão dos Guararapes", "Olinda", "Caruaru", "Petrolina", "Paulista", "Cabo de Santo Agostinho", "Camaragibe", "Garanhuns", "Vitória de Santo Antão", "Igarassu", "Abreu e Lima", "São Lourenço da Mata"],
  PI: ["Parnaíba"],
  RJ: ["São Gonçalo", "Duque de Caxias", "Nova Iguaçu", "Niterói", "Belford Roxo", "Campos dos Goytacazes", "São João de Meriti", "Petrópolis", "Volta Redonda", "Macaé", "Magé", "Itaboraí", "Cabo Frio", "Maricá", "Nova Friburgo"],
  RN: ["Mossoró", "Parnamirim", "São Gonçalo do Amarante"],
  RS: ["Caxias do Sul", "Canoas", "Pelotas", "Santa Maria", "Gravataí", "Viamão", "Novo Hamburgo", "São Leopoldo", "Rio Grande", "Alvorada", "Passo Fundo"],
  RO: ["Ji-Paraná"],
  SC: ["Joinville", "Blumenau", "São José", "Itajaí", "Chapecó", "Palhoça", "Criciúma", "Jaraguá do Sul", "Balneário Camboriú"],
  SP: [
    "Guarulhos", "Campinas", "São Bernardo do Campo", "Santo André", "Osasco", "São José dos Campos", "Ribeirão Preto", "Sorocaba", "Mauá", "São José do Rio Preto",
    "Mogi das Cruzes", "Santos", "Diadema", "Jundiaí", "Piracicaba", "Carapicuíba", "Bauru", "Itaquaquecetuba", "São Vicente", "Franca", "Praia Grande", "Guarujá",
    "Taubaté", "Limeira", "Suzano", "Taboão da Serra", "Sumaré", "Barueri", "Embu", "São Carlos", "Indaiatuba", "Cotia", "Americana", "Marília",
    "Itapevi", "Araraquara", "Jacareí", "Hortolândia", "Presidente Prudente", "Rio Claro",
  ],
  SE: ["Nossa Senhora do Socorro"],
  TO: ["Araguaína"],
};

export const cityLabel = (city: string, uf: string) => `${city} - ${uf}`;
export function parseCityLabel(label: string) {
  const m = label.trim().match(/^(.+?)\s*[-/]\s*([A-Za-z]{2})$/);
  return m ? { city: m[1].trim(), uf: m[2].toUpperCase() } : null;
}
export function citiesOf(uf: string): string[] {
  try {
    return ufCities(uf) ?? [];
  } catch {
    return [];
  }
}
export const TOTAL_CITIES = UF_CODES.reduce((s, u) => s + citiesOf(u).length, 0);

/** Confere se a cidade existe (aceita "Recife - PE" / "Recife/PE"); devolve o nome oficial. */
export function normalizeCity(label: string): string | null {
  const p = parseCityLabel(label);
  if (!p || !UF_CODES.includes(p.uf)) return null;
  const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const found = citiesOf(p.uf).find((c) => strip(c) === strip(p.city));
  return found ? cityLabel(found, p.uf) : null;
}

/**
 * Ordem de busca: 1) cidades prioritárias que você escolheu; 2) capitais; 3) grandes cidades;
 * 4) se "todas as cidades" estiver ligado, o resto dos municípios, alternando entre os estados.
 */
export function huntCityOrder(o: { priority: string[]; ufs: string[]; allCities: boolean }) {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (l: string | null) => {
    if (l && !seen.has(l)) {
      seen.add(l);
      out.push(l);
    }
  };
  o.priority.forEach((p) => push(normalizeCity(p)));
  const ufs = o.ufs.filter((u) => UF_CODES.includes(u));
  ufs.forEach((u) => push(cityLabel(UFS.find((x) => x.uf === u)!.capital, u)));
  ufs.forEach((u) => (BIG_CITIES[u] ?? []).forEach((c) => push(normalizeCity(cityLabel(c, u)))));
  if (o.allCities) {
    const lists = ufs.map((u) => citiesOf(u).map((c) => cityLabel(c, u)));
    const max = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) push(l[i]);
  }
  return out;
}

// ---------------------------------------------------------------- categorias
export const CATEGORY_GROUPS: { group: string; items: string[] }[] = [
  {
    group: "Alimentação",
    items: ["Restaurante", "Hamburgueria", "Pizzaria", "Lanchonete", "Açaiteria", "Sorveteria", "Marmitaria", "Padaria", "Confeitaria", "Doceria", "Cafeteria", "Pastelaria", "Tapiocaria", "Bar", "Distribuidora de bebidas", "Adega", "Comida japonesa", "Churrascaria", "Espetinho", "Food truck", "Comida saudável", "Hortifruti", "Açougue"],
  },
  { group: "Beleza", items: ["Barbearia", "Salão de beleza", "Esmalteria", "Clínica de estética", "Design de sobrancelhas e cílios", "Spa e massagem"] },
  { group: "Saúde", items: ["Clínica odontológica", "Clínica médica", "Fisioterapia", "Psicologia", "Nutricionista", "Ótica", "Farmácia de manipulação"] },
  { group: "Pet", items: ["Pet shop", "Banho e tosa", "Clínica veterinária"] },
  { group: "Fitness", items: ["Academia", "Estúdio de pilates", "Box de crossfit"] },
  { group: "Automotivo", items: ["Oficina mecânica", "Lava-jato", "Autopeças", "Borracharia", "Auto elétrica", "Estética automotiva"] },
  { group: "Varejo", items: ["Loja de roupas", "Loja de calçados", "Perfumaria e cosméticos", "Floricultura", "Papelaria", "Loja de celulares", "Material de construção", "Loja de móveis", "Loja de presentes", "Moda infantil", "Moda praia"] },
  { group: "Serviços", items: ["Imobiliária", "Corretor de imóveis", "Escritório de contabilidade", "Energia solar", "Escritório de advocacia", "Escola de idiomas", "Reforço escolar", "Autoescola", "Gráfica", "Estúdio de fotografia", "Buffet e eventos", "Lavanderia", "Assistência técnica", "Dedetização", "Chaveiro"] },
];
export const ALL_CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.items);

/** Junta categorias em grupos (uma busca no Gemini cobre várias categorias de uma vez). */
export function chunk<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
