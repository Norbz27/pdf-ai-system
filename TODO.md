# TODO: Fix /api/categories 404 Error

## Approved Plan
- Change the categories router prefix in server/main.py from "/api/admin/categories" to "/api/categories"
- Update the GET route in server/routes/categories.py from @router.get("") to @router.get("/") for clarity

## Steps
- [x] Edit server/main.py to change the prefix for categories_router
- [x] Edit server/routes/categories.py to update the GET route decorator
- [x] Change roles router prefix from "/api/admin/roles" to "/api/roles"
- [x] Add redirect routes for old admin URLs to prevent redirect loops
- [x] Remove sharedUsers lookup from documents.py to fix 500 error
- [x] Fix admin documents route to prevent redirect loop
- [ ] Test the /api/categories and /api/roles endpoints to ensure they return 200 OK

## Followup
- Verify that the GET /api/categories works without authentication
- Ensure admin operations (POST, PUT, DELETE) still require admin permissions
