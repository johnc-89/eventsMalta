# Events Malta - Brand Guidelines

## Color Palette

### Primary Colors

| Color | Hex Code | Usage |
|-------|----------|-------|
| Gold | `#FDBB38` | Accent, CTAs, highlights |
| Dark Charcoal | `#4C4F5D` | Primary text, headings |
| Cream | `#F8F2E8` | Background, light surfaces |
| Light Gold | `#F6E89C` | Subtle accents, hover states |
| Cyan | `#2BB6D9` | Links, interactive elements |

### Secondary Colors

| Color | Hex Code | Usage |
|-------|----------|-------|
| Teal | `#1F6D75` | Success states, secondary CTAs |
| Light Blue | `#A9D8E8` | Light backgrounds, subtle elements |
| Burgundy | `#953338` | Error states, warnings |

---

## Typography

### Font Families
- **Primary Font**: Nunito (headings, subheadings)
- **Secondary Font**: Montserrat (body text, paragraphs)

### Font Weights

| Style | Font | Weight | Usage |
|-------|------|--------|-------|
| Header | Nunito | Bold (700) | Page titles, main headings |
| Subheading | Nunito | Semibold (600) | Section titles, secondary headings |
| Body | Montserrat | Regular (400) | Paragraphs, descriptions |
| Body Small | Montserrat | Regular (400) | Captions, labels |

---

## Implementation

All brand colors and fonts are defined in `branding.config.js`. Import and use them in your components:

```javascript
import { branding } from '@/branding.config';

// Use colors
const style = {
  color: branding.colors.primary.dark,
  backgroundColor: branding.colors.background,
};

// Use fonts
const headingStyle = {
  fontFamily: branding.fonts.primary,
  fontWeight: branding.fonts.weights.bold,
};
```

---

## Color Usage Guidelines

- **Gold (#FDBB38)**: Use for primary CTAs, important highlights, and brand-forward elements
- **Dark Charcoal (#4C4F5D)**: Use for all primary text and main headings
- **Cream (#F8F2E8)**: Use as page background or light card surfaces
- **Cyan (#2BB6D9)**: Use for links, interactive elements, and secondary CTAs
- **Teal (#1F6D75)**: Use for success messages and confirmation states
- **Burgundy (#953338)**: Use for error messages and warnings only

---

## Notes

- All Google Fonts are web-safe and load from Google's CDN
- Ensure sufficient contrast ratios for accessibility (WCAG AA standard)
- Test colors in different lighting conditions for web viewing
