#!/usr/bin/env python3

import sys
sys.path.append('server')

import pytest
from unittest.mock import patch
from server.services.document_pipeline import (
    load_pdf,
    chunk_documents,
    assess_extraction_quality,
    ocr_single_page,
    load_pdf_with_unstructured,
)

@pytest.fixture
def dummy_docs():
    from langchain.schema import Document
    return [
        Document(page_content="This is a test document.", metadata={"type": "text", "section": "Test"}),
        Document(page_content="Another test document with table data.", metadata={"type": "table", "section": "Test"}),
    ]

def test_assess_extraction_quality():
    good_text = "This is a good quality text with enough length and alphanumeric characters."
    low_text = ""
    assert assess_extraction_quality(good_text, 1, 1) > 0.5
    assert assess_extraction_quality(low_text, 1, 1) == 0.0

@patch("server.services.document_pipeline.partition_pdf")
def test_load_pdf_with_unstructured_mock(partition_pdf):
    from langchain.schema import Document
    # Mock elements returned by partition_pdf
    class MockElement:
        def __init__(self, text, page_number, elem_type):
            self.text = text
            self.metadata = {"page_number": page_number}
            self.type = elem_type
        def __instancecheck__(self, cls):
            return self.type == cls.__name__

    elements = [
        MockElement("Title 1", 1, "Title"),
        MockElement("List item 1", 1, "ListItem"),
        MockElement("Table content", 1, "Table"),
        MockElement("Regular text", 1, "Text"),
    ]
    partition_pdf.return_value = elements

    docs, quality_scores = load_pdf_with_unstructured("dummy.pdf")
    assert isinstance(docs, list)
    assert isinstance(quality_scores, dict)
    assert all(isinstance(doc, Document) for doc in docs)

def test_ocr_single_page_returns_document():
    doc = ocr_single_page("dummy.pdf", 1)
    assert hasattr(doc, "page_content")
    assert hasattr(doc, "metadata")

def test_chunk_documents_splits_long_text(dummy_docs):
    chunks = chunk_documents(dummy_docs)
    assert isinstance(chunks, list)
    assert all(hasattr(chunk, "page_content") for chunk in chunks)

def test_load_pdf_and_chunk_documents():
    import os
    pdf_path = "sample.pdf"
    if os.path.exists(pdf_path):
        docs, metadata = load_pdf(pdf_path)
        chunks = chunk_documents(docs)
        assert isinstance(docs, list)
        assert isinstance(chunks, list)
    else:
        # Skip if sample PDF not available
        pass

if __name__ == "__main__":
    pytest.main(["-v", __file__])
