import {
  ChannelType,
  MessageFlags,
  OverwriteType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Guild,
  type OverwriteResolvable,
} from "discord.js";
import type { Config } from "./config.js";
import { IDS } from "./ids.js";
import type { Catalogo } from "./produtos.js";
import { painelLoja } from "./views.js";

// /setup: garante cargos, categorias e canais da loja. Idempotente: rodar de novo só cria o que falta
// e atualiza o painel no lugar (edita a mensagem existente em vez de publicar outra).

export type Recurso = "cargoEquipe" | "cargoCliente" | "categoriaTickets" | "categoriaLoja" | "canalPainel" | "canalLogs";

export const NOMES_PADRAO: Record<Recurso, string> = {
  cargoEquipe: "Equipe da Loja",
  cargoCliente: "Cliente",
  categoriaTickets: "🎫 Tickets",
  categoriaLoja: "🛒 Loja",
  canalPainel: "painel-loja",
  canalLogs: "logs-loja",
};

const ORDEM: Recurso[] = ["cargoEquipe", "cargoCliente", "categoriaTickets", "categoriaLoja", "canalPainel", "canalLogs"];
const ehCargo = (r: Recurso) => r.startsWith("cargo");
const ehCategoria = (r: Recurso) => r.startsWith("categoria");

export interface EstadoDoServidor {
  cargos: { id: string; name: string }[];
  /** type: "categoria" | "texto" (outros tipos não interessam) */
  canais: { id: string; name: string; type: "categoria" | "texto" }[];
}

export interface Passo {
  recurso: Recurso;
  nome: string;
  acao: "existe" | "criar";
  id?: string;
}

/** Decide, sem tocar no Discord, o que existe e o que precisa ser criado. Prioridade: ID do .env, depois o nome padrão. */
export function planejarSetup(estado: EstadoDoServidor, atuais: Partial<Record<Recurso, string>>): Passo[] {
  return ORDEM.map((recurso) => {
    const nome = NOMES_PADRAO[recurso];
    const lista = ehCargo(recurso) ? estado.cargos : estado.canais.filter((c) => c.type === (ehCategoria(recurso) ? "categoria" : "texto"));
    const porId = atuais[recurso] ? lista.find((x) => x.id === atuais[recurso]) : undefined;
    const achado = porId ?? lista.find((x) => x.name.toLowerCase() === nome.toLowerCase());
    return achado ? { recurso, nome, acao: "existe", id: achado.id } : { recurso, nome, acao: "criar" };
  });
}

export async function lerEstado(guild: Guild): Promise<EstadoDoServidor> {
  const [cargos, canais] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
  return {
    cargos: [...cargos.values()].map((r) => ({ id: r.id, name: r.name })),
    canais: [...canais.values()].flatMap((c) =>
      c && (c.type === ChannelType.GuildCategory || c.type === ChannelType.GuildText)
        ? [{ id: c.id, name: c.name, type: c.type === ChannelType.GuildCategory ? ("categoria" as const) : ("texto" as const) }]
        : [],
    ),
  };
}

const VER = PermissionFlagsBits.ViewChannel;

function permissoes(recurso: Recurso, ids: Partial<Record<Recurso, string>>, guildId: string, botId: string): OverwriteResolvable[] | undefined {
  const equipe = { id: ids.cargoEquipe!, type: OverwriteType.Role, allow: [VER, PermissionFlagsBits.SendMessages] } as const;
  const bot = { id: botId, type: OverwriteType.Member, allow: [VER, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] } as const;
  switch (recurso) {
    case "categoriaTickets":
    case "canalLogs":
      return [{ id: guildId, type: OverwriteType.Role, deny: [VER] }, equipe, bot];
    case "canalPainel": // todos veem, ninguém escreve (só o bot publica o painel)
      return [{ id: guildId, type: OverwriteType.Role, allow: [VER], deny: [PermissionFlagsBits.SendMessages] }, equipe, bot];
    default:
      return undefined;
  }
}

