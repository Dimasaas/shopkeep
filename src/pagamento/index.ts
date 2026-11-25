import type { Config } from "../config.js";
import { ProvedorFalso } from "./falso.js";
import type { ProvedorDePagamento } from "./provedor.js";

/** Escolhe o provedor pelo PAGAMENTO_PROVEDOR. Para um gateway real, adicione um `case` aqui. */
export function criarProvedor(config: Pick<Config, "pagamentoProvedor" | "pagamentoFalsoAutoSegundos">): ProvedorDePagamento {
  switch (config.pagamentoProvedor) {
    case "falso":
      return new ProvedorFalso(config.pagamentoFalsoAutoSegundos);
    default:
      throw new Error(`PAGAMENTO_PROVEDOR "${config.pagamentoProvedor}" desconhecido. Disponíveis: falso`);
  }
}

export * from "./provedor.js";
export { ProvedorFalso } from "./falso.js";
