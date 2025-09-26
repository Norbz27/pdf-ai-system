import requests

AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGE3ZDQ4OWU4NDVVhOTdiYzhjYWJiMjIifQ.uVXAM4bDghHGjkhIdhBWilL7w0oig8qf-aCNgNecDLg"

headers = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json"
}

data = {
    "question": "Hello AI",
    "docIds": [],
    "user": {
        "name": "Test User",
        "email": "test@example.com",
        "role": "User"
    }
}

response = requests.post("http://localhost:8000/chat", json=data, headers=headers)

print("Status Code:", response.status_code)
print("Response JSON:", response.json())
