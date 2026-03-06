export interface AccountNode {
  id: string;          // CVM column name (or _PREFIX for virtual parents)
  code: string;        // Hierarchical code (e.g. "1", "1.1", "1.1.1")
  label: string;       // Human-readable Portuguese label
  children?: AccountNode[];
}

// ── Helper builders (DRY for repetitive structures) ──────────

const AGING_BUCKETS: [string, string, string][] = [
  ["1", "30", "Até 30 dias"],
  ["2", "60", "31 a 60 dias"],
  ["3", "90", "61 a 90 dias"],
  ["4", "120", "91 a 120 dias"],
  ["5", "150", "121 a 150 dias"],
  ["6", "180", "151 a 180 dias"],
  ["7", "360", "181 a 360 dias"],
  ["8", "720", "361 a 720 dias"],
  ["9", "1080", "721 a 1080 dias"],
  ["10", "MAIOR_1080", "Acima de 1080 dias"],
];

function makeAgingTab(tabPrefix: string, tabCode: string, tabLabel: string): AccountNode {
  return {
    id: `_${tabPrefix}`, code: tabCode, label: tabLabel, children: [
      {
        id: `${tabPrefix}_A_VL_DIRCRED_PRAZO`, code: `${tabCode}.1`, label: "Por Prazo de Vencimento",
        children: AGING_BUCKETS.map(([n, s, l], i) => ({
          id: `${tabPrefix}_A${n}_VL_PRAZO_VENC_${s}`, code: `${tabCode}.1.${i + 1}`, label: l,
        })),
      },
      {
        id: `${tabPrefix}_B_VL_DIRCRED_INAD`, code: `${tabCode}.2`, label: "Por Inadimplência",
        children: AGING_BUCKETS.map(([n, s, l], i) => ({
          id: `${tabPrefix}_B${n}_VL_INAD_${s}`, code: `${tabCode}.2.${i + 1}`, label: l,
        })),
      },
      {
        id: `${tabPrefix}_C_VL_DIRCRED_ANTECIPADO`, code: `${tabCode}.3`, label: "Pagamentos Antecipados",
        children: AGING_BUCKETS.map(([n, s, l], i) => ({
          id: `${tabPrefix}_C${n}_VL_ANTECIPADO_${s}`, code: `${tabCode}.3.${i + 1}`, label: l,
        })),
      },
    ],
  };
}

function makeRateDirection(prefix: string, rateIdx: string, dirIdx: string, dirLabel: string, baseCode: string): AccountNode {
  const dirUpper = dirLabel.toUpperCase();
  return {
    id: `_TAB_IX_${prefix}${rateIdx}_${dirIdx}`, code: baseCode, label: dirLabel, children: [
      { id: `TAB_IX_${prefix}${rateIdx}_${dirIdx}_1_${dirUpper}_MIN`, code: `${baseCode}.1`, label: "Mínima" },
      { id: `TAB_IX_${prefix}${rateIdx}_${dirIdx}_2_${dirUpper}_MEDIA`, code: `${baseCode}.2`, label: "Média" },
      { id: `TAB_IX_${prefix}${rateIdx}_${dirIdx}_3_${dirUpper}_MAX`, code: `${baseCode}.3`, label: "Máxima" },
    ],
  };
}

function makeRateSegment(prefix: string, code: string, label: string): AccountNode {
  return {
    id: `_TAB_IX_${prefix}`, code, label, children: [
      { id: `_TAB_IX_${prefix}1`, code: `${code}.1`, label: "Taxa de Desconto", children: [
        makeRateDirection(prefix, "1", "1", "Compra", `${code}.1.1`),
        makeRateDirection(prefix, "1", "2", "Venda", `${code}.1.2`),
      ]},
      { id: `_TAB_IX_${prefix}2`, code: `${code}.2`, label: "Taxa de Juros", children: [
        makeRateDirection(prefix, "2", "1", "Compra", `${code}.2.1`),
        makeRateDirection(prefix, "2", "2", "Venda", `${code}.2.2`),
      ]},
    ],
  };
}

