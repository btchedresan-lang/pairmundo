import { useColorScheme } from 'react-native';
import brand from '../brand.json';

const light = { bg: '#f6f7fb', card: '#ffffff', ink: '#1d2433', muted: '#667085', line: '#e4e7ec', soft: '#fff0f4' };
const dark = { bg: '#11141b', card: '#1a1f2a', ink: '#e8eaf0', muted: '#98a2b3', line: '#2a3140', soft: '#2a1a22' };

export const C = {
  primary: brand.primary, primary2: brand.primaryDark,
  like: '#2fb380', nope: '#ff5864', super: '#3fa9f5', gold: '#f7b500', purple: '#a855f7',
  ok: '#2b8a3e', warn: '#b26b00', err: '#c92a2a',
};

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}
export { brand };
