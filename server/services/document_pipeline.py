from langchain_community.document_loaders import PyPDFLoader, PyMuPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings
from langchain.chains import RetrievalQA
from langchain.schema import Document
from typing import List, Dict, Any
import os

CHUNK_SIZE = 512  # Adjust based on Ollama model context window
CHUNK_OVERLAP = 64

# PDF Loader with fallback

def load_pdf(file_path: str):
    try:
        loader = PyPDFLoader(file_path)
        docs = loader.load()
    except Exception:
        loader = PyMuPDFLoader(file_path)
        docs = loader.load()
    metadata = {
        "num_pages": len(docs),
        "structure": [doc.metadata for doc in docs]
    }
    return docs, metadata

# Text Chunking

def chunk_documents(docs):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP
    )
    return splitter.split_documents(docs)

# Vector Indexing

FAISS_INDEX_PATH = "c:/Users/norbe/OneDrive/Documents/pdf-ai-system/server/lib/faiss_index"

async def index_documents(docs):
    embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=os.getenv("OLLAMA_URL"))
    chunks = chunk_documents(docs)
    if os.path.exists(FAISS_INDEX_PATH):
        vector_store = FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
        vector_store.add_documents(chunks)
    else:
        vector_store = FAISS.from_documents(chunks, embeddings)
    vector_store.save_local(FAISS_INDEX_PATH)
    return vector_store

async def load_faiss_index():
    try:
        embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=os.getenv("OLLAMA_URL"))
        if not os.path.exists(FAISS_INDEX_PATH):
            # Create an empty index
            dummy_doc = [Document(page_content="dummy")]
            vector_store = FAISS.from_documents(dummy_doc, embeddings)
            vector_store.save_local(FAISS_INDEX_PATH)
        return FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
    except Exception as e:
        print(f"FAISS index not found or invalid: {e}")
        return None

# Hybrid search: FAISS similarity + keyword matching

def hybrid_search(vector_store: FAISS, query: str, metadata_filter: Dict[str, Any] = None, k: int = 5):
    # FAISS similarity search
    faiss_results = vector_store.similarity_search(query, k=k)
    # Keyword matching
    keyword_results = []
    for doc in vector_store.docs:
        if query.lower() in doc.page_content.lower():
            if metadata_filter:
                if all(doc.metadata.get(key) == val for key, val in metadata_filter.items()):
                    keyword_results.append(doc)
            else:
                keyword_results.append(doc)
    # Combine and deduplicate
    combined = {d.page_content: d for d in faiss_results + keyword_results}
    # Relevance scoring (simple: FAISS rank + keyword match)
    ranked = list(combined.values())[:k]
    return ranked

# Retrieval QA chain

def get_qa_chain(vector_store: FAISS, llm):
    retriever = vector_store.as_retriever()
    return RetrievalQA.from_chain_type(llm=llm, retriever=retriever)

# Metadata filtering for access control

def filter_by_metadata(docs: List[Document], user_permissions: List[str]):
    return [doc for doc in docs if set(doc.metadata.get('permissions', [])) & set(user_permissions)]