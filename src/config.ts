// Toda a configuração (token e IDs) vem do ambiente. Nada de ID escrito no código.

export interface Config {
  token: string;
  appId: string;
  guildId: string;
  categoriaTicketsId: string;
  canalPainelId: string;
  canalLogsId?: string;
  cargoEquipeId: string;
  cargoClienteId?: string;
  pagamentoProvedor: string;
  pagamentoFalsoAutoSegundos: number;
}

const SNOWFLAKE = /^\d{17,20}$/;

/** Lê o que o bot precisa para ligar. `/setup` só exige token, app e servidor. */
export function carregarConfig(env: NodeJS.ProcessEnv = process.env, opcoes: { exigirSetup?: boolean } = {}): Config {
  const exigirSetup = opcoes.exigirSetup ?? true;
  const erros: string[] = [];
  const texto = (nome: string, obrigatorio: boolean) => {
    const v = env[nome]?.trim();
    if (!v && obrigatorio) erros.push(`${nome} não definido`);
    return v ?? "";
  };
  const id = (nome: string, obrigatorio: boolean) => {
    const v = texto(nome, obrigatorio);
    if (v && !SNOWFLAKE.test(v)) erros.push(`${nome} não parece um ID do Discord`);
    return v;
  };

  const cfg: Config = {
    token: texto("DISCORD_TOKEN", true),
    appId: id("DISCORD_APP_ID", true),
    guildId: id("DISCORD_GUILD_ID", true),
    categoriaTicketsId: id("CATEGORIA_TICKETS_ID", exigirSetup),
    canalPainelId: id("CANAL_PAINEL_ID", exigirSetup),
    canalLogsId: id("CANAL_LOGS_ID", false) || undefined,
    cargoEquipeId: id("CARGO_EQUIPE_ID", exigirSetup),
    cargoClienteId: id("CARGO_CLIENTE_ID", false) || undefined,
    pagamentoProvedor: texto("PAGAMENTO_PROVEDOR", false) || "falso",
    pagamentoFalsoAutoSegundos: Number(texto("PAGAMENTO_FALSO_AUTO_SEGUNDOS", false) || 0),
  };
  if (!Number.isFinite(cfg.pagamentoFalsoAutoSegundos) || cfg.pagamentoFalsoAutoSegundos < 0) erros.push("PAGAMENTO_FALSO_AUTO_SEGUNDOS deve ser um número >= 0");
  if (erros.length) throw new Error(`Configuração inválida (veja o .env.example):\n- ${erros.join("\n- ")}`);
  return cfg;
}
