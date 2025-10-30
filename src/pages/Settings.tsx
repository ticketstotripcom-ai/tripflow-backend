import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Save, Upload, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/lib/authService";
import { secureStorage, SecureCredentials } from "@/lib/secureStorage";
import { GoogleSheetsService } from "@/lib/googleSheets";
import { getLocalUsers, addLocalUser, deleteLocalUser, updateLocalUserRole, updateLocalUser, LocalUser } from "@/config/login";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings, sanitizeServiceAccountJson } from "@/lib/SettingsContext";

const Settings = () => {
  const [googleApiKey, setGoogleApiKey] = useState("");
  const { serviceAccountJson, setServiceAccountJson } = useSettings();
  const [googleServiceAccountJson, setGoogleServiceAccountJson] = useState("");
  const [isJsonValid, setIsJsonValid] = useState(true);
  const [sheetUrl, setSheetUrl] = useState("");
  const [worksheetNames, setWorksheetNames] = useState<string[]>(["MASTER DATA", "BACKEND SHEET"]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({
    date: "B",
    consultant: "C",
    status: "D",
    traveller_name: "E",
    travel_date: "G",
    travel_state: "H",
    remarks: "K",
    nights: "L",
    pax: "M",
    hotel_category: "N",
    meal_plan: "O",
    phone: "P",
    email: "Q",
    priority: "AL"
  });
  const [paymentLinks, setPaymentLinks] = useState<{ name: string; url: string; qrImage?: string }[]>([
    { name: "Primary Payment", url: "", qrImage: "" }
  ]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [localUsers, setLocalUsers] = useState<LocalUser[]>([]);
  const [sheets, setSheets] = useState<Array<{
    name: string;
    sheetId: string;
    worksheetNames: string[];
    columnMappings: Record<string, string>;
  }>>([
    { name: "Primary", sheetId: "", worksheetNames: ["MASTER DATA", "BACKEND SHEET"], columnMappings }
  ]);
  const [newUser, setNewUser] = useState<{ name: string; email: string; phone: string; role: 'admin' | 'consultant'; password: string }>({
    name: '', email: '', phone: '', role: 'consultant', password: '123456'
  });

  useEffect(() => {
    const session = authService.getSession();
    if (!session || session.user.role !== 'admin') {
      navigate('/dashboard?view=analytics');
      return;
    }

    loadCredentials();
    loadLocalUsers();
  }, [navigate]);

  // Sync with global SettingsContext
  useEffect(() => {
    if (serviceAccountJson && !googleServiceAccountJson) {
      try {
        setGoogleServiceAccountJson(JSON.stringify(serviceAccountJson, null, 2));
      } catch {
        // no-op
      }
    }
  }, [serviceAccountJson]);

  const loadCredentials = async () => {
    const credentials = await secureStorage.getCredentials();
    if (credentials) {
      setGoogleApiKey(credentials.googleApiKey || "");
      const json = credentials.googleServiceAccountJson || "";
      setGoogleServiceAccountJson(json);
      if (json) {
        const parsed = sanitizeServiceAccountJson(json);
        if (parsed) {
          setServiceAccountJson(parsed);
          try { localStorage.setItem('serviceAccountJson', JSON.stringify(parsed)); } catch {}
        } else {
          console.warn('⚠️ Failed to parse service account JSON from secure storage');
        }
      }
      setSheetUrl(credentials.googleSheetUrl || "");
      setWorksheetNames(credentials.worksheetNames || ["MASTER DATA", "BACKEND SHEET"]);
      setColumnMappings(credentials.columnMappings || columnMappings);
      setPaymentLinks(credentials.paymentLinks || paymentLinks);
      if (credentials.sheets && credentials.sheets.length > 0) {
        setSheets(credentials.sheets.map(s => ({
          name: s.name,
          sheetId: s.sheetId,
          worksheetNames: s.worksheetNames || ["MASTER DATA", "BACKEND SHEET"],
          columnMappings: s.columnMappings || (credentials.columnMappings || columnMappings)
        })));
      }
    }
  };

  const loadLocalUsers = async () => {
    const users = await getLocalUsers();
    setLocalUsers(users);
  };

  const handleSave = async () => {
    if (!sheetUrl) {
      toast({
        variant: "destructive",
        title: "Missing configuration",
        description: "Please provide Google Sheet URL",
      });
      return;
    }

    if (!googleApiKey && !googleServiceAccountJson) {
      toast({
        variant: "destructive",
        title: "Missing credentials",
        description: "Please provide at least Service Account JSON (required for add/update) or API Key (read-only)",
      });
      return;
    }

    const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      toast({
        variant: "destructive",
        title: "Invalid Sheet URL",
        description: "Please provide a valid Google Sheets URL",
      });
      return;
    }

    // Sanitize Service Account JSON before saving
    let sanitizedServiceAccount: any | null = null;
    if (googleServiceAccountJson && googleServiceAccountJson.trim()) {
      sanitizedServiceAccount = sanitizeServiceAccountJson(googleServiceAccountJson);
      if (!sanitizedServiceAccount) {
        toast({ variant: "destructive", title: "Invalid Service Account JSON", description: "Please paste a valid Google Service Account key (JSON)." });
        return;
      }
      // Persist to localStorage for fallback and set in context
      try { localStorage.setItem('serviceAccountJson', JSON.stringify(sanitizedServiceAccount)); } catch {}
      setServiceAccountJson(sanitizedServiceAccount);
    }

    const credentials: SecureCredentials = {
      googleApiKey: googleApiKey || undefined,
      googleServiceAccountJson: sanitizedServiceAccount ? JSON.stringify(sanitizedServiceAccount) : undefined,
      googleSheetUrl: sheetUrl,
      worksheetNames,
      columnMappings,
      paymentLinks: paymentLinks.filter(p => p.url),
      sheets: sheets.filter(s => s.sheetId).map(s => ({
        name: s.name,
        sheetId: s.sheetId,
        worksheetNames: s.worksheetNames,
        columnMappings: s.columnMappings
      }))
    };

    await secureStorage.saveCredentials(credentials);

    toast({
      title: "Settings saved",
      description: "Credentials stored securely on device",
    });
  };

  const handleFileUpload = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const newPaymentLinks = [...paymentLinks];
        newPaymentLinks[index].qrImage = e.target?.result as string;
        setPaymentLinks(newPaymentLinks);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddLocalUser = async () => {
    if (!newUser.name || !newUser.email) {
      toast({ variant: 'destructive', title: 'Missing details', description: 'Name and email are required' });
      return;
    }
    const created = await addLocalUser(newUser);
    setLocalUsers(prev => [...prev, created]);
    setNewUser({ name: '', email: '', phone: '', role: 'consultant', password: '123456' });
    toast({ title: 'User added', description: created.name });

    // Also sync to BACKEND SHEET so login works across devices
    try {
      const credentials = await secureStorage.getCredentials();
      if (!credentials) throw new Error('Sheets not configured');
      // Ensure service account write uses localStorage fallback if needed
      let effectiveServiceAccountJson = credentials.googleServiceAccountJson;
      if (!effectiveServiceAccountJson) {
        try { effectiveServiceAccountJson = localStorage.getItem('serviceAccountJson') || undefined; } catch {}
      }
      if (!effectiveServiceAccountJson) throw new Error('Service Account JSON missing');
      const svc = new GoogleSheetsService({
        apiKey: credentials.googleApiKey,
        serviceAccountJson: effectiveServiceAccountJson,
        sheetId: credentials.googleSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || '',
        worksheetNames: credentials.worksheetNames,
        columnMappings: credentials.columnMappings,
      });
      console.log('✅ Using Service Account for Sheets write operation');
      await svc.appendUser({
        name: created.name,
        email: created.email.trim().toLowerCase(),
        phone: created.phone,
        role: created.role,
        password: created.password,
      });
      toast({ title: 'Synced to Google Sheet', description: 'User can now log in', duration: 2500 });
    } catch (e: any) {
      console.warn('Failed to sync user to sheet:', e);
      toast({ variant: 'destructive', title: 'Cloud sync failed', description: e.message || 'Could not write to Google Sheets' });
    }
  };

  const handleDeleteLocalUser = async (id: string) => {
    await deleteLocalUser(id);
    setLocalUsers(prev => prev.filter(u => u.id !== id));
    toast({ title: 'User deleted' });
  };

  const handleChangeRole = async (id: string, role: 'admin' | 'consultant') => {
    await updateLocalUserRole(id, role);
    setLocalUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
    toast({ title: 'Role updated' });
  };

  const handleInlineUpdate = async (user: LocalUser, field: keyof LocalUser, value: string) => {
    const updated = { ...user, [field]: value } as LocalUser;
    await updateLocalUser({ id: user.id, [field]: value } as any);
    setLocalUsers(prev => prev.map(u => u.id === user.id ? updated : u));
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-3 sm:p-6 pt-20 pb-24">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Admin Settings
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-2">
            Configure Google Sheets integration (stored securely on device)
          </p>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Google Sheets Integration</CardTitle>
            <CardDescription>
              Connect your Google Sheet for authentication and lead management
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sheetUrl">Google Sheet URL *</Label>
              <Input
                id="sheetUrl"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The URL of your Google Spreadsheet
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">Google API Key (Read-Only)</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="AIza..."
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Optional: Only allows reading data. Get from Google Cloud Console → APIs & Services → Credentials
              </p>
            </div>

            <div className="text-center text-sm text-muted-foreground font-semibold">AND/OR</div>

            <div className="space-y-2">
              <Label htmlFor="serviceAccount">Google Service Account JSON (Required for Add/Update)</Label>
              <Textarea
                id="serviceAccount"
                placeholder='{"type": "service_account", "project_id": "...", ...}'
                value={googleServiceAccountJson}
                onChange={(e) => {
                  const val = e.target.value;
                  setGoogleServiceAccountJson(val);
                  const parsed = sanitizeServiceAccountJson(val);
                  const valid = !!parsed || val.trim() === '';
                  setIsJsonValid(valid);
                  if (parsed) {
                    try { localStorage.setItem('serviceAccountJson', JSON.stringify(parsed)); } catch {}
                    setServiceAccountJson(parsed);
                  }
                }}
                rows={6}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Required for adding/updating leads. Paste the entire JSON from your service account file.
              </p>
              {(!googleServiceAccountJson.trim() || !isJsonValid) && (
                <p className="text-xs text-amber-600">⚠️ Invalid JSON detected. Please paste a valid Google Service Account key (JSON).</p>
              )}
            </div>
          </CardContent>
        </Card>

      {/* Manage Google Sheets - Multiple */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Manage Google Sheets</CardTitle>
          <CardDescription>
            Configure multiple spreadsheets (leads can be merged across all)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sheets.map((s, index) => (
            <div key={index} className="border rounded-lg p-3 sm:p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Sheet Name</Label>
                  <Input
                    value={s.name}
                    onChange={(e) => {
                      const arr = [...sheets];
                      arr[index].name = e.target.value;
                      setSheets(arr);
                    }}
                    placeholder="Primary"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Sheet ID</Label>
                  <Input
                    value={s.sheetId}
                    onChange={(e) => {
                      const arr = [...sheets];
                      arr[index].sheetId = e.target.value;
                      setSheets(arr);
                    }}
                    placeholder="1AbCDefGhIj..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Leads Worksheet</Label>
                  <Input
                    value={s.worksheetNames[0]}
                    onChange={(e) => {
                      const arr = [...sheets];
                      arr[index].worksheetNames = [e.target.value, arr[index].worksheetNames[1]];
                      setSheets(arr);
                    }}
                    placeholder="MASTER DATA"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Users Worksheet</Label>
                  <Input
                    value={s.worksheetNames[1]}
                    onChange={(e) => {
                      const arr = [...sheets];
                      arr[index].worksheetNames = [arr[index].worksheetNames[0], e.target.value];
                      setSheets(arr);
                    }}
                    placeholder="BACKEND SHEET"
                  />
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="text-xs font-semibold mb-3">Column Mappings</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(s.columnMappings).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[10px]">{key.replace(/_/g, ' ').toUpperCase()}</Label>
                      <Input
                        value={value}
                        onChange={(e) => {
                          const arr = [...sheets];
                          arr[index].columnMappings = { ...arr[index].columnMappings, [key]: e.target.value.toUpperCase() };
                          setSheets(arr);
                        }}
                        className="text-center"
                        maxLength={2}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setSheets(prev => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() => setSheets(prev => ([...prev, { name: `Sheet ${prev.length + 1}`, sheetId: "", worksheetNames: ["MASTER DATA", "BACKEND SHEET"], columnMappings }]))}
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Add Another Sheet
          </Button>
        </CardContent>
      </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Local Users (Admin Only)</CardTitle>
            <CardDescription>Manage quick local logins. Stored on this device.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as any })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="consultant">Consultant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Password</Label>
                <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              </div>
            </div>
            <Button className="gap-2" onClick={handleAddLocalUser}>
              <Plus className="h-4 w-4" /> Add User
            </Button>

            <div className="border-t pt-4 space-y-3">
              {localUsers.length === 0 && (
                <p className="text-sm text-muted-foreground">No local users yet.</p>
              )}
              {localUsers.map(u => (
                <div key={u.id} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center">
                  <Input value={u.name} onChange={(e) => handleInlineUpdate(u, 'name', e.target.value)} />
                  <Input value={u.email} onChange={(e) => handleInlineUpdate(u, 'email', e.target.value)} />
                  <Input value={u.phone} onChange={(e) => handleInlineUpdate(u, 'phone', e.target.value)} />
                  <Select value={u.role} onValueChange={(v) => handleChangeRole(u.id, v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="consultant">Consultant</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="password" value={u.password} onChange={(e) => handleInlineUpdate(u, 'password', e.target.value)} />
                  <Button variant="destructive" className="gap-1" onClick={() => handleDeleteLocalUser(u.id)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Worksheet Configuration</CardTitle>
            <CardDescription>
              Configure worksheet names and column mappings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {worksheetNames.map((name, index) => (
              <div key={index} className="space-y-2">
                <Label htmlFor={`worksheet-${index}`}>
                  Worksheet {index + 1} Name {index === 0 ? '(Leads)' : '(Users)'}
                </Label>
                <Input
                  id={`worksheet-${index}`}
                  value={name}
                  onChange={(e) => {
                    const newNames = [...worksheetNames];
                    newNames[index] = e.target.value;
                    setWorksheetNames(newNames);
                  }}
                  placeholder={index === 0 ? 'MASTER DATA' : 'BACKEND SHEET'}
                />
              </div>
            ))}

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold mb-4">Column Mappings (MASTER DATA sheet - Column A is Trip ID)</h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(columnMappings).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`col-${key}`} className="text-xs">
                      {key.replace(/_/g, ' ').toUpperCase()}
                    </Label>
                    <Input
                      id={`col-${key}`}
                      value={value}
                      onChange={(e) => setColumnMappings({ ...columnMappings, [key]: e.target.value.toUpperCase() })}
                      placeholder="B"
                      className="text-center"
                      maxLength={2}
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>Payment Configuration</CardTitle>
            <CardDescription>
              Configure payment links and QR codes for WhatsApp sending
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentLinks.map((link, index) => (
              <div key={index} className="border p-4 rounded-lg space-y-3">
                <div className="space-y-2">
                  <Label>Payment Link Name</Label>
                  <Input
                    value={link.name}
                    onChange={(e) => {
                      const newLinks = [...paymentLinks];
                      newLinks[index].name = e.target.value;
                      setPaymentLinks(newLinks);
                    }}
                    placeholder="Primary Payment"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment URL</Label>
                  <Input
                    value={link.url}
                    onChange={(e) => {
                      const newLinks = [...paymentLinks];
                      newLinks[index].url = e.target.value;
                      setPaymentLinks(newLinks);
                    }}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>QR Code Image (Optional)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(index, e)}
                    />
                    {link.qrImage && (
                      <img src={link.qrImage} alt="QR" className="h-10 w-10 object-cover rounded" />
                    )}
                  </div>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => setPaymentLinks([...paymentLinks, { name: "", url: "", qrImage: "" }])}
            >
              <Upload className="mr-2 h-4 w-4" />
              Add Payment Link
            </Button>
          </CardContent>
        </Card>

        <div className="p-4 border rounded-lg bg-muted/50 text-xs text-muted-foreground">
          <p className="font-semibold mb-2">📌 Setup Instructions:</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Create a Google Sheets API key OR Service Account in Google Cloud Console</li>
            <li>Enable Google Sheets API for your project</li>
            <li>Service Account JSON required for adding/updating leads; API Key only allows read access</li>
            <li>Sheet must have: MASTER DATA (leads) and BACKEND SHEET (users)</li>
            <li>BACKEND SHEET columns: C=Name, D=Email, E=Phone, M=Role, N=Password</li>
            <li>MASTER DATA: Column A=Trip ID (auto), then mapped columns as above</li>
            <li>Share sheet: "Anyone with link can view" (for API key) or share with service account email</li>
            <li>All credentials stored securely on device - not in code or cloud</li>
          </ul>
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={() => navigate('/dashboard?view=analytics')} variant="outline">
            Back to Dashboard
          </Button>
          <Button onClick={handleSave}>
            Save Settings
            <Save className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