const INVESTOR_TYPES: [string, string][] = [
  ["BANCO", "Bancos"],
  ["CAPITALIZ", "Capitalização"],
  ["CLUBE", "Clubes de Investimento"],
  ["CORRETORA_DISTRIB", "Corretoras/Distribuidoras"],
  ["COTA_FIDC", "Cotas de FIDC"],
  ["EAPC", "EAPC (Ent. Aberta)"],
  ["EFPC", "EFPC (Ent. Fechada)"],
  ["FII", "FII"],
  ["INVNR", "Invest. Não Residentes"],
  ["OUTRO", "Outros"],
  ["OUTRO_FI", "Outros FI"],
  ["PF", "Pessoas Físicas"],
  ["PJ_FINANC", "PJ Financeiras"],
  ["PJ_NAO_FINANC", "PJ Não Financeiras"],
  ["RPPS", "RPPS"],
  ["SEGUR", "Seguradoras"],
];

// ── Complete Account Tree ────────────────────────────────────

export const ACCOUNT_TREE: AccountNode[] = [
  // ── Tab I — Ativo ──────────────────────────────────────────
  {
    id: "TAB_I_VL_ATIVO", code: "1", label: "Ativo Total", children: [
      { id: "TAB_I1_VL_DISP", code: "1.1", label: "Disponibilidades" },
      {
        id: "TAB_I2_VL_CARTEIRA", code: "1.2", label: "Carteira", children: [
          {
            id: "TAB_I2A_VL_DIRCRED_RISCO", code: "1.2.1", label: "Dir. Créd. c/ Aquisição de Risco", children: [
              { id: "TAB_I2A1_VL_CRED_VENC_AD", code: "1.2.1.1", label: "Vencidos Adimplentes" },
              { id: "TAB_I2A11_VL_REDUCAO_RECUP", code: "1.2.1.2", label: "(-) Redução ao Valor Recuperável" },
              { id: "TAB_I2A2_VL_CRED_VENC_INAD", code: "1.2.1.3", label: "Vencidos Inadimplentes" },
              { id: "TAB_I2A21_VL_TOTAL_PARCELA_INAD", code: "1.2.1.4", label: "Total Parcela Inadimplente" },
              { id: "TAB_I2A3_VL_CRED_INAD", code: "1.2.1.5", label: "Inadimplidos" },
              { id: "TAB_I2A4_VL_CRED_DIRCRED_PERFM", code: "1.2.1.6", label: "Performados" },
              { id: "TAB_I2A5_VL_CRED_VENCIDO_PENDENTE", code: "1.2.1.7", label: "Vencidos Pendentes" },
              { id: "TAB_I2A6_VL_CRED_EMP_RECUP", code: "1.2.1.8", label: "Empresa em Recuperação" },
              { id: "TAB_I2A7_VL_CRED_RECEITA_PUBLICA", code: "1.2.1.9", label: "Receita Pública" },
              { id: "TAB_I2A8_VL_CRED_ACAO_JUDIC", code: "1.2.1.10", label: "Ações Judiciais" },
              { id: "TAB_I2A9_VL_CRED_FATOR_RISCO", code: "1.2.1.11", label: "Fator de Risco" },
              { id: "TAB_I2A10_VL_CRED_DIVERSO", code: "1.2.1.12", label: "Créditos Diversos" },
            ],
          },
          {
            id: "TAB_I2B_VL_DIRCRED_SEM_RISCO", code: "1.2.2", label: "Dir. Créd. s/ Aquisição de Risco", children: [
              { id: "TAB_I2B1_VL_CRED_VENC_AD", code: "1.2.2.1", label: "Vencidos Adimplentes" },
              { id: "TAB_I2B11_VL_REDUCAO_RECUP", code: "1.2.2.2", label: "(-) Redução ao Valor Recuperável" },
              { id: "TAB_I2B2_VL_CRED_VENC_INAD", code: "1.2.2.3", label: "Vencidos Inadimplentes" },
              { id: "TAB_I2B21_VL_TOTAL_PARCELA_INAD", code: "1.2.2.4", label: "Total Parcela Inadimplente" },
              { id: "TAB_I2B3_VL_CRED_INAD", code: "1.2.2.5", label: "Inadimplidos" },
              { id: "TAB_I2B4_VL_CRED_DIRCRED_PERFM", code: "1.2.2.6", label: "Performados" },
              { id: "TAB_I2B5_VL_CRED_VENCIDO_PENDENTE", code: "1.2.2.7", label: "Vencidos Pendentes" },
              { id: "TAB_I2B6_VL_CRED_EMP_RECUP", code: "1.2.2.8", label: "Empresa em Recuperação" },
              { id: "TAB_I2B7_VL_CRED_RECEITA_PUBLICA", code: "1.2.2.9", label: "Receita Pública" },
              { id: "TAB_I2B8_VL_CRED_ACAO_JUDIC", code: "1.2.2.10", label: "Ações Judiciais" },
              { id: "TAB_I2B9_VL_CRED_FATOR_RISCO", code: "1.2.2.11", label: "Fator de Risco" },
              { id: "TAB_I2B10_VL_CRED_DIVERSO", code: "1.2.2.12", label: "Créditos Diversos" },
            ],
          },
          {
            id: "TAB_I2C_VL_VLMOB", code: "1.2.3", label: "Valores Mobiliários", children: [
              { id: "TAB_I2C1_VL_DEBENTURE", code: "1.2.3.1", label: "Debêntures" },
              { id: "TAB_I2C2_VL_CRI", code: "1.2.3.2", label: "CRI" },
              { id: "TAB_I2C3_VL_NP_COMERC", code: "1.2.3.3", label: "Notas Promissórias" },
              { id: "TAB_I2C4_VL_LETRA_FINANC", code: "1.2.3.4", label: "Letras Financeiras" },
              { id: "TAB_I2C5_VL_COTA_FIF", code: "1.2.3.5", label: "Cotas de FI/FIF" },
              { id: "TAB_I2C5_VL_COTA_FUNDO_ICVM555", code: "1.2.3.6", label: "Cotas Fundo ICVM 555" },
              { id: "TAB_I2C6_VL_OUTRO", code: "1.2.3.7", label: "Outros" },
            ],
          },
          { id: "TAB_I2D_VL_TITPUB_FED", code: "1.2.4", label: "Títulos Públicos Federais" },
          { id: "TAB_I2E_VL_CDB", code: "1.2.5", label: "CDB" },
          { id: "TAB_I2F_VL_OPER_COMPROM", code: "1.2.6", label: "Operações Compromissadas" },
          { id: "TAB_I2G_VL_OUTRO_RF", code: "1.2.7", label: "Outros Renda Fixa" },
          { id: "TAB_I2H_VL_COTA_FIDC", code: "1.2.8", label: "Cotas de FIDC" },
          { id: "TAB_I2I_VL_COTA_FIDC_NP", code: "1.2.9", label: "Cotas de FIDC-NP" },
          { id: "TAB_I2J_VL_CONTRATO_FUTURO", code: "1.2.10", label: "Contrato Futuro" },
          { id: "TAB_I2_DEBENTURE_CRI", code: "1.2.11", label: "Debêntures/CRI (Subtotal)" },
          { id: "TAB_I2_COTA_FIDC", code: "1.2.12", label: "Cotas FIDC (Subtotal)" },
          { id: "TAB_I2_VL_OUTRO_ATIVO", code: "1.2.13", label: "Outros Ativos da Carteira" },
        ],
      },
      {
        id: "TAB_I3_VL_POSICAO_DERIV", code: "1.3", label: "Derivativos", children: [
          { id: "TAB_I3A_VL_MERCADO_TERMO", code: "1.3.1", label: "Mercado a Termo" },
          { id: "TAB_I3B_VL_MERCADO_OPCAO", code: "1.3.2", label: "Opções" },
          { id: "TAB_I3C_VL_MERCADO_FUTURO", code: "1.3.3", label: "Futuro" },
          { id: "TAB_I3D_VL_DIFER_SWAP", code: "1.3.4", label: "Diferencial de Swap" },
          { id: "TAB_I3E_VL_COBERTURA", code: "1.3.5", label: "Cobertura" },
          { id: "TAB_I3F_VL_DEPOSITO_MARGEM", code: "1.3.6", label: "Depósito de Margem" },
        ],
      },
      {
        id: "TAB_I4_VL_OUTRO_ATIVO", code: "1.4", label: "Outros Ativos", children: [
          { id: "TAB_I4A_VL_CPRAZO", code: "1.4.1", label: "Curto Prazo" },
          { id: "TAB_I4B_VL_LPRAZO", code: "1.4.2", label: "Longo Prazo" },
        ],
      },
    ],
  },

  // ── Tab II — Carteira por Segmento ─────────────────────────
  {
    id: "TAB_II_VL_CARTEIRA", code: "2", label: "Carteira por Segmento", children: [
      { id: "TAB_II_A_VL_INDUST", code: "2.1", label: "Industrial" },
      { id: "TAB_II_B_VL_IMOBIL", code: "2.2", label: "Imobiliário" },
      {
        id: "TAB_II_C_VL_COMERC", code: "2.3", label: "Comercial", children: [
          { id: "TAB_II_C1_VL_COMERC", code: "2.3.1", label: "Atacado" },
          { id: "TAB_II_C2_VL_VAREJO", code: "2.3.2", label: "Varejo" },
          { id: "TAB_II_C3_VL_ARREND", code: "2.3.3", label: "Arrendamento Mercantil" },
        ],
      },
      {
        id: "TAB_II_D_VL_SERV", code: "2.4", label: "Serviços", children: [
          { id: "TAB_II_D1_VL_SERV", code: "2.4.1", label: "Serviços" },
          { id: "TAB_II_D2_VL_SERV_PUBLICO", code: "2.4.2", label: "Serviços Públicos" },
          { id: "TAB_II_D3_VL_SERV_EDUC", code: "2.4.3", label: "Educação" },
          { id: "TAB_II_D4_VL_ENTRET", code: "2.4.4", label: "Entretenimento" },
        ],
      },
      { id: "TAB_II_E_VL_AGRONEG", code: "2.5", label: "Agronegócio" },
      {
        id: "TAB_II_F_VL_FINANC", code: "2.6", label: "Financeiro", children: [
          { id: "TAB_II_F1_VL_CRED_PESSOA", code: "2.6.1", label: "Crédito Pessoal" },
          { id: "TAB_II_F2_VL_CRED_PESSOA_CONSIG", code: "2.6.2", label: "Crédito Consignado" },
          { id: "TAB_II_F3_VL_CRED_CORP", code: "2.6.3", label: "Corporativo" },
          { id: "TAB_II_F4_VL_MIDMARKET", code: "2.6.4", label: "Middle Market" },
          { id: "TAB_II_F5_VL_VEICULO", code: "2.6.5", label: "Veículos" },
          { id: "TAB_II_F6_VL_IMOBIL_EMPRESA", code: "2.6.6", label: "Imob. Empresarial" },
          { id: "TAB_II_F7_VL_IMOBIL_RESID", code: "2.6.7", label: "Imob. Residencial" },
          { id: "TAB_II_F8_VL_OUTRO", code: "2.6.8", label: "Outros Financeiros" },
        ],
      },
      { id: "TAB_II_G_VL_CREDITO", code: "2.7", label: "Cartão de Crédito" },
      {
        id: "TAB_II_H_VL_FACTOR", code: "2.8", label: "Factoring", children: [
          { id: "TAB_II_H1_VL_PESSOA", code: "2.8.1", label: "Pessoa" },
          { id: "TAB_II_H2_VL_CORP", code: "2.8.2", label: "Corporativo" },
        ],
      },
      {
        id: "TAB_II_I_VL_SETOR_PUBLICO", code: "2.9", label: "Setor Público", children: [
          { id: "TAB_II_I1_VL_PRECAT", code: "2.9.1", label: "Precatórios" },
          { id: "TAB_II_I2_VL_TRIBUT", code: "2.9.2", label: "Tributário" },
          { id: "TAB_II_I3_VL_ROYALTIES", code: "2.9.3", label: "Royalties" },
          { id: "TAB_II_I4_VL_OUTRO", code: "2.9.4", label: "Outros" },
        ],
      },
      { id: "TAB_II_J_VL_JUDICIAL", code: "2.10", label: "Ações Judiciais" },
      { id: "TAB_II_K_VL_MARCA", code: "2.11", label: "Marca/Patente" },
    ],
  },

  // ── Tab III — Passivo ──────────────────────────────────────
  {
    id: "TAB_III_VL_PASSIVO", code: "3", label: "Passivo Total", children: [
      {
        id: "TAB_III_A_VL_PAGAR", code: "3.1", label: "Contas a Pagar", children: [
          { id: "TAB_III_A1_VL_CPRAZO", code: "3.1.1", label: "Curto Prazo" },
          { id: "TAB_III_A2_VL_LPRAZO", code: "3.1.2", label: "Longo Prazo" },
        ],
      },
      {
        id: "TAB_III_B_VL_POSICAO_DERIV", code: "3.2", label: "Derivativos Passivo", children: [
          { id: "TAB_III_B1_VL_TERMO", code: "3.2.1", label: "Mercado a Termo" },
          { id: "TAB_III_B2_VL_OPCAO", code: "3.2.2", label: "Opções" },
          { id: "TAB_III_B3_VL_FUTURO", code: "3.2.3", label: "Futuro" },
          { id: "TAB_III_B4_VL_SWAP_PAGAR", code: "3.2.4", label: "Swap a Pagar" },
        ],
      },
    ],
  },

  // ── Tab IV — Patrimônio Líquido ────────────────────────────
  {
    id: "_TAB_IV", code: "4", label: "Patrimônio Líquido", children: [
      { id: "TAB_IV_A_VL_PL", code: "4.1", label: "PL" },
      { id: "TAB_IV_B_VL_PL_MEDIO", code: "4.2", label: "PL Médio" },
    ],
  },

  // ── Tab V — Comportamento da Carteira c/ Risco ─────────────
  makeAgingTab("TAB_V", "5", "Comportamento da Carteira c/ Risco"),

  // ── Tab VI — Comportamento da Carteira s/ Risco ────────────
  makeAgingTab("TAB_VI", "6", "Comportamento da Carteira s/ Risco"),

  // ── Tab VII — Negócios Realizados ──────────────────────────
  {
    id: "_TAB_VII", code: "7", label: "Negócios Realizados", children: [
      {
        id: "_TAB_VII_A", code: "7.1", label: "Aquisições no Mês", children: [
          { id: "TAB_VII_A1_1_QT_DIRCRED_RISCO", code: "7.1.1", label: "Qtd. c/ Risco" },
          { id: "TAB_VII_A1_2_VL_DIRCRED_RISCO", code: "7.1.2", label: "Valor c/ Risco" },
          { id: "TAB_VII_A2_1_QT_DIRCRED_SEM_RISCO", code: "7.1.3", label: "Qtd. s/ Risco" },
          { id: "TAB_VII_A2_2_VL_DIRCRED_SEM_RISCO", code: "7.1.4", label: "Valor s/ Risco" },
          { id: "TAB_VII_A3_1_QT_DIRCRED_VENC_AD", code: "7.1.5", label: "Qtd. Adimplentes" },
          { id: "TAB_VII_A3_2_VL_DIRCRED_VENC_AD", code: "7.1.6", label: "Valor Adimplentes" },
          { id: "TAB_VII_A4_1_QT_DIRCRED_VENC_INAD", code: "7.1.7", label: "Qtd. Inadimplentes" },
          { id: "TAB_VII_A4_2_VL_DIRCRED_VENC_INAD", code: "7.1.8", label: "Valor Inadimplentes" },
          { id: "TAB_VII_A5_1_QT_DIRCRED_INAD", code: "7.1.9", label: "Qtd. Inadimplidos" },
          { id: "TAB_VII_A5_2_VL_DIRCRED_INAD", code: "7.1.10", label: "Valor Inadimplidos" },
        ],
      },
      {
        id: "_TAB_VII_B", code: "7.2", label: "Alienações no Mês", children: [
          { id: "TAB_VII_B1_1_QT_CEDENTE", code: "7.2.1", label: "Qtd. Cedente" },
          { id: "TAB_VII_B1_2_VL_CEDENTE", code: "7.2.2", label: "Valor Cedente" },
          { id: "TAB_VII_B1_3_VL_CONTAB_CEDENTE", code: "7.2.3", label: "Valor Contábil Cedente" },
          { id: "TAB_VII_B2_1_QT_PREST", code: "7.2.4", label: "Qtd. Prestadora" },
          { id: "TAB_VII_B2_2_VL_PREST", code: "7.2.5", label: "Valor Prestadora" },
          { id: "TAB_VII_B2_3_VL_CONTAB_PREST", code: "7.2.6", label: "Valor Contábil Prestadora" },
          { id: "TAB_VII_B3_1_QT_TERCEIRO", code: "7.2.7", label: "Qtd. Terceiros" },
          { id: "TAB_VII_B3_2_VL_TERCEIRO", code: "7.2.8", label: "Valor Terceiros" },
          { id: "TAB_VII_B3_3_VL_CONTAB_TERCEIRO", code: "7.2.9", label: "Valor Contábil Terceiros" },
        ],
      },
      {
        id: "_TAB_VII_C", code: "7.3", label: "Substituições no Mês", children: [
          { id: "TAB_VII_C_1_QT_SUBST", code: "7.3.1", label: "Qtd. Substituições" },
          { id: "TAB_VII_C_2_VL_SUBST", code: "7.3.2", label: "Valor Substituições" },
          { id: "TAB_VII_C_3_VL_CONTAB_SUBST", code: "7.3.3", label: "Valor Contábil Substituições" },
        ],
      },
      {
        id: "_TAB_VII_D", code: "7.4", label: "Recompras no Mês", children: [
          { id: "TAB_VII_D_1_QT_RECOMPRA", code: "7.4.1", label: "Qtd. Recompras" },
          { id: "TAB_VII_D_2_VL_RECOMPRA", code: "7.4.2", label: "Valor Recompras" },
          { id: "TAB_VII_D_3_VL_CONTAB_RECOMPRA", code: "7.4.3", label: "Valor Contábil Recompras" },
        ],
      },
    ],
  },

  // ── Tab IX — Taxas Praticadas ──────────────────────────────
  {
    id: "_TAB_IX", code: "8", label: "Taxas Praticadas", children: [
      makeRateSegment("A", "8.1", "Industrial"),
      makeRateSegment("B", "8.2", "Comercial"),
      makeRateSegment("C", "8.3", "Serviços"),
      makeRateSegment("D", "8.4", "Agronegócio"),
      makeRateSegment("E", "8.5", "Financeiro"),
      makeRateSegment("F", "8.6", "Outros Segmentos"),
    ],
  },

  // ── Tab X — Outras Informações ─────────────────────────────
  {
    id: "_TAB_X", code: "9", label: "Outras Informações", children: [
      { id: "TAB_X_DEBITO_TRIBUT", code: "9.1", label: "Débito Tributário" },
      {
        id: "_TAB_X_SCR_DEV", code: "9.2", label: "SCR - Risco do Devedor", children: [
          { id: "TAB_X_SCR_RISCO_DEVEDOR_AA", code: "9.2.1", label: "Nível AA" },
          { id: "TAB_X_SCR_RISCO_DEVEDOR_A", code: "9.2.2", label: "Nível A" },
          { id: "TAB_X_SCR_RISCO_DEVEDOR_B", code: "9.2.3", label: "Nível B" },
          { id: "TAB_X_SCR_RISCO_DEVEDOR_C", code: "9.2.4", label: "Nível C" },
          { id: "TAB_X_SCR_RISCO_DEVEDOR_D", code: "9.2.5", label: "Nível D" },
          { id: "TAB_X_SCR_RISCO_DEVEDOR_E", code: "9.2.6", label: "Nível E" },
          { id: "TAB_X_SCR_RISCO_DEVEDOR_F", code: "9.2.7", label: "Nível F" },
          { id: "TAB_X_SCR_RISCO_DEVEDOR_G", code: "9.2.8", label: "Nível G" },
          { id: "TAB_X_SCR_RISCO_DEVEDOR_H", code: "9.2.9", label: "Nível H" },
        ],
      },
      {
        id: "_TAB_X_SCR_OPER", code: "9.3", label: "SCR - Risco da Operação", children: [
          { id: "TAB_X_SCR_RISCO_OPER_AA", code: "9.3.1", label: "Nível AA" },
          { id: "TAB_X_SCR_RISCO_OPER_A", code: "9.3.2", label: "Nível A" },
          { id: "TAB_X_SCR_RISCO_OPER_B", code: "9.3.3", label: "Nível B" },
          { id: "TAB_X_SCR_RISCO_OPER_C", code: "9.3.4", label: "Nível C" },
          { id: "TAB_X_SCR_RISCO_OPER_D", code: "9.3.5", label: "Nível D" },
          { id: "TAB_X_SCR_RISCO_OPER_E", code: "9.3.6", label: "Nível E" },
          { id: "TAB_X_SCR_RISCO_OPER_F", code: "9.3.7", label: "Nível F" },
          { id: "TAB_X_SCR_RISCO_OPER_G", code: "9.3.8", label: "Nível G" },
          { id: "TAB_X_SCR_RISCO_OPER_H", code: "9.3.9", label: "Nível H" },
        ],
      },
      {
        id: "_TAB_X_COTST_SENIOR", code: "9.4", label: "Cotistas Sênior", children:
          INVESTOR_TYPES.map(([suffix, label], i) => ({
            id: `TAB_X_NR_COTST_SENIOR_${suffix}`, code: `9.4.${i + 1}`, label,
          })),
      },
      {
        id: "_TAB_X_COTST_SUBORD", code: "9.5", label: "Cotistas Subordinado", children:
          INVESTOR_TYPES.map(([suffix, label], i) => ({
            id: `TAB_X_NR_COTST_SUBORD_${suffix}`, code: `9.5.${i + 1}`, label,
          })),
      },
      {
        id: "_TAB_X_LIQUIDEZ", code: "9.6", label: "Liquidez", children: [
          { id: "TAB_X_VL_LIQUIDEZ_0", code: "9.6.1", label: "Imediata (D+0)" },
          { id: "TAB_X_VL_LIQUIDEZ_30", code: "9.6.2", label: "Até 30 dias" },
          { id: "TAB_X_VL_LIQUIDEZ_60", code: "9.6.3", label: "Até 60 dias" },
          { id: "TAB_X_VL_LIQUIDEZ_90", code: "9.6.4", label: "Até 90 dias" },
          { id: "TAB_X_VL_LIQUIDEZ_180", code: "9.6.5", label: "Até 180 dias" },
          { id: "TAB_X_VL_LIQUIDEZ_360", code: "9.6.6", label: "Até 360 dias" },
          { id: "TAB_X_VL_LIQUIDEZ_MAIOR_360", code: "9.6.7", label: "Acima de 360 dias" },
        ],
      },
      {
        id: "_TAB_X_GARANTIA", code: "9.7", label: "Garantias", children: [
          { id: "TAB_X_VL_GARANTIA_DIRCRED", code: "9.7.1", label: "Valor Garantia Dir. Créd." },
          { id: "TAB_X_PR_GARANTIA_DIRCRED", code: "9.7.2", label: "% Garantia Dir. Créd." },
        ],
      },
    ],
  },
];