/** Executa o plano e devolve o ID de cada recurso (os existentes e os recém-criados). */
export async function aplicarSetup(guild: Guild, passos: Passo[], botId: string): Promise<Record<Recurso, string>> {
  const ids: Partial<Record<Recurso, string>> = {};
  for (const p of passos) if (p.acao === "existe") ids[p.recurso] = p.id!;

  for (const p of passos.filter((x) => x.acao === "criar")) {
    if (ehCargo(p.recurso)) {
      const role = await guild.roles.create({ name: p.nome, mentionable: p.recurso === "cargoEquipe", reason: "/setup da loja" });
      ids[p.recurso] = role.id;
      continue;
    }
    const canal = await guild.channels.create({
      name: p.nome,
      type: ehCategoria(p.recurso) ? ChannelType.GuildCategory : ChannelType.GuildText,
      ...(p.recurso === "canalPainel" || p.recurso === "canalLogs" ? { parent: ids.categoriaLoja } : {}),
      permissionOverwrites: permissoes(p.recurso, ids, guild.id, botId),
      reason: "/setup da loja",
    });
    ids[p.recurso] = canal.id;
  }
  return ids as Record<Recurso, string>;
}

/** Publica o painel no canal; se o bot já publicou um antes, edita essa mensagem. */
export async function publicarPainel(guild: Guild, canalId: string, catalogo: Catalogo, botId: string): Promise<"publicado" | "atualizado"> {
  const canal = await guild.channels.fetch(canalId);
  if (!canal || !canal.isTextBased()) throw new Error("Canal do painel não é um canal de texto");
  const recentes = await canal.messages.fetch({ limit: 25 });
  const antigo = [...recentes.values()].find((m) => m.author.id === botId && JSON.stringify(m.components.map((c) => c.toJSON())).includes(IDS.selectProduto));
  const payload = painelLoja(catalogo);
  if (antigo) {
    await antigo.edit(payload);
    return "atualizado";
  }
  await canal.send(payload);
  return "publicado";
}

export function formatarEnv(ids: Record<Recurso, string>): string {
  return [
    `CATEGORIA_TICKETS_ID=${ids.categoriaTickets}`,
    `CANAL_PAINEL_ID=${ids.canalPainel}`,
    `CANAL_LOGS_ID=${ids.canalLogs}`,
    `CARGO_EQUIPE_ID=${ids.cargoEquipe}`,
    `CARGO_CLIENTE_ID=${ids.cargoCliente}`,
  ].join("\n");
}

export function resumoDoPlano(passos: Passo[]): string {
  return passos.map((p) => `${p.acao === "criar" ? "➕ criado" : "✔️ já existia"}: ${p.nome}`).join("\n");
}

export async function aoSetup(i: ChatInputCommandInteraction, config: Config, catalogo: Catalogo) {
  if (!i.guild) return i.reply({ content: "Use dentro do servidor.", flags: MessageFlags.Ephemeral });
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const botId = i.client.user.id;
  const estado = await lerEstado(i.guild);
  const passos = planejarSetup(estado, {
    cargoEquipe: config.cargoEquipeId,
    cargoCliente: config.cargoClienteId,
    categoriaTickets: config.categoriaTicketsId,
    canalPainel: config.canalPainelId,
    canalLogs: config.canalLogsId,
  });
  try {
    const ids = await aplicarSetup(i.guild, passos, botId);
    const painel = await publicarPainel(i.guild, ids.canalPainel, catalogo, botId);
    return i.editReply(
      `${resumoDoPlano(passos)}\n📌 painel ${painel} em <#${ids.canalPainel}>\n\nCopie para o seu \`.env\` e reinicie o bot:\n\`\`\`\n${formatarEnv(ids)}\n\`\`\``,
    );
  } catch (e) {
    console.error("[setup] falhou:", e);
    return i.editReply("O setup parou no meio (provavelmente falta permissão ao bot: Gerenciar Cargos e Gerenciar Canais). Corrija e rode `/setup` de novo: o que já foi criado não se repete.");
  }
}
