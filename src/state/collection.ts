/**
 * The player's collection + IndexedDB persistence.
 *
 * Card instances are tiny records (the art regenerates from seeds); the save
 * also carries population draw states so the world's scarcity survives
 * reloads. JSON is fine at shop scale; typed-array packing arrives when
 * collections hit five digits.
 */

import { create } from 'zustand';
import { openDB, type IDBPDatabase } from 'idb';
import type { PulledCard } from '../engine/cards/series';
import { world } from './world';

export interface CardInstance extends PulledCard {
  /** Unique ownership id (monotonic per save). */
  uid: number;
  /** Acquisition sequence — doubles as "newest" sort key. */
  pulledSeq: number;
}

interface CollectionState {
  cards: CardInstance[];
  nextUid: number;
  addPulls(pulls: PulledCard[]): void;
  hydrated: boolean;
}

const DB_NAME = 'cardboard';
const STORE = 'save';
let db: IDBPDatabase | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (!db) {
    db = await openDB(DB_NAME, 1, {
      upgrade(d) { d.createObjectStore(STORE); },
    });
  }
  return db;
}

function scheduleSave(state: CollectionState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const d = await getDb();
      await d.put(STORE, {
        version: 1,
        cards: state.cards,
        nextUid: state.nextUid,
        populations: world.savePopulations(),
      }, 'save-v1');
    } catch (err) {
      console.warn('save failed', err);
    }
  }, 400);
}

export const useCollection = create<CollectionState>((set, get) => ({
  cards: [],
  nextUid: 1,
  hydrated: false,
  addPulls(pulls) {
    const { cards, nextUid } = get();
    const stamped: CardInstance[] = pulls.map((p, i) => ({
      ...p, uid: nextUid + i, pulledSeq: nextUid + i,
    }));
    const next = { cards: [...cards, ...stamped], nextUid: nextUid + pulls.length };
    set(next);
    scheduleSave({ ...get(), ...next });
  },
}));

/** Load the save before first render; safe to call once from main. */
export async function hydrateCollection(): Promise<void> {
  try {
    const d = await getDb();
    const save = await d.get(STORE, 'save-v1');
    if (save?.version === 1) {
      world.restorePopulations(save.populations ?? {});
      useCollection.setState({
        cards: save.cards ?? [],
        nextUid: save.nextUid ?? 1,
        hydrated: true,
      });
      return;
    }
  } catch (err) {
    console.warn('hydrate failed', err);
  }
  useCollection.setState({ hydrated: true });
}
