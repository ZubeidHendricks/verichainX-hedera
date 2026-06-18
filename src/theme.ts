/**
 * VeriChainX — Modern dark SaaS theme
 *
 * Near-black background with violet/cyan accents, crisp typography, and subtle
 * bordered "glass" surfaces (Linear / Vercel aesthetic).
 */

import { createTheme, alpha } from '@mui/material/styles';

const VIOLET = '#7C5CFF';
const CYAN = '#22D3EE';
const BG = '#0A0A0F';
const SURFACE = '#121219';

const subtle = '0 1px 2px rgba(0,0,0,0.4)';
const soft = '0 8px 30px rgba(0,0,0,0.5)';
const glow = `0 0 0 1px ${alpha(VIOLET, 0.4)}, 0 8px 40px ${alpha(VIOLET, 0.25)}`;

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: VIOLET, light: '#9D86FF', dark: '#5B3EE8', contrastText: '#FFFFFF' },
    secondary: { main: CYAN, light: '#67E8F9', dark: '#0E9AB5', contrastText: '#04121A' },
    background: { default: BG, paper: SURFACE },
    text: { primary: '#ECECF1', secondary: '#A1A1AA', disabled: 'rgba(255,255,255,0.4)' },
    success: { main: '#22C55E' },
    warning: { main: '#F59E0B' },
    error: { main: '#EF4444' },
    info: { main: CYAN },
    divider: 'rgba(255,255,255,0.08)',
  },
  typography: {
    fontFamily: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'].join(','),
    h1: { fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em' },
    h2: { fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.025em' },
    h3: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em' },
    h4: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.015em' },
    h5: { fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontSize: '1.05rem', fontWeight: 600 },
    body1: { fontSize: '1rem', lineHeight: 1.65, color: '#C7C7D1' },
    body2: { fontSize: '0.9rem', lineHeight: 1.6, color: '#A1A1AA' },
    button: { fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
    overline: { letterSpacing: '0.12em', fontWeight: 700 },
  },
  shape: { borderRadius: 14 },
  shadows: [
    'none', subtle, subtle, soft, soft, soft, soft, soft, soft, soft, soft, soft, soft,
    soft, soft, soft, soft, soft, soft, soft, soft, soft, soft, soft, glow,
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: BG,
          backgroundImage:
            `radial-gradient(60% 50% at 50% 0%, ${alpha(VIOLET, 0.18)} 0%, transparent 60%),` +
            `radial-gradient(40% 40% at 90% 10%, ${alpha(CYAN, 0.1)} 0%, transparent 60%)`,
          backgroundAttachment: 'fixed',
        },
        '::selection': { background: alpha(VIOLET, 0.4) },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 20, paddingBlock: 9 },
        containedPrimary: {
          background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`,
          color: '#fff',
          '&:hover': { background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`, filter: 'brightness(1.1)' },
        },
        outlined: { borderColor: 'rgba(255,255,255,0.16)', color: '#ECECF1', '&:hover': { borderColor: VIOLET, background: alpha(VIOLET, 0.08) } },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.08)',
          backgroundColor: alpha('#16161F', 0.7),
          backdropFilter: 'blur(12px)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(255,255,255,0.08)',
          backgroundColor: alpha('#16161F', 0.7),
          backgroundImage: 'none',
          backdropFilter: 'blur(12px)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
        outlined: { borderColor: 'rgba(255,255,255,0.16)' },
      },
    },
    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255,255,255,0.03)',
          '& fieldset': { borderColor: 'rgba(255,255,255,0.14)' },
          '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.28)' },
        },
      },
    },
    MuiTableCell: { styleOverrides: { root: { borderColor: 'rgba(255,255,255,0.07)' } } },
    MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});

export default theme;
export { VIOLET, CYAN, BG, SURFACE };
