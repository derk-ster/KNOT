# Demo plan (4 minutes + 3 minutes Q&A)

## Before presenting

- One laptop opens the deployed site (Vercel URL). A second laptop (or phone) stands by with a different browser profile.
- Both must use the deployed URL with `DATABASE_URL` configured, so groups/messages are shared.
- Rehearse the goal text typing (don't paste; typing live looks better).

## Script

1. **0:00 to 0:30. Home.** Say the pitch: "KNOT finds the people who can help you make something happen." Type the goal live:
   `I want to make a short film in Plano and need someone who can edit.`
2. **0:30 to 1:15. AI Finder / results.** Press Find my people. Show the "What KNOT understood" chips (video editing, Plano). Open "Why this match?" on Maya: the evidence rows are her actual stored profile facts. Point out the "Online only" caveat on Priya: honest limitations, not fake percentages.
3. **1:15 to 2:00. Edit the goal.** Change "in Plano" to "online" and re-run. Results react: the Plano requirement disappears and online-only people become first-class matches. Judges can type anything here; the matcher is not scripted.
4. **2:00 to 2:45. Group creation.** Tick Maya, press Create group, name the room, watch the knot animation, land in the chat.
5. **2:45 to 3:30. Cross-computer chat.** On the second device, open the invite link (copied from the room). The joiner appears as a real member. Send a message from the second device; it appears on the first within ~2 seconds. Both messages persist after refresh (shared database).
6. **3:30 to 4:00. Assistant.** Press "Help us get started": the draft is built from the group's goal and members' stated skills and free days, labeled as a draft, editable, and the chat works even if AI is off. Close with the tagline.

## Be ready for

- "Is the matching real AI?" → No model at runtime for matching; deterministic rules in `lib/match.js`, every reason traceable to a stored field. Groq models are used only in the AI Finder chat and help bot, server-side.
- "What's real data?" → The 51 community profiles are fictional (labeled demo). User sessions, groups, messages are real and shared via Postgres.
- "What if two people want the same group?" → Server-side sessions; invite links; RLS-style access enforced by the server (outsiders get 403).
