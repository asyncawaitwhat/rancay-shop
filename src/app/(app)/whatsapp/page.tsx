"use client";

import { useEffect, useState } from "react";
import { Save, RefreshCw, MessageCircle, Send, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState, EmptyState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Field } from "@/components/shared/field";
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { formatDateTime } from "@/lib/utils";
import type { WhatsappSettings, WhatsappSession, WhatsappMessage } from "@/lib/types";
import {
  getWhatsappSettings,
  saveWhatsappSettings,
  listRecentSessions,
  reactivateSession,
  pauseSession,
  listMessagesForPhone,
  sendWhatsappMessage,
  DEFAULT_WHATSAPP_SETTINGS,
} from "@/lib/firebase/services/whatsapp";

export default function WhatsappPage() {
  return (
    <ScreenGuard screen="whatsapp">
      <WhatsappContent />
    </ScreenGuard>
  );
}

type SettingsState = Omit<WhatsappSettings, "id" | "updatedAt">;

function WhatsappContent() {
  const { t } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({
    ...DEFAULT_WHATSAPP_SETTINGS,
  });
  const [sessions, setSessions] = useState<WhatsappSession[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [openSession, setOpenSession] = useState<WhatsappSession | null>(null);

  const readOnly = !can("whatsapp", "edit");

  async function load() {
    const [s, sess] = await Promise.all([
      getWhatsappSettings(),
      listRecentSessions(50).catch(() => [] as WhatsappSession[]),
    ]);
    const { id, updatedAt, ...rest } = s;
    void id;
    void updatedAt;
    setSettings(rest);
    setSessions(sess);
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
    }
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    setSaving(true);
    try {
      await saveWhatsappSettings(
        {
          ...settings,
          taxRate: Number(settings.taxRate) || 0,
          deliveryFee: Number(settings.deliveryFee) || 0,
        },
        actor
      );
      toast({ variant: "success", title: t("whatsapp.saved") });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("msg.error"),
        description: (err as Error).message,
      });
    } finally {
      setSaving(false);
    }
  }

  async function onReactivate(phone: string) {
    try {
      await reactivateSession(phone, actor);
      toast({ variant: "success", title: t("whatsapp.saved") });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("msg.error"),
        description: (err as Error).message,
      });
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("whatsapp.title")}
        description={t("whatsapp.subtitle")}
        actions={
          !readOnly && (
            <Button onClick={onSave} disabled={saving}>
              <Save className="h-4 w-4" /> {t("whatsapp.save")}
            </Button>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> {t("whatsapp.settings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground break-all">
            {t("whatsapp.webhookHint")}{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">{webhookUrl}</code>
          </p>

          <fieldset disabled={readOnly} className="space-y-4">
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={settings.botEnabled}
                  onCheckedChange={(v) => set("botEnabled", Boolean(v))}
                />
                {t("whatsapp.botEnabled")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={settings.aiAutoReplyEnabled}
                  onCheckedChange={(v) => set("aiAutoReplyEnabled", Boolean(v))}
                />
                {t("whatsapp.aiAutoReply")}
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("whatsapp.aiProvider")}>
                <Select
                  value={settings.aiProvider}
                  onValueChange={(v) => set("aiProvider", v as "openai" | "gemini")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {settings.aiProvider === "gemini" ? (
                <Field label={t("whatsapp.geminiModel")} hint={t("whatsapp.geminiKeyHint")}>
                  <Input
                    value={settings.geminiModel}
                    onChange={(e) => set("geminiModel", e.target.value)}
                    dir="ltr"
                  />
                </Field>
              ) : (
                <Field label={t("whatsapp.openaiModel")} hint={t("whatsapp.openaiKeyHint")}>
                  <Input
                    value={settings.openaiModel}
                    onChange={(e) => set("openaiModel", e.target.value)}
                    dir="ltr"
                  />
                </Field>
              )}
              <Field label={t("whatsapp.defaultLanguage")}>
                <Select
                  value={settings.defaultLanguage}
                  onValueChange={(v) => set("defaultLanguage", v as "ar" | "en")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("whatsapp.businessName")}>
                <Input
                  value={settings.businessName || ""}
                  onChange={(e) => set("businessName", e.target.value)}
                />
              </Field>
              <Field label={t("whatsapp.handoffContacts")}>
                <Input
                  value={settings.handoffContacts || ""}
                  onChange={(e) => set("handoffContacts", e.target.value)}
                  dir="ltr"
                />
              </Field>
              <Field label={t("whatsapp.taxRate")}>
                <Input
                  type="number"
                  value={String(settings.taxRate ?? 0)}
                  onChange={(e) => set("taxRate", Number(e.target.value))}
                  dir="ltr"
                />
              </Field>
              <Field label={t("whatsapp.deliveryFee")}>
                <Input
                  type="number"
                  value={String(settings.deliveryFee ?? 0)}
                  onChange={(e) => set("deliveryFee", Number(e.target.value))}
                  dir="ltr"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("whatsapp.welcomeMessage")}>
                  <Textarea
                    value={settings.welcomeMessage || ""}
                    onChange={(e) => set("welcomeMessage", e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("whatsapp.sessions")}</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <EmptyState title={t("whatsapp.noSessions")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("whatsapp.phone")}</TableHead>
                  <TableHead>{t("whatsapp.status")}</TableHead>
                  <TableHead>{t("whatsapp.lastMessage")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell dir="ltr" className="font-mono text-xs">
                      {s.phone}
                      {s.profileName ? (
                        <span className="block text-muted-foreground">
                          {s.profileName}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {s.status === "human_handoff" ? (
                        <Badge variant="destructive">{t("whatsapp.handoff")}</Badge>
                      ) : (
                        <Badge variant="secondary">{t("whatsapp.active")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="block max-w-xs truncate">
                        {s.lastInboundText || "—"}
                      </span>
                      {formatDateTime(s.lastMessageAt)}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        {s.status === "human_handoff" && !readOnly && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onReactivate(s.phone)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />{" "}
                            {t("whatsapp.reactivate")}
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setOpenSession(s)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />{" "}
                          {t("whatsapp.openChat")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {openSession && (
        <ConversationDialog
          session={openSession}
          readOnly={readOnly}
          actor={actor}
          onClose={() => setOpenSession(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function ConversationDialog({
  session,
  readOnly,
  actor,
  onClose,
  onChanged,
}: {
  session: WhatsappSession;
  readOnly: boolean;
  actor: ReturnType<typeof useAuth>["actor"];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useLang();
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(session.status);

  async function loadMessages() {
    setLoading(true);
    try {
      setMessages(await listMessagesForPhone(session.phone));
    } catch (e) {
      toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.phone]);

  async function onSend() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendWhatsappMessage(session.phone, body);
      setText("");
      await loadMessages();
    } catch (e) {
      toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
    } finally {
      setSending(false);
    }
  }

  async function toggleAi() {
    try {
      if (status === "human_handoff") {
        await reactivateSession(session.phone, actor);
        setStatus("active");
      } else {
        await pauseSession(session.phone, actor);
        setStatus("human_handoff");
      }
      onChanged();
    } catch (e) {
      toast({ variant: "destructive", title: t("msg.error"), description: (e as Error).message });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span dir="ltr" className="font-mono text-sm">{session.phone}</span>
            {session.profileName && (
              <span className="text-sm text-muted-foreground">{session.profileName}</span>
            )}
            {status === "human_handoff" ? (
              <Badge variant="destructive">{t("whatsapp.handoff")}</Badge>
            ) : (
              <Badge variant="secondary">{t("whatsapp.active")}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          {!readOnly ? (
            <Button variant="outline" size="sm" onClick={toggleAi}>
              {status === "human_handoff" ? (
                <><Play className="h-3.5 w-3.5" /> {t("whatsapp.reactivate")}</>
              ) : (
                <><Pause className="h-3.5 w-3.5" /> {t("whatsapp.pauseAi")}</>
              )}
            </Button>
          ) : <span />}
          <Button variant="ghost" size="sm" onClick={loadMessages}>
            <RefreshCw className="h-3.5 w-3.5" /> {t("action.refresh")}
          </Button>
        </div>

        <div className="h-72 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3">
          {loading ? (
            <LoadingState />
          ) : messages.length === 0 ? (
            <EmptyState title={t("whatsapp.noMessages")} />
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.direction === "incoming" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    m.direction === "incoming"
                      ? "bg-background"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text || `[${m.type}]`}</p>
                  <p className={`mt-1 text-[10px] ${m.direction === "incoming" ? "text-muted-foreground" : "opacity-80"}`}>
                    {formatDateTime(m.createdAt)}
                    {m.error ? ` • ${m.error}` : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {!readOnly && (
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("whatsapp.typeMessage")}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
            <Button onClick={onSend} disabled={sending || !text.trim()}>
              <Send className="h-4 w-4" /> {t("whatsapp.send2")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
