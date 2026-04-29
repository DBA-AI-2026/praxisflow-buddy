UPDATE public.leads
   SET assigned_to = '751f303a-75f9-437f-a231-a4fe26a3b9aa',
       assignment_source = 'manual',
       updated_at = now()
 WHERE hfx_customer_number = 'HFX-I01085'
   AND assigned_to IS NULL;