// ── Tab labels for section filter ────────────────────────────
export const TAB_LABELS: { code: string; label: string }[] = ACCOUNT_TREE.map((n) => ({
  code: n.code,
  label: `${["I","II","III","IV","V","VI","VII","","IX","X"][parseInt(n.code) - 1] || n.code} — ${n.label}`,
}));

// ── Utility functions ────────────────────────────────────────

export interface FlatAccount {
  id: string;
  code: string;
  label: string;
  depth: number;
  hasChildren: boolean;
  parentId: string | null;
}

export function flattenTree(
  nodes: AccountNode[],
  depth = 0,
  parentId: string | null = null
): FlatAccount[] {
  const result: FlatAccount[] = [];
  for (const node of nodes) {
    result.push({
      id: node.id,
      code: node.code,
      label: node.label,
      depth,
      hasChildren: !!node.children?.length,
      parentId,
    });
    if (node.children) {
      result.push(...flattenTree(node.children, depth + 1, node.id));
    }
  }
  return result;
}

export function getDescendantIds(nodes: AccountNode[], targetId: string): string[] {
  for (const node of nodes) {
    if (node.id === targetId) {
      return collectChildIds(node.children || []);
    }
    if (node.children) {
      const found = getDescendantIds(node.children, targetId);
      if (found.length) return found;
    }
  }
  return [];
}

