// Events Malta - Brand Configuration
// Central source of truth for all brand colors, fonts, and design tokens

export const branding = {
  colors: {
    // Primary Colors
    primary: {
      gold: '#FDBB38',
      dark: '#4C4F5D',
      cream: '#F8F2E8',
      lightGold: '#F6E89C',
      cyan: '#2BB6D9',
    },

    // Secondary Colors
    secondary: {
      teal: '#1F6D75',
      lightBlue: '#A9D8E8',
      burgundy: '#953338',
    },

    // Semantic Colors (for common use cases)
    background: '#F8F2E8',
    surface: '#FFFFFF',
    text: {
      primary: '#4C4F5D',
      secondary: '#6B7280',
      light: '#F8F2E8',
    },
    accent: '#2BB6D9',
    success: '#1F6D75',
    error: '#953338',
    warning: '#FDBB38',
  },

  fonts: {
    // Font Family Configuration
    primary: 'Nunito, sans-serif',
    secondary: 'Montserrat, sans-serif',

    // Font Weights
    weights: {
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extraBold: 800,
    },

    // Typography Presets
    heading: {
      fontFamily: 'Nunito, sans-serif',
      fontWeight: 700,
      letterSpacing: '-0.5px',
    },
    subheading: {
      fontFamily: 'Nunito, sans-serif',
      fontWeight: 600,
      letterSpacing: '-0.25px',
    },
    body: {
      fontFamily: 'Montserrat, sans-serif',
      fontWeight: 400,
      letterSpacing: '0px',
    },
    bodySmall: {
      fontFamily: 'Montserrat, sans-serif',
      fontWeight: 400,
      fontSize: '0.875rem',
    },
  },

  // Spacing Scale (optional, for consistency)
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },

  // Border Radius (optional)
  borderRadius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '1rem',
    full: '9999px',
  },
};

// Example usage in components:
// import { branding } from '@/branding.config';
//
// const headingStyle = {
//   color: branding.colors.primary.dark,
//   fontFamily: branding.fonts.heading.fontFamily,
//   fontWeight: branding.fonts.heading.fontWeight,
// };
