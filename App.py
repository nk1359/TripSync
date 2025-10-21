from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import mysql.connector
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
import requests
import json
import time
import hashlib
import threading

# Load environment variables
load_dotenv()

# Database configuration - works with Railway (production) and local development
db_config = {
    'host': os.getenv('MYSQLHOST', 'localhost'),
    'user': os.getenv('MYSQLUSER', 'root'),
    'password': os.getenv('MYSQLPASSWORD', os.getenv('DB_PASSWORD', '')),
    'database': os.getenv('MYSQLDATABASE', os.getenv('MYSQL_DATABASE', 'tripsync'))
}

# Initialize Flask app
app = Flask(__name__, static_folder='build', static_url_path='')
CORS(app)

# Add request logging
@app.before_request
def log_request():
    import sys
    sys.stdout.flush()  # Force flush output
    if request.method == 'POST' and 'recommendations' in request.path:
        print(f"\n[REQUEST] POST {request.path}", flush=True)
        print(f"[REQUEST] Content-Type: {request.content_type}", flush=True)

# Google Places API removed - using Yelp/OpenTripMap/Nominatim instead

# Load alternative API keys
YELP_API_KEY = os.getenv('YELP_API_KEY')
OPEN_TRIP_MAP_API_KEY = os.getenv('OPEN_TRIP_MAP_API_KEY')

# ============================================================================
# API CLIENT WRAPPER CLASSES WITH CACHING
# ============================================================================

class YelpClient:
    """Wrapper for Yelp Fusion API with MySQL caching"""
    
    BASE_URL = "https://api.yelp.com/v3"
    CACHE_EXPIRY_DAYS = 7  # Cache for 7 days for performance
    
    def __init__(self, api_key, db_config):
        self.api_key = api_key
        self.db_config = db_config
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json"
        }
    
    def _get_cache_key(self, method, params):
        """Generate cache key from method and params"""
        param_str = json.dumps(params, sort_keys=True)
        cache_key = f"yelp:{method}:{hashlib.md5(param_str.encode()).hexdigest()}"
        print(f"[YELP CACHE KEY] {cache_key} <- {param_str[:100]}")  # Debug: show cache key
        return cache_key
    
    def _get_from_cache(self, cache_key):
        """Retrieve from cached_searches table"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT data FROM cached_searches 
                WHERE cache_key = %s AND cache_expires_at > NOW()
            """, (cache_key,))
            result = cursor.fetchone()
            conn.close()
            if result:
                print(f"[YELP CACHE HIT] {cache_key}")
                return json.loads(result['data'])
            return None
        except Exception as e:
            print(f"[YELP CACHE ERROR] {e}")
            return None
    
    def _save_to_cache(self, cache_key, data):
        """Save to cached_searches table"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor()
            expires_at = datetime.now() + timedelta(days=self.CACHE_EXPIRY_DAYS)
            cursor.execute("""
                INSERT INTO cached_searches (cache_key, data, cache_expires_at)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    data = VALUES(data), 
                    cache_expires_at = VALUES(cache_expires_at),
                    cache_created_at = NOW()
            """, (cache_key, json.dumps(data), expires_at))
            conn.commit()
            conn.close()
            print(f"[YELP CACHE SAVE] {cache_key}")
        except Exception as e:
            print(f"[YELP CACHE SAVE ERROR] {e}")
    
    def _save_to_cache_async(self, cache_key, data):
        """Save to cache in background thread (non-blocking)"""
        def save():
            self._save_to_cache(cache_key, data)
        
        thread = threading.Thread(target=save, daemon=True)
        thread.start()
    
    def search(self, term=None, location=None, latitude=None, longitude=None, 
               categories=None, radius=None, limit=20, offset=0, sort_by='best_match', skip_cache=False):
        """Search for businesses"""
        cache_key = self._get_cache_key('search', {
            'term': term, 'location': location, 'lat': latitude, 'lng': longitude,
            'categories': categories, 'radius': radius, 'limit': limit, 'offset': offset
        })
        
        # Check cache (unless skip_cache is True)
        if not skip_cache:
            cached = self._get_from_cache(cache_key)
            if cached:
                return cached
        
        # Make API request
        params = {'limit': limit, 'offset': offset}
        if term:
            params['term'] = term
        if location:
            params['location'] = location
        if latitude and longitude:
            params['latitude'] = latitude
            params['longitude'] = longitude
        if categories:
            params['categories'] = categories
        if radius:
            params['radius'] = min(radius, 40000)  # Max 40km
        if sort_by:
            params['sort_by'] = sort_by
        
        try:
            response = requests.get(f"{self.BASE_URL}/businesses/search", 
                                   headers=self.headers, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                # Save to cache asynchronously (non-blocking)
                self._save_to_cache_async(cache_key, data)
                return data
            else:
                print(f"[YELP API ERROR] {response.status_code}: {response.text}")
                return None
        except Exception as e:
            print(f"[YELP API ERROR] {e}")
            return None
    
    def _save_place_to_cache(self, cache_key, data):
        """Save place to cached_places table"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor()
            expires_at = datetime.now() + timedelta(days=self.CACHE_EXPIRY_DAYS)
            cursor.execute("""
                INSERT INTO cached_places (place_id, source, data, cache_expires_at)
                VALUES (%s, 'yelp', %s, %s)
                ON DUPLICATE KEY UPDATE 
                    data = VALUES(data), 
                    cache_expires_at = VALUES(cache_expires_at)
            """, (cache_key, json.dumps(data), expires_at))
            conn.commit()
            conn.close()
            print(f"[YELP PLACE CACHE SAVE] {cache_key}")
        except Exception as e:
            print(f"[YELP PLACE CACHE SAVE ERROR] {e}")
    
    def _save_place_to_cache_async(self, cache_key, data):
        """Save place to cache in background thread (non-blocking)"""
        def save():
            self._save_place_to_cache(cache_key, data)
        
        thread = threading.Thread(target=save, daemon=True)
        thread.start()
    
    def get_business(self, business_id):
        """Get business details"""
        cache_key = f"yelp:{business_id}"
        
        # Check cache in cached_places
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT data FROM cached_places 
                WHERE place_id = %s AND cache_expires_at > NOW()
            """, (cache_key,))
            result = cursor.fetchone()
            conn.close()
            if result:
                print(f"[YELP CACHE HIT] {business_id}")
                return json.loads(result['data'])
        except Exception as e:
            print(f"[YELP CACHE ERROR] {e}")
        
        # Make API request
        try:
            response = requests.get(f"{self.BASE_URL}/businesses/{business_id}", 
                                   headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                # Save to cache asynchronously (non-blocking)
                self._save_place_to_cache_async(cache_key, data)
                return data
            else:
                print(f"[YELP API ERROR] {response.status_code}")
                return None
        except Exception as e:
            print(f"[YELP API ERROR] {e}")
            return None
    
    def autocomplete(self, text, latitude=None, longitude=None):
        """Autocomplete businesses"""
        cache_key = self._get_cache_key('autocomplete', {
            'text': text, 'lat': latitude, 'lng': longitude
        })
        
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached
        
        params = {'text': text}
        if latitude and longitude:
            params['latitude'] = latitude
            params['longitude'] = longitude
        
        try:
            response = requests.get(f"{self.BASE_URL}/autocomplete", 
                                   headers=self.headers, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                self._save_to_cache(cache_key, data)
                return data
            return None
        except Exception as e:
            print(f"[YELP AUTOCOMPLETE ERROR] {e}")
            return None


class OpenTripMapClient:
    """Wrapper for OpenTripMap API with MySQL caching"""
    
    BASE_URL = "https://api.opentripmap.com/0.1/en/places"
    CACHE_EXPIRY_DAYS = 7  # Cache for 7 days for performance
    
    def __init__(self, api_key, db_config):
        self.api_key = api_key
        self.db_config = db_config
    
    def _get_cache_key(self, method, params):
        """Generate cache key from method and params"""
        param_str = json.dumps(params, sort_keys=True)
        cache_key = f"otm:{method}:{hashlib.md5(param_str.encode()).hexdigest()}"
        print(f"[OTM CACHE KEY] {cache_key} <- {param_str[:100]}")  # Debug: show cache key
        return cache_key
    
    def _get_from_cache(self, cache_key):
        """Retrieve from cached_searches table"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT data FROM cached_searches 
                WHERE cache_key = %s AND cache_expires_at > NOW()
            """, (cache_key,))
            result = cursor.fetchone()
            conn.close()
            if result:
                print(f"[OTM CACHE HIT] {cache_key}")
                return json.loads(result['data'])
            return None
        except Exception as e:
            print(f"[OTM CACHE ERROR] {e}")
            return None
    
    def _save_to_cache(self, cache_key, data):
        """Save to cached_searches table"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor()
            expires_at = datetime.now() + timedelta(days=self.CACHE_EXPIRY_DAYS)
            cursor.execute("""
                INSERT INTO cached_searches (cache_key, data, cache_expires_at)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    data = VALUES(data), 
                    cache_expires_at = VALUES(cache_expires_at),
                    cache_created_at = NOW()
            """, (cache_key, json.dumps(data), expires_at))
            conn.commit()
            conn.close()
            print(f"[OTM CACHE SAVE] {cache_key}")
        except Exception as e:
            print(f"[OTM CACHE SAVE ERROR] {e}")
    
    def _save_to_cache_async(self, cache_key, data):
        """Save to cache in background thread (non-blocking)"""
        def save():
            self._save_to_cache(cache_key, data)
        
        thread = threading.Thread(target=save, daemon=True)
        thread.start()
    
    def search_radius(self, latitude, longitude, radius=5000, kinds=None, 
                     rate=None, limit=50, skip_cache=False):
        """Search for places within radius"""
        cache_key = self._get_cache_key('radius', {
            'lat': latitude, 'lng': longitude, 'radius': radius, 
            'kinds': kinds, 'rate': rate, 'limit': limit
        })
        
        # Check cache (unless skip_cache is True)
        if not skip_cache:
            cached = self._get_from_cache(cache_key)
            if cached:
                return cached
        
        params = {
            'apikey': self.api_key,
            'lat': latitude,
            'lon': longitude,
            'radius': radius,
            'limit': limit,
            'format': 'json'
        }
        if kinds:
            params['kinds'] = kinds
        if rate:
            params['rate'] = rate
        
        try:
            response = requests.get(f"{self.BASE_URL}/radius", 
                                   params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                # Save to cache asynchronously (non-blocking)
                self._save_to_cache_async(cache_key, data)
                return data
            else:
                print(f"[OTM API ERROR] {response.status_code}: {response.text}")
                return None
        except Exception as e:
            print(f"[OTM API ERROR] {e}")
            return None
    
    def _save_place_to_cache(self, cache_key, data):
        """Save place to cached_places table"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor()
            expires_at = datetime.now() + timedelta(days=self.CACHE_EXPIRY_DAYS)
            cursor.execute("""
                INSERT INTO cached_places (place_id, source, data, cache_expires_at)
                VALUES (%s, 'opentripmap', %s, %s)
                ON DUPLICATE KEY UPDATE 
                    data = VALUES(data), 
                    cache_expires_at = VALUES(cache_expires_at)
            """, (cache_key, json.dumps(data), expires_at))
            conn.commit()
            conn.close()
            print(f"[OTM PLACE CACHE SAVE] {cache_key}")
        except Exception as e:
            print(f"[OTM PLACE CACHE SAVE ERROR] {e}")
    
    def _save_place_to_cache_async(self, cache_key, data):
        """Save place to cache in background thread (non-blocking)"""
        def save():
            self._save_place_to_cache(cache_key, data)
        
        thread = threading.Thread(target=save, daemon=True)
        thread.start()
    
    def get_place(self, xid):
        """Get place details by xid"""
        cache_key = f"otm:{xid}"
        
        # Check cache in cached_places
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT data FROM cached_places 
                WHERE place_id = %s AND cache_expires_at > NOW()
            """, (cache_key,))
            result = cursor.fetchone()
            conn.close()
            if result:
                print(f"[OTM CACHE HIT] {xid}")
                return json.loads(result['data'])
        except Exception as e:
            print(f"[OTM CACHE ERROR] {e}")
        
        # Make API request
        try:
            response = requests.get(f"{self.BASE_URL}/xid/{xid}", 
                                   params={'apikey': self.api_key}, timeout=10)
            if response.status_code == 200:
                data = response.json()
                # Save to cache asynchronously (non-blocking)
                self._save_place_to_cache_async(cache_key, data)
                return data
            else:
                print(f"[OTM API ERROR] {response.status_code}")
                return None
        except Exception as e:
            print(f"[OTM API ERROR] {e}")
            return None


class NominatimClient:
    """Wrapper for Nominatim (OpenStreetMap) geocoding with caching"""
    
    BASE_URL = "https://nominatim.openstreetmap.org"
    CACHE_EXPIRY_DAYS = 30
    RATE_LIMIT_DELAY = 1.0  # 1 second between requests
    
    def __init__(self, db_config):
        self.db_config = db_config
        self.headers = {
            "User-Agent": "TripSync/1.0 (travel planning app)"
        }
        self.last_request_time = 0
    
    def _rate_limit(self):
        """Ensure 1 second delay between requests"""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.RATE_LIMIT_DELAY:
            time.sleep(self.RATE_LIMIT_DELAY - elapsed)
        self.last_request_time = time.time()
    
    def _get_cache_key(self, method, params):
        """Generate cache key"""
        param_str = json.dumps(params, sort_keys=True)
        return f"nominatim:{method}:{hashlib.md5(param_str.encode()).hexdigest()}"
    
    def _get_from_cache(self, cache_key):
        """Retrieve from cached_geocoding table"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT data FROM cached_geocoding 
                WHERE query = %s AND cache_expires_at > NOW()
            """, (cache_key,))
            result = cursor.fetchone()
            conn.close()
            if result:
                print(f"[NOMINATIM CACHE HIT] {cache_key}")
                return json.loads(result['data'])
            return None
        except Exception as e:
            print(f"[NOMINATIM CACHE ERROR] {e}")
            return None
    
    def _save_to_cache(self, cache_key, data):
        """Save to cached_geocoding table"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor()
            expires_at = datetime.now() + timedelta(days=self.CACHE_EXPIRY_DAYS)
            cursor.execute("""
                INSERT INTO cached_geocoding (query, data, cache_expires_at)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    data = VALUES(data), 
                    cache_expires_at = VALUES(cache_expires_at),
                    cache_created_at = NOW()
            """, (cache_key, json.dumps(data), expires_at))
            conn.commit()
            conn.close()
            print(f"[NOMINATIM CACHE SAVE] {cache_key}")
        except Exception as e:
            print(f"[NOMINATIM CACHE SAVE ERROR] {e}")
    
    def search(self, query, limit=10, addressdetails=1):
        """Search for places"""
        cache_key = self._get_cache_key('search', {'q': query, 'limit': limit})
        
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached
        
        self._rate_limit()
        
        params = {
            'q': query,
            'format': 'json',
            'limit': limit,
            'addressdetails': addressdetails
        }
        
        try:
            response = requests.get(f"{self.BASE_URL}/search", 
                                   headers=self.headers, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                self._save_to_cache(cache_key, data)
                return data
            else:
                print(f"[NOMINATIM API ERROR] {response.status_code}")
                return None
        except Exception as e:
            print(f"[NOMINATIM API ERROR] {e}")
            return None
    
    def reverse(self, latitude, longitude):
        """Reverse geocode coordinates"""
        cache_key = self._get_cache_key('reverse', {'lat': latitude, 'lon': longitude})
        
        cached = self._get_from_cache(cache_key)
        if cached:
            return cached
        
        self._rate_limit()
        
        params = {
            'lat': latitude,
            'lon': longitude,
            'format': 'json',
            'addressdetails': 1
        }
        
        try:
            response = requests.get(f"{self.BASE_URL}/reverse", 
                                   headers=self.headers, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                self._save_to_cache(cache_key, data)
                return data
            return None
        except Exception as e:
            print(f"[NOMINATIM API ERROR] {e}")
            return None


class OSRMClient:
    """Wrapper for OSRM routing/distance with caching and rate limiting"""
    
    BASE_URL = "http://router.project-osrm.org"
    CACHE_EXPIRY_DAYS = 90  # Increased from 30 to 90 days - distances rarely change
    MIN_REQUEST_INTERVAL = 0.1  # Reduced from 0.2s to 0.1s (max 10 req/sec) - faster with bulk calls
    
    def __init__(self, db_config):
        self.db_config = db_config
        self.last_request_time = 0
        import threading
        self.request_lock = threading.Lock()
    
    def _get_from_cache(self, origin_lat, origin_lng, dest_lat, dest_lng):
        """Retrieve from cached_distances table"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor(dictionary=True)
            cursor.execute("""
                SELECT distance_meters, duration_seconds 
                FROM cached_distances 
                WHERE origin_lat = %s AND origin_lng = %s 
                  AND dest_lat = %s AND dest_lng = %s
                  AND cache_expires_at > NOW()
            """, (origin_lat, origin_lng, dest_lat, dest_lng))
            result = cursor.fetchone()
            conn.close()
            if result:
                print(f"[OSRM CACHE HIT] ({origin_lat},{origin_lng}) -> ({dest_lat},{dest_lng})")
                return result
            return None
        except Exception as e:
            print(f"[OSRM CACHE ERROR] {e}")
            return None
    
    def _save_to_cache(self, origin_lat, origin_lng, dest_lat, dest_lng, distance, duration):
        """Save to cached_distances table"""
        try:
            conn = mysql.connector.connect(**self.db_config)
            cursor = conn.cursor()
            expires_at = datetime.now() + timedelta(days=self.CACHE_EXPIRY_DAYS)
            cursor.execute("""
                INSERT INTO cached_distances 
                (origin_lat, origin_lng, dest_lat, dest_lng, distance_meters, duration_seconds, cache_expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    distance_meters = VALUES(distance_meters),
                    duration_seconds = VALUES(duration_seconds),
                    cache_expires_at = VALUES(cache_expires_at),
                    cache_created_at = NOW()
            """, (origin_lat, origin_lng, dest_lat, dest_lng, distance, duration, expires_at))
            conn.commit()
            conn.close()
            print(f"[OSRM CACHE SAVE] ({origin_lat},{origin_lng}) -> ({dest_lat},{dest_lng})")
        except Exception as e:
            print(f"[OSRM CACHE SAVE ERROR] {e}")
    
    def _save_to_cache_async(self, origin_lat, origin_lng, dest_lat, dest_lng, distance, duration):
        """Save to cache in background thread (non-blocking)"""
        def save():
            self._save_to_cache(origin_lat, origin_lng, dest_lat, dest_lng, distance, duration)
        
        thread = threading.Thread(target=save, daemon=True)
        thread.start()
    
    def distance_matrix(self, origins, destinations):
        """Get distance matrix between origins and destinations
        Args:
            origins: List of (lat, lng) tuples
            destinations: List of (lat, lng) tuples
        Returns:
            dict with 'distances' and 'durations' matrices
        """
        # Check cache for each pair
        distances = []
        durations = []
        uncached_pairs = []
        
        for orig in origins:
            orig_distances = []
            orig_durations = []
            for dest in destinations:
                cached = self._get_from_cache(orig[0], orig[1], dest[0], dest[1])
                if cached:
                    orig_distances.append(cached['distance_meters'])
                    orig_durations.append(cached['duration_seconds'])
                else:
                    orig_distances.append(None)
                    orig_durations.append(None)
                    uncached_pairs.append((orig, dest))
            distances.append(orig_distances)
            durations.append(orig_durations)
        
        # Fetch uncached pairs from OSRM - use BULK table API for better performance
        if uncached_pairs:
            # OPTIMIZATION: Process up to 25 pairs (increased from 5)
            # OSRM table service can handle many coordinates in one call
            limited_pairs = uncached_pairs[:25]
            
            try:
                # OPTIMIZATION: Build ALL coordinates for single bulk API call
                # Instead of individual calls, send all at once
                unique_coords = []
                coord_to_idx = {}
                
                for orig, dest in limited_pairs:
                    if orig not in coord_to_idx:
                        coord_to_idx[orig] = len(unique_coords)
                        unique_coords.append(orig)
                    if dest not in coord_to_idx:
                        coord_to_idx[dest] = len(unique_coords)
                        unique_coords.append(dest)
                
                # Build coordinate string for OSRM table service
                # Format: lng,lat;lng,lat;lng,lat...
                coords_str = ";".join([f"{coord[1]},{coord[0]}" for coord in unique_coords])
                
                # OPTIMIZATION: Single bulk API call instead of loop
                with self.request_lock:
                    import time
                    elapsed = time.time() - self.last_request_time
                    if elapsed < self.MIN_REQUEST_INTERVAL:
                        time.sleep(self.MIN_REQUEST_INTERVAL - elapsed)
                    
                    response = requests.get(
                        f"{self.BASE_URL}/table/v1/driving/{coords_str}",
                        params={'annotations': 'distance,duration'},
                        timeout=15  # Increased timeout for bulk request
                    )
                    self.last_request_time = time.time()
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get('code') == 'Ok':
                        # Extract distances and durations from bulk response
                        bulk_distances = data.get('distances', [])
                        bulk_durations = data.get('durations', [])
                        
                        print(f"[OSRM BULK] Received matrix: {len(bulk_distances)}x{len(bulk_distances[0]) if bulk_distances else 0}")
                        
                        # Map results back to original pairs
                        successful_pairs = 0
                        for orig, dest in limited_pairs:
                            orig_idx_in_bulk = coord_to_idx[orig]
                            dest_idx_in_bulk = coord_to_idx[dest]
                            
                            if (orig_idx_in_bulk < len(bulk_distances) and 
                                dest_idx_in_bulk < len(bulk_distances[orig_idx_in_bulk])):
                                distance = bulk_distances[orig_idx_in_bulk][dest_idx_in_bulk]
                                duration = bulk_durations[orig_idx_in_bulk][dest_idx_in_bulk]
                                
                                # Skip null/None values (unreachable locations)
                                if distance is not None and duration is not None:
                                    # Update matrix
                                    orig_idx = origins.index(orig)
                                    dest_idx = destinations.index(dest)
                                    distances[orig_idx][dest_idx] = distance
                                    durations[orig_idx][dest_idx] = duration
                                    
                                    # Cache it asynchronously (non-blocking)
                                    self._save_to_cache_async(orig[0], orig[1], dest[0], dest[1], 
                                                             int(distance), int(duration))
                                    successful_pairs += 1
                                else:
                                    print(f"[OSRM BULK] Null distance for pair ({orig[0]:.4f},{orig[1]:.4f}) -> ({dest[0]:.4f},{dest[1]:.4f})")
                        
                        print(f"[OSRM BULK] Successfully calculated {successful_pairs}/{len(limited_pairs)} pairs in one call")
                elif response.status_code == 429:
                    print(f"[OSRM RATE LIMIT] Using haversine fallback for uncached pairs")
                    # Rate limited - use haversine fallback for all uncached
                    for orig, dest in limited_pairs:
                        orig_idx = origins.index(orig)
                        dest_idx = destinations.index(dest)
                        fallback_dist = self._haversine_distance(orig[0], orig[1], dest[0], dest[1])
                        distances[orig_idx][dest_idx] = fallback_dist
                        durations[orig_idx][dest_idx] = fallback_dist / 13.89
                else:
                    print(f"[OSRM API ERROR] {response.status_code}")
                    # Use haversine fallback
                    for orig, dest in limited_pairs:
                        orig_idx = origins.index(orig)
                        dest_idx = destinations.index(dest)
                        fallback_dist = self._haversine_distance(orig[0], orig[1], dest[0], dest[1])
                        distances[orig_idx][dest_idx] = fallback_dist
                        durations[orig_idx][dest_idx] = fallback_dist / 13.89
            except Exception as e:
                print(f"[OSRM BULK ERROR] {e}")
                # Fallback to haversine for errors
                for orig, dest in limited_pairs:
                    try:
                        orig_idx = origins.index(orig)
                        dest_idx = destinations.index(dest)
                        fallback_dist = self._haversine_distance(orig[0], orig[1], dest[0], dest[1])
                        distances[orig_idx][dest_idx] = fallback_dist
                        durations[orig_idx][dest_idx] = fallback_dist / 13.89
                    except:
                        pass
        
        return {
            'distances': distances,
            'durations': durations
        }
    
    def _haversine_distance(self, lat1, lon1, lat2, lon2):
        """Calculate straight-line distance between two points (fallback when OSRM fails)"""
        from math import radians, sin, cos, sqrt, atan2
        
        R = 6371000  # Earth radius in meters
        
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        distance = R * c
        
        return distance


