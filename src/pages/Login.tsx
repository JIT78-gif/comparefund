import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Mail, ArrowRight, CheckCircle } from "lucide-react";

const Login = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/magic-link-login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ email: email.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send magic link";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-bold text-3xl text-foreground mb-1">
            FIDC<span className="text-primary">.</span>Intel
          </h1>
          <p className="text-muted-foreground text-sm">Acesso restrito por convite</p>
        </div>

        <div className="border border-border/60 rounded-md p-8 bg-card">
          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-primary mx-auto" />
              <h2 className="font-bold text-xl text-foreground">Link enviado!</h2>
              <p className="text-muted-foreground text-sm">
                Verifique sua caixa de entrada em <strong className="text-foreground">{email}</strong> e clique no link para entrar.
              </p>
              <Button
                variant="ghost"
                className="text-sm"
                onClick={() => { setSent(false); setEmail(""); }}
              >
                Usar outro email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <Mail className="h-5 w-5 text-primary" />
                <h2 className="font-bold text-lg text-foreground">Entrar com email</h2>
              </div>
              <p className="text-muted-foreground text-sm">
                Insira seu email autorizado para receber um link de acesso.
              </p>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              <Button type="submit" className="w-full gap-2" disabled={loading || !email.trim()}>
                {loading ? "Enviando..." : "Enviar link de acesso"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-muted-foreground text-xs mt-6">
          Apenas emails autorizados podem acessar esta plataforma.
        </p>
      </div>
    </div>
  );
};

export default Login;
