import { useState } from "react";
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
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, ChevronDown, ChevronRight, Upload, Building2, Users, Shield, Search, Loader2, UserCog } from "lucide-react";

interface AuthorizedEmail {
  id: string;
  email: string;
  status: string;
  created_at: string;
}

interface CvmSearchResult {
  cnpj: string;
  name: string;
  admin: string;
  tp_fundo_classe: string;
  condom: string;
}

interface ManagerFund {
  cnpj: string;
  name: string;
  admin: string;
  gestor: string;
  cnpj_gestor: string;
  tp_fundo: string;
  sit: string;
}

interface ManagerGroup {
  name: string;
  cnpj: string;
  funds: ManagerFund[];
}

interface UserWithRoles {
  id: string;
  email: string;
  created_at: string;
  roles: string[];
}

const Admin = () => {
  const queryClient = useQueryClient();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"competitors" | "emails" | "users">("competitors");

  // Competitor dialogs
  const [addCompOpen, setAddCompOpen] = useState(false);
  const [addCnpjOpen, setAddCnpjOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [newCompName, setNewCompName] = useState("");
  const [targetCompId, setTargetCompId] = useState("");
  const [newCnpj, setNewCnpj] = useState("");
  const [newFundName, setNewFundName] = useState("");
  const [newFundType, setNewFundType] = useState("");
  const [bulkCsv, setBulkCsv] = useState("");

  // Email dialog
  const [addEmailOpen, setAddEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  // CVM Search
  const [cvmSearchSource, setCvmSearchSource] = useState<"monthly" | "manager">("monthly");
  const [cvmSearchQuery, setCvmSearchQuery] = useState("");
  const [cvmSearchField, setCvmSearchField] = useState("ALL");
  const [cvmSearchMonth, setCvmSearchMonth] = useState("202412");
  const [cvmResults, setCvmResults] = useState<CvmSearchResult[]>([]);
  const [cvmSearching, setCvmSearching] = useState(false);
  const [cvmAddTarget, setCvmAddTarget] = useState("");

  // Manager search results
  const [managerResults, setManagerResults] = useState<ManagerGroup[]>([]);
  const [managerTotalFunds, setManagerTotalFunds] = useState(0);

  const { data: competitors = [], isLoading } = useQuery({
    queryKey: ["competitors"],
    queryFn: fetchCompetitors,
  });

  const { data: authorizedEmails = [], isLoading: emailsLoading } = useQuery({
    queryKey: ["authorized_emails"],
    queryFn: async () => {
      const data = await invokeCompetitorAdmin("list_authorized_emails");
      return data as AuthorizedEmail[];
    },
    enabled: isAdmin,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      const data = await invokeCompetitorAdmin("list_users");
      return data as UserWithRoles[];
    },
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: async (args: { action: string; payload: Record<string, unknown> }) =>
      invokeCompetitorAdmin(args.action, args.payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["competitors"] });
      if (variables.action.includes("cnpj") || variables.action.includes("competitor")) {
        queryClient.invalidateQueries({ queryKey: ["cvm-statements"] });
      }
      if (variables.action.includes("authorized_email")) {
        queryClient.invalidateQueries({ queryKey: ["authorized_emails"] });
      }
      if (variables.action.includes("user_role")) {
        queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      }
    },
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

  const handleAddEmail = () => {
    if (!newEmail.trim()) return;
    mutation.mutate({ action: "add_authorized_email", payload: { email: newEmail.trim() } });
    setNewEmail("");
    setAddEmailOpen(false);
    toast({ title: "Email added to whitelist" });
  };

  const handleCvmSearch = async () => {
    if (!cvmSearchQuery.trim()) return;
    setCvmSearching(true);
    setCvmResults([]);
    setManagerResults([]);
    setManagerTotalFunds(0);

    try {
      if (cvmSearchSource === "manager") {
        // Manager registry search
        const isCnpjSearch = /^\d{2,14}$/.test(cvmSearchQuery.replace(/[.\-\/]/g, ""));
        const body: Record<string, unknown> = { limit: 200 };
        if (isCnpjSearch) {
          body.searchCnpjs = [cvmSearchQuery];
          body.searchTerms = [];
        } else {
          body.searchTerms = [cvmSearchQuery];
        }
        const { data, error } = await supabase.functions.invoke("cvm-manager-search", { body });
        if (error) throw error;
        setManagerResults(data?.managers || []);
        setManagerTotalFunds(data?.total_funds || 0);
        if ((data?.managers || []).length === 0) {
          toast({ title: "No results", description: "No managers/funds found matching your search." });
        }
      } else {
        // Existing monthly data search
        const isCnpjSearch = /^\d{2,14}$/.test(cvmSearchQuery.replace(/[.\-\/]/g, ""));
        const body: Record<string, unknown> = { refMonth: cvmSearchMonth, limit: 50 };
        if (isCnpjSearch) {
          body.searchCnpjs = [cvmSearchQuery];
          body.searchTerms = [];
        } else {
          body.searchTerms = [cvmSearchQuery];
          body.searchField = cvmSearchField;
        }
        const { data, error } = await supabase.functions.invoke("cvm-discover", { body });
        if (error) throw error;
        setCvmResults(data?.matches || []);
        if ((data?.matches || []).length === 0) {
          toast({ title: "No results", description: "No funds found matching your search." });
        }
      }
    } catch (err) {
      toast({ title: "Search failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setCvmSearching(false);
    }
  };

  const handleAddFromCvm = (result: CvmSearchResult) => {
    if (!cvmAddTarget) {
      toast({ title: "Select a competitor first", description: "Choose which competitor to add this CNPJ to.", variant: "destructive" });
      return;
    }
    const cleanCnpj = result.cnpj.replace(/[.\-\/]/g, "");
    mutation.mutate({
      action: "add_cnpj",
      payload: {
        competitor_id: cvmAddTarget,
        cnpj: cleanCnpj,
        fund_name: result.name || null,
        fund_type_override: result.tp_fundo_classe?.includes("NP") ? "NP" : null,
      },
    });
    toast({ title: "CNPJ added", description: `${cleanCnpj} added to competitor` });
  };

  const handleAddManagerFund = (fund: ManagerFund) => {
    if (!cvmAddTarget) {
      toast({ title: "Select a competitor first", description: "Choose which competitor to add this CNPJ to.", variant: "destructive" });
      return;
    }
    const cleanCnpj = fund.cnpj.replace(/[.\-\/]/g, "");
    mutation.mutate({
      action: "add_cnpj",
      payload: {
        competitor_id: cvmAddTarget,
        cnpj: cleanCnpj,
        fund_name: fund.name || null,
        fund_type_override: fund.tp_fundo?.includes("NP") ? "NP" : null,
      },
    });
    toast({ title: "CNPJ added", description: `${cleanCnpj} added to competitor` });
  };

  const handleAddAllManagerFunds = (funds: ManagerFund[]) => {
    if (!cvmAddTarget) {
      toast({ title: "Select a competitor first", description: "Choose which competitor to add these CNPJs to.", variant: "destructive" });
      return;
    }
    let count = 0;
    for (const fund of funds) {
      const cleanCnpj = fund.cnpj.replace(/[.\-\/]/g, "");
      mutation.mutate({
        action: "add_cnpj",
        payload: {
          competitor_id: cvmAddTarget,
          cnpj: cleanCnpj,
          fund_name: fund.name || null,
          fund_type_override: fund.tp_fundo?.includes("NP") ? "NP" : null,
        },
      });
      count++;
    }
    toast({ title: `${count} CNPJs added`, description: `Added all funds to competitor` });
  };

  const formatCnpj = (cnpj: string) => {
    if (cnpj.length !== 14) return cnpj;
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 px-4 text-center text-muted-foreground">Loading...</main>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-24 px-4 md:px-[60px] max-w-[600px] mx-auto">
          <div className="border border-border rounded-md p-8 bg-card text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-bold text-2xl text-foreground mb-2">Access Denied</h1>
            <p className="text-muted-foreground text-sm">You need admin privileges to access this page.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 px-3 sm:px-4 md:px-[60px] pb-12 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-bold text-2xl sm:text-3xl text-foreground">
            Admin Panel
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab("competitors")}
            className={`pb-3 text-sm font-mono tracking-[2px] uppercase transition-colors border-b-2 ${activeTab === "competitors" ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
          >
            <Building2 className="h-4 w-4 inline mr-2" />Competitors
          </button>
          <button
            onClick={() => setActiveTab("emails")}
            className={`pb-3 text-sm font-mono tracking-[2px] uppercase transition-colors border-b-2 ${activeTab === "emails" ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
          >
            <Users className="h-4 w-4 inline mr-2" />Authorized Emails
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`pb-3 text-sm font-mono tracking-[2px] uppercase transition-colors border-b-2 ${activeTab === "users" ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
          >
            <UserCog className="h-4 w-4 inline mr-2" />Users & Roles
          </button>
          <button
            onClick={() => setActiveTab("regulations")}
            className={`pb-3 text-sm font-mono tracking-[2px] uppercase transition-colors border-b-2 ${activeTab === "regulations" ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
          >
            <FileText className="h-4 w-4 inline mr-2" />Regulamentos
          </button>
        </div>

        {/* Authorized Emails Tab */}
        {activeTab === "emails" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-muted-foreground text-sm">Manage which emails can access the application.</p>
              <Dialog open={addEmailOpen} onOpenChange={setAddEmailOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Email</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Authorized Email</DialogTitle></DialogHeader>
                  <Input
                    type="email"
                    placeholder="user@email.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
                  />
                  <Button onClick={handleAddEmail} disabled={!newEmail.trim()}>Add</Button>
                </DialogContent>
              </Dialog>
            </div>

            {emailsLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : (
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30">
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Email</th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Status</th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Added</th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {authorizedEmails.map((em) => (
                      <tr key={em.id} className="border-t border-border hover:bg-muted/10 transition-colors">
                        <td className="p-3 font-mono text-foreground">{em.email}</td>
                        <td className="p-3">
                          <Switch
                            checked={em.status === "active"}
                            onCheckedChange={(checked) =>
                              mutation.mutate({ action: "update_authorized_email", payload: { id: em.id, status: checked ? "active" : "inactive" } })
                            }
                          />
                        </td>
                        <td className="p-3 text-muted-foreground">{new Date(em.created_at).toLocaleDateString()}</td>
                        <td className="p-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive h-7 w-7 p-0"
                            onClick={() => {
                              if (confirm(`Remove ${em.email} from whitelist?`)) {
                                mutation.mutate({ action: "delete_authorized_email", payload: { id: em.id } });
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {authorizedEmails.length === 0 && (
                      <tr><td colSpan={4} className="p-6 text-center text-muted-foreground italic">No authorized emails yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Competitors Tab */}
        {activeTab === "competitors" && (
          <div>
            {/* CVM Search Panel */}
            <div className="border border-border rounded-md p-4 mb-6 bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Search CVM Database</h3>
              </div>

              {/* Search source toggle */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => { setCvmSearchSource("monthly"); setCvmResults([]); setManagerResults([]); }}
                  className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase rounded-sm border transition-colors ${
                    cvmSearchSource === "monthly"
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Informe Mensal
                </button>
                <button
                  onClick={() => { setCvmSearchSource("manager"); setCvmResults([]); setManagerResults([]); }}
                  className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase rounded-sm border transition-colors ${
                    cvmSearchSource === "manager"
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Cadastro por Gestora
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <Input
                  placeholder={cvmSearchSource === "manager" ? "Manager name or CNPJ..." : "Fund name or CNPJ..."}
                  value={cvmSearchQuery}
                  onChange={(e) => setCvmSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCvmSearch()}
                  className="flex-1"
                />
                {cvmSearchSource === "monthly" && (
                  <>
                    <Select value={cvmSearchField} onValueChange={setCvmSearchField}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All fields</SelectItem>
                        <SelectItem value="NAME">Name only</SelectItem>
                        <SelectItem value="ADMIN">Admin only</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="YYYYMM"
                      value={cvmSearchMonth}
                      onChange={(e) => setCvmSearchMonth(e.target.value)}
                      className="w-[100px]"
                    />
                  </>
                )}
                <Button onClick={handleCvmSearch} disabled={cvmSearching || !cvmSearchQuery.trim()} size="sm">
                  {cvmSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
              </div>

              {/* Monthly data results (existing) */}
              {cvmSearchSource === "monthly" && cvmResults.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-muted-foreground">{cvmResults.length} results — Add to:</span>
                    <Select value={cvmAddTarget} onValueChange={setCvmAddTarget}>
                      <SelectTrigger className="w-[200px] h-8 text-xs">
                        <SelectValue placeholder="Select competitor" />
                      </SelectTrigger>
                      <SelectContent>
                        {competitors.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto border border-border rounded">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/50">
                        <tr>
                          <th className="text-left p-2 text-muted-foreground">CNPJ</th>
                          <th className="text-left p-2 text-muted-foreground">Name</th>
                          <th className="text-left p-2 text-muted-foreground">Admin</th>
                          <th className="text-left p-2 text-muted-foreground">Type</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cvmResults.map((r) => (
                          <tr key={r.cnpj} className="border-t border-border/50 hover:bg-muted/10">
                            <td className="p-2 font-mono">{formatCnpj(r.cnpj)}</td>
                            <td className="p-2 max-w-[300px] truncate" title={r.name}>{r.name}</td>
                            <td className="p-2 max-w-[150px] truncate text-muted-foreground" title={r.admin}>{r.admin}</td>
                            <td className="p-2">
                              {r.tp_fundo_classe && <Badge variant="outline" className="text-[10px]">{r.tp_fundo_classe}</Badge>}
                            </td>
                            <td className="p-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-primary hover:text-primary"
                                onClick={() => handleAddFromCvm(r)}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Manager search results */}
              {cvmSearchSource === "manager" && managerResults.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-muted-foreground">
                      {managerTotalFunds} funds from {managerResults.length} manager{managerResults.length > 1 ? "s" : ""} — Add to:
                    </span>
                    <Select value={cvmAddTarget} onValueChange={setCvmAddTarget}>
                      <SelectTrigger className="w-[200px] h-8 text-xs">
                        <SelectValue placeholder="Select competitor" />
                      </SelectTrigger>
                      <SelectContent>
                        {competitors.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {managerResults.map((mgr, idx) => (
                    <div key={idx} className="mb-4">
                      <div className="flex items-center justify-between mb-1 px-1">
                        <div>
                          <span className="text-sm font-semibold text-foreground">{mgr.name}</span>
                          {mgr.cnpj && (
                            <span className="text-xs text-muted-foreground ml-2 font-mono">{formatCnpj(mgr.cnpj)}</span>
                          )}
                          <Badge variant="outline" className="ml-2 text-[10px]">{mgr.funds.length} funds</Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleAddAllManagerFunds(mgr.funds)}
                        >
                          <Plus className="h-3 w-3" /> Add All
                        </Button>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto border border-border rounded">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-muted/50">
                            <tr>
                              <th className="text-left p-2 text-muted-foreground">CNPJ</th>
                              <th className="text-left p-2 text-muted-foreground">Fund Name</th>
                              <th className="text-left p-2 text-muted-foreground">Type</th>
                              <th className="text-left p-2 text-muted-foreground">Status</th>
                              <th className="p-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {mgr.funds.map((f) => (
                              <tr key={f.cnpj} className="border-t border-border/50 hover:bg-muted/10">
                                <td className="p-2 font-mono">{formatCnpj(f.cnpj)}</td>
                                <td className="p-2 max-w-[300px] truncate" title={f.name}>{f.name}</td>
                                <td className="p-2">
                                  {f.tp_fundo && <Badge variant="outline" className="text-[10px]">{f.tp_fundo}</Badge>}
                                </td>
                                <td className="p-2 text-muted-foreground">{f.sit}</td>
                                <td className="p-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs text-primary hover:text-primary"
                                    onClick={() => handleAddManagerFund(f)}
                                  >
                                    <Plus className="h-3 w-3 mr-1" /> Add
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mb-4">
              <p className="text-muted-foreground text-sm">Manage fund managers and their CNPJs</p>
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

            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : (
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30">
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold w-8"></th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Name</th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Slug</th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">CNPJs</th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Status</th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Actions</th>
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
                          <td className="p-3 font-semibold text-foreground">{comp.name}</td>
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
                                <span className="text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">CNPJs for {comp.name}</span>
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
          </div>
        )}

        {/* Regulations Tab */}
        {activeTab === "regulations" && (
          <RegulationsAdmin competitors={competitors} />
        )}

        {/* Users & Roles Tab */}
        {activeTab === "users" && (
          <div>
            <div className="mb-4">
              <p className="text-muted-foreground text-sm">View all users and manage their roles.</p>
            </div>

            {usersLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : (
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30">
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Email</th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Roles</th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Joined</th>
                       <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-t border-border hover:bg-muted/10 transition-colors">
                        <td className="p-3 font-mono text-foreground">{user.email || "—"}</td>
                        <td className="p-3">
                          <div className="flex gap-1 flex-wrap">
                            {user.roles.length > 0 ? (
                              user.roles.map((role) => (
                                <Badge key={role} variant={role === "admin" ? "default" : "outline"} className="text-xs">
                                  {role}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-xs italic">No roles</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">{new Date(user.created_at).toLocaleDateString()}</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            {user.roles.includes("admin") ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => {
                                  if (confirm(`Remove admin role from ${user.email}?`)) {
                                    mutation.mutate({ action: "set_user_role", payload: { user_id: user.id, role: "admin", grant: false } });
                                    toast({ title: "Admin role removed" });
                                  }
                                }}
                              >
                                Remove Admin
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => {
                                  if (confirm(`Grant admin role to ${user.email}?`)) {
                                    mutation.mutate({ action: "set_user_role", payload: { user_id: user.id, role: "admin", grant: true } });
                                    toast({ title: "Admin role granted" });
                                  }
                                }}
                              >
                                Make Admin
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan={4} className="p-6 text-center text-muted-foreground italic">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};


function RegulationsAdmin({ competitors }: { competitors: Competitor[] }) {
  const [ingesting, setIngesting] = useState(false);
  const [selectedComp, setSelectedComp] = useState("");
  const [title, setTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [mode, setMode] = useState<"text" | "url" | "file">("text");
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["regulation_documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulation_documents")
        .select("*, competitors(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const handleIngest = async () => {
    if (!selectedComp || !title.trim()) {
      toast({ title: "Error", description: "Select a competitor and provide a title.", variant: "destructive" });
      return;
    }
    setIngesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      if (mode === "file") {
        const fileInput = document.getElementById("reg-file-input") as HTMLInputElement;
        const file = fileInput?.files?.[0];
        if (!file) {
          toast({ title: "Error", description: "Select a PDF file.", variant: "destructive" });
          setIngesting(false);
          return;
        }
        const formData = new FormData();
        formData.append("competitor_id", selectedComp);
        formData.append("title", title.trim());
        formData.append("file", file);

        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/rag-ingest`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: formData,
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        toast({ title: "Success", description: `Ingested ${data.chunk_count} chunks.` });
      } else {
        const body: Record<string, unknown> = {
          competitor_id: selectedComp,
          title: title.trim(),
        };
        if (mode === "url") {
          body.source_url = sourceUrl.trim();
        } else {
          body.text_content = textContent.trim();
        }

        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/rag-ingest`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify(body),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        toast({ title: "Success", description: `Ingested ${data.chunk_count} chunks.` });
      }

      setTitle("");
      setTextContent("");
      setSourceUrl("");
      queryClient.invalidateQueries({ queryKey: ["regulation_documents"] });
    } catch (err) {
      toast({ title: "Ingestion failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIngesting(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Delete this regulation document and all its chunks?")) return;
    try {
      const { error } = await supabase.from("regulation_documents").delete().eq("id", docId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["regulation_documents"] });
      toast({ title: "Deleted" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-muted-foreground text-sm">Manage regulation documents for RAG chat.</p>
      </div>

      {/* Ingestion form */}
      <div className="border border-border rounded-md p-4 mb-6 bg-card space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Manual Ingestion</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select value={selectedComp} onValueChange={setSelectedComp}>
            <SelectTrigger><SelectValue placeholder="Select competitor" /></SelectTrigger>
            <SelectContent>
              {competitors.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Document title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMode("text")}
            className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase rounded-sm border transition-colors ${mode === "text" ? "bg-primary/10 border-primary text-primary" : "bg-muted border-border text-muted-foreground"}`}
          >
            Paste Text
          </button>
          <button
            onClick={() => setMode("url")}
            className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase rounded-sm border transition-colors ${mode === "url" ? "bg-primary/10 border-primary text-primary" : "bg-muted border-border text-muted-foreground"}`}
          >
            From URL
          </button>
          <button
            onClick={() => setMode("file")}
            className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase rounded-sm border transition-colors ${mode === "file" ? "bg-primary/10 border-primary text-primary" : "bg-muted border-border text-muted-foreground"}`}
          >
            Upload PDF
          </button>
        </div>

        {mode === "text" && (
          <Textarea
            placeholder="Paste the regulation text here..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={6}
          />
        )}
        {mode === "url" && (
          <Input
            placeholder="https://..."
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        )}
        {mode === "file" && (
          <input
            id="reg-file-input"
            type="file"
            accept=".pdf,.txt"
            className="text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border file:border-border file:text-sm file:bg-muted file:text-foreground hover:file:bg-muted/80"
          />
        )}

        <Button onClick={handleIngest} disabled={ingesting || !selectedComp || !title.trim()} className="gap-2">
          {ingesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {ingesting ? "Ingesting..." : "Ingest"}
        </Button>
      </div>

      {/* Documents list */}
      {docsLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground italic">No regulations ingested yet.</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Competitor</th>
                <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Title</th>
                <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Status</th>
                <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Chunks</th>
                <th className="text-left p-3 text-xs tracking-[2px] uppercase text-muted-foreground font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc: any) => (
                <tr key={doc.id} className="border-t border-border hover:bg-muted/10 transition-colors">
                  <td className="p-3 text-foreground">{doc.competitors?.name || "—"}</td>
                  <td className="p-3 text-foreground font-medium">{doc.title}</td>
                  <td className="p-3">
                    <Badge variant={doc.status === "ready" ? "default" : "outline"} className="text-[10px]">
                      {doc.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground font-mono">{doc.chunk_count}</td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-7 w-7 p-0"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Admin;
