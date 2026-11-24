# Accessibility

Voyage targets **WCAG 2.2 level AA**. This note records how it was audited, what was fixed, and how
it stays accessible.

## How it was audited (24 Nov 2026)

- **Automated:** [axe-core](https://github.com/dequelabs/axe-core) 4.10 (WCAG 2.0/2.1/2.2 A and AA rules
  plus best practices) on every page, in both **light and dark** themes, at **desktop and phone (375 px)**
  widths, as an Administrator and as a Manager.
- **States, not just pages:** every dialog (accounting export, legal hold, all Administration tabs), the
  command palette, the notifications panel, the phone menu drawer, and forms showing validation errors.
- **Keyboard:** skip link, Tab order, focus moving into and out of dialogs, Escape, arrow-key lists, and
  focus after moving between pages.
- **Reflow:** no sideways scrolling on any page at 375 px (WCAG 1.4.10).

Result: **no axe violations** on any page or state above, in either theme.

## What was fixed

| Area | Problem | Fix |
|---|---|---|
| Finance page | Crashed (blank screen) because of the accounting export dialog | Fixed; every page now also has an error boundary, so one broken page can no longer blank the app |
| Colour contrast | Green, amber and red status text was 3.7–4.4:1 in light mode; the notification badge was 2.8:1 in dark mode | Light status colours darkened slightly (all ≥ 4.7:1 on every surface and tint); badge uses dark text in dark mode |
| Headings | Several pages jumped from h1 to h3 | Section titles are h2 |
| Page titles | Every tab was called "Voyage · Travel & Reimbursement" | Each page sets its own title, e.g. "Expense reports · Voyage" (WCAG 2.4.2) |
| Page changes | Screen readers got no cue that a new page had loaded | Focus moves to the new page's heading |
| Dialogs | A dialog's focus jumped around whenever it re-rendered; Escape sometimes did nothing | Dialog keyboard setup runs once per open; Escape and focus return work |
| Phone menu | Not announced as a dialog; focus stayed behind it; menu button had no open/closed state | Modal dialog with focus trap, Escape, focus return and `aria-expanded` |
| Command palette | Results list had no name; options contained nested buttons | Standard ARIA combobox (`aria-activedescendant`) |
| Approvals inbox | Requests could only be picked with the mouse (or hidden shortcuts) | Each request has a real button; the review pane is keyboard-scrollable |
| Charts | Pie/bar slices exposed as unnamed images | Bar chart has a spoken summary; the pie is hidden (its legend lists every value) |
| Reflow | Expense, trip and new-trip pages scrolled sideways on phones | Layout columns and rows now shrink and wrap |
| Smaller items | "New" button unnamed on phones, invalid `<dl>` on Profile, unnamed landmarks, empty table header, unread dot not announced | All fixed |

## How it stays accessible

- **CI lint:** `npm run lint:a11y` (eslint-plugin-jsx-a11y, recommended rules) runs on every push and
  fails the build on unlabelled controls, missing alt text, invalid ARIA, click handlers without keyboard
  support, and similar mistakes.
- **Building blocks:** use the shared components. They already handle the hard parts: `Modal` (focus
  trap, Escape, focus return), `Field` (label, `aria-invalid`, error message wiring), `UserPicker`
  (combobox), `PageHeader` (the page's h1, which also becomes the browser tab title).
- **Motion:** animations follow the person's "reduce motion" system setting.

## Re-running the audit

With the app running locally, open any page, then paste in the browser console:

```js
await new Promise((r) => { const s = document.createElement('script'); s.src = '/node_modules/axe-core/axe.min.js'; s.onload = r; document.head.appendChild(s); });
(await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations;
```

An empty array means the page passes. Wait for page animations to finish first: text that is still
fading in can show as a false contrast failure.

Automated tools find roughly a third to half of real issues. Before a major release, also try the main
flows (request a trip, claim an expense, approve, pay) with only the keyboard and with a screen reader
(NVDA on Windows or VoiceOver on macOS).
