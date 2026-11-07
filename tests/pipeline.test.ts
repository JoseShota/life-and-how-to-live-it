import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/db';
import { seedIfEmpty } from '../src/db/seed';
import { logPipelineEvent, deletePipelineEvent, saveOpportunity, isStale } from '../src/game/engine';
import { LEAD_XP, CONVERSATION_DAILY_CAP_XP } from '../src/game/rules';
import type { Opportunity } from '../src/db/types';

beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()));
  await seedIfEmpty();
});

const pipeXp = async () => (await db.xp.where('source').equals('pipeline').toArray()).reduce((s, e) => s + e.xp, 0);

describe('leading indicators (V-7)', () => {
  it('conversations pay up to the daily cap; every one is still logged', async () => {
    for (let i = 0; i < 5; i++) await logPipelineEvent('conversation', { date: '2026-11-06' });
    expect(await db.pipelineEvents.count()).toBe(5);
    expect(await pipeXp()).toBe(CONVERSATION_DAILY_CAP_XP);
  });

  it('proposals and case studies pay their XP and can be undone', async () => {
    const id = await logPipelineEvent('case-study', { note: 'invoice bot' });
    await logPipelineEvent('proposal');
    expect(await pipeXp()).toBe(LEAD_XP['case-study'] + LEAD_XP.proposal);
    await deletePipelineEvent(id);
    expect(await pipeXp()).toBe(LEAD_XP.proposal);
  });

  it('a stage change pays once per opportunity and stage; winning a retainer unlocks Rainmaker', async () => {
    const o: Opportunity = { id: 'o', title: 'Café automation', status: 'lead', kind: 'retainer', monthlyValue: 8000, probability: 0.3, createdAt: 0 };
    await saveOpportunity(o);
    await saveOpportunity({ ...o, status: 'interview' });
    await saveOpportunity({ ...o, status: 'lead' });
    await saveOpportunity({ ...o, status: 'interview' });
    expect(await db.xp.where('refId').startsWith('pipe:stage:o:').count()).toBe(2); // interview, lead
    await saveOpportunity({ ...o, status: 'won' });
    expect(await db.unlocked.get('rainmaker')).toBeTruthy();
  });

  it('a lead is stale when its next action date has passed', () => {
    const o: Opportunity = { id: 'o', title: 'x', status: 'applied', monthlyValue: 0, probability: 0.5, nextActionDate: '2026-11-01', createdAt: 0 };
    expect(isStale(o, '2026-11-06')).toBe(true);
    expect(isStale({ ...o, status: 'won' }, '2026-11-06')).toBe(false);
  });
});
