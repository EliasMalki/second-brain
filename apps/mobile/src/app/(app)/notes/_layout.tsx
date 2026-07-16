import { Stack } from "expo-router";

/**
 * Notes is a three-level drill-down inside the drawer: home (index) → note
 * list → the note editor. A native Stack (react-native-screens) gives the iOS
 * interactive back-swipe for free, walking up the levels. Headers stay off —
 * each screen draws its own token-styled chrome (hamburger on the home level,
 * a back chevron deeper), matching the rest of the app.
 */
export default function NotesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
