import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main>
      <h1>Sign-in link didn&apos;t work</h1>
      <p>
        That magic link was invalid or expired. Magic links are single-use and
        time-limited — request a fresh one.
      </p>
      <p>
        <Link href="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
