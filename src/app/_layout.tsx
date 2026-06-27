import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="profile/statistics" />
        <Stack.Screen name="profile/history" />
        <Stack.Screen name="profile/achievements" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="permissions/location" />
        <Stack.Screen name="permissions/battery" />
      </Stack>
    </ThemeProvider>
  );
}
