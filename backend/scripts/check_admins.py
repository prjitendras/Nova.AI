"""Check current admin users"""
from pymongo import MongoClient

client = MongoClient('mongodb://localhost:27017')
db = client['workflow_ops_dev']

print("=== Current Admin Users ===")
admins = list(db['admin_users'].find({}))
if admins:
    for admin in admins:
        email = admin.get('email', 'N/A')
        role = admin.get('role', 'N/A')
        active = admin.get('is_active', False)
        print(f"  - {email}")
        print(f"    Role: {role}")
        print(f"    Active: {active}")
else:
    print("  No admin users configured.")
    print("  Go to http://localhost:3000/admin-setup to set up.")

print()
print("=== Setup Status ===")
has_super_admin = any(a.get('role') == 'SUPER_ADMIN' and a.get('is_active') for a in admins)
print(f"  Super Admin Exists: {has_super_admin}")
print(f"  Requires Setup: {not has_super_admin}")
