

## Plan: Remove DEMONSTRAÇÕES Nav Link

### Change: `src/components/Navbar.tsx`

Remove the `{ path: "/", label: t("nav.statements").toUpperCase() }` entry from the `links` array so the navbar only shows COMPARE and ADMIN (if admin). The `/` route still works, it just won't have a nav link.

### File
| File | Change |
|------|--------|
| `src/components/Navbar.tsx` | Remove the DEMONSTRAÇÕES/statements link from the `links` array |

