import brand from '../brand.json';

// One light palette: a warm off-white background with white surfaces and deep ink, so photos and the brand blue
// carry the colour. The app stays light even when the phone is in dark mode.
const light = { bg: '#f6f4f1', card: '#ffffff', ink: '#1c1b22', muted: '#6e6a76', line: '#e8e4de', soft: '#f0ede8', tint: '#eef1fc' };

export const C = {
  primary: brand.primary, primary2: brand.primaryDark,
  like: '#22b07d', like2: '#5fd3a0', nope: '#ff4d5e', super: '#2f9bf0', gold: '#f5a800', purple: '#8b5cf6',
  ok: '#2b8a3e', warn: '#b26b00', err: '#c92a2a',
};

/** Soft, layered shadows: `lift.sm` for cards and inputs, `lift.md` for buttons and floating bars, `lift.lg` for the swipe card. */
export const lift = {
  sm: { shadowColor: '#1c1b22', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  md: { shadowColor: '#1c1b22', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  lg: { shadowColor: '#1c1b22', shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
};

export function useTheme() {
  return light;
}
export { brand };
