# Tripflow Notification Brain

This document explains the end-to-end notification system for Tripflow. One row in the **Notifications** Google Sheet represents **one notification for one user**. Rows are deleted as soon as that user reads the notification.

## Overview
- Central store: Google Sheet named **"Notifications"**.
- Each notification row includes routing hints (route/target fields) so the app can deep-link to the right screen.
- Clients (web/mobile via React + Capacitor) poll the sheet, render in-app notifications, and trigger native/local/push notifications for urgent items.
- Read lifecycle: when a user taps a notification, the row is deleted from the sheet (their copy only).

## Notification Types & Purpose
- **Push notifications**: Delivered via Capacitor/OS for high-urgency items (new leads, assignments, bookings).
- **In-app notifications**: Bell + dropdown while the user is active; immediate feedback without leaving the app.
- **Local notifications**: Fired on-device when offline/background to ensure follow-ups land.
- **Heads-up notifications**: High-priority, shown as banners (mobile) for time-sensitive events.
- **Notification badge**: Count on bell and, where supported, on the app icon for quick pending-state feedback.
- **Message notifications**: Informational, lower urgency.
- **Status bar icon**: Standard icon shown when a notification is present on mobile.

## Trigger Rules (current)
- **New lead, unassigned/unstaged** → notify admin(s).  
  Condition: new lead with traveller name, phone, email present; consultant empty; status empty.
- **Lead assignment (Unfollow/Unfollowed)** → notify assigned consultant.  
  Condition: consultant changes from empty → value AND status is Unfollow/Unfollowed.
- **Lead booked with us** → congratulate and broadcast.  
  Condition: status transitions to "Booked With Us". Sends to (a) booking consultant, (b) all team members.

## Sheet Schema ("Notifications")
Columns (do not rename):
- `Timestamp` – ISO string when created.
- `Source Sheet` – e.g., Leads sheet name.
- `Title` – notification title.
- `Message` – detailed body.
- `Role / Target` – audience hint (admin/consultant/team).
- `Read / Unread` – set to "Unread" on create.
- `UserEmail` – recipient; one row per user.
- `route` – React route to open on tap.
- `targetTravellerName` – lead traveller name (if any).
- `targetDateTime` – relevant date/time (lead created, departed, etc.).
- `targetTripId` – lead/trip identifier.
- `NotificationType` – optional: push | in-app | local | heads-up | badge | message.
- `Priority` – optional: low | normal | high.

Lifecycle:
- Rows are appended for each user per event.
- When the user reads a notification, the app deletes that row (per-user completion).

## How it Works (client)
- `notificationService` reads/appends/deletes rows in the Notifications sheet.
- `NotificationContext` polls every ~45s, holds notifications in state, exposes unread counts and mark-as-read actions.
- UI: `NotificationBell` (badge) + `NotificationList` (dropdown). Click marks read and navigates to `route`.
- Native: `nativeNotifications` triggers local/push style notifications and plays `/sounds/notification.mp3` for new items.

## Extending the System
- **New rules**: Add detectors (e.g., follow-up reminders based on last contact). Call `createNotification` per recipient.
- **New types/sounds**: Add `NotificationType`/`Priority` values, map to sound files in `public/sounds`, and branch in `nativeNotifications`.
- **Polling**: Adjust interval in `NotificationContext` (default 45s). Consider WebSocket/push for real-time in future.
- **Routing**: Use the `route` column to deep-link to any screen; keep data minimal and link back to canonical lead data.

## Why this design
- Sheets remain the single source of truth for notifications across devices.
- One-row-per-user simplifies read lifecycle (delete on read).
- Supports offline/local notifications for mobile while keeping in-app UI consistent.

## Follow-Up & Deal-Closure Notification Brain

### Purpose
- Analyze lead status, activity, and remarks to push agents toward the best next action and increase closure rates.

### Data Used
- Lead status (Master Data column D).
- Remark text (column K) containing embedded timestamps: Last Call, Last WA/Whatsapp, Last Email, Last Status.
- Parsed timestamps: last call, last WhatsApp, last email, last status change, latest remark time.
- Time since last activity + simple keyword intent/objection detection.

