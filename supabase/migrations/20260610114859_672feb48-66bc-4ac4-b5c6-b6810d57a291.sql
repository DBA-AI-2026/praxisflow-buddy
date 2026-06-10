-- Phase B: contracts-Security härten (zwei vorbestehende Findings schließen)

-- ============================================================
-- Fix A: contracts UPDATE — WITH CHECK ergänzen (strict mirror USING)
-- Schliesst Owner-Hijacking via created_by-Umschreibung.
-- ============================================================
DROP POLICY IF EXISTS "Users can update own contracts or admin all" ON public.contracts;

CREATE POLICY "Users can update own contracts or admin all"
ON public.contracts
FOR UPDATE
TO authenticated
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
)
WITH CHECK (
  auth.uid() = created_by
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
);

-- ============================================================
-- Fix B: storage.objects SELECT auf 'contracts' bucket — EXISTS auf Owner verengen
-- Schliesst pfadbasiertes Cross-Read fremder Vertrags-PDFs.
-- regional_lead-Zweig spiegelt feldgleich die contracts-SELECT-Policy
-- "Gebietsleiter can view own contracts" (sales_partner_id + created_by).
-- ============================================================
DROP POLICY IF EXISTS "Contracts bucket: scoped read access" ON storage.objects;

CREATE POLICY "Contracts bucket: scoped read access"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracts'
  AND (
    -- Vollsicht: admin / sales_lead / vertragsabteilung
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_lead'::app_role)
    OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
    -- Eigener Folder-Pfad (uid als erstes Pfad-Segment)
    OR (storage.foldername(name))[1] = auth.uid()::text
    -- Owner-verengter EXISTS auf contracts
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      WHERE c.document_url = storage.objects.name
        AND (
          c.created_by = auth.uid()
          OR c.sales_partner_id = auth.uid()
          OR (
            has_role(auth.uid(), 'regional_lead'::app_role)
            AND (
              is_in_regional_lead_team(auth.uid(), c.sales_partner_id)
              OR is_in_regional_lead_team(auth.uid(), c.created_by)
            )
          )
        )
    )
  )
);