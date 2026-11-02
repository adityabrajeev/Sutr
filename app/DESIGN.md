# SUTR design system: "Concierge desk"

SUTR is a wedding operations app, but most of the people using it are doing hospitality work: welcoming guests, rooming them, getting them from the airport, and keeping a function running on time. So the reference point is the best of hotel service, not SaaS dashboards.

## 1. What the research says

| Finding | Source | What SUTR does with it |
|---|---|---|
| Housekeeping staff read a room's status **before walking in**. Icons beat text, actions are **one-handed**, and the UI has to work for people with limited smartphone experience who speak different languages. Based on interviews with 100 attendants across 40 hotels. | [Actabl](https://actabl.com/resources/hotel-housekeeping-technology-design/) | Coordinator and vendor screens lead with one status and one big next action in the thumb zone. Status always pairs an icon with a word, never colour alone. |
| Four Seasons Chat uses **real people, no bots**. Replies average **≤90 seconds**, guests message about 6 times per stay (twice the industry average), and the typical message is about 80 characters. | [Hospitality Net](https://www.hospitalitynet.org/news/4085206.html), [Hotels Mag](https://hotelsmag.com/news/for-four-seasons-texting-enhances-not-replaces-guest-comms) | The guest's FAQ assistant and WhatsApp thread merge into one **Ask** tab. Answers come instantly when SUTR knows them; anything else goes to a named person. |
| The best hotel apps are **stay-phase aware**: pre-arrival → arrival (key) → in-stay → checkout. Most apps underbuild post-stay. | [Resident](https://resident.com/travel-resources/2026/05/19/why-luxury-travellers-are-running-their-2026-trips-from-a-phone), [Sunver](https://www.sunver.app/blog/hotel-digital-concierge-the-complete-guide-for-hotels-in-2026), [DEV](https://dev.to/alichherawalla/mobile-development-for-us-hospitality-companies-guest-apps-iot-integration-and-peak-season-5gg1) | Every persona's home opens with the **one thing that matters right now**, and it changes with the phase. Post-wedding is a real phase: gallery, thanks, testimonial. |
| The concierge should be introduced **before arrival** and be reachable through links and welcome messages, not an app download. | [Sunver](https://www.sunver.app/blog/hotel-digital-concierge-the-complete-guide-for-hotels-in-2026) | No accounts for guests, hosts or vendors, as the workflow doc already specifies. Each link opens straight into the right screen. |
| Ops dashboards work when they are **focused per audience**, use colour only to direct attention, and stack to tabs on mobile. | [Esri](https://www.esri.com/content/dam/esrisites/en-us/events/conferences/2021/fedgis-conference/12308-arcgis-dashboards-designing-effective-dashboards.pdf) | A separate home for each role instead of one dashboard with hidden menu items. Colour is reserved for status. |
| Deep blues read as trust and calm, greens as wellbeing, and gold suits fills but **fails as text**: gold on cream is 2.0:1. | [Hotel Designs](https://hoteldesigns.net/member-news/accessible-design-in-hospitality-paint-colours-neurodiversity/), [ihatecolors](https://ihatecolors.pages.dev/palette/luxury-hotel) | Indigo and peacock teal carry text and actions. Turmeric is a fill and marker only. Every text pair is checked against WCAG AA (4.5:1). |
| About half of users hold the phone in one hand and tap with the thumb. Targets should be about 44 px or larger. | [UX Planet](https://uxplanet.org/one-handed-use-of-tab-bar-bottom-navigation-best-practices-for-reachability-73376377444b), [Parachute](https://parachutedesign.ca/blog/thumb-zone-ux/) | Bottom tabs on every phone view, primary actions at the bottom of their card, minimum 44 px targets, 48 px on vendor and coordinator screens. |

Caveat: most published hospitality UX material is vendor marketing. The sources above were picked because they report real observations; percentages quoted only by vendors were left out.

## 2. Screen audit: what each persona needs, screen by screen

The question for every screen: **what is this person trying to get done, at this moment, with one hand?**

**Owner / planner**: web first, runs the whole agency.
- *Today.* Keep: the critical items and the list of weddings. Change: open with the single worst fire as a ticket, not a grid of equal red cards (five cards of the same weight tell you nothing about priority). Cut: the team chip cloud from the main column; it moves to the rail.
- *Wedding workspace.* Keep: the priority queue; it *is* the screen. Change: the health bars become secondary; the queue goes first, full width.
- *Modules* (guests, RSVP, travel, rooms, vendors, budget…). These are dense work tools and stay as tables. They take on the new tokens; their layout is unchanged in this pass.

**Coordinator**: phone first, works one wedding on shift. Until now coordinators got the planner app with items hidden. That's the gap you spotted.
- *New home: My shift.* Their next commitment as a ticket, then tasks due today (one-tap complete), incidents they own, today's functions, and three quick actions: check in a guest, log an incident, report a vendor delay.
- *New navigation.* Five bottom tabs: Shift, Tasks, Guests (lookup, not admin), Live, Inbox. Agency-level items (proposals, settings, analytics, portfolio) disappear from their world rather than sitting there disabled.

**Host / family admin**: "decisions, not data entry" (workflow doc).
- *Home.* A ticket with the decisions waiting, or the countdown when there are none. Then headcount and timeline. Cut: budget and documents move behind the overview; most hosts never need them.
- *Decisions.* Keep. One decision per sheet, with approve as the dominant action and "request changes" requiring a comment.

**Guest**: no account, opens a WhatsApp link, often an elderly relative.
- *Home is phase aware.* Invited → the ticket is RSVP. Attending without travel → share travel. Pickup booked → the pickup ticket (vehicle, plate, driver, call button). Room final → the **room key card** with the room number large. Function live → where to be now. After → the gallery.
- *Tabs* cut from five to four: Home, Schedule, Stay (travel + room together, as a hotel would show them), Ask (FAQ + WhatsApp merged).
- Cut: the RSVP tab. RSVP is a task you do once, so it opens from the ticket.

**Vendor / driver / photographer**: one job, mid-task, gloves on.
- *Home is the next job.* A ticket with a live countdown to reporting time and **one** big next-step button (Confirm → Leaving → Reached → Setup → Ready → Done). The six-button grid is replaced by the single next step plus a small "running late".
- *Driver.* The trip sheet *is* home. Each passenger gets three large buttons.
- *Photographer.* Upload *is* home.

**Prospect**: deciding whether to hire.
- Keep the configurator. Restyle only; their structure already matched their job.

**Everyone**: a **"View as" switcher** (demo builds only) jumps between all nine views in one click.

## 3. Tokens

**Colour.** Indigo dye and peacock, from Jaipur blue pottery and palace interiors, with turmeric as the single warm accent:

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `ink` (Indigo night) | `#1B2440` | Text, staff sidebar, the ticket | 15.6:1 on white |
| `brand` (Peacock) | `#0E6B66` | Primary actions, links, selection | 6.4:1 on white |
| `haldi` (Turmeric) | `#E8B12B` | The ticket stub, "now" markers. **Never text on light.** | 8.3:1 under ink |
| `canvas` (Porcelain) | `#F3F4F6` | App background (cool, not cream) | n/a |
| `line` | `#DFE3EA` | Hairlines | n/a |
| `mute` | `#596274` | Secondary text | 5.6:1 on canvas |
| Status | ok `#23794A` · warn `#8A5800` (on `#FFF4D6`) · bad `#B42318` · info `#3346A0` | Status only, always with an icon or word | each ≥ 4.5:1 |

**Type.** One family, **Archivo**, using its width axis the way hotel and airport wayfinding signage does:
- Expanded 112%, bold: room numbers, times, countdowns, headcounts, page titles. Signage you read at arm's length.
- Normal 100%: body and UI at 15 px base, line-height 1.5.
- Semi-condensed 88%: dense tables and chips.
- Scale (perfect fourth): 12 / 13 / 15 / 20 / 27 / 36 / 48.

**Shape.** The radius encodes hierarchy instead of one radius everywhere: ticket 18, sheets 16, cards 12, controls 10, chips full. Cards are flat (hairline border, no shadow); shadows only on things that float (sheets, menus, toasts).

**Layout.** Left aligned throughout. Phones: one column, a 16 px gutter, and the ticket at the top. Desktop staff: indigo rail on the left, content up to 1200 px wide.

```
 phone (every persona)        desktop (planner)
┌──────────────────────┐     ┌────┬──────────────────────────────┐
│ ▓▓ NOW TICKET ▓▓▓▓▓▓ │     │rail│ ▓▓ NOW TICKET (worst fire) ▓  │
│ ┄┄┄┄┄┄┄ perforation  │     │    ├───────────────┬──────────────┤
│ ROOM  214            │     │    │ priority list │ this week    │
│ [ primary action ]   │     │    │               │ my tasks     │
├──────────────────────┤     │    │               │ team         │
│ list…                │     └────┴───────────────┴──────────────┘
├──────────────────────┤
│ tab  tab  tab  tab   │
└──────────────────────┘
```

## 4. Principles

1. **One ticket, one action.** Each home opens with a single "now" ticket: indigo, a turmeric stub, a perforated edge, and expanded numerals. It is the only bold element on the screen; everything else stays flat and quiet.
2. **Status before entering the room.** Every status pairs an icon with a word and is readable at a glance.
3. **Write like the concierge.** Plain verbs, sentence case, the name of the person who will help. No all-caps labels and no "A · B · C" meta strings on persona screens.
4. **Hide, don't disable.** A role never sees tools it can't use.
5. **Thumb first.** Bottom tabs, primary actions at the bottom of their card, targets ≥ 44 px (48 px on vendor and coordinator screens).

## 5. Review against the generic defaults

| Draft choice | Problem | Revised to |
|---|---|---|
| Cream `#FAF7F2` + Fraunces serif + terracotta `#B4532A` (the v1 look) | This is the most common generated-design default, and it says "artisan bakery" more than "palace hotel ops" | Cool porcelain, indigo and peacock, with turmeric as the only warm note; Archivo instead of a serif |
| Gold accent text for luxury | Fails contrast (2.0:1) and is the hotel cliché | Turmeric used only as a fill, under indigo |
| Grid of equal red "critical" cards | The identical-card kit; no hierarchy | One ticket for the worst item, the rest as a ranked list |
| ALL-CAPS tracked eyebrows over headings | Template chrome | Removed; the date sits as plain text under the greeting |
| "Fri, 13 Nov · 10:00 · Lakeside Lawns" meta strings | Middle-dot template tell, and hard to scan for older guests | Persona screens use stacked lines with icons: when, then where |
| Same shell for planner and coordinator | Ignores two very different jobs | Separate coordinator shell and home |

The radius scale was also rechecked: an earlier draft used 16 everywhere.
