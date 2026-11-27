import { useWindowDimensions } from 'react-native';

export type Device = 'phone' | 'tablet' | 'desktop';

/** Breite → Gerätetyp. Handy: Menü unten · iPad: Menü unten, breiter · PC: Menü links, zweispaltig */
export function useLayout() {
  const { width } = useWindowDimensions();
  const device: Device = width >= 1024 ? 'desktop' : width >= 700 ? 'tablet' : 'phone';
  return {
    width,
    device,
    /** Seitenleiste statt unterem Menü */
    sideNav: device === 'desktop',
    /** Zwei Spalten für Inhalte */
    twoColumns: width >= 900,
    /** Spalten für Raster (z. B. Übungen) */
    gridColumns: width >= 1280 ? 3 : width >= 700 ? 2 : 1,
    /** Seitenabstand des Inhalts (wie in Screen) */
    side: device === 'phone' ? 20 : 32,
  };
}

export const SIDE_NAV_WIDTH = 232;
export const BOTTOM_BAR_SPACE = 110;
