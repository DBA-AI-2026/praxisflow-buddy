import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Save, RotateCcw, Users, FileText, Receipt, FlaskConical, Lightbulb } from "lucide-react";

interface NotificationSetting {
  id: string;
  setting_key: string;
  is_enabled: boolean;
  label: string;
  description: string | null;
  category: string;
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Mail; color: string }> = {
  leads:      { label: "Lead-Management",    icon: Users,      color: "text-blue-600" },
  tippgeber:  { label: "Tipp-Leads",         icon: Lightbulb,  color: "text-amber-600" },
  demo:       { label: "Demo & Testphasen",  icon: FlaskConical, color: "text-purple-600" },
  vertraege:  { label: "Verträge",           icon: FileText,   color: "text-green-600" },
  rechnungen: { label: "Rechnungen",         icon: Receipt,    color: "text-orange-600" },
  benutzer:   { label: "Benutzerverwaltung", icon: Users,      color: "text-slate-600" },
  allgemein:  { label: "Allgemein",          icon: Mail,       color: "text-muted-foreground" },
};

const CATEGORY_ORDER = ["leads", "tippgeber", "demo", "vertraege", "rechnungen", "benutzer", "allgemein"];

export default function EmailSettings() {
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [original, setOriginal] = useState<NotificationSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("email_notification_settings" as any)
      .select("*")
      .order("category")
      .order("label");
    if (error) {
      toast.error("Fehler beim Laden: " + error.message);
    } else {
      const rows = (data as unknown as NotificationSetting[]) ?? [];
      setSettings(rows);
      setOriginal(rows);
    }
    setIsLoading(false);
  }

  function toggle(id: string) {
    setSettings(prev =>
      prev.map(s => s.id === id ? { ...s, is_enabled: !s.is_enabled } : s)
    );
  }

  function toggleAll(category: string, value: boolean) {
    setSettings(prev =>
      prev.map(s => s.category === category ? { ...s, is_enabled: value } : s)
    );
  }

  async function saveSettings() {
    setIsSaving(true);
    const changed = settings.filter(s => {
      const orig = original.find(o => o.id === s.id);
      return orig && orig.is_enabled !== s.is_enabled;
    });

    if (changed.length === 0) {
      toast.info("Keine Änderungen vorhanden.");
      setIsSaving(false);
      return;
    }

    const updates = changed.map(s =>
      supabase
        .from("email_notification_settings" as any)
        .update({ is_enabled: s.is_enabled })
        .eq("id", s.id)
    );
    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      toast.error(`${errors.length} Einstellung(en) konnten nicht gespeichert werden.`);
    } else {
      toast.success(`${changed.length} Einstellung(en) gespeichert.`);
      setOriginal(settings);
    }
    setIsSaving(false);
  }

  function resetChanges() {
    setSettings(original);
    toast.info("Änderungen zurückgesetzt.");
  }

  const hasChanges = settings.some(s => {
    const orig = original.find(o => o.id === s.id);
    return orig && orig.is_enabled !== s.is_enabled;
  });

  const grouped = CATEGORY_ORDER.reduce<Record<string, NotificationSetting[]>>((acc, cat) => {
    const items = settings.filter(s => s.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const totalEnabled = settings.filter(s => s.is_enabled).length;
  const totalCount = settings.length;

  return (
    <MainLayout
      title="E-Mail-Benachrichtigungen"
      subtitle="Aktivieren oder deaktivieren Sie automatische E-Mail-Benachrichtigungen systemweit"
    >
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Summary header */}
        <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">E-Mail-Benachrichtigungen</p>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Wird geladen…" : `${totalEnabled} von ${totalCount} Benachrichtigungen aktiv`}
            </p>
          </div>
          {!isLoading && (
            <Badge
              variant="secondary"
              className={totalEnabled === totalCount ? "bg-primary/10 text-primary border-primary/20" : ""}
            >
              {totalEnabled === totalCount ? "Alle aktiv" : `${totalEnabled}/${totalCount}`}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Category sections */}
            {Object.entries(grouped).map(([category, items]) => {
              const meta = CATEGORY_META[category] ?? CATEGORY_META.allgemein;
              const Icon = meta.icon;
              const allOn = items.every(s => s.is_enabled);
              const allOff = items.every(s => !s.is_enabled);

              return (
                <div key={category} className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* Category header */}
                  <div className="flex items-center justify-between px-5 py-3.5 bg-muted/30 border-b border-border">
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                      <span className="font-semibold text-sm text-foreground">{meta.label}</span>
                      <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
                        {items.filter(s => s.is_enabled).length}/{items.length}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        disabled={allOn}
                        onClick={() => toggleAll(category, true)}
                      >
                        Alle an
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        disabled={allOff}
                        onClick={() => toggleAll(category, false)}
                      >
                        Alle aus
                      </Button>
                    </div>
                  </div>

                  {/* Settings rows */}
                  <div className="divide-y divide-border/50">
                    {items.map((setting, idx) => {
                      const orig = original.find(o => o.id === setting.id);
                      const changed = orig && orig.is_enabled !== setting.is_enabled;
                      return (
                        <div
                          key={setting.id}
                          className={`flex items-center justify-between px-5 py-4 transition-colors ${changed ? "bg-warning/5" : "hover:bg-muted/20"}`}
                        >
                          <div className="flex-1 pr-6">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">{setting.label}</span>
                              {changed && (
                                <span className="text-[10px] font-semibold bg-warning/20 text-warning-foreground px-1.5 py-0.5 rounded border border-warning/30 uppercase tracking-wide">
                                  Geändert
                                </span>
                              )}
                            </div>
                            {setting.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                {setting.description}
                              </p>
                            )}
                          </div>
                          <Switch
                            checked={setting.is_enabled}
                            onCheckedChange={() => toggle(setting.id)}
                            aria-label={setting.label}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Action bar */}
            <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border pt-4 pb-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {hasChanges
                  ? `${settings.filter((s, i) => original[i] && original.find(o => o.id === s.id)?.is_enabled !== s.is_enabled).length} ungespeicherte Änderung(en)`
                  : "Alle Änderungen gespeichert"}
              </p>
              <div className="flex gap-2">
                {hasChanges && (
                  <Button variant="outline" size="sm" onClick={resetChanges} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Zurücksetzen
                  </Button>
                )}
                <Button size="sm" onClick={saveSettings} disabled={isSaving || !hasChanges} className="gap-1.5">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Speichern
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
