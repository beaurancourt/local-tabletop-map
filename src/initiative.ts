import { InitiativeEntity } from './types';

// Default dice for a new entity when none is specified.
export const DEFAULT_DICE = '1d6';

const DICE_PATTERN = /^\s*(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i;

// Validate a dice spec like "1d6", "d20", "2d8+3", "1d20-1".
export function isValidDiceSpec(spec: string): boolean {
  return DICE_PATTERN.test(spec);
}

// Roll a dice spec. Returns 0 for an unparseable spec.
export function rollDice(spec: string): number {
  const match = DICE_PATTERN.exec(spec);
  if (!match) return 0;
  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3].replace(/\s/g, ''), 10) : 0;
  let total = modifier;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `init-${Date.now().toString(36)}-${idCounter}`;
}

// Build entities for a (possibly batched) add. A count > 1 produces numbered
// entries: "bandit" x5 -> "bandit 1" ... "bandit 5". Each entry is rolled.
export function createEntities(name: string, count: number, dice: string, isPc: boolean): InitiativeEntity[] {
  const trimmed = name.trim() || 'Entity';
  const safeDice = isValidDiceSpec(dice) ? dice.trim() : DEFAULT_DICE;
  const n = Math.max(1, Math.floor(count) || 1);
  const entities: InitiativeEntity[] = [];
  for (let i = 1; i <= n; i++) {
    entities.push({
      id: nextId(),
      name: n > 1 ? `${trimmed} ${i}` : trimmed,
      dice: safeDice,
      roll: rollDice(safeDice),
      isPc,
    });
  }
  return entities;
}

// Re-roll initiative for every entity (start of a new battle or round).
export function rerollAll(entities: InitiativeEntity[]): InitiativeEntity[] {
  return entities.map((e) => ({ ...e, roll: rollDice(e.dice) }));
}

// Sort a copy of the entities by initiative, highest first. Unrolled entries
// (roll === null) sink to the bottom. Ties keep their relative order.
export function sortedByInitiative(entities: InitiativeEntity[]): InitiativeEntity[] {
  return [...entities].sort((a, b) => {
    const ra = a.roll ?? -Infinity;
    const rb = b.roll ?? -Infinity;
    return rb - ra;
  });
}
