import { randomUUID } from "node:crypto";

export type StatusPedido = "aguardando" | "pago" | "entregue" | "cancelado";

export interface Pedido {
  id: string;
  produtoId: string;
  usuarioId: string;
  canalId: string;
  cobrancaId: string;
  status: StatusPedido;
  criadoEm: Date;
}

/** Onde os pedidos ficam. A versão em memória serve ao template; troque por banco implementando esta interface. */
export interface RepositorioDePedidos {
  criar(dados: Omit<Pedido, "id" | "criadoEm" | "status">): Promise<Pedido>;
  obter(id: string): Promise<Pedido | undefined>;
  porCanal(canalId: string): Promise<Pedido | undefined>;
  porCobranca(cobrancaId: string): Promise<Pedido | undefined>;
  /** Pedido ainda em andamento do usuário (evita abrir um ticket por clique). */
  emAbertoDoUsuario(usuarioId: string): Promise<Pedido | undefined>;
  atualizar(id: string, parcial: Partial<Pick<Pedido, "status" | "canalId" | "cobrancaId">>): Promise<Pedido | undefined>;
}

export class PedidosEmMemoria implements RepositorioDePedidos {
  private mapa = new Map<string, Pedido>();

  async criar(dados: Omit<Pedido, "id" | "criadoEm" | "status">) {
    const p: Pedido = { ...dados, id: randomUUID().slice(0, 8), criadoEm: new Date(), status: "aguardando" };
    this.mapa.set(p.id, p);
    return p;
  }
  async obter(id: string) {
    return this.mapa.get(id);
  }
  private achar(f: (p: Pedido) => boolean) {
    return [...this.mapa.values()].find(f);
  }
  async porCanal(canalId: string) {
    return this.achar((p) => p.canalId === canalId);
  }
  async porCobranca(cobrancaId: string) {
    return this.achar((p) => p.cobrancaId === cobrancaId);
  }
  async emAbertoDoUsuario(usuarioId: string) {
    return this.achar((p) => p.usuarioId === usuarioId && (p.status === "aguardando" || p.status === "pago"));
  }
  async atualizar(id: string, parcial: Partial<Pick<Pedido, "status" | "canalId" | "cobrancaId">>) {
    const p = this.mapa.get(id);
    if (p) Object.assign(p, parcial);
    return p;
  }
}
