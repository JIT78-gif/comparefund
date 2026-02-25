

## UI Redesign to Match Reference Image + Remove Dashboard

### Analysis of Reference Image

The reference shows a professional dark-themed financial dashboard with:
- Wider horizontal navbar with multiple links and PT/EN toggle
- Clean tab-based mode switcher with green underline on active tab
- Standard/NP as a toggle switch (not buttons)
- Company checkboxes and period selector on the same row
- A new company "Omni" added
- Table with separate "Código" and "Descrição da Conta" columns
- Green-tinted parent/header rows
- Values in Brazilian format: "R$ 58.770.640"
- Negative values in red with minus prefix
- Green expand/collapse triangles

### Changes Required

**1. Remove Dashboard route and update navigation**
- File: `src/App.tsx` — Remove the Index `/` route, make `/statements` the home route, keep `/compare`
- File: `src/pages/Index.tsx` — Delete (no longer needed)
- File: `src/components/Navbar.tsx` — Redesign completely:
  - Horizontal links: HOME, DEMONSTRAÇÕES, COMPARAR, RELATÓRIOS, CONFIGURAÇÕES
  - Active link gets green underline (not color change)
  - HOME points to `/` (which is now statements)
  - PT / EN text toggle on the right (simpler than globe button)
  - Wider, more spacious layout

**2. Redesign Statements page layout**
- File: `src/pages/Statements.tsx`:
  - Title "Demonstrações Financeiras" as large heading
  - Tabs "Comparar Empresas" / "Comparar Períodos" with green underline (not buttons)
  - Standard/NP toggle switch on the right side of the tabs row
  - Companies row: "Empresas:" label + checkboxes inline + "Período:" with month/year selectors on the right
  - Add "Omni" to COMPANIES array
  - Remove the button-style mode switcher, use tab-style underlined text

**3. Redesign StatementTreeGrid table**
- File: `src/components/StatementTreeGrid.tsx`:
  - Split account column into two: "Código" (account code like "1", "1.1", "1.1.1") and "Descrição da Conta" (description)
  - Column headers styled with teal/cyan top accent border
  - Parent rows get green-tinted background (deeper green than current)
  - Green colored expand/collapse triangles (▶/▼)
  - Values formatted as full Brazilian style: "R$ 58.770.640" (dots as thousands separator)
  - Negative values: "-R$ 1.200.000" in red
  - Column headers show "(R$)" suffix

**4. Update account tree labels**
- File: `src/lib/account-tree.ts`:
  - Add code numbers to labels or extract them for the "Código" column
  - Ensure tree structure matches reference (1 - ATIVO TOTAL, 1.1 - Disponibilidades, etc.)

**5. Update translations**
- File: `src/contexts/LanguageContext.tsx`:
  - Add nav keys: "nav.home", "nav.statements" (update), "nav.reports", "nav.settings"
  - Add grid keys: "grid.code", "grid.description"
  - Update existing keys as needed

**6. Update CSS/styling**
- File: `src/index.css`:
  - Ensure dark theme colors match the reference (dark navy background, green accents)
  - The current dark theme is close but may need minor tweaks

### Technical Details

**Number formatting change:**
Current `formatBRL` abbreviates values (58.77M). Reference shows full values with dot separators (R$ 58.770.640). Will update to use `Intl.NumberFormat('pt-BR')` for authentic Brazilian formatting.

**Account code extraction:**
The reference shows codes like "1", "1.1", "1.1.1" separately from descriptions. Will derive these from the tree depth/position or add explicit `code` fields to the account tree.

**Routing change:**
```text
Before:  / → Index (landing page),  /statements → Statements
After:   / → Statements (home),     /compare → Compare (unchanged)
```

**New COMPANIES array:**
```text
["multiplica", "red", "atena", "cifra", "omni"]
```

