// Isolated PostgreSQL only: no connection to the live database or real contract INSERTs.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const sql = readFileSync('drizzle/migrations/0006_contracts_caretaker_from_lead.sql', 'utf8');
const AD = '10000000-0000-0000-0000-000000000001';
const OTHER = '10000000-0000-0000-0000-000000000002';
const db = new PGlite();

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.contracts (hfx_customer_number text, sales_partner_id uuid, sales_partner_name text);
    CREATE TABLE public.leads (hfx_customer_number text PRIMARY KEY, assigned_to uuid);
    CREATE TABLE public.user_roles (user_id uuid, role text, is_active boolean);
    CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, full_name text);
    INSERT INTO profiles VALUES ('${AD}', 'Internal AD'), ('${OTHER}', 'Exact AD');
    CREATE FUNCTION public.test_existing_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.sales_partner_id IS NOT NULL AND NEW.sales_partner_name = 'must stay empty before fallback' THEN
      RAISE EXCEPTION 'fallback ran before existing guard'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER check_no_tippgeber_as_sales_partner BEFORE INSERT ON contracts
      FOR EACH ROW EXECUTE FUNCTION public.test_existing_guard();
  `);
  await db.exec(sql);
}, 30000);
afterAll(async () => { await db.close(); });

async function prepare(role = 'user', active = true, hfx = 'HFX-I01211') {
  await db.exec('TRUNCATE contracts, leads, user_roles');
  await db.query('INSERT INTO leads VALUES ($1,$2)', [hfx, AD]);
  await db.query('INSERT INTO user_roles VALUES ($1,$2,$3)', [AD, role, active]);
}
async function insert(hfx = 'HFX-I01211', id: string | null = null, name: string | null = null) {
  const result = await db.query<{ sales_partner_id: string | null; sales_partner_name: string | null }>(
    'INSERT INTO contracts VALUES ($1,$2,$3) RETURNING sales_partner_id, sales_partner_name', [hfx, id, name]);
  return result.rows[0];
}

describe('contract caretaker BEFORE INSERT rule', () => {
  for (const role of ['user', 'regional_lead', 'sales_lead']) {
    it(`copies exact lead AD and profile name for active ${role}`, async () => {
      await prepare(role);
      expect(await insert()).toEqual({ sales_partner_id: AD, sales_partner_name: 'Internal AD' });
    });
  }
  it('never overwrites a set caretaker or their existing name', async () => {
    await prepare();
    expect(await insert('HFX-I01211', OTHER, 'Existing name')).toEqual({ sales_partner_id: OTHER, sales_partner_name: 'Existing name' });
  });
  it('does not accept inactive internal AD roles', async () => {
    await prepare('user', false);
    expect((await insert())?.sales_partner_id).toBeNull();
  });
  for (const role of ['sales_partner', 'tippgeber', 'admin']) {
    it(`does not copy a lead AD with only ${role}`, async () => {
      await prepare(role);
      expect((await insert())?.sales_partner_id).toBeNull();
    });
  }
  for (const main of ['HFX-I01211', 'HFX-I-01211']) {
    it(`falls back to ${main} for a regular -NN site`, async () => {
      await prepare('user', true, main);
      expect((await insert(`${main}-01`))?.sales_partner_id).toBe(AD);
    });
  }
  it('does not use the main lead for a -T4 special number', async () => {
    await prepare();
    expect((await insert('HFX-I01211-T4'))?.sales_partner_id).toBeNull();
  });
  it('still accepts an exact lead for a special number', async () => {
    await prepare('user', true, 'HFX-I01211-T4');
    expect((await insert('HFX-I01211-T4'))?.sales_partner_id).toBe(AD);
  });
  it('prioritizes the exact site lead over the main lead', async () => {
    await prepare();
    await db.query('INSERT INTO leads VALUES ($1,$2)', ['HFX-I01211-01', OTHER]);
    await db.query('INSERT INTO user_roles VALUES ($1,$2,true)', [OTHER, 'regional_lead']);
    expect(await insert('HFX-I01211-01')).toEqual({ sales_partner_id: OTHER, sales_partner_name: 'Exact AD' });
  });
  it('leaves a missing lead unassigned', async () => {
    await prepare();
    expect((await insert('HFX-I09999'))?.sales_partner_id).toBeNull();
  });
  it('does not change caretakers on UPDATE', async () => {
    await prepare();
    await insert('HFX-I09999');
    await db.exec("UPDATE contracts SET hfx_customer_number='HFX-I01211'");
    expect((await db.query('SELECT sales_partner_id FROM contracts')).rows[0]).toEqual({ sales_partner_id: null });
  });
  it('migration is idempotent and does not backfill existing contracts', async () => {
    await prepare();
    await insert('HFX-I09999');
    await db.exec("UPDATE contracts SET hfx_customer_number='HFX-I01211'");
    await db.exec(sql);
    expect((await db.query('SELECT sales_partner_id FROM contracts')).rows[0]).toEqual({ sales_partner_id: null });
    expect((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='trg_assign_contract_caretaker_from_lead'")).rows[0]).toEqual({ n: 1 });
  });
  it('executes fallback after the existing tippgeber guard', async () => {
    await prepare();
    expect((await insert('HFX-I01211', null, 'must stay empty before fallback'))?.sales_partner_id).toBe(AD);
  });
});