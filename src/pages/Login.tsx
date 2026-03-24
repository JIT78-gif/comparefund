import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Mail, ArrowRight, Lock } from "lucide-react";
import { login, register } from "@/lib/api";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    try {
      if (isRegister) {
        await register(email.trim(), password);
        toast({ title: "Conta criada com sucesso!" });
      } else {
        await login(email.trim(), password);
      }
      navigate("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to authenticate";
      toast({ title: "Erro", description: message, variant: "destructive" });
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
          <p className="text-muted-foreground text-sm">
            {isRegister ? "Criar nova conta" : "Acesse sua conta"}
          </p>
        </div>

        <div className="border border-border rounded-md p-8 bg-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Mail className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-lg text-foreground">
                {isRegister ? "Registrar" : "Entrar"}
              </h2>
            </div>
            <Input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-10"
              />
            </div>
            <Button type="submit" className="w-full gap-2" disabled={loading || !email.trim() || !password.trim()}>
              {loading ? "Processando..." : isRegister ? "Criar conta" : "Entrar"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
              onClick={() => setIsRegister(!isRegister)}
            >
              {isRegister ? "Já tem conta? Entrar" : "Não tem conta? Registrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
