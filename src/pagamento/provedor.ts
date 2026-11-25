// Contrato de pagamento. Para usar um gateway real (PIX, cartão, cripto...), implemente esta interface
// e registre em `criarProvedor` (src/pagamento/index.ts). O resto do bot não muda.

export type StatusPagamento = "pendente" | "pago" | "expirado" | "cancelado";

export interface NovaCobranca {
  pedidoId: string;
  descricao: string;
  valorCentavos: number;
}

export interface Cobranca {
  /** ID da cobrança no provedor. */
  id: string;
  /** Texto para o cliente pagar: código "copia e cola", link de checkout etc. */
  codigo: string;
  valorCentavos: number;
  expiraEm: Date;
}

export type AoPagar = (cobrancaId: string) => void | Promise<void>;

export interface ProvedorDePagamento {
  readonly nome: string;
  criarCobranca(nova: NovaCobranca): Promise<Cobranca>;
  /** Consulta direta (botão "Já paguei"). */
  consultar(cobrancaId: string): Promise<StatusPagamento>;
  cancelar(cobrancaId: string): Promise<void>;
  /**
   * Registra o ouvinte chamado quando um pagamento é confirmado.
   * Num gateway real, é aqui que o webhook entra: valide a assinatura e chame o ouvinte.
   */
  aoPagar(ouvinte: AoPagar): void;
}

/** Provedores que permitem simular a confirmação (só desenvolvimento). */
export interface ProvedorSimulavel extends ProvedorDePagamento {
  confirmar(cobrancaId: string): Promise<boolean>;
}

export const ehSimulavel = (p: ProvedorDePagamento): p is ProvedorSimulavel => typeof (p as ProvedorSimulavel).confirmar === "function";