# Initialize API clients
yelp_client = None
otm_client = None
nominatim_client = None
osrm_client = None

if YELP_API_KEY:
    yelp_client = YelpClient(YELP_API_KEY, db_config)
    print("[OK] Yelp client initialized")
else:
    print("WARNING: YELP_API_KEY not found!")

if OPEN_TRIP_MAP_API_KEY:
    otm_client = OpenTripMapClient(OPEN_TRIP_MAP_API_KEY, db_config)
    print("[OK] OpenTripMap client initialized")
else:
    print("WARNING: OPEN_TRIP_MAP_API_KEY not found!")

nominatim_client = NominatimClient(db_config)
print("[OK] Nominatim client initialized")

osrm_client = OSRMClient(db_config)
print("[OK] OSRM client initialized")

# ============================================================================
# END API CLIENT CLASSES
# ============================================================================

# Authentication routes
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    first_name = data.get('first_name')
    last_name = data.get('last_name')
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if not all([first_name, last_name, username, email, password]):
        return jsonify({"error": "All fields are required"}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Check if username or email already exists
        cursor.execute("SELECT * FROM users WHERE username = %s OR email = %s", (username, email))
        if cursor.fetchone():
            return jsonify({"error": "Username or email already exists"}), 409
        
        # Insert new user
        cursor.execute("""
            INSERT INTO users (first_name, last_name, username, email, password)
            VALUES (%s, %s, %s, %s, %s)
        """, (first_name, last_name, username, email, password))
        
        conn.commit()
        
        # Get the created user
        cursor.execute("SELECT user_id, first_name, last_name, username, email FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        
        return jsonify({
            "message": "User registered successfully",
            "user": {
                "user_id": user[0],
                "first_name": user[1],
                "last_name": user[2],
                "username": user[3],
                "email": user[4]
            }
        }), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT user_id, first_name, last_name, username, email FROM users WHERE username = %s AND password = %s", 
                      (username, password))
        user = cursor.fetchone()
        
        if user:
            return jsonify({
                "message": "Login successful",
                "user": user
            }), 200
        else:
            return jsonify({"error": "Invalid credentials"}), 401
            
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Friend request routes
@app.route('/api/search_users', methods=['GET'])
def search_users():
    query = request.args.get('query', '')
    current_user_id = request.args.get('user_id')
    
    if not query or not current_user_id:
        return jsonify({"error": "Query and user_id are required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Search for users by username, excluding current user
        cursor.execute("""
            SELECT user_id, first_name, last_name, username 
            FROM users
            WHERE (username LIKE %s OR first_name LIKE %s OR last_name LIKE %s)
            AND user_id != %s
            LIMIT 10
        """, (f'%{query}%', f'%{query}%', f'%{query}%', current_user_id))
        
        users = cursor.fetchall()
        
        # For each user, check if already friends or pending request
        for user in users:
            cursor.execute("""
                SELECT status FROM friends 
                WHERE (user_id = %s AND friend_id = %s) 
                OR (user_id = %s AND friend_id = %s)
            """, (current_user_id, user['user_id'], user['user_id'], current_user_id))
            
            friends = cursor.fetchone()
            user['friends_status'] = friends['status'] if friends else None
        
        return jsonify(users), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/send_friend_request', methods=['POST'])
def send_friend_request():
    data = request.json
    user_id = data.get('user_id')
    friend_id = data.get('friend_id')
    
    if not user_id or not friend_id:
        return jsonify({"error": "user_id and friend_id are required"}), 400

    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Check if friends already exists
        cursor.execute("""
            SELECT * FROM friends 
            WHERE (user_id = %s AND friend_id = %s) 
            OR (user_id = %s AND friend_id = %s)
        """, (user_id, friend_id, friend_id, user_id))
        
        if cursor.fetchone():
            return jsonify({"error": "Friend request already exists"}), 409
        
        # Insert friend request
        cursor.execute("""
            INSERT INTO friends (user_id, friend_id, status)
            VALUES (%s, %s, 'pending')
        """, (user_id, friend_id))
        
        request_id = cursor.lastrowid
        conn.commit()
        return jsonify({"message": "Friend request sent", "request_id": request_id}), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/friend_requests/<int:user_id>', methods=['GET'])
def get_friend_requests(user_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get pending friend requests received by this user
        cursor.execute("""
            SELECT f.id, f.user_id, u.first_name, u.last_name, u.username
            FROM friends f
            JOIN users u ON f.user_id = u.user_id
            WHERE f.friend_id = %s AND f.status = 'pending'
        """, (user_id,))
        
        requests = cursor.fetchall()
        return jsonify(requests), 200

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/friend_requests_sent/<int:user_id>', methods=['GET'])
def get_friend_requests_sent(user_id):
    """Get pending friend requests sent by this user"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get pending friend requests sent by this user
        cursor.execute("""
            SELECT f.id, f.friend_id, u.first_name, u.last_name, u.username
            FROM friends f
            JOIN users u ON f.friend_id = u.user_id
            WHERE f.user_id = %s AND f.status = 'pending'
        """, (user_id,))
        
        requests = cursor.fetchall()
        return jsonify(requests), 200

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/cancel_friend_request/<int:request_id>', methods=['POST'])
def cancel_friend_request(request_id):
    """Cancel a friend request that was sent"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Delete the friend request
        cursor.execute("DELETE FROM friends WHERE id = %s AND status = 'pending'", (request_id,))
        
        conn.commit()
        return jsonify({"message": "Friend request cancelled"}), 200

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/accept_friend_request/<int:request_id>', methods=['POST'])
def accept_friend_request(request_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Update friends status to accepted
        cursor.execute("""
            UPDATE friends 
            SET status = 'accepted'
            WHERE id = %s
        """, (request_id,))
        
        conn.commit()
        return jsonify({"message": "Friend request accepted"}), 200

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/reject_friend_request/<int:request_id>', methods=['POST'])
def reject_friend_request(request_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()

        # Delete the friend request
        cursor.execute("DELETE FROM friends WHERE id = %s", (request_id,))
        
        conn.commit()
        return jsonify({"message": "Friend request rejected"}), 200

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Friend routes
@app.route('/api/friends/<int:user_id>', methods=['GET'])
def get_friends(user_id):
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)

        # Get all accepted friendss for this user
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN f.user_id = %s THEN u2.user_id
                    ELSE u1.user_id
                END as user_id,
                CASE 
                    WHEN f.user_id = %s THEN u2.first_name
                    ELSE u1.first_name
                END as first_name,
                CASE 
                    WHEN f.user_id = %s THEN u2.last_name
                    ELSE u1.last_name
                END as last_name,
                CASE 
                    WHEN f.user_id = %s THEN u2.username
                    ELSE u1.username
                END as username
            FROM friends f
            JOIN users u1 ON f.user_id = u1.user_id
            JOIN users u2 ON f.friend_id = u2.user_id
            WHERE (f.user_id = %s OR f.friend_id = %s) AND f.status = 'accepted'
        """, (user_id, user_id, user_id, user_id, user_id, user_id))
        
        friends = cursor.fetchall()
        return jsonify({"friends": friends}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Friend suggestions route
@app.route('/api/friend_suggestions/<int:user_id>', methods=['GET'])
def get_friend_suggestions(user_id):
    """Get suggested users who are not friends yet"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get users who are not friends and no pending requests
        cursor.execute("""
            SELECT u.user_id as id, u.first_name, u.last_name, u.username
            FROM users u
            WHERE u.user_id != %s
            AND u.user_id NOT IN (
                SELECT CASE 
                    WHEN f.user_id = %s THEN f.friend_id
                    ELSE f.user_id
                END
                FROM friends f
                WHERE (f.user_id = %s OR f.friend_id = %s)
            )
            LIMIT 10
        """, (user_id, user_id, user_id, user_id))
        
        suggestions = cursor.fetchall()
        return jsonify({"suggestions": suggestions}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Unified user search route
@app.route('/api/users', methods=['GET'])
def search_users_unified():
    """Search users by name or username"""
    search_query = request.args.get('search', '').strip()
    current_user_id = request.args.get('current_user_id')
    
    if not current_user_id:
        return jsonify({"error": "current_user_id is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        if search_query:
            # Search with query
            cursor.execute("""
                SELECT user_id as id, first_name, last_name, username,
                       CONCAT(first_name, ' ', last_name) as name
                FROM users
                WHERE (username LIKE %s OR first_name LIKE %s OR last_name LIKE %s)
                AND user_id != %s
                LIMIT 20
            """, (f'%{search_query}%', f'%{search_query}%', f'%{search_query}%', current_user_id))
        else:
            # Return empty if no search query
            return jsonify({"users": []}), 200
        
        users = cursor.fetchall()
        
        # For each user, check friendship status
        for user in users:
            # Check if already friends
            cursor.execute("""
                SELECT id, status,
                       CASE 
                           WHEN user_id = %s THEN 'sent'
                           WHEN friend_id = %s THEN 'received'
                       END as request_direction
                FROM friends 
                WHERE (user_id = %s AND friend_id = %s) 
                OR (user_id = %s AND friend_id = %s)
            """, (current_user_id, current_user_id, current_user_id, user['id'], user['id'], current_user_id))
            
            friendship = cursor.fetchone()
            
            if friendship:
                if friendship['status'] == 'accepted':
                    user['friendship_status'] = 'friends'
                elif friendship['request_direction'] == 'sent':
                    user['friendship_status'] = 'request_sent'
                elif friendship['request_direction'] == 'received':
                    user['friendship_status'] = 'request_received'
                    user['request_id'] = friendship['id']
            else:
                user['friendship_status'] = 'none'
        
        return jsonify({"users": users}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Remove friend route
@app.route('/api/remove_friend', methods=['POST'])
def remove_friend():
    """Remove a friend"""
    data = request.json
    user_id = data.get('user_id')
    friend_id = data.get('friend_id')
    
    if not user_id or not friend_id:
        return jsonify({"error": "user_id and friend_id are required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Delete the friendship (either direction)
        cursor.execute("""
            DELETE FROM friends 
            WHERE (user_id = %s AND friend_id = %s) 
            OR (user_id = %s AND friend_id = %s)
        """, (user_id, friend_id, friend_id, user_id))
        
        conn.commit()
        return jsonify({"message": "Friend removed successfully"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# ===== CHAT API ROUTES =====

@app.route('/api/chats/user/<int:user_id>', methods=['GET'])
def get_user_chats(user_id):
    """Get all chats for a user (trip-based chats they're part of)"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get all group chats for trips the user is part of
        query = """
        SELECT 
            gc.chat_id,
            gc.trip_id,
            gc.chat_name,
            t.trip_name,
            gc.created_at,
            (SELECT COUNT(*) FROM chat_participants WHERE chat_id = gc.chat_id) as member_count
        FROM group_chats gc
        JOIN trips t ON gc.trip_id = t.trip_id
        WHERE gc.chat_id IN (
            SELECT chat_id FROM chat_participants WHERE user_id = %s
        )
        ORDER BY gc.created_at DESC
        """
        cursor.execute(query, (user_id,))
        chats = cursor.fetchall()
        
        # Get last message and unread count for each chat
        for chat in chats:
            cursor.execute("""
                SELECT cm.message, cm.sent_at, u.username, u.first_name
                FROM chat_messages cm
                JOIN users u ON cm.user_id = u.user_id
                WHERE cm.chat_id = %s
                ORDER BY cm.sent_at DESC
                LIMIT 1
            """, (chat['chat_id'],))
            
            last_msg = cursor.fetchone()
            if last_msg:
                chat['last_message'] = last_msg['message']
                chat['last_message_time'] = last_msg['sent_at']
                chat['last_sender'] = last_msg['first_name']
            else:
                chat['last_message'] = None
                chat['last_message_time'] = None
                chat['last_sender'] = None
            
            # Get unread count
            cursor.execute("""
                SELECT unread_count FROM unread_messages 
                WHERE user_id = %s AND chat_id = %s AND chat_type = 'group'
            """, (user_id, chat['chat_id']))
            unread = cursor.fetchone()
            chat['unread_count'] = unread['unread_count'] if unread else 0
        
        return jsonify({"chats": chats}), 200
        
    except Exception as e:
        print(f"Error in get_user_chats: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/<int:chat_id>/messages', methods=['GET'])
def get_chat_messages(chat_id):
    """Get all messages in a chat"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is participant
        cursor.execute("""
            SELECT 1 FROM chat_participants WHERE chat_id = %s AND user_id = %s
        """, (chat_id, user_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "Access denied"}), 403
        
        # Try to get trip info (may not exist for all chats)
        trip_name = 'Group Chat'  # Default
        try:
            cursor.execute("""
                SELECT t.trip_name
                FROM group_chats gc
                JOIN trips t ON gc.trip_id = t.trip_id
                WHERE gc.chat_id = %s
            """, (chat_id,))
            
            trip_info = cursor.fetchone()
            if trip_info and trip_info.get('trip_name'):
                trip_name = trip_info['trip_name']
        except Exception as trip_error:
            print(f"Warning: Could not fetch trip name for chat {chat_id}: {trip_error}", flush=True)
            # Continue with default trip_name
        
        # Get messages
        cursor.execute("""
            SELECT 
                cm.message_id,
                cm.message as message_content,
                cm.sent_at,
                cm.user_id as sender_id,
                u.username as sender_username,
                u.first_name as sender_first_name,
                u.last_name as sender_last_name
            FROM chat_messages cm
            JOIN users u ON cm.user_id = u.user_id
            WHERE cm.chat_id = %s
            ORDER BY cm.sent_at ASC
        """, (chat_id,))
        
        messages = cursor.fetchall()
        
        # Mark messages as read for this user
        cursor.execute("""
            DELETE FROM unread_messages 
            WHERE user_id = %s AND chat_id = %s AND chat_type = 'group'
        """, (user_id, chat_id))
        conn.commit()
        
        # Convert datetime to string and map fields for frontend compatibility
        for msg in messages:
            if msg.get('sent_at'):
                msg['sent_at'] = msg['sent_at'].isoformat() if hasattr(msg['sent_at'], 'isoformat') else str(msg['sent_at'])
            # Map backend fields to frontend expected fields (keep both old and new field names)
            msg['message'] = msg.get('message_content', '')
            msg['user_id'] = msg.get('sender_id', None)
            if 'sender_first_name' in msg:
                msg['first_name'] = msg['sender_first_name']
            if 'sender_last_name' in msg:
                msg['last_name'] = msg['sender_last_name']
        
        return jsonify({
            "messages": messages,
            "chat_name": trip_name,
            "chat_info": {
                "chat_name": trip_name,
                "trip_name": trip_name
            }
        }), 200
        
    except Exception as e:
        print(f"Error in get_chat_messages: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/direct', methods=['POST'])
def create_direct_chat():
    """Create a direct chat between two users"""
    data = request.json
    user_id = data.get('user_id')
    friend_id = data.get('friend_id')
    
    if not user_id or not friend_id:
        return jsonify({"error": "user_id and friend_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if direct chat already exists (works regardless of which user is user1 or user2)
        cursor.execute("""
            SELECT chat_id 
            FROM direct_chats 
            WHERE (user1_id = %s AND user2_id = %s) 
               OR (user1_id = %s AND user2_id = %s)
            LIMIT 1
        """, (user_id, friend_id, friend_id, user_id))
        
        existing_chat = cursor.fetchone()
        
        if existing_chat:
            # Get friend's name for response
            cursor.execute("SELECT first_name, last_name FROM users WHERE user_id = %s", (friend_id,))
            friend = cursor.fetchone()
            chat_name = f"{friend['first_name']} {friend['last_name']}"
            
            return jsonify({
                "chat_id": existing_chat['chat_id'],
                "chat_name": chat_name,
                "existed": True
            }), 200
        
        # Get friend's name
        cursor.execute("SELECT first_name, last_name FROM users WHERE user_id = %s", (friend_id,))
        friend = cursor.fetchone()
        
        # Create new direct chat (LEAST/GREATEST ensures consistent ordering)
        cursor.execute("""
            INSERT INTO direct_chats (user1_id, user2_id)
            VALUES (LEAST(%s, %s), GREATEST(%s, %s))
        """, (user_id, friend_id, user_id, friend_id))
        chat_id = cursor.lastrowid
        
        conn.commit()
        
        chat_name = f"{friend['first_name']} {friend['last_name']}"
        
        return jsonify({
            "chat_id": chat_id,
            "chat_name": chat_name,
            "existed": False,
            "is_direct": True
        }), 201
        
    except Exception as e:
        print(f"Error creating direct chat: {e}")
        print(f"User ID: {user_id}, Friend ID: {friend_id}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/direct/user/<int:user_id>', methods=['GET'])
def get_user_direct_chats(user_id):
    """Get all direct chats for a user"""
    include_archived = request.args.get('include_archived', 'false').lower() == 'true'
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Determine which archive column to check
        query = """
        SELECT 
            dc.chat_id,
            dc.user1_id,
            dc.user2_id,
            dc.last_message_at,
            dc.created_at,
            CASE 
                WHEN dc.user1_id = %s THEN dc.archived_by_user1
                ELSE dc.archived_by_user2
            END as is_archived
        FROM direct_chats dc
        WHERE (dc.user1_id = %s OR dc.user2_id = %s)
        """
        
        if not include_archived:
            query += """
            AND ((dc.user1_id = %s AND dc.archived_by_user1 = FALSE) 
                 OR (dc.user2_id = %s AND dc.archived_by_user2 = FALSE))
            """
            cursor.execute(query, (user_id, user_id, user_id, user_id, user_id))
        else:
            cursor.execute(query, (user_id, user_id, user_id))
        
        direct_chats = cursor.fetchall()
        
        # Get chat names and last messages
        for chat in direct_chats:
            other_user_id = chat['user2_id'] if chat['user1_id'] == user_id else chat['user1_id']
            
            # Get other user's name
            cursor.execute("SELECT first_name, last_name FROM users WHERE user_id = %s", (other_user_id,))
            other_user = cursor.fetchone()
            chat['chat_name'] = f"{other_user['first_name']} {other_user['last_name']}" if other_user else 'User'
            
            # Get last message
            cursor.execute("""
                SELECT message_content, sent_at 
                FROM direct_messages 
                WHERE chat_id = %s 
                ORDER BY sent_at DESC 
                LIMIT 1
            """, (chat['chat_id'],))
            last_msg = cursor.fetchone()
            if last_msg:
                chat['last_message'] = last_msg['message_content'][:50] + ('...' if len(last_msg['message_content']) > 50 else '')
                chat['last_message_time'] = last_msg['sent_at']
            
            # Get unread count
            cursor.execute("""
                SELECT unread_count FROM unread_messages 
                WHERE user_id = %s AND chat_id = %s AND chat_type = 'direct'
            """, (user_id, chat['chat_id']))
            unread = cursor.fetchone()
            chat['unread_count'] = unread['unread_count'] if unread else 0
        
        return jsonify({"chats": direct_chats}), 200
        
    except Exception as e:
        print(f"Error fetching direct chats: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/direct/<int:chat_id>/archive', methods=['POST'])
def archive_direct_chat(chat_id):
    """Archive a direct chat for a user"""
    data = request.json
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get the chat
        cursor.execute("""
            SELECT user1_id, user2_id FROM direct_chats WHERE chat_id = %s
        """, (chat_id,))
        chat = cursor.fetchone()
        
        if not chat:
            return jsonify({"error": "Chat not found"}), 404
        
        # Archive for the correct user
        if chat['user1_id'] == user_id:
            cursor.execute("UPDATE direct_chats SET archived_by_user1 = TRUE WHERE chat_id = %s", (chat_id,))
        elif chat['user2_id'] == user_id:
            cursor.execute("UPDATE direct_chats SET archived_by_user2 = TRUE WHERE chat_id = %s", (chat_id,))
        else:
            return jsonify({"error": "Access denied"}), 403
        
        conn.commit()
        return jsonify({"success": True}), 200
        
    except Exception as e:
        print(f"Error archiving chat: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/direct/<int:chat_id>/messages', methods=['GET'])
def get_direct_messages(chat_id):
    """Get messages from a direct chat"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is part of this direct chat and get other user's info
        cursor.execute("""
            SELECT 
                dc.user1_id,
                dc.user2_id,
                u1.first_name as user1_first_name,
                u1.last_name as user1_last_name,
                u2.first_name as user2_first_name,
                u2.last_name as user2_last_name
            FROM direct_chats dc
            JOIN users u1 ON dc.user1_id = u1.user_id
            JOIN users u2 ON dc.user2_id = u2.user_id
            WHERE dc.chat_id = %s AND (dc.user1_id = %s OR dc.user2_id = %s)
        """, (chat_id, user_id, user_id))
        
        chat_info = cursor.fetchone()
        if not chat_info:
            return jsonify({"error": "Access denied"}), 403
        
        # Determine the other user's name
        if int(user_id) == chat_info['user1_id']:
            other_user_name = f"{chat_info['user2_first_name']} {chat_info['user2_last_name']}"
        else:
            other_user_name = f"{chat_info['user1_first_name']} {chat_info['user1_last_name']}"
        
        # Get messages
        cursor.execute("""
            SELECT 
                dm.message_id,
                dm.sender_id,
                dm.message_content,
                dm.sent_at,
                u.username as sender_username,
                u.first_name as sender_first_name,
                u.last_name as sender_last_name
            FROM direct_messages dm
            JOIN users u ON dm.sender_id = u.user_id
            WHERE dm.chat_id = %s
            ORDER BY dm.sent_at ASC
        """, (chat_id,))
        
        messages = cursor.fetchall()
        
        # Mark messages as read for this user
        cursor.execute("""
            DELETE FROM unread_messages 
            WHERE user_id = %s AND chat_id = %s AND chat_type = 'direct'
        """, (user_id, chat_id))
        conn.commit()
        
        # Convert datetime to string and map fields for frontend compatibility
        for msg in messages:
            if msg.get('sent_at'):
                msg['sent_at'] = msg['sent_at'].isoformat()
            # Map backend fields to frontend expected fields (keep both old and new field names)
            msg['message'] = msg.get('message_content', '')
            msg['user_id'] = msg.get('sender_id', None)
            if 'sender_first_name' in msg:
                msg['first_name'] = msg['sender_first_name']
            if 'sender_last_name' in msg:
                msg['last_name'] = msg['sender_last_name']
        
        return jsonify({
            "messages": messages,
            "chat_name": other_user_name,
            "chat_info": {
                "chat_name": other_user_name,
                "trip_name": other_user_name
            }
        }), 200
        
    except Exception as e:
        print(f"Error fetching direct messages: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/direct/<int:chat_id>/messages', methods=['POST'])
def send_direct_message(chat_id):
    """Send a message in a direct chat"""
    data = request.json
    sender_id = data.get('sender_id') or data.get('user_id')
    message_content = data.get('message_content', '').strip()
    
    if not sender_id or not message_content:
        return jsonify({"error": "sender_id and message_content required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is part of this direct chat
        cursor.execute("""
            SELECT 1 FROM direct_chats 
            WHERE chat_id = %s AND (user1_id = %s OR user2_id = %s)
        """, (chat_id, sender_id, sender_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "Access denied"}), 403
        
        # Insert message
        cursor.execute("""
            INSERT INTO direct_messages (chat_id, sender_id, message_content)
            VALUES (%s, %s, %s)
        """, (chat_id, sender_id, message_content))
        
        message_id = cursor.lastrowid
        
        # Update last_message_at in direct_chats
        cursor.execute("""
            UPDATE direct_chats 
            SET last_message_at = NOW(),
                archived_by_user1 = FALSE,
                archived_by_user2 = FALSE
            WHERE chat_id = %s
        """, (chat_id,))
        
        # Get the other user in this chat
        cursor.execute("""
            SELECT user1_id, user2_id FROM direct_chats WHERE chat_id = %s
        """, (chat_id,))
        chat_users = cursor.fetchone()
        other_user_id = chat_users['user2_id'] if chat_users['user1_id'] == sender_id else chat_users['user1_id']
        
        # Update unread count for the other user
        cursor.execute("""
            INSERT INTO unread_messages (user_id, chat_id, chat_type, unread_count, last_message_at)
            VALUES (%s, %s, 'direct', 1, NOW())
            ON DUPLICATE KEY UPDATE 
                unread_count = unread_count + 1,
                last_message_at = NOW()
        """, (other_user_id, chat_id))
        
        conn.commit()
        
        # Get the created message with user details
        cursor.execute("""
            SELECT 
                dm.message_id,
                dm.sender_id,
                dm.message_content,
                dm.sent_at,
                u.username as sender_username,
                u.first_name as sender_first_name,
                u.last_name as sender_last_name
            FROM direct_messages dm
            JOIN users u ON dm.sender_id = u.user_id
            WHERE dm.message_id = %s
        """, (message_id,))
        
        new_message = cursor.fetchone()
        
        if new_message.get('sent_at'):
            new_message['sent_at'] = new_message['sent_at'].isoformat()
        
        return jsonify({
            "success": True,
            "message": new_message
        }), 201
        
    except Exception as e:
        print(f"Error sending direct message: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/chats/<int:chat_id>/messages', methods=['POST'])
def send_chat_message(chat_id):
    """Send a message in a group chat"""
    data = request.json
    sender_id = data.get('sender_id') or data.get('user_id')
    message_content = data.get('message_content') or data.get('message', '').strip()
    
    if not sender_id or not message_content:
        return jsonify({"error": "sender_id and message_content required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is participant
        cursor.execute("""
            SELECT 1 FROM chat_participants WHERE chat_id = %s AND user_id = %s
        """, (chat_id, sender_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "Access denied"}), 403
        
        # Insert message
        cursor.execute("""
            INSERT INTO chat_messages (chat_id, user_id, message)
            VALUES (%s, %s, %s)
        """, (chat_id, sender_id, message_content))
        
        message_id = cursor.lastrowid
        
        # Get all participants in this chat (except sender)
        cursor.execute("""
            SELECT user_id FROM chat_participants 
            WHERE chat_id = %s AND user_id != %s
        """, (chat_id, sender_id))
        participants = cursor.fetchall()
        
        # Update unread count for all other participants
        for participant in participants:
            cursor.execute("""
                INSERT INTO unread_messages (user_id, chat_id, chat_type, unread_count, last_message_at)
                VALUES (%s, %s, 'group', 1, NOW())
                ON DUPLICATE KEY UPDATE 
                    unread_count = unread_count + 1,
                    last_message_at = NOW()
            """, (participant['user_id'], chat_id))
        
        conn.commit()
        
        # Get the created message with user details
        cursor.execute("""
            SELECT 
                cm.message_id,
                cm.message as message_content,
                cm.sent_at,
                cm.user_id as sender_id,
                u.username as sender_username,
                u.first_name as sender_first_name,
                u.last_name as sender_last_name
            FROM chat_messages cm
            JOIN users u ON cm.user_id = u.user_id
            WHERE cm.message_id = %s
        """, (message_id,))
        
        new_message = cursor.fetchone()
        
        # Convert datetime to string
        if new_message.get('sent_at'):
            new_message['sent_at'] = new_message['sent_at'].isoformat() if hasattr(new_message['sent_at'], 'isoformat') else str(new_message['sent_at'])
        
        return jsonify({"message": new_message, "success": True}), 201
        
    except Exception as e:
        print(f"Error in send_chat_message: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

# Google Places API routes
@app.route('/api/autocomplete', methods=['GET'])
def autocomplete():
    """Autocomplete for place search - Hybrid Nominatim + Yelp"""
    query = request.args.get('query', '')
    if not query or len(query) < 2:
        return jsonify([]), 200
    
    try:
        suggestions = []
        seen_descriptions = set()
        
        # 1. Get location suggestions from Nominatim
        if nominatim_client:
            try:
                nominatim_results = nominatim_client.search(query, limit=5)
                if nominatim_results:
                    for place in nominatim_results:
                        description = place.get('display_name', '')
                        if description and description not in seen_descriptions:
                            suggestions.append({
                                'description': description,
                                'place_id': f"nominatim:{place.get('place_id', '')}"
                            })
                            seen_descriptions.add(description)
            except Exception as e:
                print(f"[AUTOCOMPLETE] Nominatim error: {e}")
        
        # 2. Get business suggestions from Yelp
        if yelp_client:
            try:
                yelp_results = yelp_client.autocomplete(query)
                if yelp_results and 'businesses' in yelp_results:
                    for business in yelp_results['businesses'][:5]:
                        name = business.get('name', '')
                        location = business.get('location', {})
                        city = location.get('city', '')
                        state = location.get('state', '')
                        description = f"{name}, {city}, {state}" if city else name
                        
                        if description and description not in seen_descriptions:
                            suggestions.append({
                                'description': description,
                                'place_id': f"yelp:{business.get('id', '')}"
                            })
                            seen_descriptions.add(description)
            except Exception as e:
                print(f"[AUTOCOMPLETE] Yelp error: {e}")
        
        return jsonify(suggestions[:10]), 200  # Limit to 10 total results
    except Exception as e:
        print("Error in autocomplete:", e)
        return jsonify({"error": str(e)}), 500

@app.route('/api/autocomplete/places', methods=['GET'])
def autocomplete_places():
    """Autocomplete for any place (cities, addresses, landmarks, etc.) - Hybrid Nominatim + Yelp"""
    query = request.args.get('query', '')
    if not query or len(query) < 2:
        return jsonify([]), 200
    
    try:
        suggestions = []
        seen_descriptions = set()
        
        # 1. Get location suggestions from Nominatim (cities, addresses, landmarks)
        if nominatim_client:
            try:
                nominatim_results = nominatim_client.search(query, limit=8)
                if nominatim_results:
                    for place in nominatim_results:
                        description = place.get('display_name', '')
                        if description and description not in seen_descriptions:
                            suggestions.append({
                                'description': description,
                                'place_id': f"nominatim:{place.get('place_id', '')}"
                            })
                            seen_descriptions.add(description)
            except Exception as e:
                print(f"[PLACES AUTOCOMPLETE] Nominatim error: {e}")
        
        # 2. Get business suggestions from Yelp
        if yelp_client:
            try:
                yelp_results = yelp_client.autocomplete(query)
                if yelp_results and 'businesses' in yelp_results:
                    for business in yelp_results['businesses'][:5]:
                        name = business.get('name', '')
                        location = business.get('location', {})
                        city = location.get('city', '')
                        state = location.get('state', '')
                        description = f"{name}, {city}, {state}" if city else name
                        
                        if description and description not in seen_descriptions:
                            suggestions.append({
                                'description': description,
                                'place_id': f"yelp:{business.get('id', '')}"
                            })
                            seen_descriptions.add(description)
            except Exception as e:
                print(f"[PLACES AUTOCOMPLETE] Yelp error: {e}")
        
        return jsonify(suggestions[:12]), 200  # Return up to 12 results
    except Exception as e:
        print("Error in places autocomplete:", e)
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/autocomplete/cities', methods=['GET'])
def autocomplete_cities():
    """Autocomplete specifically for cities - Using Nominatim"""
    query = request.args.get('query', '')
    if not query or len(query) < 2:
        return jsonify([]), 200
    
    try:
        suggestions = []
        
        # Use Nominatim to search for cities specifically
        if nominatim_client:
            try:
                nominatim_results = nominatim_client.search(query, limit=10)
                if nominatim_results:
                    for place in nominatim_results:
                        # Filter for cities, towns, villages
                        place_type = place.get('type', '').lower()
                        osm_type = place.get('osm_type', '')
                        address = place.get('address', {})
                        
                        # Check if it's a city-type location
                        is_city = (place_type in ['city', 'town', 'village', 'municipality'] or 
                                  'city' in address or 'town' in address or 
                                  place.get('class') == 'place')
                        
                        if is_city or osm_type in ['relation', 'node']:
                            description = place.get('display_name', '')
                            if description:
                                suggestions.append({
                                    'description': description,
                                    'place_id': f"nominatim:{place.get('place_id', '')}"
                                })
            except Exception as e:
                print(f"[CITY AUTOCOMPLETE] Nominatim error: {e}")
        
        return jsonify(suggestions[:10]), 200
    except Exception as e:
        print("Error in city autocomplete:", e)
        return jsonify({"error": str(e)}), 500

# ============================================================================
# HELPER FUNCTIONS FOR HYBRID SEARCH
# ============================================================================

def map_category_to_apis(category_or_type):
    """Map frontend category to appropriate API(s) and search terms
    Returns: {'primary': 'yelp'|'otm', 'yelp_category': str, 'otm_kinds': str}
    """
    category_lower = category_or_type.lower()
    
    # Business-focused categories -> Yelp primary
    yelp_primary = {
        'restaurants': {'yelp': 'restaurants', 'otm': 'foods'},
        'hotels': {'yelp': 'hotels', 'otm': 'accomodations'},
        'cafes': {'yelp': 'cafes', 'otm': 'foods'},
        'bars': {'yelp': 'bars', 'otm': None},
        'nightlife': {'yelp': 'nightlife', 'otm': None},
        'shopping': {'yelp': 'shopping', 'otm': None},
        'spas': {'yelp': 'spas', 'otm': None},
        'gyms': {'yelp': 'gyms', 'otm': None},
        'bakeries': {'yelp': 'bakeries', 'otm': 'foods'},
    }
    
    # Attraction-focused categories -> OpenTripMap primary
    otm_primary = {
        'museums': {'yelp': 'museums', 'otm': 'museums'},
        'parks': {'yelp': None, 'otm': 'natural'},  # FIXED: Don't use Yelp for parks (returns restaurants)
        'park': {'yelp': None, 'otm': 'natural'},  # NEW: Singular form
        'attractions': {'yelp': None, 'otm': 'tourist_facilities,interesting_places'},  # FIXED: OTM only
        'attraction': {'yelp': None, 'otm': 'tourist_facilities,interesting_places'},  # NEW: Singular
        'tourist_attraction': {'yelp': None, 'otm': 'tourist_facilities,cultural,historic'},  # NEW
        'landmarks': {'yelp': None, 'otm': 'interesting_places,cultural,historic'},  # FIXED: OTM only
        'landmark': {'yelp': None, 'otm': 'interesting_places,cultural,historic'},  # NEW: Singular
        'beaches': {'yelp': None, 'otm': 'beaches'},  # FIXED: OTM only for natural beaches
        'beach': {'yelp': None, 'otm': 'beaches'},  # NEW: Singular
        'trails': {'yelp': None, 'otm': 'natural'},
        'hikes': {'yelp': None, 'otm': 'natural'},  # NEW
        'hiking': {'yelp': None, 'otm': 'natural'},  # NEW
        'nature': {'yelp': None, 'otm': 'natural'},  # NEW
        'galleries': {'yelp': 'galleries', 'otm': 'cultural,museums'},
        'stadiums': {'yelp': 'stadiums', 'otm': 'sport'},
        'theaters': {'yelp': 'theater', 'otm': 'theatres_and_entertainments'},
        'zoos': {'yelp': 'zoos', 'otm': 'interesting_places'},
        'entertainment': {'yelp': 'entertainment', 'otm': 'amusements,theatres_and_entertainments'},
    }
    
    # Check if it matches a known category
    for cat, apis in yelp_primary.items():
        if cat in category_lower:
            return {'primary': 'yelp', 'yelp_category': apis['yelp'], 'otm_kinds': apis['otm']}
    
    for cat, apis in otm_primary.items():
        if cat in category_lower:
            return {'primary': 'otm', 'yelp_category': apis['yelp'], 'otm_kinds': apis['otm']}
    
    # Default: try both with generic search
    return {'primary': 'both', 'yelp_category': category_or_type, 'otm_kinds': 'interesting_places'}


def normalize_yelp_place(business, source='yelp'):
    """Convert Yelp business to unified format"""
    location = business.get('location', {})
    coordinates = business.get('coordinates', {})
    
    # Get photo URLs
    # Search endpoint returns 'image_url' (single), business details returns 'photos' (array of 3)
    photos = []
    if 'photos' in business and isinstance(business['photos'], list):
        # Business details endpoint - has photos array
        photos = business['photos'][:3]  # Yelp provides up to 3 photos
    elif business.get('image_url'):
        # Search endpoint - only has single image_url
        photos = [business['image_url']]
    
    photo_url = photos[0] if photos else ''
    
    # Calculate popularity score (rating * review_count for sorting)
    rating = business.get('rating', 0)
    review_count = business.get('review_count', 0)
    popularity = rating * review_count
    
    # Extract category titles from category objects
    categories = business.get('categories', [])
    category_titles = [cat.get('title', '') for cat in categories if isinstance(cat, dict)]
    category_str = ', '.join(category_titles[0:2]) if category_titles else 'Business'
    
    return {
        'place_id': f"yelp:{business.get('id', '')}",
        'place_name': business.get('name', ''),
        'address': location.get('address1', ''),
        'city_name': location.get('city', ''),
        'category': category_str,
        'image_url': photo_url,
        'photos': photos,  # Array of photos for carousel (1 for search, up to 3 for details)
        'rating': str(rating),
        'lat': coordinates.get('latitude'),
        'lng': coordinates.get('longitude'),
        'source': source,
        'popularity': popularity,
        'review_count': review_count
    }


def normalize_otm_place(place, source='opentripmap'):
    """Convert OpenTripMap place to unified format"""
    # Get place name
    name = place.get('name', 'Unknown Place')
    
    # Get coordinates
    point = place.get('point', {})
    lat = point.get('lat')
    lon = point.get('lon')
    
    # Get kinds/category
    kinds = place.get('kinds', '')
    category = kinds.split(',')[0].replace('_', ' ').title() if kinds else 'Attraction'
    
    # Rate is popularity metric (1-7 scale, with 7 being most notable)
    rate = place.get('rate', 0)
    
    # Get photo URL(s)
    # Search results have 'preview' with single image
    # Full details have 'image' URL and optionally 'wikipedia_extracts' with images
    photos = []
    if place.get('image'):
        photos.append(place['image'])
    elif place.get('preview', {}).get('source'):
        photos.append(place['preview']['source'])
    
    photo_url = photos[0] if photos else ''
    
    return {
        'place_id': f"otm:{place.get('xid', '')}",
        'place_name': name,
        'address': '',  # OTM doesn't provide detailed addresses
        'city_name': '',
        'category': category,
        'image_url': photo_url,
        'photos': photos,  # Array of photos (usually just 1 for OTM)
        'rating': str(min(5.0, rate)),  # Convert rate (1-7) to rating (1-5)
        'lat': lat,
        'lng': lon,
        'source': source,
        'popularity': rate * 10,  # Normalize rate to be comparable with Yelp
        'rate': rate
    }


def normalize_search_term(term):
    """Normalize search terms to improve Google Places API results.
    Convert common singular terms to plural or more search-friendly versions."""
    
    if not term:
        return term
        
    term_lower = term.lower().strip()
    
    # Common singular to plural mappings that improve search results
    singular_to_plural = {
        'park': 'parks',
        'museum': 'museums',
        'restaurant': 'restaurants',
        'hotel': 'hotels',
        'cafe': 'cafes',
        'bar': 'bars',
        'beach': 'beaches',
        'trail': 'trails',
        'gym': 'gyms',
        'spa': 'spas',
        'mall': 'malls',
        'store': 'stores',
        'shop': 'shops',
        'attraction': 'attractions',
        'landmark': 'landmarks',
        'gallery': 'galleries',
        'theater': 'theaters',
        'cinema': 'cinemas',
        'bakery': 'bakeries',
        'library': 'libraries',
        'stadium': 'stadiums',
        'zoo': 'zoos',
    }
    
    # Handle the FIRST word too (not just last word) - important for phrases like "park in nyc"
    words = term_lower.split()
    first_word = words[0] if words else term_lower
    
    # Check first word (most important for search terms)
    if first_word in singular_to_plural:
        words[0] = singular_to_plural[first_word]
        result = ' '.join(words)
        return result
    
    # Check last word as fallback
    last_word = words[-1] if words else term_lower
    if last_word in singular_to_plural:
        words[-1] = singular_to_plural[last_word]
        return ' '.join(words)
    
    # If no mapping found, return original term
    return term

@app.route('/api/search', methods=['GET'])
def search_places():
    """Hybrid search using Yelp Fusion + OpenTripMap with popularity sorting"""
    # Get query parameters
    place_type = request.args.get('place_type', '')
    categories_param = request.args.get('categories', '')
    city = request.args.get('city', '')
    state = request.args.get('state', '')
    country = request.args.get('country', 'USA')
    offset = int(request.args.get('offset', 0))
    
    print(f"📥 [HYBRID SEARCH] place_type: '{place_type}', city: '{city}', state: '{state}', categories: '{categories_param}'")
    
    # Determine search term (place_type or categories)
    search_term = place_type or categories_param
    
    if not search_term and not city:
        return jsonify({"error": "Either search term or location is required"}), 400
    
    try:
        all_places = []
        
        # Build location string for Yelp
        location_parts = [part for part in [city, state, country] if part]
        location_str = ', '.join(location_parts) if location_parts else None
        
        # Get coordinates for OpenTripMap (if we have a location)
        lat, lng = None, None
        if city and nominatim_client:
            try:
                geocode_query = f"{city}, {state}" if state else city
                geocode_results = nominatim_client.search(geocode_query, limit=1)
                if geocode_results and len(geocode_results) > 0:
                    lat = float(geocode_results[0].get('lat'))
                    lng = float(geocode_results[0].get('lon'))
                    print(f"[INFO] Geocoded '{geocode_query}' to ({lat}, {lng})")
            except Exception as e:
                print(f"[WARN] Geocoding error: {e}")
        
        # Map category to determine which APIs to use
        api_config = map_category_to_apis(search_term) if search_term else {'primary': 'both', 'yelp_category': None, 'otm_kinds': 'interesting_places'}
        print(f"[STRATEGY] API Strategy: {api_config['primary']} - Yelp: {api_config['yelp_category']}, OTM: {api_config['otm_kinds']}")
        
        # Query Yelp if appropriate
        if api_config['primary'] in ['yelp', 'both'] and yelp_client and api_config['yelp_category']:
            try:
                yelp_params = {
                    'limit': 20,
                    'offset': offset,
                    'sort_by': 'rating'  # Sort by rating for popular places
                }
                
                if location_str:
                    yelp_params['location'] = location_str
                elif lat and lng:
                    yelp_params['latitude'] = lat
                    yelp_params['longitude'] = lng
                
                # Use category or term
                if api_config['yelp_category']:
                    yelp_params['categories'] = api_config['yelp_category']
                else:
                    yelp_params['term'] = search_term
                
                yelp_results = yelp_client.search(**yelp_params)
                
                if yelp_results and 'businesses' in yelp_results:
                    for business in yelp_results['businesses']:
                        try:
                            place = normalize_yelp_place(business)
                            # Only add if it has required fields
                            if place.get('lat') and place.get('lng'):
                                all_places.append(place)
                        except Exception as e:
                            print(f"[WARN] Error normalizing Yelp business: {e}")
                    
                    print(f"[OK] Yelp returned {len(yelp_results['businesses'])} businesses")
            except Exception as e:
                print(f"[ERROR] Yelp search error: {e}")
        
        # Query OpenTripMap if appropriate
        if api_config['primary'] in ['otm', 'both'] and otm_client and api_config['otm_kinds'] and lat and lng:
            try:
                # Search with larger radius and filter by rate (popularity)
                otm_results = otm_client.search_radius(
                    latitude=lat,
                    longitude=lng,
                    radius=10000,  # 10km radius
                    kinds=api_config['otm_kinds'],
                    rate=3,  # Minimum rate of 3 (moderately notable)
                    limit=20
                )
                
                if otm_results and isinstance(otm_results, list):
                    for place in otm_results:
                        try:
                            # Filter out places without names
                            if place.get('name'):
                                normalized = normalize_otm_place(place)
                                # Fill in city if we have it
                                if city:
                                    normalized['city_name'] = city
                                all_places.append(normalized)
                        except Exception as e:
                            print(f"[WARN] Error normalizing OTM place: {e}")
                    
                    print(f"[OK] OpenTripMap returned {len(otm_results)} places")
            except Exception as e:
                print(f"[ERROR] OpenTripMap search error: {e}")
        
        # Sort by popularity (highest first)
        all_places.sort(key=lambda x: x.get('popularity', 0), reverse=True)
        
        # Remove temporary sorting fields and ensure photo fallback
        for place in all_places:
            place.pop('popularity', None)
            place.pop('review_count', None)
            place.pop('rate', None)
            
            # Ensure image_url has a fallback
            if not place.get('image_url'):
                place['image_url'] = 'https://via.placeholder.com/400x250/1a1a2e/6366f1?text=No+Image'
        
        print(f"[OK] Returning {len(all_places)} total places (sorted by popularity)")
        
        return jsonify({
            'places': all_places,
            'total': len(all_places),
            'next_page_token': None,  # Hybrid API doesn't support traditional pagination
            'has_more': False
        }), 200
        
    except Exception as e:
        print(f"[ERROR] Error in hybrid search: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

def extract_city_from_address(address):
    """Extract city name from formatted address"""
    if not address:
        return ''
    
    parts = address.split(',')
    if len(parts) >= 2:
        return parts[-3].strip() if len(parts) >= 3 else parts[0].strip()
    return parts[0].strip()

@app.route('/api/search/city', methods=['GET'])
def search_places_in_city():
    """Search for places in a specific city - DEPRECATED: Use /api/search instead"""
    return jsonify({"error": "This endpoint is deprecated. Use /api/search instead"}), 410
    
    # Get query parameters
    city_name = request.args.get('city', '')
    category = request.args.get('category', '')
    
    if not city_name:
        return jsonify({"error": "City name is required"}), 400
    
    try:
        # Get city coordinates first
        geocode_result = gmaps.geocode(city_name)
        if not geocode_result:
            return jsonify({"error": "City not found"}), 404
        
        city_location = geocode_result[0]['geometry']['location']
        city_display_name = geocode_result[0].get('formatted_address', city_name)
        
        # Search for places in this city
        search_type = ''
        if category and category != 'All':
            # Map our category to Google Places types
            category_map = {
                'Restaurants': 'restaurant',
                'Hotels': 'lodging',
                'Attractions': 'tourist_attraction',
                'Museums': 'museum',
                'Parks & Recreation': 'park',
                'Shopping': 'shopping_mall'
            }
            search_type = category_map.get(category, 'tourist_attraction')
        
        # Perform nearby search
        results = gmaps.places_nearby(
            location=city_location,
            radius=50000,  # 50km radius
            type=search_type if search_type else None
        )
        
        city_places = []
        
        for place in results.get('results', []):
            try:
                place_id = place.get('place_id')
                
                # Get photo URL
                photo_url = None
                photos = place.get('photos')
                if photos and len(photos) > 0:
                    photo_reference = photos[0].get('photo_reference')
                    if photo_reference:
                        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                
                # Get detailed place information
                try:
                    details = gmaps.place(place_id=place_id, fields=[
                        'name', 'formatted_address', 'geometry', 
                        'rating', 'type', 'url'
                    ])
                    
                    if details['status'] == 'OK':
                        result_data = details['result']
                        
                        # Get place type and convert to category
                        place_type = result_data.get('types', [])
                        if isinstance(place_type, str):
                            place_type = [place_type]
                        
                        city_places.append({
                            'place_id': place_id,
                            'place_name': result_data.get('name', ''),
                            'address': result_data.get('formatted_address', ''),
                            'city_name': city_display_name,
                            'category': extract_category_from_types(place_type),
                            'image_url': photo_url,
                            'rating': str(result_data.get('rating', '4.5')),
                            'google_maps_url': result_data.get('url', '')
                        })
                        print(f"  Added: {result_data.get('name', '')}")
                except Exception as e:
                    print(f"Error fetching details for {place_id}: {e}")
                    continue
            
            except Exception as e:
                print(f"Error processing place: {e}")
                continue
        
        return jsonify({
            'results': city_places,
            'total': len(city_places),
            'city': city_display_name
        }), 200
        
    except Exception as e:
        print("Error in city search:", e)
        return jsonify({"error": str(e)}), 500

def is_location_match(address, city=None, state=None):
    """Check if address matches the specified city and/or state"""
    if not address:
        return False
    
    address_lower = address.lower()
    
    # Check city match
    if city:
        print(f"  Checking city match: '{city}' in '{address_lower}'")
        city_lower = city.lower()
        
        # For cities like "New York", check if it appears in the address
        # Also check for the city name in different formats
        if city_lower in address_lower:
            print(f"  City match found!")
        elif state:
            # If city not found but state is provided, check if address is in the state
            # Some NYC areas like Queens, Brooklyn might not say "New York" in address
            state_upper = state.upper()
            address_upper = address.upper()
            
            # Check if state code appears in address
            if f' {state_upper} ' in f' {address_upper} ':
                print(f"  Checking state match: '{state_upper}' in '{address_upper}'")
                print(f"  State match found!")
                return True
            else:
                print(f"  Skipping - city doesn't match")
                return False
        else:
            print(f"  Skipping - city doesn't match")
            return False
    
    # Check state match if city matched or no city specified
    if state:
        state_upper = state.upper()
        address_upper = address.upper()
        
        # Check if state code appears in address (with spaces to avoid partial matches)
        if f' {state_upper} ' in f' {address_upper} ':
            return True
        
        print(f"  Skipping - state doesn't match")
        return False
    
    return True

@app.route('/api/search/advanced', methods=['GET'])
def advanced_search():
    """Advanced search - DEPRECATED: Use /api/search instead"""
    return jsonify({"error": "This endpoint is deprecated. Use /api/search instead"}), 410
    
    # Get query parameters
    place_type = request.args.get('place_type', '')
    category = request.args.get('category', '')
    city = request.args.get('city', '')
    state = request.args.get('state', '')
    
    if not place_type and not category:
        return jsonify({"error": "Either place_type or category is required"}), 400
    
    try:
        # Build search query
        search_parts = []
        if place_type:
            search_parts.append(place_type)
        if category and category != 'All':
            search_parts.append(category)
        
        search_query = ' '.join(search_parts)
        
        # Add location to query
        location_parts = []
        if city:
            location_parts.append(city)
        if state:
            location_parts.append(state)
        location_parts.append('USA')
        
        location_string = ', '.join(location_parts)
        full_query = f"{search_query} in {location_string}"
        
        print(f"Searching for: {full_query}")
        
        # Perform text search
        results = gmaps.places(query=full_query)
        
        print(f"Processing {len(results.get('results', []))} search results")
        
        formatted_places = []
        
        for idx, place in enumerate(results.get('results', []), 1):
            try:
                place_id = place.get('place_id')
                print(f"Processing place {idx}: {place.get('name')} - {place_id}")
                
                # Get photo URL
                photo_url = None
                photos = place.get('photos')
                if photos and len(photos) > 0:
                    photo_reference = photos[0].get('photo_reference')
                    if photo_reference:
                        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
                
                # Get detailed place information
                try:
                    details = gmaps.place(place_id=place_id, fields=[
                        'name', 'formatted_address', 'geometry', 
                        'rating', 'type', 'url'
                    ])
                    
                    if details['status'] == 'OK':
                        result_data = details['result']
                        
                        # Get place type and convert to category
                        place_type_list = result_data.get('types', [])
                        if isinstance(place_type_list, str):
                            place_type_list = [place_type_list]
                        category = extract_category_from_types(place_type_list)
                        
                        # Check if result matches our criteria
                        address = result_data.get('formatted_address', '')
                        print(f"  Address: {address}")
                        
                        # Apply location filter
                        if not is_location_match(address, city, state):
                            continue
                        
                        city_display_name = city if city else extract_city_from_address(address)
                        
                        formatted_place = {
                            'place_id': place_id,
                            'place_name': result_data.get('name', ''),
                            'address': address,
                            'city_name': city_display_name,
                            'category': category,
                            'image_url': photo_url,
                            'rating': str(result_data.get('rating', '4.5')),
                            'google_maps_url': result_data.get('url', ''),
                            'lat': result_data['geometry']['location']['lat'] if 'geometry' in result_data else None,
                            'lng': result_data['geometry']['location']['lng'] if 'geometry' in result_data else None
                        }
                        formatted_places.append(formatted_place)
                        print(f"  Added place: {formatted_place['place_name']}")
                
                except Exception as e:
                    print(f"Error fetching place details for {place_id}: {e}")
                    continue
            
            except Exception as e:
                print(f"Error processing place: {e}")
                continue
        
        return jsonify({
            'places': formatted_places,
            'total': len(formatted_places)
        }), 200

    except Exception as e:
        print("Error in advanced search:", e)
        return jsonify({"error": str(e)}), 500

@app.route('/api/search/nearby', methods=['GET'])
def search_nearby():
    """Hybrid search for POPULAR places near a location (not just nearest)"""
    lat = request.args.get('lat')
    lng = request.args.get('lng')
    radius = request.args.get('radius', 10000)  # Default 10km for wider search
    category_filter = request.args.get('category')
    
    if not lat or not lng:
        return jsonify({"error": "Latitude and longitude are required"}), 400
    
    try:
        lat = float(lat)
        lng = float(lng)
        radius = int(radius)
        
        print(f"[INFO] [NEARBY SEARCH] lat={lat}, lng={lng}, radius={radius}m, category={category_filter}")
        
        all_places = []
        
        # Determine search strategy based on category
        api_config = map_category_to_apis(category_filter) if category_filter and category_filter != 'All' else {
            'primary': 'both', 'yelp_category': None, 'otm_kinds': 'interesting_places'
        }
        
        print(f"[STRATEGY] API Strategy: {api_config['primary']}")
        
        # Query Yelp for POPULAR businesses (sorted by rating and review count)
        if api_config['primary'] in ['yelp', 'both'] and yelp_client:
            try:
                yelp_params = {
                    'latitude': lat,
                    'longitude': lng,
                    'radius': min(radius, 40000),  # Yelp max is 40km
                    'limit': 20,
                    'sort_by': 'rating'  # Sort by rating for popular places
                }
                
                if api_config['yelp_category']:
                    yelp_params['categories'] = api_config['yelp_category']
                
                yelp_results = yelp_client.search(**yelp_params)
                
                if yelp_results and 'businesses' in yelp_results:
                    for business in yelp_results['businesses']:
                        try:
                            # Filter by minimum review count to ensure popularity
                            if business.get('review_count', 0) >= 10:  # At least 10 reviews
                                place = normalize_yelp_place(business)
                                if place.get('lat') and place.get('lng'):
                                    all_places.append(place)
                        except Exception as e:
                            print(f"[WARN] Error normalizing Yelp business: {e}")
                    
                    print(f"[OK] Yelp returned {len(yelp_results['businesses'])} businesses")
            except Exception as e:
                print(f"[ERROR] Yelp search error: {e}")
        
        # Query OpenTripMap for POPULAR attractions (filtered by rate >= 3)
        if api_config['primary'] in ['otm', 'both'] and otm_client:
            try:
                otm_kinds = api_config['otm_kinds'] or 'interesting_places,tourist_facilities'
                
                otm_results = otm_client.search_radius(
                    latitude=lat,
                    longitude=lng,
                    radius=radius,
                    kinds=otm_kinds,
                    rate=3,  # Minimum rate of 3 (moderately notable) - POPULAR ONLY
                    limit=20
                )
                
                if otm_results and isinstance(otm_results, list):
                    for place in otm_results:
                        try:
                            if place.get('name') and place.get('rate', 0) >= 3:  # Filter popular
                                normalized = normalize_otm_place(place)
                                all_places.append(normalized)
                        except Exception as e:
                            print(f"[WARN] Error normalizing OTM place: {e}")
                    
                    print(f"[OK] OpenTripMap returned {len(otm_results)} places")
            except Exception as e:
                print(f"[ERROR] OpenTripMap search error: {e}")
        
        # Sort by popularity (rating × review_count for Yelp, rate for OTM)
        all_places.sort(key=lambda x: x.get('popularity', 0), reverse=True)
        
        # Clean up and add fallback images
        for place in all_places:
            place.pop('popularity', None)
            place.pop('review_count', None)
            place.pop('rate', None)
            
            if not place.get('image_url'):
                place['image_url'] = 'https://via.placeholder.com/400x250/1a1a2e/6366f1?text=No+Image'
        
        # Return top results (most popular)
        top_places = all_places[:20]
        
        print(f"[OK] Returning {len(top_places)} POPULAR places (sorted by popularity)")
        
        return jsonify({
            'places': top_places,
            'total': len(top_places)
        }), 200
        
    except Exception as e:
        print(f"[ERROR] Error in nearby search: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

def extract_category_from_types(types):
    """Extract category from Google Place types with priority ordering"""
    
    # Print for debugging
    print(f"DEBUG: Extracting category from types: {types}")
    
    # Ensure types is a list
    if not types:
        print("DEBUG: No types provided, defaulting to Attractions")
        return 'Attractions'
    
    if isinstance(types, str):
        types = [types]
    
    # Define priority order - more specific types first
    priority_types = [
        # Food & Dining (highest priority for restaurants)
        'restaurant', 'cafe', 'bar', 'food', 'meal_delivery', 'meal_takeaway', 'bakery',
        # Accommodation
        'lodging', 'hotel', 'motel', 'resort',
        # Specific attractions
        'museum', 'art_gallery', 'zoo', 'aquarium',
        # Parks
        'park', 'amusement_park', 'campground', 'rv_park',
        # Shopping
        'shopping_mall', 'clothing_store', 'department_store', 'electronics_store', 
        'furniture_store', 'book_store', 'store',
        # Entertainment
        'night_club', 'casino', 'stadium', 'movie_theater', 'bowling_alley',
        # Health & Wellness
        'gym', 'spa', 'beauty_salon', 'hair_care', 'hospital', 'doctor', 'dentist', 'pharmacy',
        # Education
        'school', 'university', 'library',
        # Places of Worship
        'church', 'mosque', 'synagogue', 'hindu_temple',
        # Transportation
        'airport', 'bus_station', 'train_station', 'subway_station',
        # Services
        'parking', 'gas_station', 'car_wash', 'bank', 'atm',
        # Government
        'city_hall', 'courthouse', 'police', 'post_office',
        # Generic (lowest priority)
        'landmark', 'tourist_attraction', 'point_of_interest'
    ]
    
    category_mapping = {
        'restaurant': 'Restaurants',
        'cafe': 'Cafes',
        'bar': 'Bars',
        'food': 'Restaurants',
        'meal_delivery': 'Restaurants',
        'meal_takeaway': 'Restaurants',
        'bakery': 'Bakeries',
        'museum': 'Museums',
        'art_gallery': 'Galleries',
        'park': 'Parks',
        'amusement_park': 'Parks',
        'campground': 'Parks',
        'rv_park': 'Parks',
        'tourist_attraction': 'Attractions',
        'zoo': 'Zoos',
        'aquarium': 'Zoos',
        'landmark': 'Landmarks',
        'point_of_interest': 'Attractions',
        'shopping_mall': 'Shopping',
        'store': 'Shopping',
        'clothing_store': 'Shopping',
        'department_store': 'Shopping',
        'electronics_store': 'Shopping',
        'furniture_store': 'Shopping',
        'book_store': 'Shopping',
        'lodging': 'Hotels',
        'hotel': 'Hotels',
        'motel': 'Hotels',
        'resort': 'Hotels',
        'night_club': 'Nightlife',
        'casino': 'Nightlife',
        'stadium': 'Stadiums',
        'movie_theater': 'Theaters',
        'theater': 'Theaters',
        'theatre': 'Theaters',
        'bowling_alley': 'Entertainment',
        'gym': 'Gyms',
        'spa': 'Spas',
        'beauty_salon': 'Spas',
        'hair_care': 'Spas',
        'natural_feature': 'Beaches',
        'beach': 'Beaches',
        'hiking_area': 'Trails',
        'trail': 'Trails',
        'church': 'Landmarks',
        'mosque': 'Landmarks',
        'synagogue': 'Landmarks',
        'hindu_temple': 'Landmarks',
        'airport': 'Transportation',
        'bus_station': 'Transportation',
        'train_station': 'Transportation',
        'subway_station': 'Transportation',
        'parking': 'Services',
        'gas_station': 'Services',
        'car_wash': 'Services',
        'bank': 'Services',
        'atm': 'Services',
        'hospital': 'Healthcare',
        'doctor': 'Healthcare',
        'dentist': 'Healthcare',
        'pharmacy': 'Healthcare',
        'school': 'Education',
        'university': 'Education',
        'library': 'Education',
        'city_hall': 'Government',
        'courthouse': 'Government',
        'police': 'Government',
        'post_office': 'Government'
    }
    
    # Check types in priority order
    for priority_type in priority_types:
        if priority_type in types:
            category = category_mapping.get(priority_type)
            if category:
                print(f"DEBUG: Found match! Type '{priority_type}' -> Category '{category}'")
                return category
    
    # Default to Attractions if no match found
    print(f"DEBUG: No match found in types {types}, defaulting to Attractions")
    return 'Attractions'

# Endpoint to get basic place details (coordinates, etc.)
@app.route('/api/place-details', methods=['GET'])
def get_basic_place_details():
    """Get basic place details (lat/lng) from place_id - Hybrid version"""
    place_id = request.args.get('place_id')
    if not place_id:
        return jsonify({"error": "place_id is required"}), 400
    
    try:
        # Check if it's a Nominatim place_id
        if place_id.startswith('nominatim:'):
            nom_id = place_id.replace('nominatim:', '')
            if nominatim_client:
                # For Nominatim, we need to search by query since we don't have direct lookup by ID
                # Use cached geocoding results or search
                cache_key = f"nominatim:lookup:{nom_id}"
                conn = mysql.connector.connect(**db_config)
                cursor = conn.cursor(dictionary=True)
                cursor.execute("""
                    SELECT data FROM cached_geocoding 
                    WHERE query = %s AND cache_expires_at > NOW()
                """, (cache_key,))
                result = cursor.fetchone()
                conn.close()
                
                if result:
                    data = json.loads(result['data'])
                    return jsonify({
                        "lat": float(data.get('lat')),
                        "lng": float(data.get('lon'))
                    }), 200
            
            return jsonify({"error": "Place not found"}), 404
        
        # Check if it's a Yelp business ID
        elif place_id.startswith('yelp:'):
            business_id = place_id.replace('yelp:', '')
            if yelp_client:
                business = yelp_client.get_business(business_id)
                if business:
                    coords = business.get('coordinates', {})
                    return jsonify({
                        "lat": coords.get('latitude'),
                        "lng": coords.get('longitude')
                    }), 200
            return jsonify({"error": "Business not found"}), 404
        
        # Check if it's an OpenTripMap xid
        elif place_id.startswith('otm:'):
            xid = place_id.replace('otm:', '')
            if otm_client:
                place = otm_client.get_place(xid)
                if place:
                    point = place.get('point', {})
                    return jsonify({
                        "lat": point.get('lat'),
                        "lng": point.get('lon')
                    }), 200
            return jsonify({"error": "Place not found"}), 404
        
        # Legacy Google Place ID - no longer supported
        else:
            return jsonify({"error": "Google Place IDs are no longer supported. Please use Yelp or OpenTripMap place IDs."}), 410
        
    except Exception as e:
        print(f"Error in get_basic_place_details: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# Hybrid endpoint to get place details from Yelp, OpenTripMap, or Google
@app.route('/api/place/<path:place_id>', methods=['GET'])
def get_place_details(place_id):
    """Get place details - Hybrid version supporting yelp:, otm:, nominatim:, and Google place IDs"""
    try:
        # Yelp business details
        if place_id.startswith('yelp:'):
            business_id = place_id.replace('yelp:', '')
            if not yelp_client:
                return jsonify({"error": "Yelp client not configured"}), 500
            
            business = yelp_client.get_business(business_id)
            if not business:
                return jsonify({"error": "Business not found"}), 404
            
            location = business.get('location', {})
            coordinates = business.get('coordinates', {})
            
            # Get photo URLs (Yelp provides up to 3 photos)
            photos = business.get('photos', [])
            if not photos:
                photos = [business.get('image_url')] if business.get('image_url') else []
            
            # Format Yelp categories
            categories = business.get('categories', [])
            category_names = [cat.get('title', '') for cat in categories if cat.get('title')]
            
            place_details = {
                'id': place_id,
                'name': business.get('name', ''),
                'category': ', '.join(category_names[:2]) if category_names else 'Business',
                'address': location.get('display_address', [' '.join(location.get('display_address', []))]),
                'city_name': location.get('city', ''),
                'image_url': photos[0] if photos else 'https://via.placeholder.com/400x250/1a1a2e/6366f1?text=No+Image',
                'photos': photos,
                'rating': business.get('rating', 0),
                'user_ratings_total': business.get('review_count', 0),
                'price_level': len(business.get('price', '')) if business.get('price') else None,
                'phone': business.get('display_phone'),
                'website': business.get('url'),  # Yelp page URL
                'google_maps_url': f"https://www.google.com/maps/search/?api=1&query={coordinates.get('latitude')},{coordinates.get('longitude')}" if coordinates else None,
                'opening_hours': business.get('hours'),
                'lat': coordinates.get('latitude'),
                'lng': coordinates.get('longitude'),
                'source': 'yelp'
            }
            
            return jsonify(place_details), 200
        
        # OpenTripMap place details
        elif place_id.startswith('otm:'):
            xid = place_id.replace('otm:', '')
            if not otm_client:
                return jsonify({"error": "OpenTripMap client not configured"}), 500
            
            place = otm_client.get_place(xid)
            if not place:
                return jsonify({"error": "Place not found"}), 404
            
            point = place.get('point', {})
            preview = place.get('preview', {})
            
            # Get photo (OpenTripMap provides one main photo)
            photo_url = preview.get('source', '') if preview else ''
            photos = [photo_url] if photo_url else []
            
            # Get description/info
            description = place.get('wikipedia_extracts', {}).get('text', '') or place.get('info', {}).get('descr', '')
            
            # Get kinds/category
            kinds = place.get('kinds', '')
            category = kinds.split(',')[0].replace('_', ' ').title() if kinds else 'Attraction'
            
            # Rate is popularity (1-7 scale)
            rate = place.get('rate', 0)
            
            # Get address info
            address_info = place.get('address', {})
            city = address_info.get('city', '') or address_info.get('state', '')
            
            place_details = {
                'id': place_id,
                'name': place.get('name', 'Unknown Place'),
                'category': category,
                'address': address_info.get('road', '') or address_info.get('suburb', ''),
                'city_name': city,
                'image_url': photo_url or 'https://via.placeholder.com/400x250/1a1a2e/6366f1?text=No+Image',
                'photos': photos,
                'rating': min(5.0, rate),  # Convert rate to 5-star scale
                'user_ratings_total': 0,  # OTM doesn't have review counts
                'price_level': None,
                'phone': None,
                'website': place.get('otm'),  # OpenTripMap page
                'wikipedia': place.get('wikipedia'),
                'description': description,
                'google_maps_url': f"https://www.google.com/maps/search/?api=1&query={point.get('lat')},{point.get('lon')}" if point else None,
                'opening_hours': None,
                'lat': point.get('lat'),
                'lng': point.get('lon'),
                'source': 'opentripmap'
            }
            
            return jsonify(place_details), 200
        
        # Legacy Google Place ID - no longer supported
        else:
            return jsonify({"error": "Google Place IDs are no longer supported. Please use Yelp or OpenTripMap place IDs."}), 410
        
    except Exception as e:
        print("Error fetching place details:", e)
        return jsonify({"error": str(e)}), 500

# Calendar API Endpoints
@app.route('/api/calendar/events', methods=['GET'])
def get_calendar_events():
    user_id = request.args.get('user_id')
    chat_groups_id = request.args.get('chat_groups_id')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Build the query dynamically based on provided parameters
        # Note: place_id now stores Google Places place_id instead of MySQL place id
        query = """
        SELECT 
            ce.event_id,
            ce.title,
            ce.description,
            ce.start_date,
            ce.end_date,
            ce.location,
            ce.place_id,
            ce.chat_groups_id,
            g.chat_groups_name,
            ce.created_by
        FROM calendar_events ce
        LEFT JOIN `chat_groups` g ON ce.chat_groups_id = g.chat_groups_id
        WHERE ce.created_by = %s
        """
        
        params = [user_id]
        
        if chat_groups_id:
            query += " AND ce.chat_groups_id = %s"
            params.append(chat_groups_id)
        
        if start_date and end_date:
            query += " AND ce.start_date >= %s AND ce.end_date <= %s"
            params.extend([start_date, end_date])
        
        query += " ORDER BY ce.start_date ASC"
        
        cursor.execute(query, params)
        events = cursor.fetchall()
        
        # For each event with a place_id, fetch place details from Google Places
        for event in events:
            if event['place_id']:
                # Place details no longer fetched (Google Places API removed)
                # Calendar events now only show place_id
                pass
                event['place_name'] = ''
                event['place_address'] = ''
                event['place_category'] = ''
                event['city_name'] = ''
        
        return jsonify(events), 200
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/calendar/events', methods=['POST'])
def create_calendar_event():
    data = request.json
    
    # Required fields
    title = data.get('title')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    created_by = data.get('created_by')
    
    # Optional fields
    description = data.get('description', '')
    location = data.get('location', '')
    place_id = data.get('place_id')  # Google Places place_id
    chat_groups_id = data.get('chat_groups_id')
    
    if not all([title, start_date, end_date, created_by]):
        return jsonify({"error": "Title, start_date, end_date, and created_by are required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        cursor.execute("""
        INSERT INTO calendar_events 
            (title, description, start_date, end_date, location, place_id, chat_groups_id, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (title, description, start_date, end_date, location, place_id, chat_groups_id, created_by))
        
        event_id = cursor.lastrowid
        conn.commit()
        
        return jsonify({
            "message": "Event created successfully",
            "event_id": event_id
        }), 201
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/calendar/events/<int:event_id>', methods=['PUT'])
def update_calendar_event(event_id):
    data = request.json
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Verify user owns this event
        cursor.execute("SELECT created_by FROM calendar_events WHERE event_id = %s", (event_id,))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Event not found"}), 404
        
        if str(result[0]) != str(user_id):
            return jsonify({"error": "Unauthorized"}), 403
        
        # Build update query dynamically
        update_fields = []
        params = []
        
        if 'title' in data:
            update_fields.append("title = %s")
            params.append(data['title'])
        
        if 'description' in data:
            update_fields.append("description = %s")
            params.append(data['description'])
        
        if 'start_date' in data:
            update_fields.append("start_date = %s")
            params.append(data['start_date'])
        
        if 'end_date' in data:
            update_fields.append("end_date = %s")
            params.append(data['end_date'])
        
        if 'location' in data:
            update_fields.append("location = %s")
            params.append(data['location'])
        
        if 'place_id' in data:
            update_fields.append("place_id = %s")
            params.append(data['place_id'])
        
        if 'chat_groups_id' in data:
            update_fields.append("chat_groups_id = %s")
            params.append(data['chat_groups_id'])
        
        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400
        
        params.append(event_id)
        query = f"UPDATE calendar_events SET {', '.join(update_fields)} WHERE event_id = %s"
        
        cursor.execute(query, params)
        conn.commit()
        
        return jsonify({"message": "Event updated successfully"}), 200
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/calendar/events/<int:event_id>', methods=['DELETE'])
def delete_calendar_event(event_id):
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Verify user owns this event
        cursor.execute("SELECT created_by FROM calendar_events WHERE event_id = %s", (event_id,))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Event not found"}), 404
        
        if str(result[0]) != str(user_id):
            return jsonify({"error": "Unauthorized"}), 403
        
        cursor.execute("DELETE FROM calendar_events WHERE event_id = %s", (event_id,))
        conn.commit()
        
        return jsonify({"message": "Event deleted successfully"}), 200
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/calendar/chat_groups/<int:user_id>', methods=['GET'])
def get_user_chat_groups(user_id):
    """Get all chat_groups that a user is part of for calendar selection"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT DISTINCT g.chat_groups_id, g.chat_groups_name
            FROM user_chat_groups ug
            JOIN `chat_groups` g ON ug.chat_groups_id = g.chat_groups_id
            WHERE ug.user_id = %s
            ORDER BY g.chat_groups_name ASC
        """, (user_id,))
        
        chat_groups = cursor.fetchall()
        return jsonify(chat_groups), 200
    
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Homepage/Welcome API
@app.route('/api/welcome/<int:user_id>', methods=['GET'])
def get_welcome_data(user_id):
    """Get personalized welcome data for user homepage"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get user info
        cursor.execute("""
            SELECT first_name, last_name FROM users WHERE user_id = %s
        """, (user_id,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({"error": "User not found"}), 404
        
        # Get upcoming events count
        cursor.execute("""
            SELECT COUNT(*) as count FROM calendar_events 
            WHERE created_by = %s AND start_date >= CURDATE()
        """, (user_id,))
        upcoming_events = cursor.fetchone()['count']
        
        # Get active chat_groups count
        cursor.execute("""
            SELECT COUNT(DISTINCT chat_groups_id) as count FROM user_chat_groups 
            WHERE user_id = %s
        """, (user_id,))
        active_chat_groups = cursor.fetchone()['count']
        
        # Get recent activity (latest messages and events)
        cursor.execute("""
            SELECT 'message' as type, m.messages as content, m.timestamp, g.chat_groups_name as context
            FROM messagess m
            JOIN `chat_groups` g ON m.chat_groups_id = g.chat_groups_id
            JOIN user_chat_groups ug ON g.chat_groups_id = ug.chat_groups_id
            WHERE ug.user_id = %s
            ORDER BY m.timestamp DESC
            LIMIT 5
        """, (user_id,))
        recent_activity = cursor.fetchall()
        
        welcome_data = {
            'user': user,
            'stats': {
                'upcoming_events': upcoming_events,
                'active_chat_groups': active_chat_groups
            },
            'recent_activity': recent_activity
        }
        
        return jsonify(welcome_data), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# Serve React App
@app.route('/')
@app.route('/search')
@app.route('/friends')
@app.route('/chats')
@app.route('/chats/<path:path>')
@app.route('/planner')
@app.route('/login')
@app.route('/register')
def react_routes(path=None):
    return send_from_directory(app.static_folder, 'index.html')

# Trip management routes
@app.route('/api/trips/<int:user_id>', methods=['GET'])
def get_user_trips(user_id):
    """Get all trips for a user"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get trips where user is a participant
        query = """
        SELECT DISTINCT 
            t.*, 
            tp.role,
            (SELECT COUNT(*) FROM trip_participants WHERE trip_id = t.trip_id) as member_count
        FROM trips t
        JOIN trip_participants tp ON t.trip_id = tp.trip_id
        WHERE tp.user_id = %s
        ORDER BY t.created_at DESC
        """
        cursor.execute(query, (user_id,))
        trips = cursor.fetchall()
        
        # Convert date objects to YYYY-MM-DD strings to avoid timezone issues
        for trip in trips:
            if trip.get('start_date'):
                trip['start_date'] = trip['start_date'].strftime('%Y-%m-%d') if hasattr(trip['start_date'], 'strftime') else str(trip['start_date'])
            if trip.get('end_date'):
                trip['end_date'] = trip['end_date'].strftime('%Y-%m-%d') if hasattr(trip['end_date'], 'strftime') else str(trip['end_date'])
            if trip.get('created_at'):
                trip['created_at'] = trip['created_at'].isoformat() if hasattr(trip['created_at'], 'isoformat') else str(trip['created_at'])
        
        return jsonify({"trips": trips})
        
    except Exception as e:
        print(f"Database error in get_user_trips: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/trips', methods=['POST'])
def create_trip():
    """Create a new trip"""
    data = request.json
    trip_name = data.get('trip_name')
    description = data.get('description')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    created_by = data.get('created_by')
    member_ids = data.get('member_ids', [])  # List of friend user_ids to add to the trip
    
    if not all([trip_name, start_date, end_date, created_by]):
        return jsonify({"error": "Missing required fields"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Create trip
        trip_query = """
        INSERT INTO trips (trip_name, description, start_date, end_date, created_by)
        VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(trip_query, (trip_name, description, start_date, end_date, created_by))
        trip_id = cursor.lastrowid
        
        # Add creator as trip participant
        participant_query = """
        INSERT INTO trip_participants (trip_id, user_id, role)
        VALUES (%s, %s, 'owner')
        """
        cursor.execute(participant_query, (trip_id, created_by))
        
        # Add invited friends as trip participants
        for member_id in member_ids:
            cursor.execute(participant_query.replace("'owner'", "'member'"), (trip_id, member_id))
        
        # Create group chat for the trip
        chat_query = """
        INSERT INTO group_chats (trip_id, chat_name)
        VALUES (%s, %s)
        """
        cursor.execute(chat_query, (trip_id, f"{trip_name} Chat"))
        chat_id = cursor.lastrowid
        
        # Add creator to group chat
        chat_participant_query = """
        INSERT INTO chat_participants (chat_id, user_id)
        VALUES (%s, %s)
        """
        cursor.execute(chat_participant_query, (chat_id, created_by))
        
        # Add invited friends to group chat
        for member_id in member_ids:
            cursor.execute(chat_participant_query, (chat_id, member_id))
        
        # Add trip destinations if provided
        destinations = data.get('destinations', [])
        if destinations:
            dest_query = """
            INSERT INTO trip_destinations (trip_id, destination, place_id, lat, lng, start_date, end_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
            for dest in destinations:
                cursor.execute(dest_query, (
                    trip_id,
                    dest.get('destination'),
                    dest.get('place_id'),
                    dest.get('lat'),
                    dest.get('lng'),
                    dest.get('start_date'),
                    dest.get('end_date')
                ))
        
        conn.commit()
        
        return jsonify({
            "success": True,
            "trip_id": trip_id,
            "chat_id": chat_id,
            "message": "Trip created successfully"
        }), 201
        
    except Exception as e:
        print(f"Database error in create_trip: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/trips/<int:trip_id>', methods=['PUT'])
def update_trip(trip_id):
    """Update trip basic information (name, description)"""
    data = request.json
    user_id = data.get('user_id')
    trip_name = data.get('trip_name')
    description = data.get('description')
    
    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants 
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        participant = cursor.fetchone()
        
        if not participant or participant['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only trip owners/admins can edit trip details"}), 403
        
        # Update trip
        update_query = "UPDATE trips SET "
        params = []
        if trip_name is not None:
            update_query += "trip_name = %s, "
            params.append(trip_name)
        if description is not None:
            update_query += "description = %s, "
            params.append(description)
        
        update_query = update_query.rstrip(', ') + " WHERE trip_id = %s"
        params.append(trip_id)
        
        cursor.execute(update_query, params)
        conn.commit()
        
        return jsonify({"success": True, "message": "Trip updated successfully"}), 200
        
    except Exception as e:
        print(f"Error updating trip: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/trips/<int:trip_id>/dates', methods=['PUT'])
def update_trip_dates(trip_id):
    """Update trip dates and remap planner items"""
    data = request.json
    user_id = data.get('user_id')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    
    if not all([user_id, start_date, end_date]):
        return jsonify({"error": "Missing required fields"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants 
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        participant = cursor.fetchone()
        
        if not participant or participant['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only trip owners/admins can edit trip dates"}), 403
        
        # Get old dates
        cursor.execute("SELECT start_date, end_date FROM trips WHERE trip_id = %s", (trip_id,))
        old_trip = cursor.fetchone()
        old_start = old_trip['start_date']
        old_end = old_trip['end_date']
        
        # Update trip dates
        cursor.execute("""
            UPDATE trips 
            SET start_date = %s, end_date = %s
            WHERE trip_id = %s
        """, (start_date, end_date, trip_id))
        
        # Remap planner items if dates changed
        items_remapped = 0
        if old_start != start_date or old_end != end_date:
            # Get all planner items for this trip
            cursor.execute("""
                SELECT planner_id, start_date 
                FROM planner 
                WHERE trip_id = %s
                ORDER BY start_date
            """, (trip_id,))
            items = cursor.fetchall()
            
            if items:
                # Calculate date mappings
                from datetime import datetime, timedelta
                old_start_dt = datetime.strptime(str(old_start), '%Y-%m-%d')
                new_start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                
                for item in items:
                    if item['start_date']:
                        item_date = datetime.strptime(str(item['start_date']), '%Y-%m-%d')
                        days_from_start = (item_date - old_start_dt).days
                        new_item_date = new_start_dt + timedelta(days=days_from_start)
                        new_date_str = new_item_date.strftime('%Y-%m-%d')
                        
                        cursor.execute("""
                            UPDATE planner 
                            SET start_date = %s, end_date = %s
                            WHERE planner_id = %s
                        """, (new_date_str, new_date_str, item['planner_id']))
                        items_remapped += 1
        
        conn.commit()
        
        return jsonify({
            "success": True,
            "message": "Dates updated successfully",
            "items_remapped": items_remapped
        }), 200
        
    except Exception as e:
        print(f"Error updating trip dates: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/trips/<int:trip_id>/destinations', methods=['GET'])
def get_trip_destinations(trip_id):
    """Get all destinations for a trip"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT destination_id, destination, place_id, lat, lng, start_date, end_date
            FROM trip_destinations
            WHERE trip_id = %s
            ORDER BY start_date
        """, (trip_id,))
        destinations = cursor.fetchall()
        
        # Convert dates to YYYY-MM-DD format
        for dest in destinations:
            if dest.get('start_date'):
                dest['start_date'] = dest['start_date'].strftime('%Y-%m-%d') if hasattr(dest['start_date'], 'strftime') else str(dest['start_date'])
            if dest.get('end_date'):
                dest['end_date'] = dest['end_date'].strftime('%Y-%m-%d') if hasattr(dest['end_date'], 'strftime') else str(dest['end_date'])
        
        return jsonify({"destinations": destinations}), 200
        
    except Exception as e:
        print(f"Error fetching trip destinations: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/trips/<int:trip_id>/destinations/<int:destination_id>', methods=['PUT'])
def update_destination_dates(trip_id, destination_id):
    """Update destination dates"""
    data = request.json
    user_id = data.get('user_id')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    
    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants 
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        participant = cursor.fetchone()
        
        if not participant or participant['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only trip owners/admins can edit destinations"}), 403
        
        # Update destination dates
        cursor.execute("""
            UPDATE trip_destinations 
            SET start_date = %s, end_date = %s
            WHERE destination_id = %s AND trip_id = %s
        """, (start_date, end_date, destination_id, trip_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Destination dates updated"}), 200
        
    except Exception as e:
        print(f"Error updating destination: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/trips/<int:trip_id>/members', methods=['GET'])
def get_trip_members(trip_id):
    """Get all members of a trip"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT 
            u.user_id,
            u.username,
            u.first_name,
            u.last_name,
            tp.role
        FROM trip_participants tp
        JOIN users u ON tp.user_id = u.user_id
        WHERE tp.trip_id = %s
        ORDER BY 
            CASE tp.role
                WHEN 'owner' THEN 1
                WHEN 'admin' THEN 2
                ELSE 3
            END,
            u.first_name
        """
        cursor.execute(query, (trip_id,))
        members = cursor.fetchall()
        
        return jsonify({"members": members}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/members', methods=['POST'])
def add_trip_member(trip_id):
    """Add a member to a trip (owner/admin only)"""
    data = request.json
    user_id = data.get('user_id')  # Person adding the member
    member_id = data.get('member_id')  # Person being added
    
    if not user_id or not member_id:
        return jsonify({"error": "user_id and member_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        user_role = cursor.fetchone()
        if not user_role or user_role['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only owners and admins can add members"}), 403
        
        # Check if member is already in the trip
        cursor.execute("""
            SELECT 1 FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, member_id))
        
        if cursor.fetchone():
            return jsonify({"error": "User is already a member of this trip"}), 400
        
        # Add member to trip
        cursor.execute("""
            INSERT INTO trip_participants (trip_id, user_id, role)
            VALUES (%s, %s, 'member')
        """, (trip_id, member_id))
        
        # Add member to trip's group chat
        cursor.execute("""
            SELECT chat_id FROM group_chats WHERE trip_id = %s
        """, (trip_id,))
        
        chat = cursor.fetchone()
        if chat:
            cursor.execute("""
                INSERT INTO chat_participants (chat_id, user_id)
                VALUES (%s, %s)
            """, (chat['chat_id'], member_id))
        
        # Create notification for the added member
        cursor.execute("""
            INSERT INTO trip_notifications (user_id, trip_id, added_by_user_id)
            VALUES (%s, %s, %s)
        """, (member_id, trip_id, user_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Member added successfully"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/members/<int:member_id>', methods=['DELETE'])
def remove_trip_member(trip_id, member_id):
    """Remove a member from a trip (owner/admin only, cannot remove owner)"""
    data = request.json
    user_id = data.get('user_id')  # Person removing the member
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        user_role = cursor.fetchone()
        if not user_role or user_role['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only owners and admins can remove members"}), 403
        
        # Check if member being removed is the owner
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, member_id))
        
        member_role = cursor.fetchone()
        if member_role and member_role['role'] == 'owner':
            return jsonify({"error": "Cannot remove the trip owner"}), 400
        
        # Remove member from trip
        cursor.execute("""
            DELETE FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, member_id))
        
        # Remove member from trip's group chat
        cursor.execute("""
            SELECT chat_id FROM group_chats WHERE trip_id = %s
        """, (trip_id,))
        
        chat = cursor.fetchone()
        if chat:
            cursor.execute("""
                DELETE FROM chat_participants
                WHERE chat_id = %s AND user_id = %s
            """, (chat['chat_id'], member_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Member removed successfully"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# ===== TRIP MEMBER REQUEST ROUTES =====

@app.route('/api/trips/<int:trip_id>/member-requests', methods=['POST'])
def request_add_trip_member(trip_id):
    """Request to add a friend to a trip (any member can request)"""
    data = request.json
    requester_id = data.get('requester_id')  # Person making the request
    friend_id = data.get('friend_id')  # Person to be added
    
    if not requester_id or not friend_id:
        return jsonify({"error": "requester_id and friend_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if requester is a member of the trip
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, requester_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "You must be a trip member to request additions"}), 403
        
        # Check if friend is already in the trip
        cursor.execute("""
            SELECT 1 FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, friend_id))
        
        if cursor.fetchone():
            return jsonify({"error": "User is already a member of this trip"}), 400
        
        # Check if request already exists
        cursor.execute("""
            SELECT id FROM trip_member_requests
            WHERE trip_id = %s AND friend_id = %s AND status = 'pending'
        """, (trip_id, friend_id))
        
        if cursor.fetchone():
            return jsonify({"error": "A pending request already exists for this user"}), 400
        
        # Check if requester is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, requester_id))
        
        requester_role = cursor.fetchone()
        is_owner_or_admin = requester_role and requester_role['role'] in ['owner', 'admin']
        
        # Create the request
        # If requester is owner/admin, auto-approve owner side
        cursor.execute("""
            INSERT INTO trip_member_requests (trip_id, requester_id, friend_id, status, owner_approved, friend_accepted)
            VALUES (%s, %s, %s, 'pending', %s, FALSE)
        """, (trip_id, requester_id, friend_id, is_owner_or_admin))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request sent to trip owner"}), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/member-requests', methods=['GET'])
def get_trip_member_requests(trip_id):
    """Get all pending member requests for a trip (requests from non-owners that need owner approval)"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        user_role = cursor.fetchone()
        if not user_role or user_role['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only owners and admins can view requests"}), 403
        
        # Get pending requests ONLY from non-owners/non-admins (actual requests needing approval)
        # Invitations sent by owners/admins go to the friend, not shown here
        cursor.execute("""
            SELECT 
                tmr.id as request_id,
                tmr.requester_id,
                tmr.friend_id,
                tmr.created_at,
                u1.first_name as requester_first_name,
                u1.last_name as requester_last_name,
                u1.username as requester_username,
                u2.first_name as friend_first_name,
                u2.last_name as friend_last_name,
                u2.username as friend_username,
                tp.role as requester_role
            FROM trip_member_requests tmr
            JOIN users u1 ON tmr.requester_id = u1.user_id
            JOIN users u2 ON tmr.friend_id = u2.user_id
            LEFT JOIN trip_participants tp ON tmr.trip_id = tp.trip_id AND tmr.requester_id = tp.user_id
            WHERE tmr.trip_id = %s 
              AND tmr.status = 'pending'
              AND (tp.role IS NULL OR tp.role NOT IN ('owner', 'admin'))
            ORDER BY tmr.created_at DESC
        """, (trip_id,))
        
        requests = cursor.fetchall()
        
        return jsonify({"requests": requests}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/sent-invitations', methods=['GET'])
def get_sent_invitations(trip_id):
    """Get all pending invitations sent by owners/admins for this trip"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is a member of the trip
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "You must be a trip member to view invitations"}), 403
        
        # Get pending invitations sent by owners/admins (these are pending friend acceptances)
        cursor.execute("""
            SELECT 
                tmr.id as invitation_id,
                tmr.requester_id,
                tmr.friend_id,
                tmr.created_at,
                u.first_name,
                u.last_name,
                u.username,
                tp.role as requester_role
            FROM trip_member_requests tmr
            JOIN users u ON tmr.friend_id = u.user_id
            LEFT JOIN trip_participants tp ON tmr.trip_id = tp.trip_id AND tmr.requester_id = tp.user_id
            WHERE tmr.trip_id = %s 
              AND tmr.status = 'pending'
              AND tp.role IN ('owner', 'admin')
            ORDER BY tmr.created_at DESC
        """, (trip_id,))
        
        invitations = cursor.fetchall()
        
        return jsonify({"invitations": invitations}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/my-requests', methods=['GET'])
def get_my_trip_requests(trip_id):
    """Get pending requests that I (the current user) have made for this trip"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is a member of the trip
        cursor.execute("""
            SELECT 1 FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "You must be a trip member to view your requests"}), 403
        
        # Get pending requests made by this user
        cursor.execute("""
            SELECT 
                tmr.id as request_id,
                tmr.friend_id,
                tmr.created_at,
                tmr.owner_approved,
                tmr.friend_accepted,
                u.first_name,
                u.last_name,
                u.username
            FROM trip_member_requests tmr
            JOIN users u ON tmr.friend_id = u.user_id
            WHERE tmr.trip_id = %s 
              AND tmr.requester_id = %s
              AND tmr.status = 'pending'
            ORDER BY tmr.created_at DESC
        """, (trip_id, user_id))
        
        requests = cursor.fetchall()
        
        return jsonify({"requests": requests}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/member-requests/<int:request_id>/approve', methods=['POST'])
def approve_trip_member_request(trip_id, request_id):
    """Approve a member addition request (owner/admin only)"""
    data = request.json
    user_id = data.get('user_id')  # Person approving
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        user_role = cursor.fetchone()
        if not user_role or user_role['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only owners and admins can approve requests"}), 403
        
        # Get request details
        cursor.execute("""
            SELECT friend_id FROM trip_member_requests
            WHERE id = %s AND trip_id = %s AND status = 'pending'
        """, (request_id, trip_id))
        
        request_data = cursor.fetchone()
        if not request_data:
            return jsonify({"error": "Request not found or already processed"}), 404
        
        friend_id = request_data['friend_id']
        
        # Mark as owner approved
        cursor.execute("""
            UPDATE trip_member_requests
            SET owner_approved = TRUE, approved_by = %s, updated_at = NOW()
            WHERE id = %s
        """, (user_id, request_id))
        
        # Check if friend has also accepted
        cursor.execute("""
            SELECT friend_accepted FROM trip_member_requests
            WHERE id = %s
        """, (request_id,))
        
        request_status = cursor.fetchone()
        
        # If both have approved, add member to trip
        if request_status and request_status['friend_accepted']:
            # Add member to trip
            cursor.execute("""
                INSERT INTO trip_participants (trip_id, user_id, role)
                VALUES (%s, %s, 'member')
            """, (trip_id, friend_id))
            
            # Add member to trip's group chat
            cursor.execute("""
                SELECT chat_id FROM group_chats WHERE trip_id = %s
            """, (trip_id,))
            
            chat = cursor.fetchone()
            if chat:
                cursor.execute("""
                    INSERT INTO chat_participants (chat_id, user_id)
                    VALUES (%s, %s)
                """, (chat['chat_id'], friend_id))
            
            # Update request status to approved
            cursor.execute("""
                UPDATE trip_member_requests
                SET status = 'approved'
                WHERE id = %s
            """, (request_id,))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request approved and member added"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>/member-requests/<int:request_id>/reject', methods=['POST'])
def reject_trip_member_request(trip_id, request_id):
    """Reject a member addition request (owner/admin only)"""
    data = request.json
    user_id = data.get('user_id')  # Person rejecting
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is owner or admin
        cursor.execute("""
            SELECT role FROM trip_participants
            WHERE trip_id = %s AND user_id = %s
        """, (trip_id, user_id))
        
        user_role = cursor.fetchone()
        if not user_role or user_role['role'] not in ['owner', 'admin']:
            return jsonify({"error": "Only owners and admins can reject requests"}), 403
        
        # Update request status
        cursor.execute("""
            UPDATE trip_member_requests
            SET status = 'rejected', approved_by = %s, updated_at = NOW()
            WHERE id = %s AND trip_id = %s AND status = 'pending'
        """, (user_id, request_id, trip_id))
        
        if cursor.rowcount == 0:
            return jsonify({"error": "Request not found or already processed"}), 404
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request rejected"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# ===== TRIP INVITATION ROUTES (for invited friends to accept/decline) =====

@app.route('/api/users/<int:user_id>/trip-invitations', methods=['GET'])
def get_user_trip_invitations(user_id):
    """Get all pending trip invitations for a user"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get invitations where this user is the friend_id (invited person)
        cursor.execute("""
            SELECT 
                tmr.id as invitation_id,
                tmr.trip_id,
                tmr.requester_id,
                tmr.created_at,
                t.trip_name,
                t.description,
                t.start_date,
                t.end_date,
                u.first_name as inviter_first_name,
                u.last_name as inviter_last_name,
                u.username as inviter_username
            FROM trip_member_requests tmr
            JOIN trips t ON tmr.trip_id = t.trip_id
            JOIN users u ON tmr.requester_id = u.user_id
            WHERE tmr.friend_id = %s AND tmr.status = 'pending'
            ORDER BY tmr.created_at DESC
        """, (user_id,))
        
        invitations = cursor.fetchall()
        
        return jsonify({"invitations": invitations}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trip-invitations/<int:invitation_id>/accept', methods=['POST'])
def accept_trip_invitation(invitation_id):
    """Accept a trip invitation (invited friend accepts)"""
    data = request.json
    user_id = data.get('user_id')  # Person accepting (should be friend_id)
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get invitation details and verify user is the invited person
        cursor.execute("""
            SELECT trip_id, friend_id FROM trip_member_requests
            WHERE id = %s AND status = 'pending'
        """, (invitation_id,))
        
        invitation = cursor.fetchone()
        if not invitation:
            return jsonify({"error": "Invitation not found or already processed"}), 404
        
        if invitation['friend_id'] != user_id:
            return jsonify({"error": "You are not authorized to accept this invitation"}), 403
        
        trip_id = invitation['trip_id']
        
        # Mark as friend accepted
        cursor.execute("""
            UPDATE trip_member_requests
            SET friend_accepted = TRUE, updated_at = NOW()
            WHERE id = %s
        """, (invitation_id,))
        
        # Check if owner has also approved
        cursor.execute("""
            SELECT owner_approved FROM trip_member_requests
            WHERE id = %s
        """, (invitation_id,))
        
        request_status = cursor.fetchone()
        
        # If both have approved, add member to trip
        if request_status and request_status['owner_approved']:
            # Add user to trip
            cursor.execute("""
                INSERT INTO trip_participants (trip_id, user_id, role)
                VALUES (%s, %s, 'member')
            """, (trip_id, user_id))
            
            # Add user to trip's group chat
            cursor.execute("""
                SELECT chat_id FROM group_chats WHERE trip_id = %s
            """, (trip_id,))
            
            chat = cursor.fetchone()
            if chat:
                cursor.execute("""
                    INSERT INTO chat_participants (chat_id, user_id)
                    VALUES (%s, %s)
                """, (chat['chat_id'], user_id))
            
            # Update invitation status to approved
            cursor.execute("""
                UPDATE trip_member_requests
                SET status = 'approved', approved_by = %s
                WHERE id = %s
            """, (user_id, invitation_id))
        
        conn.commit()
        
        # Return appropriate message
        if request_status and request_status['owner_approved']:
            return jsonify({"success": True, "message": "Invitation accepted! You've been added to the trip.", "added": True}), 200
        else:
            return jsonify({"success": True, "message": "Invitation accepted! Waiting for trip owner approval.", "added": False}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trip-invitations/<int:invitation_id>/decline', methods=['POST'])
def decline_trip_invitation(invitation_id):
    """Decline a trip invitation (invited friend declines)"""
    data = request.json
    user_id = data.get('user_id')  # Person declining (should be friend_id)
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Verify user is the invited person
        cursor.execute("""
            SELECT friend_id FROM trip_member_requests
            WHERE id = %s AND status = 'pending'
        """, (invitation_id,))
        
        invitation = cursor.fetchone()
        if not invitation:
            return jsonify({"error": "Invitation not found or already processed"}), 404
        
        if invitation['friend_id'] != user_id:
            return jsonify({"error": "You are not authorized to decline this invitation"}), 403
        
        # Update invitation status
        cursor.execute("""
            UPDATE trip_member_requests
            SET status = 'rejected', approved_by = %s, updated_at = NOW()
            WHERE id = %s
        """, (user_id, invitation_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Invitation declined"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

# ===== CHAT MEMBER REQUEST ROUTES =====

@app.route('/api/chats/<int:chat_id>/member-requests', methods=['POST'])
def request_add_chat_member(chat_id):
    """Request to add a friend to a chat (any chat participant can request, owner must approve)"""
    data = request.json
    requester_id = data.get('requester_id')  # Person making the request
    friend_id = data.get('friend_id')  # Person to be added
    
    if not requester_id or not friend_id:
        return jsonify({"error": "requester_id and friend_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if requester is a participant of the chat
        cursor.execute("""
            SELECT 1 FROM chat_participants
            WHERE chat_id = %s AND user_id = %s
        """, (chat_id, requester_id))
        
        if not cursor.fetchone():
            return jsonify({"error": "You must be a chat participant to request additions"}), 403
        
        # Check if friend is already in the chat
        cursor.execute("""
            SELECT 1 FROM chat_participants
            WHERE chat_id = %s AND user_id = %s
        """, (chat_id, friend_id))
        
        if cursor.fetchone():
            return jsonify({"error": "User is already a member of this chat"}), 400
        
        # Check if request already exists
        cursor.execute("""
            SELECT id FROM chat_member_requests
            WHERE chat_id = %s AND friend_id = %s AND status = 'pending'
        """, (chat_id, friend_id))
        
        if cursor.fetchone():
            return jsonify({"error": "A pending request already exists for this user"}), 400
        
        # Create the request
        cursor.execute("""
            INSERT INTO chat_member_requests (chat_id, requester_id, friend_id, status)
            VALUES (%s, %s, %s, 'pending')
        """, (chat_id, requester_id, friend_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request sent to chat owner"}), 201
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/chats/<int:chat_id>/member-requests', methods=['GET'])
def get_chat_member_requests(chat_id):
    """Get all pending member requests for a chat (owner/admin only for trip chats)"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get chat details to check if it's a trip chat
        cursor.execute("""
            SELECT trip_id FROM group_chats WHERE chat_id = %s
        """, (chat_id,))
        
        chat_info = cursor.fetchone()
        
        # If it's a trip chat, check if user is owner or admin
        if chat_info and chat_info['trip_id']:
            cursor.execute("""
                SELECT role FROM trip_participants
                WHERE trip_id = %s AND user_id = %s
            """, (chat_info['trip_id'], user_id))
            
            user_role = cursor.fetchone()
            if not user_role or user_role['role'] not in ['owner', 'admin']:
                return jsonify({"error": "Only trip owners and admins can view requests"}), 403
        else:
            # For non-trip chats, any participant can view
            cursor.execute("""
                SELECT 1 FROM chat_participants
                WHERE chat_id = %s AND user_id = %s
            """, (chat_id, user_id))
            
            if not cursor.fetchone():
                return jsonify({"error": "You must be a chat participant to view requests"}), 403
        
        # Get all pending requests
        cursor.execute("""
            SELECT 
                cmr.id as request_id,
                cmr.requester_id,
                cmr.friend_id,
                cmr.created_at,
                u1.first_name as requester_first_name,
                u1.last_name as requester_last_name,
                u1.username as requester_username,
                u2.first_name as friend_first_name,
                u2.last_name as friend_last_name,
                u2.username as friend_username
            FROM chat_member_requests cmr
            JOIN users u1 ON cmr.requester_id = u1.user_id
            JOIN users u2 ON cmr.friend_id = u2.user_id
            WHERE cmr.chat_id = %s AND cmr.status = 'pending'
            ORDER BY cmr.created_at DESC
        """, (chat_id,))
        
        requests = cursor.fetchall()
        
        return jsonify({"requests": requests}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/chats/<int:chat_id>/member-requests/<int:request_id>/approve', methods=['POST'])
def approve_chat_member_request(chat_id, request_id):
    """Approve a chat member addition request (owner/admin only for trip chats)"""
    data = request.json
    user_id = data.get('user_id')  # Person approving
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get chat details to check if it's a trip chat
        cursor.execute("""
            SELECT trip_id FROM group_chats WHERE chat_id = %s
        """, (chat_id,))
        
        chat_info = cursor.fetchone()
        
        # If it's a trip chat, check if user is owner or admin
        if chat_info and chat_info['trip_id']:
            cursor.execute("""
                SELECT role FROM trip_participants
                WHERE trip_id = %s AND user_id = %s
            """, (chat_info['trip_id'], user_id))
            
            user_role = cursor.fetchone()
            if not user_role or user_role['role'] not in ['owner', 'admin']:
                return jsonify({"error": "Only trip owners and admins can approve requests"}), 403
        
        # Get request details
        cursor.execute("""
            SELECT friend_id FROM chat_member_requests
            WHERE id = %s AND chat_id = %s AND status = 'pending'
        """, (request_id, chat_id))
        
        request_data = cursor.fetchone()
        if not request_data:
            return jsonify({"error": "Request not found or already processed"}), 404
        
        friend_id = request_data['friend_id']
        
        # Add member to chat
        cursor.execute("""
            INSERT INTO chat_participants (chat_id, user_id)
            VALUES (%s, %s)
        """, (chat_id, friend_id))
        
        # If this is a trip chat, also add to trip
        if chat_info and chat_info['trip_id']:
            # Check if already in trip
            cursor.execute("""
                SELECT 1 FROM trip_participants
                WHERE trip_id = %s AND user_id = %s
            """, (chat_info['trip_id'], friend_id))
            
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO trip_participants (trip_id, user_id, role)
                    VALUES (%s, %s, 'member')
                """, (chat_info['trip_id'], friend_id))
        
        # Update request status
        cursor.execute("""
            UPDATE chat_member_requests
            SET status = 'approved', approved_by = %s, updated_at = NOW()
            WHERE id = %s
        """, (user_id, request_id))
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request approved and member added"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/chats/<int:chat_id>/member-requests/<int:request_id>/reject', methods=['POST'])
def reject_chat_member_request(chat_id, request_id):
    """Reject a chat member addition request (owner/admin only for trip chats)"""
    data = request.json
    user_id = data.get('user_id')  # Person rejecting
    
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get chat details to check if it's a trip chat
        cursor.execute("""
            SELECT trip_id FROM group_chats WHERE chat_id = %s
        """, (chat_id,))
        
        chat_info = cursor.fetchone()
        
        # If it's a trip chat, check if user is owner or admin
        if chat_info and chat_info['trip_id']:
            cursor.execute("""
                SELECT role FROM trip_participants
                WHERE trip_id = %s AND user_id = %s
            """, (chat_info['trip_id'], user_id))
            
            user_role = cursor.fetchone()
            if not user_role or user_role['role'] not in ['owner', 'admin']:
                return jsonify({"error": "Only trip owners and admins can reject requests"}), 403
        
        # Update request status
        cursor.execute("""
            UPDATE chat_member_requests
            SET status = 'rejected', approved_by = %s, updated_at = NOW()
            WHERE id = %s AND chat_id = %s AND status = 'pending'
        """, (user_id, request_id, chat_id))
        
        if cursor.rowcount == 0:
            return jsonify({"error": "Request not found or already processed"}), 404
        
        conn.commit()
        
        return jsonify({"success": True, "message": "Request rejected"}), 200
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        return jsonify({"error": "Database error occurred"}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()

@app.route('/api/trips/<int:trip_id>', methods=['DELETE'])
def delete_trip(trip_id):
    """Delete a trip (only owner can delete)"""
    data = request.json
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({"error": "User ID is required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Check if user is the owner of the trip
        check_query = """
        SELECT role FROM trip_participants
        WHERE trip_id = %s AND user_id = %s
        """
        cursor.execute(check_query, (trip_id, user_id))
        result = cursor.fetchone()
        
        if not result or result[0] != 'owner':
            return jsonify({"error": "Only the trip owner can delete this trip"}), 403
        
        # Delete related records first (foreign key constraints)
        # Delete planner items
        cursor.execute("DELETE FROM planner WHERE trip_id = %s", (trip_id,))
        
        # Delete chat messages
        cursor.execute("""
            DELETE FROM chat_messages 
            WHERE chat_id IN (SELECT chat_id FROM group_chats WHERE trip_id = %s)
        """, (trip_id,))
        
        # Delete chat participants
        cursor.execute("""
            DELETE FROM chat_participants 
            WHERE chat_id IN (SELECT chat_id FROM group_chats WHERE trip_id = %s)
        """, (trip_id,))
        
        # Delete group chats
        cursor.execute("DELETE FROM group_chats WHERE trip_id = %s", (trip_id,))
        
        # Delete trip participants
        cursor.execute("DELETE FROM trip_participants WHERE trip_id = %s", (trip_id,))
        
        # Finally, delete the trip itself
        cursor.execute("DELETE FROM trips WHERE trip_id = %s", (trip_id,))
        
        conn.commit()
        
        return jsonify({
            "success": True,
            "message": "Trip deleted successfully"
        }), 200
        
    except Exception as e:
        print(f"Database error in delete_trip: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    finally:
        if conn:
            conn.close()

# Planner routes
@app.route('/api/planner/<int:trip_id>', methods=['GET'])
def get_planner_items(trip_id):
    """Get all planner items for a trip"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT p.*, u.username as created_by_username
        FROM planner p
        JOIN users u ON p.created_by = u.user_id
        WHERE p.trip_id = %s
        ORDER BY p.start_date, p.order_index, p.start_time, p.planner_id
        """
        cursor.execute(query, (trip_id,))
        items = cursor.fetchall()
        
        # Convert date and time objects to ISO format strings and fetch photos from Google API
        for item in items:
            
            if item.get('start_date'):
                item['start_date'] = item['start_date'].strftime('%Y-%m-%d') if hasattr(item['start_date'], 'strftime') else str(item['start_date'])[:10]
            if item.get('end_date'):
                item['end_date'] = item['end_date'].strftime('%Y-%m-%d') if hasattr(item['end_date'], 'strftime') else str(item['end_date'])[:10]
            # Convert time objects to string format (HH:MM:SS)
            if item.get('start_time'):
                item['start_time'] = str(item['start_time']) if item['start_time'] else None
            if item.get('end_time'):
                item['end_time'] = str(item['end_time']) if item['end_time'] else None
            
            # Use stored image_url from database
            if not item.get('image_url'):
                item['image_url'] = 'https://via.placeholder.com/400x250/1a1a2e/6366f1?text=No+Image'
            
            # Set photo_url for frontend compatibility
            item['photo_url'] = item.get('image_url')
        
        # Just return items immediately - distance calculation happens separately
        # Frontend will call /api/planner/calculate-distances separately if needed
        
        return jsonify({"items": items})
        
    except Exception as e:
        print(f"Database error in get_planner_items: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items', methods=['POST'])
def create_planner_item():
    """Create a new planner item - HYBRID VERSION (Yelp/OpenTripMap)"""
    data = request.json
    trip_id = data.get('trip_id')
    item_name = data.get('item_name')
    item_type = data.get('item_type', 'custom')
    description = data.get('description')
    location = data.get('location')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    cost = data.get('cost')
    notes = data.get('notes')
    created_by = data.get('created_by')
    google_place_id = data.get('google_place_id')  # Can be yelp:xxx, otm:xxx, or legacy Google ID
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    image_url = data.get('image_url')  # NEW: Get image from request
    rating = data.get('rating')  # NEW: Get rating from request
    
    print(f"[ADD-ITEM] Creating planner item: {item_name} for trip {trip_id}")
    print(f"[ADD-ITEM] Coordinates: lat={latitude}, lng={longitude}, place_id={google_place_id}")
    print(f"[ADD-ITEM] Image: {image_url}")
    
    if not all([trip_id, item_name, start_date, created_by]):
        return jsonify({"error": "Missing required fields"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        # Get the next order_index for this trip and date
        cursor.execute("""
            SELECT COALESCE(MAX(order_index), -1) + 1 as next_order
            FROM planner
            WHERE trip_id = %s AND start_date = %s
        """, (trip_id, start_date))
        next_order = cursor.fetchone()[0]
        
        # Ensure image has a fallback
        if not image_url:
            image_url = 'https://via.placeholder.com/400x250/1a1a2e/6366f1?text=No+Image'
        
        # Create planner item with image_url
        item_query = """
        INSERT INTO planner (trip_id, item_name, item_type, description, location, 
                           start_date, end_date, start_time, end_time, cost, notes, created_by, 
                           google_place_id, latitude, longitude, order_index, image_url, rating)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(item_query, (
            trip_id, item_name, item_type, description, location,
            start_date, end_date, start_time, end_time, cost, notes, created_by, 
            google_place_id, latitude, longitude, next_order, image_url, rating
        ))
        planner_id = cursor.lastrowid
        
        # If place_id is provided, store the place and link it (HYBRID VERSION)
        if google_place_id:
            try:
                # Determine source from place_id prefix
                if google_place_id.startswith('yelp:'):
                    # Yelp business
                    business_id = google_place_id.replace('yelp:', '')
                    if yelp_client:
                        business = yelp_client.get_business(business_id)
                        if business:
                            location_data = business.get('location', {})
                            coordinates = business.get('coordinates', {})
                            
                            # Store in google_places table (renamed for compatibility)
                            place_query = """
                            INSERT INTO google_places (place_id, name, address, latitude, longitude, place_type, rating)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            ON DUPLICATE KEY UPDATE
                            name = VALUES(name), address = VALUES(address), 
                            latitude = VALUES(latitude), longitude = VALUES(longitude),
                            place_type = VALUES(place_type), rating = VALUES(rating)
                            """
                            cursor.execute(place_query, (
                                google_place_id,
                                business.get('name', ''),
                                location_data.get('address1', ''),
                                coordinates.get('latitude'),
                                coordinates.get('longitude'),
                                'yelp_business',
                                business.get('rating')
                            ))
                            
                            # Link planner item to place
                            link_query = """
                            INSERT INTO planner_places (planner_id, google_place_id, place_source)
                            VALUES (%s, %s, 'yelp')
                            """
                            cursor.execute(link_query, (planner_id, google_place_id))
                
                elif google_place_id.startswith('otm:'):
                    # OpenTripMap place
                    xid = google_place_id.replace('otm:', '')
                    if otm_client:
                        place = otm_client.get_place(xid)
                        if place:
                            point = place.get('point', {})
                            
                            # Store in google_places table
                            place_query = """
                            INSERT INTO google_places (place_id, name, address, latitude, longitude, place_type, rating)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            ON DUPLICATE KEY UPDATE
                            name = VALUES(name), address = VALUES(address), 
                            latitude = VALUES(latitude), longitude = VALUES(longitude),
                            place_type = VALUES(place_type)
                            """
                            cursor.execute(place_query, (
                                google_place_id,
                                place.get('name', ''),
                                place.get('address', {}).get('road', ''),
                                point.get('lat'),
                                point.get('lon'),
                                'otm_place',
                                None
                            ))
                            
                            # Link planner item to place
                            link_query = """
                            INSERT INTO planner_places (planner_id, google_place_id, place_source)
                            VALUES (%s, %s, 'opentripmap')
                            """
                            cursor.execute(link_query, (planner_id, google_place_id))
                
                else:
                    # Legacy Google Place ID - skip for now (no longer supported)
                    print(f"[WARN] Legacy Google Place ID detected and skipped: {google_place_id}")
                    
            except Exception as e:
                print(f"Error fetching place details: {e}")
                import traceback
                traceback.print_exc()
        
        conn.commit()
        
        # Return the newly created item immediately
        cursor_dict = conn.cursor(dictionary=True)
        cursor_dict.execute("""
            SELECT p.*, u.username as created_by_username
            FROM planner p
            JOIN users u ON p.created_by = u.user_id
            WHERE p.planner_id = %s
        """, (planner_id,))
        new_item = cursor_dict.fetchone()
        
        # Convert dates to string format
        if new_item.get('start_date'):
            new_item['start_date'] = new_item['start_date'].strftime('%Y-%m-%d') if hasattr(new_item['start_date'], 'strftime') else str(new_item['start_date'])[:10]
        if new_item.get('end_date'):
            new_item['end_date'] = new_item['end_date'].strftime('%Y-%m-%d') if hasattr(new_item['end_date'], 'strftime') else str(new_item['end_date'])[:10]
        
        # Mark distance as calculating (will be updated by background fetch)
        new_item['distance_calculating'] = True
        
        print(f"[ADD-ITEM] Successfully created item with ID: {planner_id}")
        print(f"[ADD-ITEM] Returning item: {new_item['item_name']}")
        
        return jsonify({
            "success": True,
            "planner_id": planner_id,
            "message": "Planner item created successfully",
            "item": new_item
        }), 201
        
    except Exception as e:
        print(f"Database error in create_planner_item: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/<int:trip_id>/calculate-distances', methods=['POST'])
def calculate_planner_distances(trip_id):
    """Calculate and cache distances between planner items using OSRM"""
    if not osrm_client:
        return jsonify({"error": "OSRM client not configured"}), 500
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Get all items for this trip with coordinates, ordered correctly
        query = """
        SELECT planner_id, item_name, location, start_date, latitude, longitude
        FROM planner
        WHERE trip_id = %s AND latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY start_date, order_index, start_time, planner_id
        """
        cursor.execute(query, (trip_id,))
        items = cursor.fetchall()
        
        if len(items) < 2:
            return jsonify({"message": "Not enough items with coordinates to calculate distances", "updated": 0})
        
        print(f"[OSRM DISTANCE] Calculating distances for {len(items)} items")
        
        # Build list of coordinate pairs
        origins = []
        destinations = []
        item_pairs = []
        
        for i in range(len(items) - 1):
            current_item = items[i]
            next_item = items[i + 1]
            
            current_lat = current_item.get('latitude')
            current_lng = current_item.get('longitude')
            next_lat = next_item.get('latitude')
            next_lng = next_item.get('longitude')
            
            if all([current_lat, current_lng, next_lat, next_lng]):
                origins.append((current_lat, current_lng))
                destinations.append((next_lat, next_lng))
                item_pairs.append((current_item, next_item))
        
        if not origins:
            return jsonify({"message": "No valid coordinate pairs to calculate", "updated": 0})
        
        # Call OSRM distance matrix (with caching)
        result = osrm_client.distance_matrix(origins, destinations)
        
        updated_count = 0
        
        # Update database with calculated distances
        if result.get('distances') and result.get('durations'):
            print(f"[OSRM DISTANCE] Result matrix size: {len(result['distances'])}x{len(result['distances'][0]) if result['distances'] else 0}")
            for i, (current_item, next_item) in enumerate(item_pairs):
                # Check if index is valid
                if i >= len(result['distances']) or i >= len(result['distances'][i]):
                    print(f"[OSRM DISTANCE] Index {i} out of bounds for matrix")
                    continue
                    
                distance_meters = result['distances'][i][i]  # Diagonal elements are the pairs
                duration_seconds = result['durations'][i][i]
                
                if distance_meters is not None and duration_seconds is not None:
                    # Convert to miles and format
                    distance_miles = distance_meters * 0.000621371
                    distance_text = f"{distance_miles:.1f} mi"
                    
                    # Convert seconds to readable time
                    duration_minutes = duration_seconds / 60
                    if duration_minutes < 60:
                        duration_text = f"{int(duration_minutes)} min"
                    else:
                        hours = int(duration_minutes / 60)
                        mins = int(duration_minutes % 60)
                        duration_text = f"{hours} hr {mins} min" if mins > 0 else f"{hours} hr"
                    
                    from_location = current_item.get('item_name')
                    
                    cursor.execute("""
                        UPDATE planner
                        SET distance_from_previous = %s,
                            duration_from_previous = %s,
                            from_location = %s
                        WHERE planner_id = %s
                    """, (
                        distance_text,
                        duration_text,
                        from_location,
                        next_item['planner_id']
                    ))
                    updated_count += 1
                    print(f"[OSRM DISTANCE] Updated item {next_item['planner_id']}: {duration_text} / {distance_text} from {from_location}")
                else:
                    print(f"[OSRM DISTANCE] No distance data for item pair {i}: {current_item.get('item_name')} -> {next_item.get('item_name')}")
        
        conn.commit()
        print(f"[OSRM DISTANCE] Successfully cached distances for {updated_count} items")
        
        return jsonify({"success": True, "updated": updated_count})
        
    except Exception as e:
        print(f"Error calculating distances: {e}")
        import traceback
        traceback.print_exc()
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items/reorder', methods=['POST'])
def reorder_planner_items():
    """Update order_index for items after drag and drop"""
    data = request.json
    items_order = data.get('items')  # Array of {planner_id, order_index}
    
    if not items_order:
        return jsonify({"error": "Missing items order"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        print(f"[REORDER] Updating order for {len(items_order)} items")
        
        for item in items_order:
            cursor.execute("""
                UPDATE planner
                SET order_index = %s
                WHERE planner_id = %s
            """, (item['order_index'], item['planner_id']))
            print(f"[REORDER] Set order_index={item['order_index']} for planner_id={item['planner_id']}")
        
        conn.commit()
        
        return jsonify({"success": True, "message": f"Updated order for {len(items_order)} items"})
        
    except Exception as e:
        print(f"Error in reorder_planner_items: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items/fix-categories', methods=['POST'])
def fix_planner_item_categories():
    """Fix categories - DEPRECATED: Google Places API no longer used"""
    return jsonify({"error": "This endpoint is deprecated. Categories are now set when items are created."}), 410

@app.route('/api/planner/<int:trip_id>/fix-place-ids', methods=['POST'])
def fix_missing_place_ids(trip_id):
    """Fix missing place IDs - DEPRECATED: Google Places API no longer used"""
    return jsonify({"error": "This endpoint is deprecated."}), 410

@app.route('/api/planner/items/<int:planner_id>', methods=['PUT'])
def update_planner_item(planner_id):
    """Update a planner item"""
    data = request.json
    user_id = data.get('user_id')
    
    # Check if user has permission to update this item
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user is participant in the trip
        check_query = """
        SELECT p.created_by, t.trip_id
        FROM planner p
        JOIN trips t ON p.trip_id = t.trip_id
        JOIN trip_participants tp ON t.trip_id = tp.trip_id
        WHERE p.planner_id = %s AND tp.user_id = %s
        """
        cursor.execute(check_query, (planner_id, user_id))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Permission denied"}), 403
        
        # Update the item
        update_fields = []
        update_values = []
        
        for field in ['item_name', 'item_type', 'description', 'location', 
                     'start_date', 'end_date', 'start_time', 'end_time', 'cost', 'notes']:
            if field in data:
                update_fields.append(f"{field} = %s")
                update_values.append(data[field])
        
        if update_fields:
            update_values.append(planner_id)
            update_query = f"""
            UPDATE planner 
            SET {', '.join(update_fields)}
            WHERE planner_id = %s
            """
            cursor.execute(update_query, update_values)
            conn.commit()
        
        return jsonify({"success": True, "message": "Planner item updated successfully"})
        
    except Exception as e:
        print(f"Database error in update_planner_item: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items/<int:planner_id>/notes', methods=['PUT'])
def update_planner_item_notes(planner_id):
    """Update notes for a planner item"""
    data = request.json
    user_id = data.get('user_id')
    notes = data.get('notes', '')
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user has permission to update this item
        check_query = """
        SELECT p.created_by, t.trip_id
        FROM planner p
        JOIN trips t ON p.trip_id = t.trip_id
        JOIN trip_participants tp ON t.trip_id = tp.trip_id
        WHERE p.planner_id = %s AND tp.user_id = %s
        """
        cursor.execute(check_query, (planner_id, user_id))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Permission denied"}), 403
        
        # Update the notes
        update_query = """
        UPDATE planner 
        SET notes = %s
        WHERE planner_id = %s
        """
        cursor.execute(update_query, (notes, planner_id))
        conn.commit()
        
        return jsonify({"success": True, "message": "Notes updated successfully"})
        
    except Exception as e:
        print(f"Database error in update_planner_item_notes: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/items/<int:planner_id>/time', methods=['PUT'])
def update_planner_item_time(planner_id):
    """Update time for a planner item"""
    data = request.json
    user_id = data.get('user_id')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user has permission to update this item
        check_query = """
        SELECT p.created_by, t.trip_id
        FROM planner p
        JOIN trips t ON p.trip_id = t.trip_id
        JOIN trip_participants tp ON t.trip_id = tp.trip_id
        WHERE p.planner_id = %s AND tp.user_id = %s
        """
        cursor.execute(check_query, (planner_id, user_id))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Permission denied"}), 403
        
        # Update the time
        update_query = """
        UPDATE planner 
        SET start_time = %s, end_time = %s
        WHERE planner_id = %s
        """
        cursor.execute(update_query, (start_time, end_time, planner_id))
        conn.commit()
        
        return jsonify({"success": True, "message": "Time updated successfully"})
        
    except Exception as e:
        print(f"Database error in update_planner_item_time: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/planner/recommendations', methods=['POST'])
def get_recommendations():
    """Get POPULAR nearby place recommendations using Yelp + OpenTripMap (Hybrid)"""
    import sys
    try:
        print("[RECOMMENDATIONS] === START ===", flush=True)
        sys.stdout.flush()
        data = request.json
        print(f"[RECOMMENDATIONS] Received request data: {data}", flush=True)
        sys.stdout.flush()
        
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        place_type = data.get('type', 'all')  # Default to all types
        radius = data.get('radius', 5000)  # Default 5km radius
        page_token = data.get('page_token')  # Legacy param (ignored for hybrid)
        
        if not latitude or not longitude:
            print("[RECOMMENDATIONS] Missing latitude or longitude", flush=True)
            return jsonify({"error": "Latitude and longitude required"}), 400
        
        lat = float(latitude)
        lng = float(longitude)
        radius = int(radius)
        
        print(f"[RECOMMENDATIONS] Parsed: lat={lat}, lng={lng}, radius={radius}m, type={place_type}", flush=True)
        sys.stdout.flush()
        
        all_places = []
        
        # Map of user-friendly names to Yelp/OTM categories
        # Format: (api_to_use, yelp_category, otm_kinds)
        type_mapping = {
            'parks': ('otm', None, 'natural'),  # FIXED: Parks should be OTM only (natural areas)
            'museums': ('both', 'museums', 'museums'),
            'restaurants': ('yelp', 'restaurants', None),
            'cafes': ('yelp', 'cafes', None),
            'shopping': ('yelp', 'shopping', None),  # FIXED: Remove 'other' from OTM
            'attractions': ('otm', None, 'tourist_facilities,cultural,historic'),
            'tourist_attraction': ('otm', None, 'tourist_facilities,cultural,historic'),  # NEW: Match common type
            'entertainment': ('both', 'arts,entertainment', 'amusements'),
            'nightlife': ('yelp', 'nightlife', None),
            'landmarks': ('otm', None, 'historic,cultural'),  # FIXED: Remove natural (that's parks)
            'hikes': ('otm', None, 'natural'),  # FIXED: Hiking should be OTM only
            'hiking': ('otm', None, 'natural'),  # NEW: Alternative name
            'beaches': ('otm', None, 'beaches'),
            'beach': ('otm', None, 'beaches'),  # NEW: Singular form
            'hotels': ('yelp', 'hotels', None),
            'lodging': ('yelp', 'hotels', None),  # NEW: Alternative name
            'art': ('both', 'arts', 'museums'),
            'food': ('yelp', 'food,restaurants', None),
            'nature': ('otm', None, 'natural'),
            'all': ('both', None, 'interesting_places'),
            'tourist_attractions': ('otm', None, 'tourist_facilities,cultural,historic')  # NEW
        }
        
        # Get API strategy
        strategy = type_mapping.get(place_type.lower(), ('both', place_type, 'interesting_places'))
        api_to_use, yelp_category, otm_kinds = strategy
        
        print(f"[STRATEGY] {api_to_use} | Yelp: {yelp_category} | OTM: {otm_kinds}")
        
        # Query Yelp for POPULAR businesses (minimum 10 reviews)
        if api_to_use in ['yelp', 'both'] and yelp_client and yelp_category:  # FIXED: Check yelp_category not None
            try:
                yelp_params = {
                    'latitude': lat,
                    'longitude': lng,
                    'radius': min(radius, 40000),  # Yelp max is 40km
                    'limit': 20,
                    'sort_by': 'rating',  # Most popular
                    'categories': yelp_category  # Always set category (we checked it's not None)
                }
                
                yelp_results = yelp_client.search(**yelp_params)
                
                if yelp_results and 'businesses' in yelp_results:
                    for business in yelp_results['businesses']:
                        try:
                            # Filter by minimum review count (popular only)
                            if business.get('review_count', 0) >= 10:
                                place = normalize_yelp_place(business)
                                if place.get('lat') and place.get('lng'):
                                    all_places.append(place)
                        except Exception as e:
                            print(f"[WARN] Error normalizing Yelp: {e}")
                    
                    print(f"[OK] Yelp: {len([p for p in all_places if p.get('source') == 'yelp'])} businesses")
            except Exception as e:
                print(f"[ERROR] Yelp error: {e}")
        
        # Query OpenTripMap for POPULAR attractions (rate >= 3)
        if api_to_use in ['otm', 'both'] and otm_client and otm_kinds:
            try:
                print(f"[OTM] Calling API: lat={lat}, lng={lng}, kinds={otm_kinds}")
                otm_results = otm_client.search_radius(
                    latitude=lat,
                    longitude=lng,
                radius=radius,
                    kinds=otm_kinds,
                    rate=2,  # Lower threshold to get more results
                    limit=50  # Increased limit
                )
                
                print(f"[OTM] API returned: {type(otm_results)}, length={len(otm_results) if isinstance(otm_results, list) else 'N/A'}")
                
                if otm_results and isinstance(otm_results, list):
                    for place in otm_results:
                        try:
                            if place.get('name') and place.get('rate', 0) >= 2:  # Lower threshold
                                normalized = normalize_otm_place(place)
                                all_places.append(normalized)
                                print(f"  + Added: {place.get('name')} (rate: {place.get('rate')})")
                        except Exception as e:
                            print(f"[WARN] Error normalizing OTM: {e}")
                            import traceback
                            traceback.print_exc()
                    
                    print(f"[OK] OTM: {len([p for p in all_places if p.get('source') == 'opentripmap'])} places")
                else:
                    print(f"[WARN] OTM returned no results or invalid format")
            except Exception as e:
                print(f"[ERROR] OTM error: {e}")
                import traceback
                traceback.print_exc()
        
        # FALLBACK: If we got zero results and only tried OTM, try Yelp as backup
        if len(all_places) == 0 and api_to_use == 'otm' and yelp_client:
            print(f"[INFO] OpenTripMap returned 0 results, falling back to Yelp...")
            try:
                # Try Yelp with generic term search
                yelp_params = {
                    'latitude': lat,
                    'longitude': lng,
                    'radius': min(radius, 40000),
                    'limit': 20,
                    'sort_by': 'rating',
                    'term': place_type  # Use the original search term
                }
                
                yelp_results = yelp_client.search(**yelp_params)
                
                if yelp_results and 'businesses' in yelp_results:
                    for business in yelp_results['businesses']:
                        try:
                            if business.get('review_count', 0) >= 10:
                                place = normalize_yelp_place(business)
                                if place.get('lat') and place.get('lng'):
                                    all_places.append(place)
                        except Exception as e:
                            print(f"[WARN] Error normalizing Yelp (fallback): {e}")
                    
                    print(f"[OK] Yelp fallback: {len([p for p in all_places if p.get('source') == 'yelp'])} businesses")
            except Exception as e:
                print(f"[ERROR] Yelp fallback error: {e}")
        
        # Sort by popularity
        all_places.sort(key=lambda x: x.get('popularity', 0), reverse=True)
        
        # Calculate distances in bulk (MUCH faster than one-by-one)
        if osrm_client and len(all_places) > 0:
            try:
                print(f"[DISTANCE] Calculating distances for {len(all_places)} places in BULK...", flush=True)
                
                # Prepare all coordinates at once
                origin_coords = [(lat, lng)]
                dest_coords = []
                valid_places = []
                
                for place in all_places:
                    place_lat = place.get('lat')
                    place_lng = place.get('lng')
                    if place_lat and place_lng:
                        dest_coords.append((place_lat, place_lng))
                        valid_places.append(place)
                
                if dest_coords:
                    # Single bulk API call instead of N individual calls
                    result = osrm_client.distance_matrix(origin_coords, dest_coords)
                    
                    if result and 'distances' in result and 'durations' in result:
                        distances = result['distances'][0]  # First (only) origin row
                        durations = result['durations'][0]
                        
                        # Map results back to places
                        for i, place in enumerate(valid_places):
                            if i < len(distances):
                                distance_m = distances[i]
                                duration_s = durations[i] if i < len(durations) else None
                                
                                if distance_m and distance_m < 1000:
                                    place['distance'] = f"{int(distance_m)} m"
                                elif distance_m:
                                    place['distance'] = f"{distance_m/1000:.1f} km"
                                else:
                                    place['distance'] = "N/A"
                                
                                if duration_s and duration_s < 60:
                                    place['duration'] = f"{int(duration_s)} sec"
                                elif duration_s:
                                    place['duration'] = f"{int(duration_s/60)} min"
                                else:
                                    place['duration'] = "N/A"
                            else:
                                place['distance'] = "N/A"
                                place['duration'] = "N/A"
                        
                        print(f"[DISTANCE] ✓ Calculated {len(valid_places)} distances in one call", flush=True)
                    else:
                        print(f"[WARN] Bulk distance matrix returned no results", flush=True)
                        for place in all_places:
                            place['distance'] = "N/A"
                            place['duration'] = "N/A"
                else:
                    print(f"[WARN] No valid coordinates found in recommendations", flush=True)
                    for place in all_places:
                        place['distance'] = "N/A"
                        place['duration'] = "N/A"
            except Exception as e:
                print(f"[ERROR] Bulk distance calculation failed: {e}", flush=True)
                for place in all_places:
                    place['distance'] = "N/A"
                    place['duration'] = "N/A"
        else:
            # No OSRM client or no places
            for place in all_places:
                place['distance'] = "N/A"
                place['duration'] = "N/A"
        
        # Convert to frontend format
        recommendations = []
        for place in all_places[:20]:  # Top 20 most popular
                recommendation = {
                    'place_id': place.get('place_id'),
                'name': place.get('place_name'),
                'address': place.get('address', 'Address not available'),
                'rating': float(place.get('rating', 0)),
                'user_ratings_total': place.get('review_count', 0),
                'types': [place.get('category', 'place')],
                'latitude': place.get('lat'),
                'longitude': place.get('lng'),
                'distance': place.get('distance', 'N/A'),
                'duration': place.get('duration', 'N/A'),
                'photo_url': place.get('image_url') or 'https://via.placeholder.com/400x250/1a1a2e/6366f1?text=No+Image',
                'open_now': None  # Yelp/OTM don't provide real-time status
            }
                recommendations.append(recommendation)
        
        print(f"[OK] Returning {len(recommendations)} POPULAR recommendations")
        
        print(f"[RECOMMENDATIONS] Returning {len(recommendations)} recommendations")
        return jsonify({
            'recommendations': recommendations,
            'count': len(recommendations),
            'next_page_token': None  # No pagination for hybrid (returns top results)
        }), 200
        
    except Exception as e:
        print("[ERROR] Exception in get_recommendations:")
        print(f"[ERROR] {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"{type(e).__name__}: {str(e)}"}), 500

@app.route('/api/planner/items/<int:planner_id>', methods=['DELETE'])
def delete_planner_item(planner_id):
    """Delete a planner item"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        # Check if user has permission to delete this item
        check_query = """
        SELECT p.created_by, t.trip_id
        FROM planner p
        JOIN trips t ON p.trip_id = t.trip_id
        JOIN trip_participants tp ON t.trip_id = tp.trip_id
        WHERE p.planner_id = %s AND tp.user_id = %s
        """
        cursor.execute(check_query, (planner_id, user_id))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"error": "Permission denied"}), 403
        
        # Delete the item
        delete_query = "DELETE FROM planner WHERE planner_id = %s"
        cursor.execute(delete_query, (planner_id,))
        conn.commit()
        
        return jsonify({"success": True, "message": "Planner item deleted successfully"})
        
    except Exception as e:
        print(f"Database error in delete_planner_item: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/notifications/<int:user_id>', methods=['GET'])
def get_notifications(user_id):
    """Get all notifications for a user (friend requests, trip additions, recent messages)"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        
        notifications = []
        
        # 1. Friend Requests
        cursor.execute("""
            SELECT 
                'friend_request' as type,
                f.id as notification_id,
                u.first_name,
                u.last_name,
                u.username,
                f.user_id as sender_id,
                NULL as trip_id,
                NULL as chat_id,
                NULL as message_preview,
                f.created_at as timestamp
            FROM friends f
            JOIN users u ON f.user_id = u.user_id
            WHERE f.friend_id = %s AND f.status = 'pending'
        """, (user_id,))
        notifications.extend(cursor.fetchall())
        
        # 2. Trip Invitations (for friends being invited)
        cursor.execute("""
            SELECT 
                'trip_invitation' as type,
                tmr.id as notification_id,
                u.first_name,
                u.last_name,
                u.username,
                tmr.requester_id as sender_id,
                tmr.trip_id,
                NULL as chat_id,
                t.trip_name as message_preview,
                t.description as trip_description,
                tmr.created_at as timestamp,
                tmr.owner_approved,
                tmr.friend_accepted
            FROM trip_member_requests tmr
            JOIN users u ON tmr.requester_id = u.user_id
            JOIN trips t ON tmr.trip_id = t.trip_id
            WHERE tmr.friend_id = %s AND tmr.status = 'pending'
        """, (user_id,))
        notifications.extend(cursor.fetchall())
        
        # 2b. Member Addition Requests (for trip owners/admins to approve)
        cursor.execute("""
            SELECT 
                'member_request' as type,
                tmr.id as notification_id,
                u1.first_name,
                u1.last_name,
                u1.username,
                tmr.requester_id as sender_id,
                tmr.trip_id,
                NULL as chat_id,
                CONCAT(u2.first_name, ' ', u2.last_name, ' requested by ', u1.first_name) as message_preview,
                t.trip_name,
                u2.first_name as friend_first_name,
                u2.last_name as friend_last_name,
                tmr.created_at as timestamp
            FROM trip_member_requests tmr
            JOIN users u1 ON tmr.requester_id = u1.user_id
            JOIN users u2 ON tmr.friend_id = u2.user_id
            JOIN trips t ON tmr.trip_id = t.trip_id
            JOIN trip_participants tp ON tmr.trip_id = tp.trip_id
            WHERE tp.user_id = %s 
              AND tp.role IN ('owner', 'admin')
              AND tmr.status = 'pending'
              AND NOT tmr.owner_approved
              AND tmr.requester_id != %s
        """, (user_id, user_id))
        notifications.extend(cursor.fetchall())
        
        # 3. Trip Addition Notifications
        cursor.execute("""
            SELECT 
                'trip_added' as type,
                tn.notification_id,
                u.first_name,
                u.last_name,
                u.username,
                tn.added_by_user_id as sender_id,
                tn.trip_id,
                NULL as chat_id,
                t.trip_name as message_preview,
                tn.created_at as timestamp
            FROM trip_notifications tn
            JOIN users u ON tn.added_by_user_id = u.user_id
            JOIN trips t ON tn.trip_id = t.trip_id
            WHERE tn.user_id = %s AND tn.is_read = FALSE
        """, (user_id,))
        notifications.extend(cursor.fetchall())
        
        # 4. Recent Unread Messages (both group and direct)
        cursor.execute("""
            SELECT 
                'message' as type,
                um.id as notification_id,
                um.chat_id,
                um.chat_type,
                um.unread_count,
                um.last_message_at as timestamp
            FROM unread_messages um
            WHERE um.user_id = %s AND um.unread_count > 0
            ORDER BY um.last_message_at DESC
            LIMIT 10
        """, (user_id,))
        
        unread_messages = cursor.fetchall()
        
        # Get chat names and last message preview for unread messages
        for msg in unread_messages:
            if msg['chat_type'] == 'group':
                # Get group chat name
                cursor.execute("SELECT chat_name FROM group_chats WHERE chat_id = %s", (msg['chat_id'],))
                chat = cursor.fetchone()
                msg['chat_name'] = chat['chat_name'] if chat else 'Group Chat'
                
                # Get last message preview
                cursor.execute("""
                    SELECT cm.message, u.first_name 
                    FROM chat_messages cm
                    JOIN users u ON cm.user_id = u.user_id
                    WHERE cm.chat_id = %s 
                    ORDER BY cm.sent_at DESC 
                    LIMIT 1
                """, (msg['chat_id'],))
                last_message = cursor.fetchone()
                if last_message:
                    preview = last_message['message'][:40] + ('...' if len(last_message['message']) > 40 else '')
                    msg['message_preview'] = f"{last_message['first_name']}: {preview}"
                    msg['sender_name'] = last_message['first_name']
                else:
                    msg['message_preview'] = f"{msg['unread_count']} new message{'s' if msg['unread_count'] > 1 else ''}"
            else:
                # Get other user info for direct chat
                cursor.execute("""
                    SELECT user1_id, user2_id FROM direct_chats WHERE chat_id = %s
                """, (msg['chat_id'],))
                chat = cursor.fetchone()
                if chat:
                    other_user_id = chat['user2_id'] if chat['user1_id'] == user_id else chat['user1_id']
                    cursor.execute("SELECT first_name, last_name FROM users WHERE user_id = %s", (other_user_id,))
                    other_user = cursor.fetchone()
                    msg['chat_name'] = f"{other_user['first_name']} {other_user['last_name']}" if other_user else 'Direct Chat'
                    msg['first_name'] = other_user['first_name'] if other_user else 'User'
                    msg['last_name'] = other_user['last_name'] if other_user else ''
                    
                    # Get last message preview
                    cursor.execute("""
                        SELECT message_content 
                        FROM direct_messages 
                        WHERE chat_id = %s 
                        ORDER BY sent_at DESC 
                        LIMIT 1
                    """, (msg['chat_id'],))
                    last_message = cursor.fetchone()
                    if last_message:
                        preview = last_message['message_content'][:40] + ('...' if len(last_message['message_content']) > 40 else '')
                        msg['message_preview'] = preview
                    else:
                        msg['message_preview'] = f"{msg['unread_count']} new message{'s' if msg['unread_count'] > 1 else ''}"
        
        notifications.extend(unread_messages)
        
        # Sort all notifications by timestamp
        notifications.sort(key=lambda x: x['timestamp'] if x['timestamp'] else '', reverse=True)
        
        # Convert timestamps to ISO format
        for notif in notifications:
            if notif.get('timestamp'):
                notif['timestamp'] = notif['timestamp'].isoformat() if hasattr(notif['timestamp'], 'isoformat') else str(notif['timestamp'])
        
        return jsonify({"notifications": notifications}), 200
        
    except Exception as e:
        print(f"Error fetching notifications: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
def mark_notification_read(notification_id):
    """Mark a trip notification as read"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE trip_notifications 
            SET is_read = TRUE 
            WHERE notification_id = %s
        """, (notification_id,))
        
        conn.commit()
        return jsonify({"success": True}), 200
        
    except Exception as e:
        print(f"Error marking notification as read: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/unread/<int:user_id>/<int:chat_id>/<chat_type>', methods=['DELETE'])
def clear_unread_count(user_id, chat_id, chat_type):
    """Clear unread count for a specific chat"""
    conn = None
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM unread_messages 
            WHERE user_id = %s AND chat_id = %s AND chat_type = %s
        """, (user_id, chat_id, chat_type))
        
        conn.commit()
        return jsonify({"success": True}), 200
        
    except Exception as e:
        print(f"Error clearing unread count: {e}")
        return jsonify({"error": "Database error"}), 500
    finally:
        if conn:
            conn.close()

# Serve React App
@app.route('/')
def serve_root():
    print(f"[SERVE] Serving root /")
    return send_from_directory(app.static_folder, 'index.html')

# Explicitly handle SPA routes
@app.route('/search')
@app.route('/friends')
@app.route('/planner')
@app.route('/calendar')
@app.route('/chats')
@app.route('/chats/<chat_id>')
def serve_spa_routes(chat_id=None):
    route = request.path
    print(f"[SERVE] Serving SPA route: {route}")
    return send_from_directory(app.static_folder, 'index.html')

# Catch all for other routes
@app.route('/<path:path>')
def serve_catchall(path):
    print(f"[SERVE] Catchall requested path: '{path}'")
    
    # Don't serve React for API routes
    if path.startswith('api/'):
        return jsonify({"error": "API endpoint not found"}), 404
    
    # Serve static files if they exist (CSS, JS, images, etc.)
    if os.path.exists(os.path.join(app.static_folder, path)):
        print(f"[SERVE] Serving static file: {path}")
        return send_from_directory(app.static_folder, path)
    
    # Serve index.html for all other routes (React Router handles them)
    print(f"[SERVE] Serving index.html for path: {path}")
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    # Enable request logging
    import logging
    logging.basicConfig(level=logging.INFO)
    
    # Railway provides PORT environment variable
    port = int(os.getenv('PORT', 5000))
    # Use 0.0.0.0 to listen on all interfaces (required for Railway)
    print(f"[SERVER] Starting on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)  # Enable debug for better error messages
