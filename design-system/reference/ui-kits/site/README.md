# UI kit — Site institucional

The public-facing Impoclick page. Same components as the app — the marketing surface is *not* a separate design language, it is the product language at a larger scale.

## Sections

| File | Contents |
|---|---|
| `SiteSections.jsx` | `Eyebrow`, `Section`, `SiteHeader` (72px blurred bar), `Hero` (centred headline + live product preview in a browser frame), `LogoStrip` |
| `SiteBody.jsx` | `Features` (6 interactive cards), `HowItWorks` (copy + Timeline), `Numbers` (4 flat Stat cards), `Testimonial` (inverted deep-sea card), `CTA` (aqua card + email capture), `SiteFooter` |

## Notes

- The hero glow is two radial gradients (aqua top-right, orange bottom-left) at ≤26% — the only place gradients appear in the brand.
- The product preview inside the hero is built from real `Card` / `Stat` / `Timeline` / `Badge` components, not a screenshot.
- "Abrir demonstração" and the CTA button navigate to `../app/index.html`.
- Marketing is the only surface allowed to use the `secondary` (cargo orange) button.
