import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Upload, Trash2 } from "lucide-react";
import { secureStorage, type SecureCredentials } from "@/lib/secureStorage";
import { getLocalUsers, addLocalUser, deleteLocalUser, updateLocalUserRole, updateLocalUser, type LocalUser } from "@/config/login";
import { useSettings, sanitizeServiceAccountJson } from "@/lib/SettingsContext";
import { stringifyServiceAccountJson } from "@/lib/serviceAccount";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { serviceAccountJson, setServiceAccountJson } = useSettings();

  // Credentials form
  const [sheetUrl, setSheetUrl] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [googleServiceAccountJson, setGoogleServiceAccountJson] = useState("");
  const [isJsonValid, setIsJsonValid] = useState(true);

  // Users
  const [localUsers, setLocalUsers] = useState<LocalUser[]>([]);
  const [newUser, setNewUser] = useState<Omit<LocalUser, 'id'>>({ name: "", email: "", phone: "", role: "consultant", password: "123456" });

  // Payments
  const [paymentLinks, setPaymentLinks] = useState<Array<{ name: string; url: string; qrImage?: string }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const res = await Preferences.get({ key: 'push_enabled' });
        setPushEnabled(res.value === 'true');
      } catch {}
      // Load credentials
      try {
        const creds = await secureStorage.getCredentials();
        if (creds) {
          setSheetUrl(creds.googleSheetUrl || "");
          setGoogleApiKey(creds.googleApiKey || "");
          const raw = creds.googleServiceAccountJson || "";
          setGoogleServiceAccountJson(raw);
          setPaymentLinks(creds.paymentLinks || []);
          if (raw) {
            const parsed = sanitizeServiceAccountJson(raw);
            if (parsed) {
              setServiceAccountJson(parsed);
            }
          }
        }
      } catch {}
      // Load users
      try { setLocalUsers(await getLocalUsers()); } catch {}
    })();
  }, []);

  const handleTogglePush = async (next: boolean) => {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: 'push_enabled', value: String(next) });
      setPushEnabled(next);
      if (next) {
        const { initPush } = await import('@/lib/nativePush');
        await initPush();
        // Best-effort local notification permission to avoid first-use crash
        try {
          const { LocalNotifications } = await import('@capacitor/local-notifications');
          let local = await LocalNotifications.checkPermissions();
          if (local.display === 'prompt') {
            try { local = await LocalNotifications.requestPermissions(); } catch {}
          }
        } catch {}
        toast({ title: 'Push enabled', description: 'Registered for push notifications' });
      } else {
        toast({ title: 'Push disabled', description: 'You will not receive native push' });
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to update push', description: e?.message || 'Unknown error' });
    }
  };

  const handleSaveCredentials = async () => {
    if (!sheetUrl) {
      toast({ variant: 'destructive', title: 'Sheet URL required' });
      return;
    }
    let sanitized: any | null = null;
    if (googleServiceAccountJson && googleServiceAccountJson.trim()) {
      sanitized = sanitizeServiceAccountJson(googleServiceAccountJson);
      if (!sanitized) {
        toast({ variant: 'destructive', title: 'Invalid Service Account JSON' });
        return;
      }
      try {
        const serialized = stringifyServiceAccountJson(sanitized);
        if (serialized) localStorage.setItem('serviceAccountJson', serialized);
        setServiceAccountJson(sanitized);
      } catch {}
    }
    const payload: SecureCredentials = {
      googleApiKey: googleApiKey || undefined,
      googleServiceAccountJson: sanitized ? JSON.stringify(sanitized) : undefined,
      googleSheetUrl: sheetUrl,
      worksheetNames: ["MASTER DATA", "BACKEND SHEET"],
      columnMappings: (await import('@/config/localSecrets')).localSecrets.columnMappings,
      paymentLinks,
    } as any;
    await secureStorage.saveCredentials(payload);
    toast({ title: 'Settings saved' });
  };

  const handleFileUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const next = [...paymentLinks];
      next[index].qrImage = String(ev.target?.result || '');
      setPaymentLinks(next);
    };
    reader.readAsDataURL(file);
  };

  const handleAddLocalUser = async () => {
    if (!newUser.name || !newUser.email) {
      toast({ variant: 'destructive', title: 'Name and email required' });
      return;
    }
    const created = await addLocalUser(newUser);
    setLocalUsers(prev => [...prev, created]);
    setNewUser({ name: '', email: '', phone: '', role: 'consultant', password: '123456' });
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-3 sm:p-6 pt-20 pb-[calc(var(--bottom-nav-height)+2.5rem)] overflow-y-auto max-h-screen">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">Settings</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-2">Control notifications and app preferences</p>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Push Notifications</CardTitle>
            <CardDescription>Enable/disable native push registration (Android)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Enable push notifications</div>
                <div className="text-xs text-muted-foreground">Requires valid google-services.json in app</div>
              </div>
              <button
                type="button"
                onClick={() => handleTogglePush(!pushEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${pushEnabled ? 'bg-primary' : 'bg-muted'}`}
                aria-pressed={pushEnabled}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${pushEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </CardContent>
        </Card>
        
        {/* Google Sheets Credentials */}
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Google Sheets</CardTitle>
            <CardDescription>Configure Sheets URL and credentials</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="sheetUrl">Sheet URL</Label>
              <Input id="sheetUrl" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key (optional)</Label>
              <Input id="apiKey" value={googleApiKey} onChange={e => setGoogleApiKey(e.target.value)} placeholder="AIza..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sa">Service Account JSON (for add/update)</Label>
              <Textarea id="sa" rows={6} value={googleServiceAccountJson}
                onChange={(e) => {
                  setGoogleServiceAccountJson(e.target.value);
                  const ok = !!sanitizeServiceAccountJson(e.target.value) || e.target.value.trim() === '';
                  setIsJsonValid(ok);
                }}
              />
              {!isJsonValid && <p className="text-xs text-amber-600">Invalid JSON</p>}
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveCredentials}>
                <Save className="h-4 w-4 mr-2" /> Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users management */}
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Local Users</CardTitle>
            <CardDescription>Manage users for on-device auth</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              {localUsers.map(u => (
                <div key={u.id} className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-center border rounded p-2">
                  <Input value={u.name} onChange={(e) => updateLocalUser({ id: u.id, name: e.target.value })} />
                  <Input value={u.email} onChange={(e) => updateLocalUser({ id: u.id, email: e.target.value })} />
                  <Input value={u.phone} onChange={(e) => updateLocalUser({ id: u.id, phone: e.target.value })} />
                  <Select value={u.role} onValueChange={(v) => updateLocalUserRole(u.id, v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="consultant">Consultant</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="password" value={u.password} onChange={(e) => updateLocalUser({ id: u.id, password: e.target.value })} />
                  <Button variant="outline" onClick={() => deleteLocalUser(u.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center">
              <Input placeholder="Name" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
              <Input placeholder="Email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
              <Input placeholder="Phone" value={newUser.phone} onChange={e => setNewUser({ ...newUser, phone: e.target.value })} />
              <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="consultant">Consultant</SelectItem>
                </SelectContent>
              </Select>
              <Input type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
              <Button variant="outline" onClick={handleAddLocalUser}><Upload className="h-4 w-4 mr-2" />Add</Button>
            </div>
          </CardContent>
        </Card>

        {/* Payment links */}
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Payment Links</CardTitle>
            <CardDescription>Optional quick-send links</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentLinks.map((p, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center border rounded p-2">
                <Input placeholder="Name" value={p.name} onChange={e => { const n=[...paymentLinks]; n[i].name=e.target.value; setPaymentLinks(n); }} />
                <Input placeholder="URL" value={p.url} onChange={e => { const n=[...paymentLinks]; n[i].url=e.target.value; setPaymentLinks(n); }} />
                <Input type="file" accept="image/*" onChange={(e)=>handleFileUpload(i,e)} />
                {p.qrImage && <img src={p.qrImage} alt="QR" className="h-10 w-10 object-cover rounded" />}
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPaymentLinks([...paymentLinks, { name: '', url: '' }])}><Upload className="h-4 w-4 mr-2" />Add Link</Button>
              <Button onClick={handleSaveCredentials}><Save className="h-4 w-4 mr-2" />Save All</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 mb-[calc(var(--bottom-nav-height)+3rem)]">
          <Button onClick={() => {
            // Navigate to home page (working tab) instead of dashboard analytics
            navigate('/');
          }} variant="outline">
            Back to Dashboard
          </Button>
        </div>
        {/* Spacer to ensure last content clears bottom nav on small screens */}
        <div aria-hidden className='h-[calc(var(--bottom-nav-height)+3rem)]' />
      </div>
    </div>
  );
};

export default Settings;


