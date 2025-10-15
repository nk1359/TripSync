import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

conn = mysql.connector.connect(
    host=os.getenv('MYSQLHOST', 'localhost'),
    user=os.getenv('MYSQLUSER', 'root'),
    password=os.getenv('MYSQLPASSWORD', os.getenv('DB_PASSWORD', '')),
    database=os.getenv('MYSQLDATABASE', 'tripsync')
)

cursor = conn.cursor(dictionary=True)

print("\n=== TRIPS TABLE ===")
cursor.execute('SELECT trip_id, trip_name, start_date, end_date FROM trips ORDER BY trip_id DESC LIMIT 3')
trips = cursor.fetchall()
for t in trips:
    print(f"Trip {t['trip_id']}: {t['trip_name']}")
    print(f"  start_date: {t['start_date']} (type: {type(t['start_date']).__name__})")
    print(f"  end_date: {t['end_date']} (type: {type(t['end_date']).__name__})")
    print()

print("=== TRIP_DESTINATIONS TABLE ===")
cursor.execute('SELECT * FROM trip_destinations ORDER BY destination_id DESC LIMIT 3')
dests = cursor.fetchall()
for d in dests:
    print(f"Dest {d['destination_id']}: {d['destination']}")
    print(f"  trip_id: {d['trip_id']}")
    print(f"  start_date: {d['start_date']} (type: {type(d['start_date']).__name__})")
    print(f"  end_date: {d['end_date']} (type: {type(d['end_date']).__name__})")
    print()

conn.close()


