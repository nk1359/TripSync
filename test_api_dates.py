import requests
import json

# Test the trips endpoint
response = requests.get('http://127.0.0.1:5000/api/trips/7')  # Replace 7 with your user_id
data = response.json()

print("\n=== API RESPONSE: /api/trips/7 ===")
if 'trips' in data and len(data['trips']) > 0:
    trip = data['trips'][0]
    print(f"Trip: {trip.get('trip_name')}")
    print(f"  start_date: {trip.get('start_date')} (type: {type(trip.get('start_date'))})")
    print(f"  end_date: {trip.get('end_date')} (type: {type(trip.get('end_date'))})")
    print(f"\nRaw JSON:")
    print(json.dumps(trip, indent=2))
    
    # Test destinations endpoint
    trip_id = trip.get('trip_id')
    if trip_id:
        dest_response = requests.get(f'http://127.0.0.1:5000/api/trips/{trip_id}/destinations')
        dest_data = dest_response.json()
        
        print(f"\n=== API RESPONSE: /api/trips/{trip_id}/destinations ===")
        if 'destinations' in dest_data and len(dest_data['destinations']) > 0:
            dest = dest_data['destinations'][0]
            print(f"Destination: {dest.get('destination')}")
            print(f"  start_date: {dest.get('start_date')} (type: {type(dest.get('start_date'))})")
            print(f"  end_date: {dest.get('end_date')} (type: {type(dest.get('end_date'))})")
            print(f"\nRaw JSON:")
            print(json.dumps(dest, indent=2))


