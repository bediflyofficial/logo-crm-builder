import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Bedifly CRM" },
      { name: "description", content: "Securely set a new password for your Bedifly CRM account." },
      { property: "og:title", content: "Reset password — Bedifly CRM" },
      { property: "og:description", content: "Securely set a new password for your Bedifly CRM account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [validRecovery, setValidRecovery] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const isRecoveryLink = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    const checkRecovery = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (active) setValidRecovery(isRecoveryLink && !sessionError && Boolean(data.session));
    };
    void checkRecovery();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) setValidRecovery(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) { setError("Use at least 8 characters for your new password."); return; }
    if (password !== repeatPassword) { setError("The passwords do not match."); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    await supabase.auth.signOut();
    toast.success("Your password was updated. Sign in with your new password.");
    window.location.assign("/");
  }

  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
    <section className="crm-card w-full max-w-[420px] p-6 sm:p-8">
      <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary"><LockKeyhole className="size-5" /></div>
      <h1 className="mt-5 text-xl font-semibold text-foreground">Set a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose a secure password for your Bedifly CRM account.</p>
      {validRecovery === null ? <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Checking the secure link…</p>
        : !validRecovery ? <div className="mt-5 space-y-4"><p className="rounded-md border border-accent bg-accent/40 p-3 text-xs leading-relaxed text-accent-foreground">This password link has expired or is invalid. Request a new link from the sign-in screen.</p><Button asChild variant="outline" className="w-full"><a href="/"><ArrowLeft className="size-4" /> Back to sign in</a></Button></div>
          : <form onSubmit={submit} className="mt-6 space-y-4"><label className="grid gap-1.5 text-xs font-medium text-foreground">New password<Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label className="grid gap-1.5 text-xs font-medium text-foreground">Confirm new password<Input type="password" autoComplete="new-password" minLength={8} value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} required /></label>{error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}<Button disabled={busy} className="w-full">{busy && <LoaderCircle className="size-4 animate-spin" />}Update password</Button></form>}
    </section>
  </main>;
}