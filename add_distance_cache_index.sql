-- Add index for faster distance cache lookups
CREATE INDEX IF NOT EXISTS idx_cache_lookup 
ON cached_distances(origin_lat, origin_lng, dest_lat, dest_lng, cache_expires_at);

-- Show index was created
SHOW INDEX FROM cached_distances WHERE Key_name = 'idx_cache_lookup';


