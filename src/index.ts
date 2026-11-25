import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { registrarComandos } from "./commands.js";
import { carregarConfig, type Config } from "./config.js";
import { aoPagamentoConfirmado, criarRoteador, type Deps } from "./handlers.js";
import { criarProvedor } from "./pagamento/index.js";
import { PedidosEmMemoria } from "./pedidos.js";
import { carregarCatalogo } from "./produtos.js";

// Sem os IDs do /setup no .env o bot sobe em "modo setup": só o comando /setup existe, e ele imprime os IDs.
let modoSetup = false;
let config: Config;
try {
  config = carregarConfig();
} catch (e) {
  config = carregarConfig(process.env, { exigirSetup: false });
  modoSetup = true;
  console.warn("[bot] IDs do setup ausentes: modo setup (rode /setup no servidor e copie os IDs para o .env).");
}
const provedor = criarProvedor(config);
const deps: Deps = { config, catalogo: carregarCatalogo(), provedor, pedidos: new PedidosEmMemoria() };

// Só o intent Guilds: o bot trabalha com slash commands e componentes (nada de ler mensagens).
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

provedor.aoPagar((cobrancaId) => aoPagamentoConfirmado(client, deps, cobrancaId));

client.once(Events.ClientReady, async (c) => {
  await registrarComandos(config.token, config.appId, config.guildId, { incluirConfirmar: provedor.nome === "falso", somenteSetup: modoSetup });
  console.log(`[bot] online como ${c.user.tag} (pagamento: ${provedor.nome})`);
});

const rotear = criarRoteador(deps);
client.on(Events.InteractionCreate, (i) => {
  rotear(i).catch((e) => {
    console.error("[bot] erro na interação:", e);
    if (i.isRepliable() && !i.replied && !i.deferred) void i.reply({ content: "Algo deu errado. Tente de novo.", ephemeral: true }).catch(() => undefined);
  });
});

void client.login(config.token);
