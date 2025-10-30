import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useSheetService } from '@/hooks/useSheetService';
import { authService } from '@/lib/authService';
import { notifyAll } from '@/utils/notifyTriggers';

interface BlackboardMessage {
  id: string;
  message: string;
  author: string;
  createdAt: string;
}

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Blackboard() {
  const [messages, setMessages] = useState<BlackboardMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [text, setText] = useState('');
  const { toast } = useToast();
  const session = authService.getSession();
  const isAdmin = session?.user.role === 'admin';

  const load = async () => {
    try {
      setLoading(true);
      const svc = await useSheetService();
      const rows = await svc.getRows('blackboard');
      const parsed = (rows || [])
        .filter((r: any[]) => r && r.length)
        .map((r: any[]) => ({
          id: String(r[0] || ''),
          message: String(r[1] || ''),
          author: String(r[2] || ''),
          createdAt: String(r[3] || ''),
        })) as BlackboardMessage[];
      parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMessages(parsed.slice(0, 5));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to load blackboard', description: e.message || 'Try again later' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const handlePost = async () => {
    if (!isAdmin) return;
    const content = text.trim();
    if (!content) {
      toast({ variant: 'destructive', title: 'Message required', description: 'Please write something to post' });
      return;
    }

    try {
      setPosting(true);
      const svc = await useSheetService();
      const now = new Date().toISOString();
      const id = uuid();
      await svc.appendRow('blackboard', [id, content, session?.user.name || 'Admin', now]);
      await notifyAll('New Blackboard Update', 'Admin posted a new announcement. Check your Dashboard.');
      setText('');
      await load();
      toast({ title: 'Posted', description: 'Your announcement has been shared with everyone.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Post failed', description: e.message || 'Unable to post update' });
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card className="shadow-soft">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg sm:text-xl">🖤 Blackboard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isAdmin && (
          <div className="space-y-2">
            <Textarea
              placeholder="Write an announcement for everyone…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex justify-end">
              <Button onClick={handlePost} disabled={posting} className="min-w-[120px]">
                {posting ? 'Posting…' : 'Post Update'}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {loading && messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">Loading updates…</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">No announcements yet.</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="rounded-md border p-3 bg-card/50">
                <div className="text-sm">{m.message}</div>
                <div className="mt-1 text-xs text-muted-foreground">— {m.author} · {new Date(m.createdAt).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
