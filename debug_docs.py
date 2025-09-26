import asyncio
from server.lib.mongodb import get_database

async def check_docs():
    try:
        db = await get_database()
        docs = await db.documents.find({}).limit(3).to_list(None)
        print('Sample documents:')
        for i, doc in enumerate(docs):
            print(f'Doc {i}:')
            print(f'  _id: {doc.get("_id")} (type: {type(doc.get("_id"))})')
            print(f'  categoryId: {doc.get("categoryId")} (type: {type(doc.get("categoryId"))})')
            print(f'  name: {doc.get("name")}')
            print(f'  uploadedBy: {doc.get("uploadedBy")}')
            print()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_docs())
