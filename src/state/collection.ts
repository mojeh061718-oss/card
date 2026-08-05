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
import { gradeCard, COMPANIES, type GradeResult, type Tier } from '../engine/condition/grading';
import { childSeedN, hashString } from '../engine/rng';

export interface CardInstance extends PulledCard {
  /** Unique ownership id (monotonic per save). */
  uid: number;
  /** Acquisition sequence — doubles as "newest" sort key. */
  pulledSeq: number;
  /** Slabbed grade, once returned. */
  grade?: { companyKey: string; result: GradeResult; gradedDay: number };
}

export interface Submission {
  uids: number[];
  companyKey: string;
  tier: Tier;
  submittedDay: number;
  dueDay: number;
  feePaid: number;
}

interface CollectionState {
  cards: CardInstance[];
  nextUid: number;
  hydrated: boolean;
  day: number;
  submissions: Submission[];
  /** Slabs that came back and await the reveal ceremony. */
  returns: number[];
  addPulls(pulls: PulledCard[]): void;
  submitForGrading(uids: number[], companyKey: string, tier: Tier): void;
  endDay(): void;
  /** Reveal one returned slab: applies the grade, returns the instance. */
  revealReturn(uid: number): CardInstance | null;
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
        day: state.day,
        submissions: state.submissions,
        returns: state.returns,
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
  day: 1,
  submissions: [],
  returns: [],
  addPulls(pulls) {
    const { cards, nextUid } = get();
    const stamped: CardInstance[] = pulls.map((p, i) => ({
      ...p, uid: nextUid + i, pulledSeq: nextUid + i,
    }));
    set({ cards: [...cards, ...stamped], nextUid: nextUid + pulls.length });
    scheduleSave(get());
  },
  submitForGrading(uids, companyKey, tier) {
    const co = COMPANIES.find(c => c.key === companyKey);
    if (!co || uids.length === 0) return;
    const { day, submissions } = get();
    set({
      submissions: [...submissions, {
        uids, companyKey, tier,
        submittedDay: day,
        dueDay: day + co.turnaroundDays[tier],
        feePaid: co.fees[tier] * uids.length,
      }],
    });
    scheduleSave(get());
  },
  endDay() {
    const { day, submissions, returns } = get();
    const newDay = day + 1;
    const arrived = submissions.filter(s => s.dueDay <= newDay);
    const pending = submissions.filter(s => s.dueDay > newDay);
    set({
      day: newDay,
      submissions: pending,
      returns: [...returns, ...arrived.flatMap(s => s.uids.map(uid => uid))],
    });
    // Stash which company each arrived uid used, via a lookup on reveal.
    arrivedCompanies = new Map([
      ...arrivedCompanies,
      ...arrived.flatMap(s => s.uids.map(uid => [uid, s.companyKey] as [number, string])),
    ]);
    scheduleSave(get());
  },
  revealReturn(uid) {
    const { cards, returns, day } = get();
    const card = cards.find(c => c.uid === uid);
    const companyKey = arrivedCompanies.get(uid);
    if (!card || !companyKey) return null;
    const co = COMPANIES.find(c => c.key === companyKey)!;
    const condition = world.conditionOf(card);
    // Submission seed: unique per (card identity, grading event) — cracking
    // and resubmitting later rerolls because day differs.
    const subSeed = childSeedN(hashString(`${card.seriesId}:${card.cardIndex}:${card.parallelId}:${card.serial}`), day * 1000 + uid);
    const result = gradeCard(condition, co, subSeed);
    const graded: CardInstance = { ...card, grade: { companyKey, result, gradedDay: day } };
    set({
      cards: cards.map(c => (c.uid === uid ? graded : c)),
      returns: returns.filter(r => r !== uid),
    });
    scheduleSave(get());
    return graded;
  },
}));

/** uid -> companyKey for slabs in transit back to the shop. */
let arrivedCompanies = new Map<number, string>();

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
        day: save.day ?? 1,
        submissions: save.submissions ?? [],
        returns: save.returns ?? [],
        hydrated: true,
      });
      // Rebuild the in-transit company map for already-arrived returns: the
      // submission record is gone, so map from grade-less returns is not
      // possible — drop them back into pending with a 1-day due instead.
      const orphaned: number[] = (save.returns ?? []).filter(() => true);
      if (orphaned.length > 0) {
        const state = useCollection.getState();
        useCollection.setState({
          returns: [],
          submissions: [...state.submissions, {
            uids: orphaned, companyKey: 'psg', tier: 0 as Tier,
            submittedDay: state.day, dueDay: state.day, feePaid: 0,
          }],
        });
      }
      return;
    }
  } catch (err) {
    console.warn('hydrate failed', err);
  }
  useCollection.setState({ hydrated: true });
}
