import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquareText, Send, Loader2, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchCompetitors } from "@/lib/competitors";

interface Competitor {
  key: string;
  label: string;
  id?: string;
}

type Msg = { role: "user" | "assistant"; content: string };

export default function RegulationChat() {
  const { data: competitors = [] } = useQuery<Competitor[]>({
    queryKey: ["competitors-chat"],
    queryFn: async () => {
      const data = await fetchCompetitors();
      return (data || []).map((c) => ({ key: c.slug, label: c.name, id: c.id }));
    },
    staleTime: 5 * 60 * 1000,
  });
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const toggleCompetitor = (key: string) => {
    setSelectedCompetitor((prev) => (prev === key ? null : key));
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Msg = { role: "user", content: text };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);

    try {
      const competitorIds = selectedCompetitor
        ? competitors.filter((c) => c.key === selectedCompetitor).map((c) => c.id).filter(Boolean)
        : [];

      const data = await apiFetch("/chat", {
        method: "POST",
        body: JSON.stringify({ messages: allMessages, competitor_ids: competitorIds }),
      });

      setMessages([...allMessages, { role: "assistant", content: data.reply || "No response received." }]);
    } catch (e) {
      console.error("Chat error:", e);
      setMessages([...allMessages, { role: "assistant", content: `⚠️ ${e instanceof Error ? e.message : "Error connecting to AI"}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, selectedCompetitor, competitors]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors">
        <MessageSquareText className="h-5 w-5" />
        <span className="text-sm font-medium hidden sm:inline">{t("chat.regulations")}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[480px] flex flex-col p-0">
          <SheetHeader className="p-4 pb-2 border-b border-border">
            <SheetTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" />
              {t("chat.title")}
            </SheetTitle>
          </SheetHeader>

          {competitors.length > 0 && (
            <div className="px-4 py-2 flex flex-wrap gap-1.5 border-b border-border">
              {competitors.map((c) => (
                <Badge key={c.key} variant={selectedCompetitor === c.key ? "default" : "outline"} className="cursor-pointer text-[10px] tracking-wider" onClick={() => toggleCompetitor(c.key)}>
                  {c.label}
                  {selectedCompetitor === c.key && <X className="h-3 w-3 ml-1" />}
                </Badge>
              ))}
            </div>
          )}

          <ScrollArea className="flex-1 px-4" ref={scrollRef}>
            <div className="py-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <MessageSquareText className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p>{t("chat.empty")}</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-border">
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
              <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("chat.placeholder")} disabled={isLoading} className="flex-1" />
              <Button type="submit" size="icon" disabled={!input.trim() || isLoading}><Send className="h-4 w-4" /></Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
