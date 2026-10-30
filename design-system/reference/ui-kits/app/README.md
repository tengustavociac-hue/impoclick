# UI kit — Painel do importador (web app)

The Impoclick operations app: where an importer follows every container from the supplier's floor to their own door.

## Screens

| File | Screen | What it shows |
|---|---|---|
| `AppShell.jsx` | Chrome | Sticky TopBar with the centred NavPills, 248px SideNav, light/dark switch, plan-usage footer card |
| `DashboardScreen.jsx` | Painel | Hero aqua metric card, plan usage, cost donut, 12-month SparkBars, live shipment Timeline, team activity |
| `ImportsScreen.jsx` | Importações | Filter bar (search pill + selects + removable Tags), Tabs by bucket, DataTable, EmptyState when a search misses |
| `ShipmentScreen.jsx` | Embarque | Four stat cards, route Timeline + ProgressBar, tabbed items/documents tables, inverted supplier panel |
| `QuoteScreen.jsx` | Cotação | Two-step form, sticky aqua estimate card with DonutMeter, Toast on submit |
| `CostsScreen.jsx` | Custos | Cost KPIs, 12-month trend, per-process table with inline margin ProgressBars |

## Interactions that work

- NavPills / SideNav route between all five screens.
- Light ↔ dark switch in the top bar (sets `data-theme` on `<html>`).
- Imports: live search, tab filtering, removable filter tags, empty state, row arrow → shipment detail.
- Shipment: tab between items and documents.
- Quote: modal switch changes the estimate and transit time; submit fires a Toast.

Everything is composed from the published components — no screen re-implements a primitive.
