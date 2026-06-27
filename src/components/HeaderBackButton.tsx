import { Text, TouchableOpacity, StyleSheet } from "react-native";

type HeaderBackButtonProps = {
  onPress: () => void;
};

export function HeaderBackButton({ onPress }: HeaderBackButtonProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Назад"
      activeOpacity={0.82}
      style={styles.button}
      onPress={onPress}
    >
      <Text style={styles.icon}>‹</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: "#151C33",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  icon: {
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 30,
    fontWeight: "800",
    includeFontPadding: false,
    textAlign: "center",
    textAlignVertical: "center",
    transform: [{ translateY: -1 }],
  },
});
