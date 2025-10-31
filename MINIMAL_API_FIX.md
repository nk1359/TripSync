# 🎯 Minimal Google API Fix (No Maps)

## What You Actually Need

Your TripSync app uses Google APIs for:
- ✅ **Place autocomplete** (finding cities, hotels, restaurants)
- ✅ **Place details** (getting info about places)
- ✅ **Geocoding** (converting city names to coordinates)
- ✅ **Distance calculations** (measuring distances between locations)

**You DON'T need:**
- ❌ Interactive maps display
- ❌ Maps JavaScript API

## The 3 APIs You Must Enable

### 1. **Places API** ⭐ (Most Important)
**What it does:** Powers all your autocomplete and place search features

**Enable it:**
1. Go to: https://console.cloud.google.com/apis/library
2. Search: "Places API"
3. Click the one that says **"Places API"** (NOT "Places API (New)")
4. Click **"Enable"**

### 2. **Geocoding API** ⭐
**What it does:** Converts "New York" → latitude/longitude

**Enable it:**
1. In the same API Library page
2. Search: "Geocoding API"
3. Click **"Enable"**

### 3. **Distance Matrix API** ⭐
**What it does:** Calculates distances between places in your itinerary

**Enable it:**
1. In the same API Library page
2. Search: "Distance Matrix API"
3. Click **"Enable"**

## Set API Key Permissions

After enabling the 3 APIs above:

1. Go to: https://console.cloud.google.com/apis/credentials
2. Click your API key
3. Scroll to **"API restrictions"**
4. Select **"Restrict key"**
5. Check ONLY these 3 boxes:
   - ☑️ Places API
   - ☑️ Geocoding API
   - ☑️ Distance Matrix API
6. Click **"Save"**

This is more secure than "Don't restrict key" and only allows what you actually use.

## Wait & Test

1. **Wait 2-5 minutes** (API changes take time)

2. **Test it:**
   ```bash
   .\venv\Scripts\python.exe test_api_key.py
   ```

3. **Start your app:**
   ```bash
   .\venv\Scripts\python.exe App.py
   ```

4. **Try autocomplete** in your app

## What Your App Uses (Technical Details)

From your `App.py`:
```python
gmaps.places_autocomplete()  # Places API
gmaps.places()               # Places API
gmaps.places_nearby()        # Places API
gmaps.place()                # Places API (details)
gmaps.geocode()              # Geocoding API
gmaps.distance_matrix()      # Distance Matrix API
```

Photo URLs: `googleapis.com/maps/api/place/photo` → Uses Places API

**Confirmed:** You don't use Maps JavaScript API anywhere in your code.

## Cost Estimate (Free Tier)

With $200/month free credit:
- Places Autocomplete: 1,000 requests = $2.83
- Places Details: 1,000 requests = $17
- Geocoding: 1,000 requests = $5
- Distance Matrix: 1,000 elements = $5

**You can do ~1,500 place searches per month before paying anything.**

## Summary

**Enable these 3 APIs only:**
1. Places API ✅
2. Geocoding API ✅
3. Distance Matrix API ✅

**Skip these:**
- Maps JavaScript API ❌
- Everything else ❌

**Total setup time: 3 minutes**