### Scoring (0–100 Urgency)
- Status weight (e.g., Hot Leads 40, Negotiations 30, Proposal 3 25, Booked With Us -100).
- Time decay (up to +30): Call/WA/Email/Status inactivity → tiered points (0–6h:0, 6–12h:+3, 12–24h:+6, 24–48h:+10, 48–72h:+15, >72h:+20). Cap at +30. If no activity at all, +10.
- Behaviour keywords (clamped -40 to +25):
  - Positive intent: +15 (`interested`, `very keen`, `will confirm`, `finalizing`, `almost done`, `serious`)
  - Price objection: +10 (`price`, `budget`, `too expensive`, `costly`)
  - Non-response: +5 (`not picking up`, `no response`, `didn't answer`)
  - Negative intent: -40 (`not interested`, `no longer interested`, `stop calling`, `do not call`)
  - Age >7 days (not closed/cancelled) → +15
- Clamp final score 0–100.
- Examples:
  - Hot lead, 24h since last call, “interested” → ~80–100.
  - Follow-up Calls - 2, 3 days no contact, “no response” → ~60–80.
  - Booked With Us → 0.

### Next Best Actions
- Actions: CALL_NOW, SEND_WHATSAPP, SEND_EMAIL, PUSH_NEGOTIATION, SHARE_PROPOSAL, CHECK_INTEREST.
- Urgency: low/normal/high derived from status + recency + score.
- Examples:
  - Hot Leads & last call >6h → CALL_NOW (high).
  - Proposal Shared & WA >12h → SEND_WHATSAPP (high).
  - Negotiations & status change >8h → PUSH_NEGOTIATION (high).
  - Follow-up Calls & no call >24h → CALL_NOW (normal/high by score).

### Notification Types & When They Fire
- High score (>70): urgent follow-up notification (Priority high, NotificationType FOLLOWUP).
- Medium (40–70): normal reminder (FOLLOWUP).
- Low (20–40): low-priority reminder (FOLLOWUP) at a reduced cadence.
- <20: typically no notification.
- Each notification records `NotificationType`, `Priority`, `NextAction` in the sheet.

### Time-Based Rules (layered)
- Hot Leads: no call >6h → CALL_NOW (high).
- Negotiations: no status change >8–12h → PUSH_NEGOTIATION.
- Proposal 1/2/3 Shared: reminders at +12h, +24h, +48h (WA/email/call escalation).
- Follow-up Calls 1–5: last call >24h → CALL_NOW.
- Whatsapp Sent: last WA >18h and no call → SEND_WHATSAPP_REMINDER or CALL_NOW.
- Unfollowed (assigned): 1–2h after assignment with no call → CALL_NOW.

### Examples
- Status: Hot Leads; Score: 85; NBA: CALL_NOW → Title: “Follow Up Now: Hot Lead Cooling Down”; Message: “Last call was 26 hours ago and status is 'Hot Leads'. Call now to keep momentum.”
- Status: Proposal 2 Shared; Score: 65; NBA: SEND_WHATSAPP → Title: “Proposal Follow-Up Needed”; Message: “Proposal 2 was shared 18 hours ago with no reply. Send a WhatsApp reminder.”
- Status: Negotiations; Score: 78; NBA: PUSH_NEGOTIATION → Title: “Negotiation Stuck – Take Action”; Message: “No status change in negotiations for 10 hours. Push forward.”

### Extensibility
- Add new keywords or weights in `leadScoring`.
- Adjust time thresholds in `nextBestAction` or time-based rules.
- Add new notification types by extending `NotificationType`/`NextAction` and branching in the sync logic.

### Sheet Columns (additions)
- `NotificationType` (e.g., FOLLOWUP, CLOSING)
- `Priority` (low | normal | high)
- `NextAction` (e.g., CALL_NOW, SEND_WHATSAPP, PUSH_NEGOTIATION)
