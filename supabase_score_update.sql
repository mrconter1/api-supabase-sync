-- Update the upsert function to ADD scores instead of replacing them
-- Run this in your Supabase SQL Editor

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
    score = episodes.score + EXCLUDED.score,  -- ADD to existing score instead of replacing
    episode_name = EXCLUDED.episode_name,
    show_name = EXCLUDED.show_name,
    show_uri = EXCLUDED.show_uri,
    show_description = EXCLUDED.show_description,
    episode_description = EXCLUDED.episode_description,
    episode_duration = EXCLUDED.episode_duration,
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql; 