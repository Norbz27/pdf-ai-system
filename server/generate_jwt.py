import jwt
import datetime

# JWT secret from .env
JWT_SECRET = "OTRhxSuDYzNGQjoATv153UBgeaV9n6Bz"

# Example payload (customize as needed)
payload = {
    "sub": "testuser",
    "userId": "507f1f77bcf86cd799439011",  # Example ObjectId
    "permissions": ["user_page_access", "chat"],
    "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
}

# Generate JWT token
encoded_jwt = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
print(encoded_jwt)
