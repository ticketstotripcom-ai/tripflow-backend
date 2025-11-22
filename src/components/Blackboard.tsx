import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSheetService } from "@/hooks/useSheetService";
import { authService } from "@/lib/authService";
import { notifyAll } from "@/utils/notifyTriggers";
import { Pin, Trash2 } from "lucide-react";

interface BlackboardMessage {
  id: string;
  message: string;
  author: string;
  createdAt: string;
  pinned: boolean;
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Minimal markdown renderer */
function renderMarkdown(text: string) {
  if (!text) return null;

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`(.+?)`/g, "<code class='px-1 py-0.5 rounded bg-muted text-xs'>$1</code>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    "<a href='$2' target='_blank' class='underline text-primary'>$1</a>"
  );
  html = html.replace(/\n/g, "<br />");

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Single animated Blackboard card */
function BlackboardItem({
  msg,
  isAdmin,
  onPinToggle,
  onDelete,
}: {
  msg: BlackboardMessage;
  isAdmin: boolean;
  onPinToggle: (id: string, nextPinned: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const startXRef = useState<number | null>(null)[0] as any;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isAdmin) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startXRef.current = e.clientX;
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !isAdmin || startXRef.current == null) return;
    const deltaX = e.clientX - startXRef.current;
    if (deltaX < 0) setDragX(Math.max(deltaX, -120));
  };

  const handlePointerUp = () => {
    if (!isAdmin) return;
    setDragging(false);

    if (dragX <= -80) {
      // Trigger fade-out animation
      setFadeOut(true);
      setTimeout(() => onDelete(msg.id), 250);
    } else {
      setDragX(0);
    }
  };

  return (
    <div className={`relative overflow-hidden ${fadeOut ? "opacity-0 transition-opacity duration-300" : ""}`}>
      <div className="absolute inset-0 flex justify-end items-center pr-4 bg-red-50 dark:bg-red-900/20">
        {isAdmin && (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-300 text-xs sm:text-sm">
            Swipe to delete <Trash2 className="w-4 h-4" />
          </div>
        )}
      </div>

      <div
        className="relative rounded-md border p-3 bg-card/50 transition-transform duration-200 ease-out animate-fade-in"
        style={{ transform: `translateX(${dragX}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          setDragging(false);
          setDragX(0);
        }}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 text-sm">{renderMarkdown(msg.message)}</div>

          {isAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPinToggle(msg.id, !msg.pinned);
              }}
              className={`p-1 transition-colors ${
                msg.pinned ? "text-yellow-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Pin className={`w-4 h-4 ${msg.pinned ? "fill-yellow-500" : ""}`} />
            </button>
          )}
        </div>

        <div className="mt-1 text-xs text-muted-foreground">
          {msg.pinned && <span className="mr-1">📌</span>}
          — {msg.author} · {new Date(msg.createdAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export default function Blackboard() {
  const [messages, setMessages] = useState<BlackboardMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [text, setText] = useState("");
  const { toast } = useToast();
  const session = authService.getSession();
  const isAdmin = session?.user.role === "admin";
  const { service } = useSheetService();

  /** Load messages from Google Sheets */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (!service) return;

      const rows = await service.getRows("Blackboard");

      const parsed: BlackboardMessage[] = (rows || [])
        .filter((r: any[]) => r && r[1])
        .map((r: any[]) => ({
          id: String(r[0] ?? ""),
          message: String(r[1] ?? ""),
          author: String(r[2] ?? ""),
          createdAt: String(r[3] ?? ""),
          pinned: String(r[4] ?? "").toLowerCase() === "true",
        }));

      // Sort: pinned first → newest first
      parsed.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      setMessages(parsed);
      localStorage.setItem("crm_blackboard_cache_v1", JSON.stringify(parsed));
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to load blackboard",
        description: err?.message || "Try again later",
      });
    } finally {
      setLoading(false);
    }
  }, [service, toast]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  /** Admin: post new announcement */
  const handlePost = async () => {
    if (!isAdmin) return;
    const content = text.trim();

    if (!content) {
      toast({
        variant: "destructive",
        title: "Message required",
        description: "Please write something to post",
      });
      return;
    }

    try {
      setPosting(true);
      if (!service) return;

      const row = [
        uuid(),
        content,
        session?.user.name ?? "Admin",
        new Date().toISOString(),
        "FALSE",
      ];

      await service.appendRow("Blackboard", row);

      try {
        await notifyAll(
          "New Blackboard Update",
          "Admin posted a new announcement",
          "blackboard"
        );
      } catch {}

      setText("");
      await load();

      toast({ title: "Posted", description: "Your announcement is live." });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Post failed",
        description: err?.message || "Unable to publish announcement",
      });
    } finally {
      setPosting(false);
    }
  };

  /** ADMIN: toggle global pin state (Google Sheets write) */
  const handleTogglePin = async (id: string, nextPinned: boolean) => {
    try {
      if (!service) return;

      const success =
        (service as any).updateBlackboardPin &&
        (await (service as any).updateBlackboardPin("Blackboard", id, nextPinned));

      if (!success) {
        console.warn("updateBlackboardPin not implemented in GoogleSheetsService");
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, pinned: nextPinned } : m
        )
      );

      toast({
        title: nextPinned ? "Pinned" : "Unpinned",
        description: nextPinned
          ? "Announcement moved to pinned section."
          : "Announcement unpinned.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Pin update failed",
        description: "Unable to update pin state.",
      });
    }
  };

  /** ADMIN: delete entry */
  const handleDelete = async (id: string) => {
    if (!isAdmin) return;

    // local remove
    setMessages((prev) => prev.filter((m) => m.id !== id));

    try {
      if ((service as any).deleteBlackboardRowById) {
        await (service as any).deleteBlackboardRowById("Blackboard", id);
      } else {
        console.warn("deleteBlackboardRowById not implemented.");
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: "Could not delete row from Google Sheets.",
      });
    }
  };

  // Split messages into sections
  const pinnedMessages = messages.filter((m) => m.pinned);
  const otherMessages = messages.filter((m) => !m.pinned);

  return (
    <Card className="shadow-soft">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg sm:text-xl">🖤 Blackboard</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ADMIN INPUT */}
        {isAdmin && (
          <div className="space-y-2">
            <Textarea
              placeholder="Write an announcement… supports **bold**, *italic*, links, and line breaks"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex justify-end">
              <Button onClick={handlePost} disabled={posting} className="min-w-[120px]">
                {posting ? "Posting…" : "Post Update"}
              </Button>
            </div>
          </div>
        )}

        {/* PINNED SECTION */}
        {pinnedMessages.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              📌 Pinned Announcements
            </div>

            {pinnedMessages.map((m) => (
              <BlackboardItem
                key={m.id}
                msg={m}
                isAdmin={isAdmin}
                onPinToggle={handleTogglePin}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* NORMAL MESSAGES */}
        <div className="space-y-2">
          {loading && messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : otherMessages.length === 0 ? (
            <div className="text-sm text-muted-foreground">No announcements yet.</div>
          ) : (
            otherMessages.map((m) => (
              <BlackboardItem
                key={m.id}
                msg={m}
                isAdmin={isAdmin}
                onPinToggle={handleTogglePin}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
