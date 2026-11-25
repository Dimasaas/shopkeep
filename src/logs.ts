import type { Client } from "discord.js";
import type { Config } from "./config.js";

/** Manda uma linha ao canal de logs (se configurado). Falha de log nunca derruba o fluxo. */
export async function registrarLog(client: Client, config: Pick<Config, "canalLogsId">, texto: string): Promise<void> {
  if (!config.canalLogsId) return;
  try {
    const canal = await client.channels.fetch(config.canalLogsId);
    if (canal?.isSendable()) await canal.send({ content: texto, allowedMentions: { parse: [] } });
  } catch (e) {
    console.error("[log] não consegui registrar:", e);
  }
}
