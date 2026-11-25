import { MessageFlags, type ChatInputCommandInteraction, type Interaction, type StringSelectMenuInteraction } from "discord.js";
import type { Config } from "./config.js";
import { NOMES } from "./commands.js";
import { analisarId } from "./ids.js";
import type { Catalogo } from "./produtos.js";
import { painelLoja, produtoIndisponivel, resumoProduto } from "./views.js";

export interface Deps {
  config: Config;
  catalogo: Catalogo;
}

const efemero = { flags: MessageFlags.Ephemeral } as const;

/** Menu de produtos: mostra o resumo e o botão Comprar, só para quem clicou. */
export async function aoEscolherProduto(i: StringSelectMenuInteraction, deps: Deps) {
  const produto = deps.catalogo.produtos.find((p) => p.id === i.values[0]);
  if (!produto) return i.reply({ ...produtoIndisponivel(), ...efemero });
  return i.reply({ ...resumoProduto(produto, deps.catalogo.moeda), ...efemero });
}

/** /painel: publica o painel no canal atual. */
export async function aoPublicarPainel(i: ChatInputCommandInteraction, deps: Deps) {
  const canal = i.channel;
  if (!canal || !("send" in canal)) return i.reply({ content: "Use em um canal de texto.", ...efemero });
  await canal.send(painelLoja(deps.catalogo));
  return i.reply({ content: "Painel publicado.", ...efemero });
}

export function criarRoteador(deps: Deps) {
  return async function aoInteragir(i: Interaction): Promise<void> {
    if (i.isChatInputCommand()) {
      if (i.commandName === NOMES.painel) await aoPublicarPainel(i, deps);
      return;
    }
    if (i.isStringSelectMenu() && analisarId(i.customId)?.acao === "produto") await aoEscolherProduto(i, deps);
  };
}
