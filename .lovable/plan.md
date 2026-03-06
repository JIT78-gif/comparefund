

## Full Website Visual Redesign

Styling-only changes across all pages to match the reference dark financial dashboard aesthetic. No logic or function changes.

### 1. Global Styles (`src/index.css`)
- Darken the dark mode background to near-black (`hsl(225, 25%, 6%)`)
- Adjust card backgrounds to darker navy (`hsl(225, 25%, 8%)`)
- Refine border colors to subtle dark blue-green tints
- Keep existing primary green `hsl(145, 100%, 42%)`

### 2. StatementTreeGrid (`src/components/StatementTreeGrid.tsx`)
- **Sticky columns**: Make Code + Description columns sticky (`sticky left-0`, `sticky left-[120px]`) with `z-10` and opaque backgrounds
- **Header row**: Dark green-tinted background (`bg-[#0d2818]`)
- **Top-level rows**: Stronger green tint (`bg-[#0a2a15]`)
- **Sub-parent rows**: Subtle green (`bg-[#0d1f14]`)
- **Leaf rows**: Near-transparent with hover
- **Borders**: More visible grid lines, outer border with cyan accent
- Column headers show `(R$)` suffix for currency columns

### 3. Navbar (`src/components/Navbar.tsx`)
- Darken background to match new base (`bg-[#0a0f1a]/95`)
- Ensure backdrop blur works with new darker palette

### 4. Login Page (`src/pages/Login.tsx`)
- Darken card and background to match new palette
- Input fields get darker background (`bg-[#0d1520]`)

### 5. Compare Page (`src/pages/Compare.tsx`)
- Controls card: darker background
- Chart cards: darker background with subtle border
- Table: match same dark green-tinted header style as StatementTreeGrid

### 6. Admin Page (`src/pages/Admin.tsx`)
- Tab bar, cards, dialogs: match darker palette
- Tables: consistent header styling with green tint

### 7. ChartPanel (`src/components/ChartPanel.tsx`)
- Card background: match new card color
- Border styling consistency

### 8. MetricCard (`src/components/MetricCard.tsx`)
- Darker card background to match new palette

### Scope
- **CSS/class changes only** across ~8 files
- Zero logic, data, or function changes
- All features (charts, admin, auth, compare) remain fully functional

