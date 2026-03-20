ALTER TABLE product_commissions
  ADD COLUMN sprint_start date,
  ADD COLUMN sprint_end date,
  ADD COLUMN sprint_target_1 integer,
  ADD COLUMN sprint_target_2 integer,
  ADD COLUMN sprint_bonus_1 numeric DEFAULT 0,
  ADD COLUMN sprint_bonus_2 numeric DEFAULT 0;