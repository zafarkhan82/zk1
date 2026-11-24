import { Image, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { logoSrc } from '@/lib/org';

/** Rundes Verbandslogo auf hellem Grund (gut lesbar im dunklen Design) */
export function UnitLogoImage({ url, size = 40, label }: { url: string | null | undefined; size?: number; label?: string }) {
  const theme = useTheme();
  const src = logoSrc(url);
  return (
    <View
      accessibilityLabel={label ? `Logo ${label}` : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: src ? '#F4F6F8' : theme.backgroundSelected,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
      {src && <Image source={{ uri: src }} style={{ width: size * 0.84, height: size * 0.84 }} resizeMode="contain" accessibilityIgnoresInvertColors />}
    </View>
  );
}
