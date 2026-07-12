import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="container" style={{ paddingTop: "4rem", maxWidth: "26rem" }}>
      <div className="card">
        <h1>Sign-in link didn&apos;t work</h1>
        <p>
          That magic link was invalid or expired. Magic links are single-use
          and time-limited — request a fresh one. (If you&apos;re already
          signed in, just head to the app.)
        </p>
        <p>
          <Link href="/login" className="btn btn-primary">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
