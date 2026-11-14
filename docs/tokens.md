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

**DM versus players.** Players see the token body, name, health bar and numbers.
The DM additionally gets the token panel (place, name, HP, max, owner, colour,
remove), can drag tokens, and sees the edit fields. There is no hidden information
in the token layer yet; that is a networking/visibility card.

## Use

In the DM window, open **Show Settings → Tokens**, press **Place token**, then
click a map cell. The token tool is also bound to `K`. The panel edits the token
list; dragging a token with the token tool moves it to another cell. Tokens are
saved with the map.

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
