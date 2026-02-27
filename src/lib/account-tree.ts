export interface AccountNode {
  id: string;          // CVM column name
  code: string;        // Hierarchical code (e.g. "1", "1.1", "1.1.1")
  label: string;       // Human-readable Portuguese label
  children?: AccountNode[];
}

export const ACCOUNT_TREE: AccountNode[] = [
  // ── Tab I — Ativo ──────────────────────────────────────────
  {
    id: "TAB_I_VL_ATIVO",
    code: "1",
    label: "Ativo Total",
    children: [
      { id: "TAB_I1_VL_DISP", code: "1.1", label: "Disponibilidades" },
      {
        id: "TAB_I2_VL_CARTEIRA",
        code: "1.2",
        label: "Carteira",
        children: [
          {
            id: "TAB_I2A_VL_DIRCRED_RISCO",
            code: "1.2.1",
            label: "Dir. Créd. c/ Aquisição de Risco",
            children: [
              { id: "TAB_I2A1_VL_CRED_VENC_AD", code: "1.2.1.1", label: "Vencidos Adimplentes" },
              { id: "TAB_I2A11_VL_REDUCAO_RECUP", code: "1.2.1.2", label: "(-) Redução ao Valor Recuperável" },
              { id: "TAB_I2A2_VL_CRED_VENC_INAD", code: "1.2.1.3", label: "Vencidos Inadimplentes" },
              { id: "TAB_I2A21_VL_TOTAL_PARCELA_INAD", code: "1.2.1.4", label: "Total Parcela Inadimplente" },
              { id: "TAB_I2A3_VL_CRED_INAD", code: "1.2.1.5", label: "Inadimplidos" },
              { id: "TAB_I2A4_VL_CRED_DIRCRED_PERFM", code: "1.2.1.6", label: "Performados" },
              { id: "TAB_I2A5_VL_CRED_VENCIDO_PENDENTE", code: "1.2.1.7", label: "Vencidos Pendentes" },
            ],
          },
          {
            id: "TAB_I2B_VL_DIRCRED_SEM_RISCO",
            code: "1.2.2",
            label: "Dir. Créd. s/ Aquisição de Risco",
            children: [
              { id: "TAB_I2B1_VL_CRED_VENC_AD", code: "1.2.2.1", label: "Vencidos Adimplentes" },
              { id: "TAB_I2B11_VL_REDUCAO_RECUP", code: "1.2.2.2", label: "(-) Redução ao Valor Recuperável" },
              { id: "TAB_I2B2_VL_CRED_VENC_INAD", code: "1.2.2.3", label: "Vencidos Inadimplentes" },
              { id: "TAB_I2B21_VL_TOTAL_PARCELA_INAD", code: "1.2.2.4", label: "Total Parcela Inadimplente" },
              { id: "TAB_I2B3_VL_CRED_INAD", code: "1.2.2.5", label: "Inadimplidos" },
              { id: "TAB_I2B4_VL_CRED_DIRCRED_PERFM", code: "1.2.2.6", label: "Performados" },
              { id: "TAB_I2B5_VL_CRED_VENCIDO_PENDENTE", code: "1.2.2.7", label: "Vencidos Pendentes" },
            ],
          },
          {
            id: "TAB_I2C_VL_VLMOB",
            code: "1.2.3",
            label: "Valores Mobiliários",
            children: [
              { id: "TAB_I2C5_VL_COTA_FIF", code: "1.2.3.1", label: "Cotas de FI / FIF" },
            ],
          },
          { id: "TAB_I2D_VL_TITPUB_FED", code: "1.2.4", label: "Títulos Públicos Federais" },
          { id: "TAB_I2E_VL_CDB", code: "1.2.5", label: "CDB" },
          { id: "TAB_I2F_VL_OPER_COMPROM", code: "1.2.6", label: "Operações Compromissadas" },
        ],
      },
      {
        id: "TAB_I3_VL_POSICAO_DERIV",
        code: "1.3",
        label: "Derivativos",
        children: [
          { id: "TAB_I3A_VL_MERCADO_TERMO", code: "1.3.1", label: "Mercado a Termo" },
        ],
      },
      {
        id: "TAB_I4_VL_OUTRO_ATIVO",
        code: "1.4",
        label: "Outros Ativos",
        children: [
          { id: "TAB_I4A_VL_CPRAZO", code: "1.4.1", label: "Curto Prazo" },
          { id: "TAB_I4B_VL_LPRAZO", code: "1.4.2", label: "Longo Prazo" },
        ],
      },
    ],
  },

  // ── Tab II — Classificação da Carteira por Segmento ────────
  {
    id: "TAB_II_VL_CARTEIRA",
    code: "2",
    label: "Carteira por Segmento",
    children: [
      { id: "TAB_II_A_VL_INDUST", code: "2.1", label: "Industrial" },
      { id: "TAB_II_B_VL_IMOBIL", code: "2.2", label: "Imobiliário" },
      {
        id: "TAB_II_C_VL_COMERC",
        code: "2.3",
        label: "Comercial",
        children: [
          { id: "TAB_II_C1_VL_COMERC", code: "2.3.1", label: "Atacado" },
          { id: "TAB_II_C2_VL_VAREJO", code: "2.3.2", label: "Varejo" },
        ],
      },
      {
        id: "TAB_II_D_VL_SERV",
        code: "2.4",
        label: "Serviços",
        children: [
          { id: "TAB_II_D1_VL_SERV", code: "2.4.1", label: "Serviços" },
          { id: "TAB_II_D2_VL_SERV_PUBLICO", code: "2.4.2", label: "Serviços Públicos" },
          { id: "TAB_II_D3_VL_SERV_EDUC", code: "2.4.3", label: "Educação" },
        ],
      },
      { id: "TAB_II_E_VL_AGRO", code: "2.5", label: "Agronegócio" },
      {
        id: "TAB_II_F_VL_FINANC",
        code: "2.6",
        label: "Financeiro",
        children: [
          { id: "TAB_II_F1_VL_CRED_PESSOAL", code: "2.6.1", label: "Crédito Pessoal" },
          { id: "TAB_II_F2_VL_CRED_CONSIG", code: "2.6.2", label: "Crédito Consignado" },
          { id: "TAB_II_F3_VL_FINANC_VEICULOS", code: "2.6.3", label: "Financ. de Veículos" },
          { id: "TAB_II_F4_VL_CRED_CARTAO", code: "2.6.4", label: "Cartão de Crédito" },
          { id: "TAB_II_F5_VL_FACTORING", code: "2.6.5", label: "Factoring" },
          { id: "TAB_II_F6_VL_SETOR_PUBLICO", code: "2.6.6", label: "Setor Público" },
          { id: "TAB_II_F7_VL_ACAO_JUDICIAL", code: "2.6.7", label: "Ações Judiciais" },
          { id: "TAB_II_F8_VL_OUTRO", code: "2.6.8", label: "Outros Financeiros" },
        ],
      },
    ],
  },

  // ── Tab III — Passivo ──────────────────────────────────────
  {
    id: "TAB_III_VL_PASSIVO",
    code: "3",
    label: "Passivo Total",
    children: [
      {
        id: "TAB_III_A_VL_PAGAR",
        code: "3.1",
        label: "Contas a Pagar",
        children: [
          { id: "TAB_III_A1_VL_CPRAZO", code: "3.1.1", label: "Curto Prazo" },
          { id: "TAB_III_A2_VL_LPRAZO", code: "3.1.2", label: "Longo Prazo" },
        ],
      },
      {
        id: "TAB_III_B_VL_POSICAO_DERIV",
        code: "3.2",
        label: "Derivativos Passivo",
        children: [
          { id: "TAB_III_B1_VL_TERMO", code: "3.2.1", label: "Mercado a Termo" },
        ],
      },
    ],
  },

  // ── Tab IV — Patrimônio Líquido ────────────────────────────
  {
    id: "TAB_IV_A_VL_PL",
    code: "4",
    label: "Patrimônio Líquido",
    children: [
      { id: "TAB_IV_B_VL_PL_MEDIO", code: "4.1", label: "PL Médio" },
    ],
  },

  // ── Tab VII — Aquisições, Substituições e Recompras ────────
  {
    id: "_TAB_VII",
    code: "5",
    label: "Aquisições e Recompras",
    children: [
      {
        id: "_TAB_VII_A",
        code: "5.1",
        label: "Aquisições no Mês",
        children: [
          { id: "TAB_VII_A1_1_QT_DIRCRED_RISCO", code: "5.1.1", label: "Qtd. c/ Risco" },
          { id: "TAB_VII_A1_2_VL_DIRCRED_RISCO", code: "5.1.2", label: "Valor c/ Risco" },
          { id: "TAB_VII_A2_1_QT_DIRCRED_SEM_RISCO", code: "5.1.3", label: "Qtd. s/ Risco" },
          { id: "TAB_VII_A2_2_VL_DIRCRED_SEM_RISCO", code: "5.1.4", label: "Valor s/ Risco" },
          { id: "TAB_VII_A3_1_QT_DIRCRED_VENC_AD", code: "5.1.5", label: "Qtd. Adimplentes" },
          { id: "TAB_VII_A3_2_VL_DIRCRED_VENC_AD", code: "5.1.6", label: "Valor Adimplentes" },
          { id: "TAB_VII_A5_1_QT_DIRCRED_INAD", code: "5.1.7", label: "Qtd. Inadimplentes" },
          { id: "TAB_VII_A5_2_VL_DIRCRED_INAD", code: "5.1.8", label: "Valor Inadimplentes" },
        ],
      },
      {
        id: "_TAB_VII_B",
        code: "5.2",
        label: "Substituições no Mês",
        children: [
          { id: "TAB_VII_B2_1_QT_PREST", code: "5.2.1", label: "Qtd. Prestadora" },
          { id: "TAB_VII_B2_2_VL_PREST", code: "5.2.2", label: "Valor Prestadora" },
          { id: "TAB_VII_B2_3_VL_CONTAB_PREST", code: "5.2.3", label: "Valor Contábil Prestadora" },
          { id: "TAB_VII_B3_1_QT_TERCEIRO", code: "5.2.4", label: "Qtd. Terceiros" },
          { id: "TAB_VII_B3_2_VL_TERCEIRO", code: "5.2.5", label: "Valor Terceiros" },
          { id: "TAB_VII_B3_3_VL_CONTAB_TERCEIRO", code: "5.2.6", label: "Valor Contábil Terceiros" },
        ],
      },
      {
        id: "_TAB_VII_D",
        code: "5.3",
        label: "Recompras no Mês",
        children: [
          { id: "TAB_VII_D_1_QT_RECOMPRA", code: "5.3.1", label: "Qtd. Recompras" },
          { id: "TAB_VII_D_2_VL_RECOMPRA", code: "5.3.2", label: "Valor Recompras" },
          { id: "TAB_VII_D_3_VL_CONTAB_RECOMPRA", code: "5.3.3", label: "Valor Contábil Recompras" },
        ],
      },
    ],
  },
];

/** Flatten tree into array with depth info for rendering */
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

/** Get all descendant IDs for a given parent */
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
