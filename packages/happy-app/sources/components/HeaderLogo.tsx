import * as React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useUnistyles } from 'react-native-unistyles';
import { desktopBrandAccessibilityLabel, desktopLogoSource } from '@/brand/desktopBrand';

/**
 * Shared header logo component used across all main tabs.
 * Extracted to prevent flickering on tab switches - when each tab
 * had its own HeaderLeft, the component would unmount/remount.
 */
export const HeaderLogo = React.memo(() => {
    const { theme } = useUnistyles();
    return (
        <View style={{
            width: 32,
            height: 32,
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <Image
                source={desktopLogoSource(theme.dark)}
                contentFit="contain"
                style={{ width: 24, height: 24 }}
                tintColor={theme.colors.header.tint}
                accessibilityLabel={desktopBrandAccessibilityLabel()}
            />
        </View>
    );
});
