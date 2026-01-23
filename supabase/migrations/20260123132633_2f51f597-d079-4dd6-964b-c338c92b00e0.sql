-- Add temporary password column to profiles table for admin reference
ALTER TABLE public.profiles 
ADD COLUMN temp_password text;

-- Only admins can view the temp_password
COMMENT ON COLUMN public.profiles.temp_password IS 'Temporary password for admin reference - should be cleared after user changes password';