import { PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from "discord.js";

export const NOMES = { painel: "painel", entregar: "entregar", fechar: "fechar", confirmar: "confirmar", setup: "setup" } as const;

export function definirComandos(opcoes: { incluirConfirmar: boolean; somenteSetup?: boolean }) {
  const todos = [
    new SlashCommandBuilder()
      .setName(NOMES.painel)
      .setDescription("Publica o painel da loja neste canal (equipe)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName(NOMES.entregar)
      .setDescription("Entrega o pedido do ticket atual (equipe)")
      .addStringOption((o) => o.setName("mensagem").setDescription("Texto/credenciais enviados ao cliente").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName(NOMES.fechar)
      .setDescription("Fecha e apaga o ticket atual (equipe)")
      .addStringOption((o) => o.setName("motivo").setDescription("Motivo registrado no log"))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName(NOMES.setup)
      .setDescription("Cria categorias, canais e cargos que faltam (administrador)")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];
  const comandos = opcoes.somenteSetup ? todos.filter((c) => c.name === NOMES.setup) : todos;
  // /confirmar só existe com o provedor falso: simula o pagamento aprovado.
  if (opcoes.incluirConfirmar && !opcoes.somenteSetup) {
    comandos.push(
      new SlashCommandBuilder()
        .setName(NOMES.confirmar)
        .setDescription("[dev] Confirma o pagamento falso do ticket atual (equipe)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    );
  }
  return comandos.map((c) => c.toJSON());
}

/** Registra os comandos só no servidor configurado (aparecem na hora, ao contrário dos globais). */
export async function registrarComandos(token: string, appId: string, guildId: string, opcoes: { incluirConfirmar: boolean; somenteSetup?: boolean }) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: definirComandos(opcoes) });
}
