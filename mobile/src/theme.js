import brand from '../brand.json';

// One light palette with a pale blue background. The app stays light even when the phone is in dark mode.
const light = { bg: '#edf1fd', card: '#ffffff', ink: '#2b2a33', muted: '#6b7286', line: '#e1e6f5', soft: '#edf2ff' };

export const C = {
  primary: brand.primary, primary2: brand.primaryDark,
  like: '#2fb380', nope: '#ff5864', super: '#3fa9f5', gold: '#f7b500', purple: '#a855f7',
  ok: '#2b8a3e', warn: '#b26b00', err: '#c92a2a',
};

export function useTheme() {
  return light;
}
export { brand };
