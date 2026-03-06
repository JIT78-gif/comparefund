

## Plan: Pixel-Perfect CSS Match to Reference Image

After reviewing all files and the reference screenshot, here are the specific CSS differences between the current implementation and the reference image that need to be fixed:

### Files to Change (styling only, no logic changes)

**1. `src/index.css` — Fine-tune dark mode CSS variables**
- Background: darken to `hsl(220, 35%, 4%)` (near-black with slight blue)
- Card: `hsl(220, 30%, 6%)`
- Border: more subtle `hsl(220, 20%, 12%)`
- Grid header: `hsl(160, 35%, 8%)` (darker green tint)
- Grid row top: `hsl(160, 30%, 7%)`
- Grid row parent: `hsl(160, 25%, 6%)`
- Muted-foreground: slightly brighter for readability

**2. `src/components/StatementTreeGrid.tsx` — Table styling tweaks**
- Outer table border: explicit `border-[#0ea5e9]/50` (cyan glow matching image)
- Header border-bottom: `border-b-[#0ea5e9]/40`
- Column headers: append `(R$)` suffix for currency columns (visible in image)
- Expand arrows: change color from `text-primary` to `text-[#0ea5e9]` (teal/cyan as in image)
- Leaf row text: ensure `text-foreground` not `text-muted-foreground` for values
- Top-level rows: show code + label in uppercase with bold white text

**3. `src/pages/Statements.tsx` — Controls area**
- Tab underline: already green, verify thickness matches (2px)
- Company checkbox labels: selected companies should show in `text-primary` (green)
- Period selectors: darker background on dropdowns (`bg-[#0a1018]`)
- Standard/NP switch: ensure green accent

**4. `src/components/Navbar.tsx` — Background**
- Darken to `bg-[#060a12]/98` for near-black navbar
- Border-bottom: `border-[#1a2030]`

**5. `src/pages/Login.tsx` — Card styling**
- Card background: `bg-[#0a1018]`
- Input background: `bg-[#060d16]` with border `border-[#1a2535]`

**6. `src/pages/Compare.tsx` — Consistency**
- Controls card: `bg-[#0a1018]` 
- Chart cards: same dark background
- Table headers: match grid-header variable

**7. `src/components/ChartPanel.tsx` — Card background**
- Border: `border-[#0ea5e9]/30` (cyan accent)
- Background: match card variable

**8. `src/components/MetricCard.tsx` — Card styling**  
- Background: match new card color
- Border: subtle with color accent

### Technical Summary
- 8 files modified, all CSS class changes only
- Zero logic, data, or function changes
- Key visual changes: darker backgrounds, cyan table borders, teal expand arrows, `(R$)` column suffix

