import jwt
import datetime

# JWT secret from .env
JWT_SECRET = "OTRhxSuDYzNGQjoATv153UBgeaV9n6Bz"

# Example payload (customize as needed)
payload = {
    "sub": "testuser",
    "permissions": ["chat"],
    "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)
}

# Generate JWT token
encoded_jwt = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
print(encoded_jwt)
