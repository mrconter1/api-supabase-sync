-- ===== COMPLETE SUPABASE DATABASE SETUP =====
-- Run this SQL to set up a fresh database for podcast episode tracking
-- This creates tables, indexes, functions, and RLS policies

-- Create the episodes table
CREATE TABLE IF NOT EXISTS episodes (
  id BIGSERIAL PRIMARY KEY,
  first_appearance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  score INTEGER NOT NULL,
  episode_name TEXT NOT NULL,
  show_name TEXT NOT NULL,
  episode_uri TEXT NOT NULL,
  show_uri TEXT NOT NULL,
  show_description TEXT,
  episode_description TEXT,
  episode_duration VARCHAR(50),
  region TEXT NOT NULL,
  last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Create unique constraint on episode_uri + region combination
-- This prevents duplicate episodes per region but allows same episode in different regions
ALTER TABLE episodes 
ADD CONSTRAINT episodes_uri_region_unique 
UNIQUE (episode_uri, region);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_episodes_region ON episodes(region);
CREATE INDEX IF NOT EXISTS idx_episodes_score ON episodes(score);
CREATE INDEX IF NOT EXISTS idx_episodes_first_appearance ON episodes(first_appearance_date);
CREATE INDEX IF NOT EXISTS idx_episodes_show_name ON episodes(show_name);
CREATE INDEX IF NOT EXISTS idx_episodes_last_updated ON episodes(last_updated);

-- Create the upsert function for episode data
CREATE OR REPLACE FUNCTION upsert_episode_score(
  p_episode_uri TEXT,
  p_rank INTEGER,
  p_episode_name TEXT,
  p_show_name TEXT,
  p_show_uri TEXT,
  p_region TEXT,
  p_show_description TEXT DEFAULT '',
  p_episode_description TEXT DEFAULT NULL,
  p_episode_duration TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO episodes (
    episode_uri,
    score,
    episode_name,
    show_name,
    show_uri,
    show_description,
    region,
    episode_description,
    episode_duration,
    first_appearance_date,
    last_updated,
    created_at
  ) VALUES (
    p_episode_uri,
    p_rank,
    p_episode_name,
    p_show_name,
    p_show_uri,
    p_show_description,
    p_region,
    p_episode_description,
    p_episode_duration,
    CURRENT_DATE,
    NOW(),
    NOW()
  )
  ON CONFLICT (episode_uri, region) 
  DO UPDATE SET
    score = EXCLUDED.score,
    episode_name = EXCLUDED.episode_name,
    show_name = EXCLUDED.show_name,
    show_uri = EXCLUDED.show_uri,
    show_description = EXCLUDED.show_description,
    episode_description = EXCLUDED.episode_description,
    episode_duration = EXCLUDED.episode_duration,
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (optional - uncomment if you want RLS)
-- ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (optional - uncomment and modify as needed)
-- Policy for authenticated users to read all data
-- CREATE POLICY "Users can view all episodes" ON episodes
--   FOR SELECT USING (auth.role() = 'authenticated');

-- Policy for service role to insert/update (for your sync script)
-- CREATE POLICY "Service role can manage episodes" ON episodes
--   FOR ALL USING (auth.role() = 'service_role');

-- Create helpful views for analytics (optional)
CREATE OR REPLACE VIEW episode_rankings AS
SELECT 
  episode_name,
  show_name,
  region,
  score,
  episode_duration,
  first_appearance_date,
  last_updated,
  ROW_NUMBER() OVER (PARTITION BY region ORDER BY score ASC) as current_rank
FROM episodes
WHERE last_updated >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY region, score;

-- Create a view for top shows by average episode ranking
CREATE OR REPLACE VIEW top_shows_by_region AS
SELECT 
  show_name,
  region,
  COUNT(*) as episode_count,
  AVG(score) as avg_score,
  MIN(score) as best_score,
  MAX(last_updated) as last_episode_update
FROM episodes
GROUP BY show_name, region
ORDER BY region, avg_score;

-- Grant necessary permissions to authenticated and anon users
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON episodes TO anon, authenticated;
GRANT SELECT ON episode_rankings TO anon, authenticated;
GRANT SELECT ON top_shows_by_region TO anon, authenticated;

-- Grant full access to service role (for your sync script)
GRANT ALL ON episodes TO service_role;
GRANT EXECUTE ON FUNCTION upsert_episode_score TO service_role;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Database setup completed successfully!';
  RAISE NOTICE 'Tables created: episodes';
  RAISE NOTICE 'Functions created: upsert_episode_score';
  RAISE NOTICE 'Views created: episode_rankings, top_shows_by_region';
  RAISE NOTICE 'Ready for podcast episode tracking!';
END $$; 