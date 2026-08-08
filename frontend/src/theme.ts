import { alpha, createTheme } from "@mui/material/styles";

interface AppPalette {
  surface: {
    hoverSubtle: string;
    muted: string;
    interactive: string;
    selected: string;
    glass: string;
  };
  border: {
    subtle: string;
    default: string;
    strong: string;
  };
  accent: {
    primaryPale: string;
    secondaryPale: string;
    secondaryHover: string;
    secondaryBorder: string;
    purple: string;
    purpleLight: string;
    errorPale: string;
    warning: string;
    warningLight: string;
    warningPale: string;
  };
  tone: {
    primary: {
      faint: string;
      subtle: string;
      soft: string;
      border: string;
      strongBorder: string;
    };
    secondary: {
      faint: string;
      subtle: string;
      soft: string;
      border: string;
      strongBorder: string;
    };
    error: {
      faint: string;
      subtle: string;
      soft: string;
      border: string;
      strongBorder: string;
    };
    warning: {
      subtle: string;
      soft: string;
    };
  };
  overlay: {
    faint: string;
    subtle: string;
    medium: string;
    strong: string;
    darkFaint: string;
    darkSoft: string;
    scrim: string;
  };
  gradient: {
    brand: string;
    feature: string;
  };
  shadow: {
    primaryGlow: string;
    sheet: string;
    familiarityGlow: string;
    primarySoft: string;
    primarySmall: string;
    secondarySoft: string;
    card: string;
    secondaryInset: string;
    lightGlow: string;
  };
  marketing: {
    canvas: string;
    surface: string;
    surfaceStrong: string;
    text: string;
    textStrong: string;
    textSoft: string;
    textMuted: string;
    textSubtle: string;
    textFaint: string;
    border: string;
    borderSubtle: string;
    borderStrong: string;
    primary: string;
    primaryHover: string;
    primaryPale: string;
    primaryDark: string;
    primaryBorder: string;
    cta: string;
    ctaText: string;
    ctaHover: string;
    darkCta: string;
    darkCtaHover: string;
    link: string;
    linkHover: string;
  };
}

declare module "@mui/material/styles" {
  interface TypeBackground {
    sunken: string;
    elevated: string;
    hover: string;
  }

  interface Palette {
    app: AppPalette;
  }

  interface PaletteOptions {
    app?: AppPalette;
  }
}

const base = {
  canvas: "#050508",
  sunken: "#0a0a0f",
  paper: "#0f0f16",
  elevated: "#1a1a24",
  hover: "#242431",
  borderStrong: "#2a2a38",
  emerald: "#10b981",
  emeraldLight: "#34d399",
  emeraldDark: "#065f46",
  emeraldPale: "#6ee7b7",
  indigo: "#4338ca",
  indigoBorder: "#6366f1",
  indigoLight: "#818cf8",
  indigoDark: "#312e81",
  indigoPale: "#a5b4fc",
  orange: "#ff9800",
  red: "#ef4444",
  redLight: "#f87171",
  purple: "#a78bfa",
  white: "#ffffff",
} as const;

/**
 * Application UI colors live here. Illustration palettes belong beside their
 * artwork (for example components/artwork/CollectionTree.tsx) and must not be
 * added to this theme.
 */
