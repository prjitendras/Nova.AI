"""Check admin user details including AAD ID"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pymongo import MongoClient
from app.config.settings import settings

client = MongoClient(settings.mongo_uri)
db = client[settings.mongo_db]

print("=== Admin Users with AAD IDs ===")
for user in db.admin_users.find():
    print(f"Email: {user.get('email')}")
    print(f"Display Name: {user.get('display_name')}")
    print(f"AAD ID: {user.get('aad_id', 'NOT SET')}")
    print(f"Role: {user.get('role')}")
    print(f"Active: {user.get('is_active')}")
    print("---")
