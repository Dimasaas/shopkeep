import { ChannelType, OverwriteType, PermissionFlagsBits, type Guild, type GuildMember, type OverwriteResolvable } from "discord.js";
import type { Config } from "./config.js";

const VER_E_FALAR = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

export function nomeDoCanal(nomeUsuario: string): string {
  const base = nomeUsuario
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `ticket-${base || "cliente"}`;
}

/** Quem pode ver o ticket: só o comprador, a equipe e o próprio bot. @everyone fica de fora. */
export function permissoesDoTicket(opcoes: { guildId: string; usuarioId: string; cargoEquipeId: string; botId: string }): OverwriteResolvable[] {
  return [
    { id: opcoes.guildId, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: opcoes.usuarioId, type: OverwriteType.Member, allow: VER_E_FALAR },
    { id: opcoes.cargoEquipeId, type: OverwriteType.Role, allow: [...VER_E_FALAR, PermissionFlagsBits.ManageMessages] },
    { id: opcoes.botId, type: OverwriteType.Member, allow: [...VER_E_FALAR, PermissionFlagsBits.ManageChannels] },
  ];
}

export function criarCanalDeTicket(guild: Guild, comprador: { id: string; nome: string }, config: Config, pedidoId: string) {
  return guild.channels.create({
    name: nomeDoCanal(comprador.nome),
    type: ChannelType.GuildText,
    parent: config.categoriaTicketsId,
    topic: `pedido:${pedidoId} · comprador:${comprador.id}`,
    permissionOverwrites: permissoesDoTicket({
      guildId: guild.id,
      usuarioId: comprador.id,
      cargoEquipeId: config.cargoEquipeId,
      botId: guild.client.user.id,
    }),
    reason: `Ticket do pedido ${pedidoId}`,
  });
}

/** Equipe = cargo da equipe ou quem gerencia o servidor. */
export function ehEquipe(membro: GuildMember | null | undefined, config: Pick<Config, "cargoEquipeId">): boolean {
  if (!membro) return false;
  return membro.permissions.has(PermissionFlagsBits.ManageGuild) || membro.roles.cache.has(config.cargoEquipeId);
}
