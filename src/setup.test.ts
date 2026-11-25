import { ChannelType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { IDS_TESTE, novasDeps } from "../test/helpers.js";
import { aoSetup, aplicarSetup, formatarEnv, NOMES_PADRAO, planejarSetup, publicarPainel, type EstadoDoServidor } from "./setup.js";

const vazio: EstadoDoServidor = { cargos: [], canais: [] };
const completo: EstadoDoServidor = {
  cargos: [
    { id: "r1", name: "Equipe da Loja" },
    { id: "r2", name: "cliente" },
  ],
  canais: [
    { id: "c1", name: "🎫 Tickets", type: "categoria" },
    { id: "c2", name: "🛒 Loja", type: "categoria" },
    { id: "c3", name: "painel-loja", type: "texto" },
    { id: "c4", name: "logs-loja", type: "texto" },
  ],
};

/** Servidor falso com estado mutável, para provar a idempotência rodando duas vezes. */
function servidorFalso() {
  const estado: EstadoDoServidor = { cargos: [], canais: [] };
  let n = 0;
  const criados: string[] = [];
  const mensagens: { id: string; author: { id: string }; components: { toJSON(): unknown }[]; edit: ReturnType<typeof vi.fn> }[] = [];
  const painel = {
    isTextBased: () => true,
    messages: { fetch: async () => new Map(mensagens.map((m) => [m.id, m])) },
    send: vi.fn(async (payload: { components: { toJSON(): unknown }[] }) => {
      mensagens.push({ id: `m${mensagens.length}`, author: { id: IDS_TESTE.bot }, components: payload.components, edit: vi.fn() });
    }),
  };
  const guild = {
    id: IDS_TESTE.guild,
    roles: {
      fetch: async () => new Map(estado.cargos.map((r) => [r.id, r])),
      create: vi.fn(async ({ name }: { name: string }) => {
        const r = { id: `role${++n}`, name };
        estado.cargos.push(r);
        criados.push(name);
        return r;
      }),
    },
    channels: {
      fetch: async (id?: string) =>
        id
          ? painel
          : new Map(estado.canais.map((c) => [c.id, { ...c, type: c.type === "categoria" ? ChannelType.GuildCategory : ChannelType.GuildText }])),
      create: vi.fn(async ({ name, type, parent }: { name: string; type: ChannelType; parent?: string }) => {
        const c = { id: `ch${++n}`, name, type: type === ChannelType.GuildCategory ? ("categoria" as const) : ("texto" as const), parent };
        estado.canais.push(c);
        criados.push(name);
        return c;
      }),
    },
  };
  return { guild, estado, criados, painel, mensagens };
}

describe("planejarSetup", () => {
  it("servidor vazio: cria os seis recursos", () => {
    const p = planejarSetup(vazio, {});
    expect(p.map((x) => x.acao)).toEqual(Array(6).fill("criar"));
    expect(p.map((x) => x.nome)).toEqual(Object.values(NOMES_PADRAO));
  });

  it("servidor completo: nada a criar (acha por nome, sem diferenciar maiúsculas)", () => {
    const p = planejarSetup(completo, {});
    expect(p.every((x) => x.acao === "existe")).toBe(true);
    expect(p.find((x) => x.recurso === "cargoCliente")?.id).toBe("r2");
  });

  it("o ID do .env vence o nome, e ID que não existe mais é recriado", () => {
    const estado: EstadoDoServidor = { ...completo, cargos: [...completo.cargos, { id: "r9", name: "Outro" }] };
    expect(planejarSetup(estado, { cargoEquipe: "r9" }).find((x) => x.recurso === "cargoEquipe")?.id).toBe("r9");
    const semEquipe = { ...completo, cargos: [] };
    expect(planejarSetup(semEquipe, { cargoEquipe: "r1" }).find((x) => x.recurso === "cargoEquipe")?.acao).toBe("criar");
  });

  it("categoria e canal de texto com o mesmo nome não se confundem", () => {
    const estado: EstadoDoServidor = { cargos: [], canais: [{ id: "x", name: "painel-loja", type: "categoria" }] };
    expect(planejarSetup(estado, {}).find((p) => p.recurso === "canalPainel")?.acao).toBe("criar");
  });
});

describe("aplicarSetup", () => {
  it("cria na ordem certa: cargos, categorias, canais dentro da categoria da loja", async () => {
    const s = servidorFalso();
    const ids = await aplicarSetup(s.guild as never, planejarSetup(vazio, {}), IDS_TESTE.bot);
    expect(s.criados).toEqual(Object.values(NOMES_PADRAO));
    const logs = s.guild.channels.create.mock.calls.find((c) => c[0].name === "logs-loja")![0] as { parent: string; permissionOverwrites: { id: string; deny?: unknown }[] };
    expect(logs.parent).toBe(ids.categoriaLoja);
    expect(logs.permissionOverwrites[0]).toMatchObject({ id: IDS_TESTE.guild });
    expect(logs.permissionOverwrites[0]!.deny).toBeDefined();
    expect(formatarEnv(ids)).toContain(`CARGO_EQUIPE_ID=${ids.cargoEquipe}`);
  });

  it("rodar duas vezes não duplica nada", async () => {
    const s = servidorFalso();
    await aplicarSetup(s.guild as never, planejarSetup(await estadoDe(s), {}), IDS_TESTE.bot);
    const primeira = s.criados.length;
    const ids2 = await aplicarSetup(s.guild as never, planejarSetup(await estadoDe(s), {}), IDS_TESTE.bot);
    expect(primeira).toBe(6);
    expect(s.criados).toHaveLength(6);
    expect(Object.values(ids2)).toHaveLength(6);
  });

  it("recria só o que foi apagado", async () => {
    const s = servidorFalso();
    await aplicarSetup(s.guild as never, planejarSetup(vazio, {}), IDS_TESTE.bot);
    s.estado.canais = s.estado.canais.filter((c) => c.name !== "logs-loja");
    s.criados.length = 0;
    await aplicarSetup(s.guild as never, planejarSetup(await estadoDe(s), {}), IDS_TESTE.bot);
    expect(s.criados).toEqual(["logs-loja"]);
  });
});

async function estadoDe(s: ReturnType<typeof servidorFalso>): Promise<EstadoDoServidor> {
  return { cargos: [...s.estado.cargos], canais: [...s.estado.canais] };
}

describe("publicarPainel", () => {
  it("publica na primeira vez e edita a mesma mensagem nas seguintes", async () => {
    const s = servidorFalso();
    const { carregarCatalogo } = await import("./produtos.js");
    expect(await publicarPainel(s.guild as never, "c3", carregarCatalogo(), IDS_TESTE.bot)).toBe("publicado");
    s.mensagens[0]!.components = s.painel.send.mock.calls[0]![0].components.map((c) => ({ toJSON: () => c.toJSON() }));
    expect(await publicarPainel(s.guild as never, "c3", carregarCatalogo(), IDS_TESTE.bot)).toBe("atualizado");
    expect(s.painel.send).toHaveBeenCalledOnce();
    expect(s.mensagens[0]!.edit).toHaveBeenCalledOnce();
  });
});

describe("/setup", () => {
  it("responde com o que foi criado e as linhas do .env", async () => {
    const s = servidorFalso();
    const editReply = vi.fn();
    const { config, catalogo } = novasDeps();
    await aoSetup(
      { guild: s.guild, client: { user: { id: IDS_TESTE.bot } }, deferReply: vi.fn(), editReply } as never,
      { ...config, cargoEquipeId: "", categoriaTicketsId: "", canalPainelId: "", canalLogsId: undefined, cargoClienteId: undefined },
      catalogo,
    );
    const texto = editReply.mock.calls[0]![0] as string;
    expect(texto).toMatch(/➕ criado: Equipe da Loja/);
    expect(texto).toMatch(/CATEGORIA_TICKETS_ID=\w+/);
    expect(texto).toMatch(/painel publicado/);
  });

  it("falha no meio: avisa que dá para rodar de novo", async () => {
    const s = servidorFalso();
    s.guild.roles.create.mockRejectedValueOnce(new Error("Missing Permissions"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const editReply = vi.fn();
    const { config, catalogo } = novasDeps();
    await aoSetup({ guild: s.guild, client: { user: { id: IDS_TESTE.bot } }, deferReply: vi.fn(), editReply } as never, config, catalogo);
    expect(editReply.mock.calls[0]![0]).toMatch(/rode `\/setup` de novo/);
  });
});
