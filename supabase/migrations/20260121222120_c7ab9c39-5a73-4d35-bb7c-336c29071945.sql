-- Create table for storing integration settings per user
CREATE TABLE public.integration_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    integration_type TEXT NOT NULL,
    api_key_encrypted TEXT,
    is_connected BOOLEAN NOT NULL DEFAULT false,
    auto_sync_enabled BOOLEAN NOT NULL DEFAULT false,
    sync_interval TEXT DEFAULT 'daily',
    sync_time TIME DEFAULT '14:00',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, integration_type)
);

-- Create table for sync logs
CREATE TABLE public.integration_sync_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    integration_type TEXT NOT NULL,
    sync_type TEXT NOT NULL, -- 'export' or 'import'
    status TEXT NOT NULL, -- 'success', 'error', 'pending'
    records_count INTEGER DEFAULT 0,
    message TEXT,
    error_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for integration_settings
CREATE POLICY "Users can view their own integration settings"
ON public.integration_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own integration settings"
ON public.integration_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integration settings"
ON public.integration_settings
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own integration settings"
ON public.integration_settings
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for integration_sync_logs
CREATE POLICY "Users can view their own sync logs"
ON public.integration_sync_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sync logs"
ON public.integration_sync_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_integration_settings_updated_at
BEFORE UPDATE ON public.integration_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();