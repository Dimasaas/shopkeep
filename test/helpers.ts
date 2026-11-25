import { vi } from "vitest";
import type { Deps } from "../src/handlers.js";
import { ProvedorFalso } from "../src/pagamento/falso.js";
import { PedidosEmMemoria } from "../src/pedidos.js";
import { carregarCatalogo } from "../src/produtos.js";

export const IDS_TESTE = {
  guild: "100000000000000001",
  categoria: "100000000000000002",
  painel: "100000000000000003",
  equipe: "100000000000000004",
  cliente: "100000000000000005",
  logs: "100000000000000006",
  bot: "100000000000000007",
  comprador: "200000000000000001",
  atendente: "200000000000000002",
} as const;

export function novasDeps(sobrescrever: Partial<Deps> = {}): Deps {
  return {
    catalogo: carregarCatalogo(),
    provedor: new ProvedorFalso(0),
    pedidos: new PedidosEmMemoria(),
    config: {
      token: "tk-test",
      appId: "100000000000000099",
      guildId: IDS_TESTE.guild,
      categoriaTicketsId: IDS_TESTE.categoria,
      canalPainelId: IDS_TESTE.painel,
      canalLogsId: IDS_TESTE.logs,
      cargoEquipeId: IDS_TESTE.equipe,
      cargoClienteId: IDS_TESTE.cliente,
      pagamentoProvedor: "falso",
      pagamentoFalsoAutoSegundos: 0,
    },
    ...sobrescrever,
  };
}

/** Membro falso: equipe se tiver o cargo (ou ManageGuild). */
export function membro(opcoes: { equipe?: boolean; nome?: string } = {}) {
  const cargos = new Map<string, unknown>();
  if (opcoes.equipe) cargos.set(IDS_TESTE.equipe, {});
  return { displayName: opcoes.nome ?? "Fulano", roles: { cache: cargos }, permissions: { has: () => false } };
}

/** Canal de texto falso que registra o que foi enviado. */
export function canalFalso(id = "300000000000000001") {
  return { id, send: vi.fn(async () => ({})), delete: vi.fn(async () => ({})), isSendable: () => true };
}

/** Cliente falso com um canal de logs e um canal de ticket conhecidos. */
export function clienteFalso(canais: Record<string, ReturnType<typeof canalFalso>> = {}) {
  const logs = canais[IDS_TESTE.logs] ?? canalFalso(IDS_TESTE.logs);
  const todos = { ...canais, [IDS_TESTE.logs]: logs };
  const addRole = vi.fn(async () => ({}));
  return {
    logs,
    addRole,
    client: {
      user: { id: IDS_TESTE.bot },
      channels: { fetch: vi.fn(async (id: string) => todos[id] ?? null) },
      guilds: { fetch: vi.fn(async () => ({ members: { fetch: vi.fn(async () => ({ roles: { add: addRole } })) } })) },
    },
  };
}
