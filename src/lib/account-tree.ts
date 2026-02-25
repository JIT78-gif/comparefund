export interface AccountNode {
  id: string;          // CVM column name
  code: string;        // Hierarchical code (e.g. "1", "1.1", "1.1.1")
  label: string;       // Human-readable Portuguese label
  children?: AccountNode[];
}

export const ACCOUNT_TREE: AccountNode[] = [
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
              { id: "TAB_I2A2_VL_CRED_VENC_INAD", code: "1.2.1.2", label: "Vencidos Inadimplentes" },
              { id: "TAB_I2A3_VL_CRED_INAD", code: "1.2.1.3", label: "Inadimplidos" },
              { id: "TAB_I2A4_VL_CRED_DIRCRED_PERFM", code: "1.2.1.4", label: "Performados" },
            ],
          },
          {
            id: "TAB_I2B_VL_DIRCRED_SEM_RISCO",
            code: "1.2.2",
            label: "Dir. Créd. s/ Aquisição de Risco",
            children: [
              { id: "TAB_I2B1_VL_CRED_VENC_AD", code: "1.2.2.1", label: "Vencidos Adimplentes" },
              { id: "TAB_I2B2_VL_CRED_VENC_INAD", code: "1.2.2.2", label: "Vencidos Inadimplentes" },
              { id: "TAB_I2B3_VL_CRED_INAD", code: "1.2.2.3", label: "Inadimplidos" },
              { id: "TAB_I2B4_VL_CRED_DIRCRED_PERFM", code: "1.2.2.4", label: "Performados" },
            ],
          },
          { id: "TAB_I2C_VL_VLMOB", code: "1.2.3", label: "Valores Mobiliários" },
          { id: "TAB_I2D_VL_TITPUB_FED", code: "1.2.4", label: "Títulos Públicos Federais" },
          { id: "TAB_I2E_VL_OPER_COMPROMISSADA", code: "1.2.5", label: "Operações Compromissadas" },
          { id: "TAB_I2F_VL_CDB", code: "1.2.6", label: "CDB" },
          { id: "TAB_I2G_VL_COTAS_FIDC", code: "1.2.7", label: "Cotas de FIDC" },
          { id: "TAB_I2H_VL_COTAS_FI", code: "1.2.8", label: "Cotas de FI" },
        ],
      },
      { id: "TAB_I3_VL_POSICAO_DERIV", code: "1.3", label: "Derivativos" },
      { id: "TAB_I4_VL_OUTRO_ATIVO", code: "1.4", label: "Outros Ativos" },
    ],
  },
  {
    id: "TAB_III_VL_PASSIVO",
    code: "2",
    label: "Passivo Total",
    children: [
      {
        id: "TAB_III_A_VL_PAGAR",
        code: "2.1",
        label: "Contas a Pagar",
        children: [
          { id: "TAB_III_A1_VL_CPRAZO", code: "2.1.1", label: "Curto Prazo" },
          { id: "TAB_III_A2_VL_LPRAZO", code: "2.1.2", label: "Longo Prazo" },
        ],
      },
      { id: "TAB_III_B_VL_POSICAO_DERIV", code: "2.2", label: "Derivativos Passivo" },
    ],
  },
  {
    id: "TAB_IV_A_VL_PL",
    code: "3",
    label: "Patrimônio Líquido",
    children: [
      { id: "TAB_IV_B_VL_PL_MEDIO", code: "3.1", label: "PL Médio" },
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
