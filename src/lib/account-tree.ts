export interface AccountNode {
  id: string;          // CVM column name
  label: string;       // Human-readable Portuguese label
  children?: AccountNode[];
}

export const ACCOUNT_TREE: AccountNode[] = [
  {
    id: "TAB_I_VL_ATIVO",
    label: "Ativo Total",
    children: [
      { id: "TAB_I1_VL_DISP", label: "1. Disponibilidades" },
      {
        id: "TAB_I2_VL_CARTEIRA",
        label: "2. Carteira",
        children: [
          {
            id: "TAB_I2A_VL_DIRCRED_RISCO",
            label: "2a. Dir. Créd. c/ Aquisição de Risco",
            children: [
              { id: "TAB_I2A1_VL_CRED_VENC_AD", label: "2a.1 Vencidos Adimplentes" },
              { id: "TAB_I2A2_VL_CRED_VENC_INAD", label: "2a.2 Vencidos Inadimplentes" },
              { id: "TAB_I2A3_VL_CRED_INAD", label: "2a.3 Inadimplidos" },
              { id: "TAB_I2A4_VL_CRED_DIRCRED_PERFM", label: "2a.4 Performados" },
            ],
          },
          {
            id: "TAB_I2B_VL_DIRCRED_SEM_RISCO",
            label: "2b. Dir. Créd. s/ Aquisição de Risco",
            children: [
              { id: "TAB_I2B1_VL_CRED_VENC_AD", label: "2b.1 Vencidos Adimplentes" },
              { id: "TAB_I2B2_VL_CRED_VENC_INAD", label: "2b.2 Vencidos Inadimplentes" },
              { id: "TAB_I2B3_VL_CRED_INAD", label: "2b.3 Inadimplidos" },
              { id: "TAB_I2B4_VL_CRED_DIRCRED_PERFM", label: "2b.4 Performados" },
            ],
          },
          { id: "TAB_I2C_VL_VLMOB", label: "2c. Valores Mobiliários" },
          { id: "TAB_I2D_VL_TITPUB_FED", label: "2d. Títulos Públicos Federais" },
          { id: "TAB_I2E_VL_OPER_COMPROMISSADA", label: "2e. Operações Compromissadas" },
          { id: "TAB_I2F_VL_CDB", label: "2f. CDB" },
          { id: "TAB_I2G_VL_COTAS_FIDC", label: "2g. Cotas de FIDC" },
          { id: "TAB_I2H_VL_COTAS_FI", label: "2h. Cotas de FI" },
        ],
      },
      { id: "TAB_I3_VL_POSICAO_DERIV", label: "3. Derivativos" },
      { id: "TAB_I4_VL_OUTRO_ATIVO", label: "4. Outros Ativos" },
    ],
  },
  {
    id: "TAB_III_VL_PASSIVO",
    label: "Passivo Total",
    children: [
      {
        id: "TAB_III_A_VL_PAGAR",
        label: "A. Contas a Pagar",
        children: [
          { id: "TAB_III_A1_VL_CPRAZO", label: "A.1 Curto Prazo" },
          { id: "TAB_III_A2_VL_LPRAZO", label: "A.2 Longo Prazo" },
        ],
      },
      { id: "TAB_III_B_VL_POSICAO_DERIV", label: "B. Derivativos Passivo" },
    ],
  },
  {
    id: "TAB_IV_A_VL_PL",
    label: "Patrimônio Líquido",
    children: [
      { id: "TAB_IV_B_VL_PL_MEDIO", label: "PL Médio" },
    ],
  },
];

/** Flatten tree into array with depth info for rendering */
export interface FlatAccount {
  id: string;
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