function collectChildIds(nodes: AccountNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (node.children) ids.push(...collectChildIds(node.children));
  }
  return ids;
}

/** Get the direct (non-virtual) leaf IDs under a given node, recursively. */
export function getLeafIds(nodes: AccountNode[], targetId: string): string[] {
  for (const node of nodes) {
    if (node.id === targetId) {
      return collectLeafIds(node.children || []);
    }
    if (node.children) {
      const found = getLeafIds(node.children, targetId);
      if (found.length) return found;
    }
  }
  return [];
}

function collectLeafIds(nodes: AccountNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (!node.id.startsWith("_")) ids.push(node.id);
    if (node.children) ids.push(...collectLeafIds(node.children));
  }
  return ids;
}

/** Get direct children IDs of a node (one level deep). */
export function getDirectChildIds(nodes: AccountNode[], targetId: string): string[] {
  for (const node of nodes) {
    if (node.id === targetId) {
      return (node.children || []).map(c => c.id);
    }
    if (node.children) {
      const found = getDirectChildIds(node.children, targetId);
      if (found.length) return found;
    }
  }
  return [];
}

// ── Format type detection ────────────────────────────────────

export function isRateColumn(id: string): boolean {
  return id.startsWith("TAB_IX_") || id.startsWith("_TAB_IX") || id === "TAB_X_PR_GARANTIA_DIRCRED";
}

export function isQuantityColumn(id: string): boolean {
  return id.includes("_QT_") || id.startsWith("TAB_X_NR_COTST");
}
