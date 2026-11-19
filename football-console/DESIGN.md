# Football Analytics — Interface design language

## Direction

An editorial football control room: confident near-black navigation, neutral
paper-like content, hairline separators, restrained status colors, and compact
rows that prioritize the match itself. The reference is the visual restraint of
the STRATUM gallery example; the quality review follows the principles of
[`pbakaus/impeccable`](https://github.com/pbakaus/impeccable): deliberate hierarchy,
purposeful density, responsive adaptation, accessibility, and hardening for
real content. Do not copy the Impeccable product's branding or UI assets.

## Information hierarchy

1. League group and kickoff time.
2. Home team, score, away team, current match state.
3. On demand: goal scorers and minutes, market details, and supporting facts.
4. Explanatory notes, source information, and administrative controls.

Only one visible league label is needed per expanded group. In the schedule,
do not add a hidden or redundant column that allocates blank width. Grouped
matches remain chronological within each league. Use Chinese names when a
reliable mapping exists, otherwise retain the source English name.

## Visual system

- Main canvas: neutral light gray (`#f5f5f3`); content surfaces: white.
- Navigation and league bands: near-black (`#111213`).
- Main text: dark ink (`#1b1d1e`); supporting text: readable muted gray.
- Success/win green and loss/error red are *semantic only*; text must also
  say what occurred. Avoid decorative gradients, neon, glass, and stacked cards.
- Use a short, consistent spacing rhythm (4, 8, 12, 16, 24px) and thin borders.
- Square or barely rounded panels/controls. Reserve large visual contrast for
  headings, score, selected navigation, and significant result states.
- Use Chinese-capable sans text for names and copy; monospace for times,
  scorelines, counts, short labels, and percentages. Keep numerical columns
  visually aligned with tabular numerals.

## Density and responsive rules

- Desktop: one match per horizontal line under a collapsible league heading.
  No large fixture cards or repeated descriptions. Show multiple fixtures at
  once without making the text too small to distinguish.
- Mobile: retain one concise row per match, with two balanced teams around the
  score. Wrap long localized names instead of clipping the result.
- Historical summary: six statistics in one segmented strip on wide screens,
  three per row on phones; standing columns stay narrow and aligned.
- Controls may be compact visually, but tap targets must remain operable.
  Mobile form inputs use 16px to avoid involuntary iOS browser zoom.
- Keep focus indicators visible, including against dark navigation, and
  respect reduced-motion preferences.

## Functional invariants

- Visual restyling must not change predictions, grades, statistics, data
  synchronization, fixture identity, or historical records.
- Match rows remain interactive and open confirmed scorer details when
  available. Do not invent events or silently replace missing data.
- Empty states are concise. Internal verification labels, noise, and debugging
  counters should not dominate the public reading path.
- Keep schedule, predictions, review, historical statistics, standings, and
  data verification within the same visual language.

## Regression checklist

- Check desktop and mobile states with many fixtures and zero fixtures.
- Check long team names, bilingual fallback, live and finished scores.
- Check league collapse/expand, match-detail modal, keyboard focus, and zoom.
- Check standings overflow and history numeric alignment.
- Run the Node test suite after editing code or data presentation.
