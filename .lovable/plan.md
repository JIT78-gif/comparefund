

## Feature: Account Selection + Chart Generation

### What the user wants
1. Each account row in the tree grid gets a **checkbox** to select/deselect it
2. Selected accounts appear in a **chart panel** below (or beside) the grid
3. User can choose the **chart type** (bar, line, pie, area)

### Implementation

**1. Add selection state to StatementTreeGrid**
- Add a `Set<string>` state for selected account IDs
- Render a small checkbox (or toggle icon) on each **leaf** row (non-virtual accounts only)
- Add a "Clear selection" button in the toolbar
- Show a badge with the count of selected accounts

**2. Create a `ChartPanel` component** (`src/components/ChartPanel.tsx`)
- Receives: selected account IDs, columns, getValue function
- Chart type selector (dropdown or toggle group): Bar, Line, Area, Pie
- Uses the existing `recharts` library (already installed) with the shadcn `ChartContainer`
- For Bar/Line/Area: X-axis = columns (companies or periods), one series per selected account
- For Pie: shows distribution of selected accounts for a single column
- Color assignment: use a palette mapped to each selected account
- Shows account labels in the legend

**3. Wire it into the Statements page**
- Lift `selectedAccounts` state up to `Statements.tsx` and pass it down to both `StatementTreeGrid` and `ChartPanel`
- Render `ChartPanel` below the grid, only visible when at least 1 account is selected
- Pass the same `columns` and `getValue` props to the chart

**4. UX details**
- Checkbox appears to the left of the account label in each row
- Maximum selection limit of ~10 accounts to keep charts readable (show toast if exceeded)
- A floating "View Chart" button appears when accounts are selected, scrolling down to the chart
- Chart is responsive and uses the existing theme colors

### Files to create/modify
- **Create**: `src/components/ChartPanel.tsx` — chart rendering with type selector
- **Modify**: `src/components/StatementTreeGrid.tsx` — add checkboxes and selection callback
- **Modify**: `src/pages/Statements.tsx` — manage selection state, render ChartPanel

