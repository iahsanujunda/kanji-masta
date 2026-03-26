-- Enable RLS on user_cost — no client-side access, backend-only via direct connection
ALTER TABLE user_cost ENABLE ROW LEVEL SECURITY;
