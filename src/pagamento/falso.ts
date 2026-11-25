import { randomUUID } from "node:crypto";
import type { AoPagar, Cobranca, NovaCobranca, ProvedorSimulavel, StatusPagamento } from "./provedor.js";

const VALIDADE_MS = 15 * 60_000;

/**
 * Provedor FALSO para desenvolvimento: nada de dinheiro de verdade.
 * Confirma pelo comando /confirmar ou, se autoConfirmarSegundos > 0, sozinho depois desse tempo.
 */
export class ProvedorFalso implements ProvedorSimulavel {
  readonly nome = "falso";
  private cobrancas = new Map<string, { status: StatusPagamento; expiraEm: Date }>();
  private ouvintes: AoPagar[] = [];

  constructor(private autoConfirmarSegundos = 0) {}

  async criarCobranca(nova: NovaCobranca): Promise<Cobranca> {
    const id = `falso_${randomUUID()}`;
    const expiraEm = new Date(Date.now() + VALIDADE_MS);
    this.cobrancas.set(id, { status: "pendente", expiraEm });
    if (this.autoConfirmarSegundos > 0) {
      setTimeout(() => void this.confirmar(id), this.autoConfirmarSegundos * 1000).unref();
    }
    return { id, codigo: `PAGAMENTO-FALSO-${id.slice(6, 14).toUpperCase()}-${nova.valorCentavos}`, valorCentavos: nova.valorCentavos, expiraEm };
  }

  async consultar(cobrancaId: string): Promise<StatusPagamento> {
    const c = this.cobrancas.get(cobrancaId);
    if (!c) return "cancelado";
    if (c.status === "pendente" && c.expiraEm.getTime() < Date.now()) c.status = "expirado";
    return c.status;
  }

  async cancelar(cobrancaId: string): Promise<void> {
    const c = this.cobrancas.get(cobrancaId);
    if (c && c.status === "pendente") c.status = "cancelado";
  }

  aoPagar(ouvinte: AoPagar): void {
    this.ouvintes.push(ouvinte);
  }

  /** Marca como paga e avisa os ouvintes. Devolve false se não estava pendente (idempotente). */
  async confirmar(cobrancaId: string): Promise<boolean> {
    if ((await this.consultar(cobrancaId)) !== "pendente") return false;
    this.cobrancas.get(cobrancaId)!.status = "pago";
    for (const o of this.ouvintes) await o(cobrancaId);
    return true;
  }
}
