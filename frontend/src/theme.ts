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
    backdrop: string;
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
  backdrop: "#747C8F",
  canvas: "#343A48",
  sunken: "#2B303C",
  paper: "#454D5E",
  elevated: "#555E72",
  hover: "#626C81",
  borderStrong: "#778196",
  primary: "#D6E2DF",
  primaryLight: "#E4EBE9",
  primaryDark: "#849B96",
  primaryPale: "#EEF2F1",
  secondary: "#C6B0B8",
  secondaryBorder: "#D8C8CE",
  secondaryLight: "#D8C8CE",
  secondaryDark: "#846F77",
  secondaryPale: "#E7DCE0",
  warning: "#CA7288",
  warningLight: "#D58D9F",
  warningDark: "#8C4C5C",
  warningPale: "#E8C2CB",
  ink: "#30343F",
  white: "#F5F5F5",
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
      main: base.primary,
      light: base.primaryLight,
      dark: base.primaryDark,
      contrastText: base.ink,
    },
    secondary: {
      main: base.secondary,
      light: base.secondaryLight,
      dark: base.secondaryDark,
      contrastText: base.ink,
    },
    success: {
      main: base.primary,
      light: base.primaryLight,
      dark: base.primaryDark,
      contrastText: base.ink,
    },
    warning: {
      main: base.warning,
      light: base.warningLight,
      contrastText: base.ink,
    },
    error: {
      main: base.warning,
      light: base.warningLight,
      dark: base.warningDark,
      contrastText: base.ink,
    },
    background: {
      backdrop: base.backdrop,
      default: base.canvas,
      sunken: base.sunken,
      paper: base.paper,
      elevated: base.elevated,
      hover: base.hover,
    },
    text: {
      primary: alpha(base.white, 0.96),
      secondary: alpha(base.white, 0.76),
      disabled: alpha(base.white, 0.54),
    },
    divider: base.elevated,
    action: {
      hover: alpha(base.white, 0.06),
      selected: alpha(base.secondaryLight, 0.18),
      disabled: alpha(base.white, 0.3),
      disabledBackground: alpha(base.white, 0.08),
    },
    app: {
      surface: {
        hoverSubtle: "#4A5365",
        muted: "#4D5668",
        interactive: base.hover,
        selected: "#687286",
        glass: alpha(base.paper, 0.8),
      },
      border: {
        subtle: alpha(base.white, 0.06),
        default: base.elevated,
        strong: base.borderStrong,
      },
      accent: {
        primaryPale: base.primaryPale,
        secondaryPale: base.secondaryPale,
        secondaryHover: base.secondaryLight,
        secondaryBorder: base.secondaryBorder,
        purple: base.secondary,
        purpleLight: base.secondaryPale,
        errorPale: base.warningPale,
        warning: base.warning,
        warningLight: base.warningLight,
        warningPale: base.warningPale,
      },
      tone: {
        primary: {
          faint: alpha(base.primary, 0.08),
          subtle: alpha(base.primary, 0.12),
          soft: alpha(base.primary, 0.18),
          border: alpha(base.primaryLight, 0.32),
          strongBorder: alpha(base.primary, 0.56),
        },
        secondary: {
          faint: alpha(base.secondaryLight, 0.1),
          subtle: alpha(base.secondary, 0.14),
          soft: alpha(base.secondaryLight, 0.18),
          border: alpha(base.secondaryLight, 0.34),
          strongBorder: alpha(base.secondaryLight, 0.56),
        },
        error: {
          faint: alpha(base.warningLight, 0.08),
          subtle: alpha(base.warning, 0.12),
          soft: alpha(base.warning, 0.16),
          border: alpha(base.warningLight, 0.24),
          strongBorder: alpha(base.warningLight, 0.52),
        },
        warning: {
          subtle: alpha(base.warning, 0.12),
          soft: alpha(base.warning, 0.18),
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
        brand: `linear-gradient(135deg, ${base.primaryLight}, ${base.secondary})`,
        feature: `linear-gradient(135deg, ${base.primaryDark}, ${base.secondaryDark})`,
      },
      shadow: {
        primaryGlow: `0 0 30px ${alpha(base.primary, 0.24)}`,
        sheet: `0 -16px 50px ${alpha(base.sunken, 0.45)}`,
        familiarityGlow: `0 0 8px ${alpha(base.primaryLight, 0.64)}`,
        primarySoft: `0 0 20px ${alpha(base.primary, 0.18)}`,
        primarySmall: `0 0 15px ${alpha(base.primary, 0.18)}`,
        secondarySoft: `0 0 20px ${alpha(base.secondary, 0.24)}`,
        card: `0 8px 32px ${alpha(base.sunken, 0.3)}`,
        secondaryInset: `inset 0 0 15px ${alpha(base.secondaryBorder, 0.2)}`,
        lightGlow: `0 0 30px ${alpha(base.white, 0.3)}`,
      },
      marketing: {
        canvas: base.canvas,
        surface: "#3B4251",
        surfaceStrong: "#5C6C68",
        text: base.white,
        textStrong: base.white,
        textSoft: "#DFE2E8",
        textMuted: "#C9CED7",
        textSubtle: "#ABB2C0",
        textFaint: "#9DA5B4",
        border: "#687286",
        borderSubtle: "#5C667A",
        borderStrong: base.borderStrong,
        primary: base.primary,
        primaryHover: base.primaryLight,
        primaryPale: base.primaryPale,
        primaryDark: "#7E9690",
        primaryBorder: "#AABDB8",
        cta: base.primary,
        ctaText: base.ink,
        ctaHover: base.primaryPale,
        darkCta: "#2F3937",
        darkCtaHover: "#414C49",
        link: "#BCC2CD",
        linkHover: base.white,
      },
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: base.backdrop,
        },
      },
    },
  },
});
