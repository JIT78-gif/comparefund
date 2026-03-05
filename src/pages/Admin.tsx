import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { fetchCompetitors, invokeCompetitorAdmin, type Competitor } from "@/lib/competitors";
import { Plus, Trash2, ChevronDown, ChevronRight, Upload, Building2, Settings } from "lucide-react";

const Admin = () => {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState(() => sessionStorage.getItem("admin_pw") || "");
  const [authenticated, setAuthenticated] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Dialogs
  const [addCompOpen, setAddCompOpen] = useState(false);
  const [addCnpjOpen, setAddCnpjOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [newCompName, setNewCompName] = useState("");
  const [targetCompId, setTargetCompId] = useState("");
  const [newCnpj, setNewCnpj] = useState("");
  const [newFundName, setNewFundName] = useState("");
  const [newFundType, setNewFundType] = useState("");
  const [bulkCsv, setBulkCsv] = useState("");

  const { data: competitors = [], isLoading } = useQuery({
    queryKey: ["competitors"],
    queryFn: fetchCompetitors,
  });

  // Try auto-auth with stored password
  useEffect(() => {
    if (password && !authenticated) {
      invokeCompetitorAdmin("list", {}, password)
        .then(() => setAuthenticated(true))
        .catch(() => { sessionStorage.removeItem("admin_pw"); setPassword(""); });
    }
  }, []);

  const handleLogin = () => {
    setPassword(pwInput);
    sessionStorage.setItem("admin_pw", pwInput);
    setAuthenticated(true);
  };

  const mutation = useMutation({
    mutationFn: async (args: { action: string; payload: Record<string, unknown> }) =>
      invokeCompetitorAdmin(args.action, args.payload, password),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["competitors"] }),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddCompetitor = () => {
    if (!newCompName.trim()) return;
    mutation.mutate({ action: "add_competitor", payload: { name: newCompName.trim() } });
    setNewCompName("");
    setAddCompOpen(false);
    toast({ title: "Competitor added" });
  };

  const handleAddCnpj = () => {
    if (!targetCompId || !newCnpj.trim()) return;
    mutation.mutate({
      action: "add_cnpj",
      payload: {
        competitor_id: targetCompId,
        cnpj: newCnpj.trim(),
        fund_name: newFundName.trim() || null,
        fund_type_override: newFundType || null,
      },
    });
    setNewCnpj("");
    setNewFundName("");
    setNewFundType("");
    setAddCnpjOpen(false);
    toast({ title: "CNPJ added" });
  };

  const handleBulkImport = () => {
    if (!targetCompId || !bulkCsv.trim()) return;
    mutation.mutate({ action: "bulk_import_cnpjs", payload: { competitor_id: targetCompId, csv_text: bulkCsv } });
    setBulkCsv("");
    setBulkOpen(false);
    toast({ title: "Bulk import submitted" });
  };

  const formatCnpj = (cnpj: string) => {
    if (cnpj.length !== 14) return cnpj;
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 px-4 md:px-[60px] max-w-[600px] mx-auto">
          <div className="border border-border rounded-md p-8 bg-card">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="h-6 w-6 text-primary" />
              <h1 className="font-display font-extrabold text-2xl text-foreground">Admin Access</h1>
            </div>
            <p className="text-muted-foreground text-sm mb-4">Enter the admin password to manage competitors and CNPJs.</p>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Password"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <Button onClick={handleLogin}>Enter</Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 px-3 sm:px-4 md:px-[60px] pb-12 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-foreground">
              Competitor Management
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Manage fund managers and their CNPJs</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={addCompOpen} onOpenChange={setAddCompOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Competitor</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Competitor</DialogTitle></DialogHeader>
                <Input placeholder="Competitor name" value={newCompName} onChange={(e) => setNewCompName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddCompetitor()} />
                <Button onClick={handleAddCompetitor} disabled={!newCompName.trim()}>Add</Button>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : (
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-display w-8"></th>
                  <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-display">Name</th>
                  <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-display">Slug</th>
                  <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-display">CNPJs</th>
                  <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-display">Status</th>
                  <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-display">Actions</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((comp) => (
                  <>
                    <tr key={comp.id} className="border-t border-border hover:bg-muted/10 transition-colors">
                      <td className="p-3">
                        <button onClick={() => toggleExpand(comp.id)} className="text-muted-foreground hover:text-foreground">
                          {expanded.has(comp.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="p-3 font-display font-semibold text-foreground">{comp.name}</td>
                      <td className="p-3 font-mono text-muted-foreground">{comp.slug}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="font-mono">{comp.competitor_cnpjs.length}</Badge>
                      </td>
                      <td className="p-3">
                        <Switch
                          checked={comp.status === "active"}
                          onCheckedChange={(checked) =>
                            mutation.mutate({ action: "update_competitor", payload: { id: comp.id, status: checked ? "active" : "inactive" } })
                          }
                        />
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete ${comp.name} and all its CNPJs?`)) {
                              mutation.mutate({ action: "delete_competitor", payload: { id: comp.id } });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                    {expanded.has(comp.id) && (
                      <tr key={`${comp.id}-cnpjs`}>
                        <td colSpan={6} className="bg-muted/5 px-8 py-3">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs tracking-[2px] uppercase text-muted-foreground font-display">CNPJs for {comp.name}</span>
                            <div className="flex gap-2">
                              <Dialog open={addCnpjOpen && targetCompId === comp.id} onOpenChange={(o) => { setAddCnpjOpen(o); if (o) setTargetCompId(comp.id); }}>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setTargetCompId(comp.id)}>
                                    <Plus className="h-3 w-3" /> Add CNPJ
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader><DialogTitle>Add CNPJ to {comp.name}</DialogTitle></DialogHeader>
                                  <Input placeholder="CNPJ (14 digits)" value={newCnpj} onChange={(e) => setNewCnpj(e.target.value)} />
                                  <Input placeholder="Fund name (optional)" value={newFundName} onChange={(e) => setNewFundName(e.target.value)} />
                                  <Select value={newFundType} onValueChange={setNewFundType}>
                                    <SelectTrigger><SelectValue placeholder="Fund type override" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">None (auto-detect)</SelectItem>
                                      <SelectItem value="NP">NP (Non-Standard)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button onClick={handleAddCnpj} disabled={!newCnpj.trim()}>Add CNPJ</Button>
                                </DialogContent>
                              </Dialog>
                              <Dialog open={bulkOpen && targetCompId === comp.id} onOpenChange={(o) => { setBulkOpen(o); if (o) setTargetCompId(comp.id); }}>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setTargetCompId(comp.id)}>
                                    <Upload className="h-3 w-3" /> Bulk Import
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader><DialogTitle>Bulk Import CNPJs for {comp.name}</DialogTitle></DialogHeader>
                                  <p className="text-sm text-muted-foreground">One CNPJ per line. Format: <code>cnpj,fund_name</code></p>
                                  <Textarea placeholder="23216398000101,FIDC Name&#10;40211675000102" rows={6} value={bulkCsv} onChange={(e) => setBulkCsv(e.target.value)} />
                                  <Button onClick={handleBulkImport} disabled={!bulkCsv.trim()}>Import</Button>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </div>
                          {comp.competitor_cnpjs.length === 0 ? (
                            <p className="text-muted-foreground text-sm italic">No CNPJs registered</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                                  <th className="text-left pb-2">CNPJ</th>
                                  <th className="text-left pb-2">Fund Name</th>
                                  <th className="text-left pb-2">Type Override</th>
                                  <th className="text-left pb-2">Status</th>
                                  <th className="text-left pb-2"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {comp.competitor_cnpjs.map((cnpj) => (
                                  <tr key={cnpj.id} className="border-t border-border/50">
                                    <td className="py-2 font-mono text-foreground">{formatCnpj(cnpj.cnpj)}</td>
                                    <td className="py-2 text-muted-foreground">{cnpj.fund_name || "—"}</td>
                                    <td className="py-2">
                                      {cnpj.fund_type_override ? (
                                        <Badge variant="outline" className="text-xs">{cnpj.fund_type_override}</Badge>
                                      ) : (
                                        <span className="text-muted-foreground">Auto</span>
                                      )}
                                    </td>
                                    <td className="py-2">
                                      <Switch
                                        checked={cnpj.status === "active"}
                                        onCheckedChange={(checked) =>
                                          mutation.mutate({ action: "update_cnpj", payload: { id: cnpj.id, status: checked ? "active" : "inactive" } })
                                        }
                                      />
                                    </td>
                                    <td className="py-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive h-7 w-7 p-0"
                                        onClick={() => {
                                          if (confirm(`Delete CNPJ ${formatCnpj(cnpj.cnpj)}?`)) {
                                            mutation.mutate({ action: "delete_cnpj", payload: { id: cnpj.id } });
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default Admin;
