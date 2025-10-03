import requests

# Expired token
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlciIsInVzZXJJZCI6IjUwN2YxZjc3YmNmODZjZDc5OTQzOTAxMSIsInBlcm1pc3Npb25zIjpbInVzZXJfcGFnZV9hY2Nlc3MiLCJjaGF0Il0sImV4cCI6MTc1OTQ0NzgxMX0.oLIvsLzpZczafEGTgxCgJnLF6pylrjKogYe2Z76ZMkks"

url = "http://localhost:8000/api/documents"

headers = {
    "Authorization": f"Bearer {token}"
}

try:
    response = requests.get(url, headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
