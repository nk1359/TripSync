# 🗺️ Google Maps API Setup Guide

## Current Issue
Your API key is valid, but the required APIs are not enabled in your Google Cloud project.

## Error Message
```
REQUEST_DENIED - You're calling a legacy API, which is not enabled for your project
```

## ✅ Solution: Enable Required APIs

### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Select your project (or create one if you don't have one)

### Step 2: Enable Required APIs

Go to **APIs & Services** → **Library** and enable these APIs:

#### Essential APIs (Required for TripSync):
1. **Places API** (Legacy) ⭐ **This is the main one causing the issue**
   - Search for: "Places API"
   - Click the one that says "Places API" (not "Places API (New)")
   - Click "Enable"
   - **What it does:** Autocomplete, place search, place details

2. **Geocoding API** ⭐ **Required**
   - For converting addresses to coordinates
   - Click "Enable"
   - **What it does:** City names → latitude/longitude

3. **Distance Matrix API** ⭐ **Required**
   - For calculating distances between locations
   - Click "Enable"
   - **What it does:** Calculate travel time/distance between places

#### Optional APIs (NOT needed for TripSync):
4. **Maps JavaScript API** ❌ **Skip this**
   - Only needed if you want to display interactive maps on your website
   - TripSync doesn't use this

5. **Places API (New)** - Optional, for future migration
6. **Directions API** - Optional, for turn-by-turn directions

### Step 3: Verify API Key Restrictions

1. Go to **APIs & Services** → **Credentials**
2. Click on your API key
3. Check **API restrictions**:
   - **Option A (Recommended for development)**: "Don't restrict key"
   - **Option B (Production)**: Select only the APIs listed above

4. Check **Application restrictions**:
   - For local development: Choose "None"
   - For production: Set appropriate restrictions

### Step 4: Save and Wait
- Click "Save"
- Wait 2-5 minutes for changes to propagate

### Step 5: Test
Run this command to test:
```bash
.\venv\Scripts\python.exe test_api_key.py
```

You should see:
```
[OK] API Connection Successful!
     Test query returned X results
```

## 💰 Pricing Information

Google provides:
- **$200/month free credit** (covers ~28,500 place searches)
- After that: ~$0.017 per request

Your current usage should stay within the free tier.

## 🔧 Troubleshooting

### Error: "API key not valid"
- Check if your .env file has: `GOOGLE_PLACES_API_KEY=your_key_here`
- No spaces around the `=`
- No quotes around the key

### Error: "This API project is not authorized"
- API key restrictions are too strict
- Temporarily set to "Don't restrict key" for testing

### Error: "REQUEST_DENIED"
- APIs not enabled (follow steps above)
- Wait 5 minutes after enabling APIs

## 📝 Your Current Setup

✅ API Key exists: `GOOGLE_PLACES_API_KEY`
✅ Length: 39 characters (correct)
✅ Format: Starts with `AIza` (correct)
❌ APIs not enabled in Google Cloud Console

## Next Steps

1. Enable the APIs listed above
2. Wait 2-5 minutes
3. Run: `.\venv\Scripts\python.exe test_api_key.py`
4. Start your Flask server: `.\venv\Scripts\python.exe App.py`
5. Test autocomplete in your app

## Alternative: Switch to New Places API (Future)

Google is pushing everyone to the new Places API. If you want to future-proof:
- Use the new `@googlemaps/places` library
- Update your App.py to use the new API format
- This requires more code changes

**For now, enabling the legacy API is the quickest fix.**

