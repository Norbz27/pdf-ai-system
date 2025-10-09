import jwt
import os

# Replace with your actual user ID and JWT secret
user_id = "replace_with_valid_user_id"
jwt_secret = os.getenv("JWT_SECRET", "your_jwt_secret_here")

payload = {
    "userId": user_id,
    "permissions": ["admin_access"]
}

token = jwt.encode(payload, jwt_secret, algorithm="HS256")

print("Generated JWT token:")
print(token)
