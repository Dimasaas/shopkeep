// custom_ids dos componentes. O estado da conversa viaja no próprio id (nada fica em memória só para isso).

export const IDS = {
  selectProduto: "loja:produto",
  comprar: (produtoId: string) => `loja:comprar:${produtoId}`,
  jaPaguei: (pedidoId: string) => `loja:paguei:${pedidoId}`,
  cancelar: (pedidoId: string) => `loja:cancelar:${pedidoId}`,
} as const;

export interface IdAnalisado {
  acao: "produto" | "comprar" | "paguei" | "cancelar";
  valor?: string;
}

export function analisarId(customId: string): IdAnalisado | null {
  const [ns, acao, valor] = customId.split(":");
  if (ns !== "loja") return null;
  if (acao === "produto") return { acao };
  if ((acao === "comprar" || acao === "paguei" || acao === "cancelar") && valor) return { acao, valor };
  return null;
}