export const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: base.emerald,
      light: base.emeraldLight,
      dark: base.emeraldDark,
      contrastText: base.canvas,
    },
    secondary: {
      main: base.indigo,
      light: base.indigoLight,
      dark: base.indigoDark,
      contrastText: base.white,
    },
    success: {
      main: base.emerald,
      light: base.emeraldLight,
      dark: base.emeraldDark,
      contrastText: base.canvas,
    },
    warning: {
      main: base.orange,
    },
    error: {
      main: base.red,
      light: base.redLight,
    },
    background: {
      default: base.canvas,
      sunken: base.sunken,
      paper: base.paper,
      elevated: base.elevated,
      hover: base.hover,
    },
    text: {
      primary: "rgba(255,255,255,0.92)",
      secondary: "rgba(255,255,255,0.70)",
      disabled: "rgba(255,255,255,0.50)",
    },
    divider: base.elevated,
    action: {
      hover: alpha(base.white, 0.06),
      selected: alpha(base.indigoLight, 0.14),
      disabled: alpha(base.white, 0.3),
      disabledBackground: alpha(base.white, 0.08),
    },
    app: {
      surface: {
        hoverSubtle: "#14141d",
        muted: "#15151e",
        interactive: "#252534",
        selected: "#292938",
        glass: alpha(base.paper, 0.8),
      },
      border: {
        subtle: alpha(base.white, 0.06),
        default: base.elevated,
        strong: base.borderStrong,
      },
      accent: {
        primaryPale: base.emeraldPale,
        secondaryPale: base.indigoPale,
        secondaryHover: "#4f46e5",
        secondaryBorder: base.indigoBorder,
        purple: base.purple,
        purpleLight: "#c084fc",
        errorPale: "#fca5a5",
        warning: "#f97316",
        warningLight: "#fb923c",
        warningPale: "#fed7aa",
      },
      tone: {
        primary: {
          faint: alpha(base.emerald, 0.08),
          subtle: alpha(base.emerald, 0.1),
          soft: alpha(base.emerald, 0.15),
          border: alpha(base.emeraldLight, 0.28),
          strongBorder: alpha(base.emerald, 0.5),
        },
        secondary: {
          faint: alpha(base.indigoLight, 0.1),
          subtle: alpha(base.indigo, 0.12),
          soft: alpha(base.indigoLight, 0.15),
          border: alpha(base.indigoLight, 0.3),
          strongBorder: alpha(base.indigoLight, 0.5),
        },
        error: {
          faint: alpha(base.redLight, 0.08),
          subtle: alpha(base.red, 0.12),
          soft: alpha(base.red, 0.15),
          border: alpha(base.redLight, 0.22),
          strongBorder: alpha(base.redLight, 0.5),
        },
        warning: {
          subtle: alpha(base.orange, 0.1),
          soft: alpha(base.orange, 0.15),
        },
      },
      overlay: {
        faint: alpha(base.white, 0.04),
        subtle: alpha(base.white, 0.1),
        medium: alpha(base.white, 0.12),
        strong: alpha(base.white, 0.2),
        darkFaint: alpha(base.canvas, 0.1),
        darkSoft: alpha(base.canvas, 0.25),
        scrim: alpha(base.canvas, 0.6),
      },
      gradient: {
        brand: `linear-gradient(135deg, ${base.emeraldLight}, ${base.indigo})`,
        feature: `linear-gradient(135deg, ${base.emeraldDark}, ${base.indigoDark})`,
      },
      shadow: {
        primaryGlow: `0 0 30px ${alpha(base.emerald, 0.3)}`,
        sheet: `0 -16px 50px ${alpha(base.canvas, 0.45)}`,
        familiarityGlow: `0 0 8px ${alpha(base.emeraldLight, 0.8)}`,
        primarySoft: `0 0 20px ${alpha(base.emerald, 0.2)}`,
        primarySmall: `0 0 15px ${alpha(base.emerald, 0.2)}`,
        secondarySoft: `0 0 20px ${alpha(base.indigo, 0.3)}`,
        card: `0 8px 32px ${alpha(base.canvas, 0.3)}`,
        secondaryInset: `inset 0 0 15px ${alpha(base.indigoBorder, 0.2)}`,
        lightGlow: `0 0 30px ${alpha(base.white, 0.3)}`,
      },
      marketing: {
        canvas: "#080b0a",
        surface: "#0c100e",
        surfaceStrong: "#133a2b",
        text: "#f2f5f3",
        textStrong: "#f4f7f5",
        textSoft: "#aeb8b3",
        textMuted: "#929e98",
        textSubtle: "#68746e",
        textFaint: "#59655f",
        border: "#2a332f",
        borderSubtle: "#18201c",
        borderStrong: "#334039",
        primary: "#3dbb83",
        primaryHover: "#64cfa0",
        primaryPale: "#6ec99f",
        primaryDark: "#39755b",
        primaryBorder: "#28664e",
        cta: "#dfe9e4",
        ctaText: "#0b100d",
        ctaHover: "#f0f5f2",
        darkCta: "#0d1712",
        darkCtaHover: "#19291f",
        link: "#728078",
        linkHover: "#b8c2bd",
      },
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: base.canvas,
        },
      },
    },
  },
});
