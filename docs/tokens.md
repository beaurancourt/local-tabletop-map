# Tokens

Tokens are placed combatants on the map: a name, current/max HP, an owner field,
and a cell position. They are a map-level layer, not a replacement for the
initiative roster.

## Decisions

**Store and persistence.** Tokens live in `AppState.tokens` and are saved per map
in `SavedMapState.tokens`, beside fog, drawings, blocks and labels. They are part
of the state that syncs from the DM window to the player window, so no new layer
or transport is introduced. Older saves without the field load with `tokens: []`.

**Stable identity.** Every token gets a `crypto.randomUUID()` id (with a fallback
for environments without it). The id does not change when the name, HP or cell
changes. `owner` is a nullable string reserved for the networking card; it is
persisted and editable but nothing enforces or consumes it yet.

**Position.** Tokens are anchored to a grid cell (`gridX`, `gridY`), not free pixel
coordinates. The token is drawn at the cell centre and leaving it on another cell
snaps it there. This keeps positions stable when the grid offset or size changes
and gives the network layer a small integer key. Free positioning would be a
later change if token footprints or half-cell movement are needed.

**Initiative.** Tokens are independent of initiative entities. Initiative works
whether or not a map is loaded and can contain actors not yet placed; a token can
exist without a roster entry. The stable token id leaves room for an explicit
link later without guessing one now.

**Health bar.** Both windows draw a name above the token and a rounded bar below
it. The fill is green above 50%, yellow from 25% to 50%, and red at or below 25%
(including 0). The bar carries the current/max numbers underneath. `maxHp: 0`
means "unset": no bar is drawn and the token is neutral grey. HP is clamped to
0..max; zero HP empties the bar and reddens the token outline and name. The bar is
sized in map pixels so it scales with the map, and the name/number text uses a
heavy outline for legibility over any map.

**Fog and hit testing.** The fog canvas is an Image drawn above the tokens.
Konva hit-tests an Image as its full rectangle regardless of transparent pixels,
so a listening fog image swallowed every token press on a map with any fog; the
press fell through to the draggable map layer and panned instead of grabbing the
token. The fog image is now `listening={false}`. It stays above the tokens
visually, so unrevealed tokens remain hidden, but presses reach the token or the
map beneath. This was invisible on fog-free test maps, and it affected the DM
and browser player as well as the browser GM.

**Rendering cost.** Each token is a group of Konva nodes (body, name, health
bar, HP text, tag pills). The body's soft shadow originally used Konva's
perfect-draw path, which allocates a buffer per shadowed, stroked shape on every
draw. That path made a 30-token map take ~100 ms per drag frame even though only
the dragged token moved. Setting `perfectDrawEnabled={false}` on the token body
keeps the same shadow and brings the same 30-token drag to ~17 ms. A layer split
was measured too; it made empty-map panning cheaper but did not fix the token
drag, so the extra layer and its fog-order complexity were not kept. The
regression guard is the frame measurement in the card, not a unit test: the cost
is in the canvas draw, which vitest does not exercise.

**DM versus players.** Players see the token body, name, health bar and numbers.
A player can press their own token to select it and drag it; the matching HP row
in the HUD highlights. The DM and browser GM additionally get the token panel
(place, name, HP, max, owner, colour, remove), can press any token to select and
drag it, and see the edit fields. There is no hidden information in the token
layer yet; that is a networking/visibility card.

**Interaction precedence.** A pointer press on a token always belongs to the
token, whatever tool is selected. The active tool only changes what an empty-map
press does: `pan` and `token` drag the map, and the token tool places a token on
the click that ends a drag-free press. This is one rule in `MapCanvas`, so the
desktop DM, browser GM and browser player behave alike. Selecting a token opens
its existing editor — the settings sidebar on the DM, the Tokens panel in the
browser GM, and the HP row in the player HUD — and a double-click focuses that
editor directly. The touch path uses the same precedence: a press on a token is
left to Konva's token drag, while empty-map drags and two-finger pinches pan and
zoom the player's local view.

**Undo and redo.** Token changes use the same command pattern as fog, drawings
and text labels (`src/history.ts`): `createTokenChangeOperation(before, after)`
stores the whole token on each side, where `before=null` is an add and
`after=null` is a remove. `recordTokenChange` pushes it onto the existing
`HistoryManager`, so token and non-token operations interleave in one 100-step
stack instead of a second history mechanism.

- **One drag is one step.** `MapCanvas` calls `onTokenMove` once on drag end, not
  per pointer move. Dropping a token back on its own cell records nothing.
