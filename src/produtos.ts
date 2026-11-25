import { readFileSync } from "node:fs";

export interface Produto {
  id: string;
  nome: string;
  descricao: string;
  precoCentavos: number;
  emoji?: string;
}

export interface Catalogo {
  moeda: string;
  produtos: Produto[];
}

/** O Discord aceita no máximo 25 opções num select. */
export const MAX_OPCOES = 25;

export function formatarPreco(centavos: number, moeda = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(centavos / 100);
}

/** Valida o formato do catálogo e devolve erro legível em vez de falhar adiante. */
export function validarCatalogo(bruto: unknown): Catalogo {
  const o = bruto as Partial<Catalogo> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.produtos)) throw new Error("produtos.json: faltou a lista \"produtos\"");
  if (o.produtos.length === 0) throw new Error("produtos.json: a lista de produtos está vazia");
  if (o.produtos.length > MAX_OPCOES) throw new Error(`produtos.json: no máximo ${MAX_OPCOES} produtos (limite do select do Discord)`);
  const ids = new Set<string>();
  for (const p of o.produtos) {
    if (!p || typeof p.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(p.id)) throw new Error(`produtos.json: id inválido (${JSON.stringify(p?.id)}); use a-z, 0-9 e hífen`);
    if (ids.has(p.id)) throw new Error(`produtos.json: id repetido "${p.id}"`);
    ids.add(p.id);
    if (typeof p.nome !== "string" || !p.nome.trim()) throw new Error(`produtos.json: "${p.id}" sem nome`);
    if (!Number.isInteger(p.precoCentavos) || p.precoCentavos <= 0) throw new Error(`produtos.json: "${p.id}" precisa de precoCentavos inteiro e positivo`);
  }
  return { moeda: o.moeda ?? "BRL", produtos: o.produtos.map((p) => ({ ...p, descricao: p.descricao ?? "" })) };
}

export function carregarCatalogo(caminho = new URL("../config/produtos.json", import.meta.url)): Catalogo {
  return validarCatalogo(JSON.parse(readFileSync(caminho, "utf8")));
}
