import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { handleToEmail } from "@second-brain/shared/domain/accounts";
import { APP_NAME, AUTH_CALLBACK_URL } from "@/lib/branding";
import { supabase } from "@/lib/supabase";

const PLACEHOLDER = "#9ca3af";
const RESEND_COOLDOWN = 60;

type Mode = "magic" | "password";

export default function SignIn() {
  const [mode, setMode] = useState<Mode>("magic");
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function describe(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (/rate|too many|429/i.test(msg)) {
      return "Too many attempts. Wait a minute and try again.";
    }
    return msg;
  }

  async function sendMagicLink() {
    if (!email.trim()) return setError("Enter your email address.");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    setBusy(false);
    if (err) return setError(describe(err));
    setSent(true);
    setCooldown(RESEND_COOLDOWN);
  }

  async function verifyCode() {
    if (code.trim().length < 6) return setError("Enter the 6-digit code.");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (err) return setError(describe(err));
    router.replace("/");
  }

  async function signInPassword() {
    if (!username.trim() || !password) {
      return setError("Enter your username and password.");
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: handleToEmail(username),
      password,
    });
    setBusy(false);
    if (err) return setError("Wrong username or password.");
    router.replace("/");
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 justify-center gap-5 px-6">
          <Text className="text-2xl text-fg">{APP_NAME}</Text>

          {mode === "magic" && !sent && (
            <View className="gap-3">
              <Text className="text-fg-muted">
                Enter your email and we&apos;ll send a magic link and a code.
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={PLACEHOLDER}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                inputMode="email"
                className="h-11 rounded border border-border bg-surface px-3 text-fg"
              />
              <PrimaryButton label="Send magic link" busy={busy} onPress={sendMagicLink} />
            </View>
          )}

          {mode === "magic" && sent && (
            <View className="gap-3">
              <Text className="text-fg-muted">
                Check your email. Tap the link on this phone, or enter the
                6-digit code below.
              </Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor={PLACEHOLDER}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={6}
                className="h-11 rounded border border-border bg-surface px-3 text-fg"
              />
              <PrimaryButton label="Verify code" busy={busy} onPress={verifyCode} />
              <View className="flex-row items-center justify-between">
                <Pressable
                  disabled={cooldown > 0 || busy}
                  onPress={sendMagicLink}
                  className="h-11 justify-center"
                >
                  <Text className={cooldown > 0 ? "text-fg-muted" : "text-fg"}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setSent(false);
                    setCode("");
                    setError(null);
                  }}
                  className="h-11 justify-center"
                >
                  <Text className="text-fg">Use a different email</Text>
                </Pressable>
              </View>
            </View>
          )}

          {mode === "password" && (
            <View className="gap-3">
              <Text className="text-fg-muted">
                Sign in with your username and password.
              </Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                placeholderTextColor={PLACEHOLDER}
                autoCapitalize="none"
                autoCorrect={false}
                className="h-11 rounded border border-border bg-surface px-3 text-fg"
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="password"
                placeholderTextColor={PLACEHOLDER}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                className="h-11 rounded border border-border bg-surface px-3 text-fg"
              />
              <PrimaryButton label="Sign in" busy={busy} onPress={signInPassword} />
            </View>
          )}

          {error && <Text className="text-danger">{error}</Text>}

          <Pressable
            onPress={() => {
              setMode(mode === "magic" ? "password" : "magic");
              setSent(false);
              setError(null);
            }}
            className="h-11 justify-center"
          >
            <Text className="text-fg-muted">
              {mode === "magic"
                ? "Use a password instead"
                : "Email me a magic link instead"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={busy}
      onPress={onPress}
      className="h-11 flex-row items-center justify-center rounded bg-accent px-4"
    >
      {busy ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text className="font-medium text-accent-fg">{label}</Text>
      )}
    </Pressable>
  );
}