- **One field edit is one step on commit.** Typing updates the live state on
  every keystroke, but `TokenEditSession` snapshots the token on focus and
  records one operation on blur or Enter. A no-op focus records nothing.
- **Discrete actions are one step each.** Add token, remove token, and each tag
  add/remove are single operations. Name, HP, max HP, owner and colour are
  field-commit steps. Because the whole token is stored, every token field is
  covered.
- **Depth is 100**, shared with the other undoable operations in the DM and with
  the browser GM's own operations. Loading a new map clears the stack. The stack
  is in memory: reconnecting, refreshing or opening a new tab starts empty.
- **The browser GM's undo is a shared-state replay.** Undo computes the next
  `AppState` from the GM's local stack, then calls the same `onChange` used by
  every other GM edit. That sends a normal `gm-state` message over the WebSocket
  and the server broadcasts the resulting state to every player. There is no
  local-only rewind and no separate "undo" event; players simply receive the
  re-applied table state. The GM's history covers GM actions, not player moves.
  Undoing a token restores that whole token, so a later edit by another client
  to the same token is overwritten by that undo; other tokens are untouched.
- **Controls.** Both the DM toolbar and the browser GM header have Undo and Redo
  buttons with live step counts. `Ctrl/Cmd+Z` undoes, `Ctrl/Cmd+Shift+Z` and
  `Ctrl/Cmd+Y` redo. While an input is focused, the app leaves the browser's
  native text undo alone.
- **Tests.** `src/tokenHistory.test.ts` covers add/move/edit/remove operations,
  other tokens surviving, undo/redo through `HistoryManager`, the 100-step
  depth, field coalescing (many HP keystrokes → one step), separate fields,
  tag steps and no-op commits.

## Use

In the DM window, open **Show Settings → Tokens**, press **Place token**, then
click a map cell. The token tool is also bound to `K`. The panel edits the token
list. Press a token on the map to select it and open its editor, whatever tool is
active; drag it onto another cell to move it. A drag on empty map pans instead of
placing. Tokens are saved with the map.

## Tests

`npm test` runs `src/tokens.test.ts` (9 tests): HP clamping (including unset max),
ratio bounds, the green/yellow/red/grey thresholds, cell-centre and
cell-from-point maths, stable id/owner/defaults from `makeToken`, and tag
normalisation/add/duplicate/remove.

`screenshots/tokens-tv.png` is the TV-scale proof.

## Tags

Tags are labels attached to a token, such as `prone`, `poisoned`, `concentrating`
or `on fire`.

**Free text plus suggestions.** A tag is free text, with a datalist of common
conditions/statuses (`TAG_SUGGESTIONS` in `src/tokens.ts`: blinded, blessed,
burning, charmed, concentrating, cursed, deafened, exhausted, frightened,
grappled, hidden, incapacitated, invisible, paralysed, poisoned, prone,
restrained, stunned, unconscious). The DM can type anything; the suggestions make
the common cases one click.

**One canonical spelling.** `normalizeTag` trims, drops leading `#`, collapses
whitespace, lower-cases and caps the length at 24 characters. `addTokenTag` refuses
empty tags and exact duplicates after normalisation, so `Prone`, `#prone` and
`  PRONE ` are one tag. A genuine typo (`poisioned`) is still a separate tag; the
suggestion list is the guard against common misspellings, not a fixed vocabulary.
`removeTokenTag` removes by the same canonical form; unknown tags are a no-op.

**Editing.** A token's tags live in the Token inspector panel (Show Settings →
Tokens): chips with an × remove, an input with the condition suggestions adds.
There is no right-click menu or inline editing on the map; the inspector keeps the
map clean and gives the full list a place.

**Rendering.** Tags are drawn as compact pills under the token's HP bar. At most
two are shown plus `+N`; each is truncated at 12 characters. The full list is in
the inspector. They are visible in both DM and player windows. This keeps a token
with many conditions from becoming a wall of text at TV distance.

**Duration.** A tag is a persistent label with no automatic expiry. Duration and
end-of-turn removal are condition mechanics, which belong with the initiative
tracker (and there are two initiative modes); silently expiring token tags on one
of them would be a trap. That is deliberately left for an initiative/conditions
card.

**Tests.** `src/tokens.test.ts` covers normalisation (case, leading #, whitespace,
length cap), add/duplicate/no-op and remove by canonical form, plus the existing HP
and position maths. `screenshots/tokens-tv.png` shows compact tags and the `+N`
overflow marker.
