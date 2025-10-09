from langchain_community.document_loaders import PyPDFLoader, PyMuPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings
from langchain.chains import RetrievalQA
from langchain.schema import Document
from typing import Any, List
import os
import pdfplumber
import json
try:
    from unstructured.partition.pdf import partition_pdf
    from unstructured.documents.elements import Title, ListItem, Table, Text, Image
    UNSTRUCTURED_AVAILABLE = True
except ImportError:
    UNSTRUCTURED_AVAILABLE = False
try:
    from doctr.io import DocumentFile
    from doctr.models import ocr_predictor
    DOCTR_AVAILABLE = True
except ImportError:
    DOCTR_AVAILABLE = False

try:
    import layoutparser as lp
    LAYOUTPARSER_AVAILABLE = True
except ImportError:
    LAYOUTPARSER_AVAILABLE = False

CHUNK_SIZE = 1000  # Increased for better context
CHUNK_OVERLAP = 100

# PDF Loader with fallback

def preprocess_tables_in_text(text: str) -> str:
    """
    Dynamically detect tables in plain text by identifying consecutive lines with tabular structure,
    such as consistent column separators (multiple spaces or tabs), and convert to markdown.
    Wrap detected tables with [TABLE START] and [TABLE END].
    """
    lines = text.splitlines()
    new_lines = []
    i = 0
    while i < len(lines):
        # Try to detect a table starting from current line
        table_lines, end_idx = detect_table_block(lines, i)
        if table_lines:
            # Convert to markdown
            md_table = convert_to_markdown_table_dynamic(table_lines)
            new_lines.append("[TABLE START]")
            new_lines.extend(md_table)
            new_lines.append("[TABLE END]")
            i = end_idx
        else:
            new_lines.append(lines[i])
            i += 1
    return "\n".join(new_lines)

def detect_table_block(lines: list, start_idx: int) -> tuple[list, int]:
    """
    Detect a block of consecutive lines that form a table.
    Returns (table_lines, end_idx) if detected, else ([], start_idx)
    Heuristics: At least 2 lines, consistent number of columns (split by \s{2,} or \t),
    and lines are not too short or too long compared to others.
    """
    import re
    table_lines = []
    min_lines = 2
    max_lines = 20  # Limit to avoid false positives
    for j in range(start_idx, min(start_idx + max_lines, len(lines))):
        line = lines[j].strip()
        if not line:
            continue  # Skip empty lines
        # Split into columns
        cols = re.split(r'\s{2,}|\t', line)
        num_cols = len(cols)
        if num_cols < 2:
            # Not tabular
            break
        # Check if columns are reasonable (not all single chars, etc.)
        if any(len(col.strip()) == 0 for col in cols):
            continue  # Skip lines with empty columns
        table_lines.append(line)
        if len(table_lines) >= min_lines:
            # Check consistency: all lines have similar num_cols
            nums = [len(re.split(r'\s{2,}|\t', l)) for l in table_lines]
            if len(set(nums)) == 1:  # All same number of columns
                continue  # Keep adding
            else:
                # Inconsistent, stop
                table_lines = table_lines[:-1]  # Remove last inconsistent line
                break
    if len(table_lines) >= min_lines:
        return table_lines, start_idx + len(table_lines)
    return [], start_idx

def convert_to_markdown_table_dynamic(table_lines: list) -> list:
    """
    Dynamically convert detected table lines to markdown table.
    Assumes all lines have the same number of columns separated by \s{2,} or \t.
    Generates generic headers if not present.
    """
    import re
    if not table_lines:
        return []
    # Get columns for each line
    rows = []
    for line in table_lines:
        cols = re.split(r'\s{2,}|\t', line.strip())
        rows.append(cols)
    # Determine max columns
    max_cols = max(len(r) for r in rows)
    # Normalize rows
    for r in rows:
        while len(r) < max_cols:
            r.append("")
    # Assume first row is header if it looks like headers (all strings, no numbers, etc.)
    # Simple heuristic: if first row has no digits, treat as header
    is_header = not any(any(c.isdigit() for c in col) for col in rows[0])
    if is_header and len(rows) > 1:
        header = rows[0]
        data_rows = rows[1:]
    else:
        header = [f"Column {i+1}" for i in range(max_cols)]
        data_rows = rows
    # Build markdown
    md_lines = []
    md_lines.append("| " + " | ".join(header) + " |")
    md_lines.append("|" + "|".join([" --- "]*len(header)) + "|")
    for r in data_rows:
        md_lines.append("| " + " | ".join(r) + " |")
    return md_lines

def convert_to_markdown_table(table_lines: list) -> list:
    """
    Convert list of table lines (strings) to markdown table lines.
    Handles key-value pairs as tables, AWOL tables, and general tables.
    """
    import re
    rows = []
    is_key_value = any(':' in line for line in table_lines)

    if is_key_value:
        # Treat as key-value table
        for line in table_lines:
            line = line.strip()
            if ':' in line:
                key, value = line.split(':', 1)
                rows.append([key.strip(), value.strip()])
            else:
                # If no colon, perhaps header or other
                rows.append([line, ""])
        if rows:
            header = ["Field", "Value"]
    else:
        # Original logic for AWOL or general tables
        for line in table_lines:
            line = line.strip()
            if line.startswith("More than"):
                # Special case for "More than six (6) days Termination (T)"
                days = "More than six (6) days"
                penalty = "Termination (T)"
                rows.append([days, penalty])
            else:
                # For AWOL table, split by first space after number + "day" or "days"
                match = re.match(r'(\d+\s+days?)\s+(.*)', line)
                if match:
                    days = match.group(1)
                    penalty = match.group(2)
                    rows.append([days, penalty])
                else:
                    # Fallback to splitting by 2+ spaces or tabs
                    cols = re.split(r'\s{2,}|\t', line)
                    rows.append(cols)
        if rows:
            header = ["TOTAL AWOL DAYS", "PENALTY"] if len(rows[0]) == 2 else ["Column " + str(i+1) for i in range(len(rows[0]))]

    if not rows:
        return []

    # Determine max columns
    max_cols = max(len(r) for r in rows)

    # Normalize rows to max_cols
    for r in rows:
        while len(r) < max_cols:
            r.append("")

    # Build markdown table
    md_lines = []
    if rows:
        # Add header row
        md_lines.append("| " + " | ".join(header) + " |")
        # Separator
        md_lines.append("|" + "|".join([" --- "]*len(header)) + "|")
        # Data rows
        for r in rows:
            md_lines.append("| " + " | ".join(r) + " |")
    return md_lines

def preprocess_lists_in_text(text: str) -> str:
    """
    Detect lists (bullets - or *, numbered 1., 2., etc.) and group consecutive list items.
    Wrap groups in [LIST START] ... [LIST END].
    """
    lines = text.splitlines()
    new_lines = []
    in_list = False
    list_lines = []

    def is_list_line(line: str) -> bool:
        import re
        stripped = line.strip()
        return bool(re.match(r'^[-\*]\s+', stripped)) or bool(re.match(r'^\d+\.\s+', stripped))

    for line in lines:
        if is_list_line(line):
            list_lines.append(line)
            in_list = True
        else:
            if in_list:
                if len(list_lines) >= 2:
                    new_lines.append("[LIST START]")
                    new_lines.extend(list_lines)
                    new_lines.append("[LIST END]")
                else:
                    new_lines.extend(list_lines)
                list_lines = []
                in_list = False
            new_lines.append(line)
    # If file ends while still in list
    if in_list:
        if len(list_lines) >= 2:
            new_lines.append("[LIST START]")
            new_lines.extend(list_lines)
            new_lines.append("[LIST END]")
        else:
            new_lines.extend(list_lines)
    return "\n".join(new_lines)

def extract_headers(text: str) -> list[dict[str, Any]]:
    """
    Extract section headers using regex ^\d+(\.\d+)*\s+[A-Z].
    Return list of dicts with 'header', 'start_line', 'end_line'.
    """
    import re
    lines = text.splitlines()
    headers = []
    current_header = None
    for i, line in enumerate(lines):
        match = re.match(r'^(\d+(\.\d+)*)\s+([A-Z].*)', line.strip())
        if match:
            if current_header:
                current_header['end_line'] = i - 1
                headers.append(current_header)
            current_header = {
                'header': match.group(3),
                'start_line': i,
                'end_line': len(lines) - 1  # Will be updated
            }
    if current_header:
        current_header['end_line'] = len(lines) - 1
        headers.append(current_header)
    return headers

import pytesseract
from PIL import Image
import fitz  # PyMuPDF

import logging

def ocr_pdf(file_path: str):
    """
    Perform OCR on each page of the PDF and return list of Documents with page content and metadata.
    Uses docTR OCR as primary method.
    If 'text' key is missing or empty in docTR output, fallback to image-based OCR on that page using pytesseract.
    """
    docs = []
    if DOCTR_AVAILABLE:
        # Use docTR for better OCR
        model = ocr_predictor(pretrained=True)
        doc = DocumentFile.from_pdf(file_path)
        result = model(doc)
        for page_num, page in enumerate(result.pages):
            export_data = page.export()
            text = export_data.get('text', '')
            if not text.strip():
                logging.info(f"OCR fallback triggered for page {page_num} due to empty text.")
                # Fallback to image-based OCR for this page
                try:
                    import fitz
                    pix = None
                    pdf_doc = fitz.open(file_path)
                    if page_num < len(pdf_doc):
                        page_fitz = pdf_doc.load_page(page_num)
                        pix = page_fitz.get_pixmap()
                    if pix:
                        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                        text = pytesseract.image_to_string(img)
                        logging.info(f"OCR fallback successful for page {page_num}, extracted {len(text)} characters.")
                    else:
                        logging.warning(f"Could not load page {page_num} image for OCR fallback.")
                except Exception as e:
                    logging.error(f"OCR fallback failed on page {page_num}: {e}")
            metadata = {"page": page_num + 1, "source": file_path}
            docs.append(Document(page_content=text, metadata=metadata))
    else:
        # Fallback to pytesseract for full document
        import fitz
        doc = fitz.open(file_path)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap()
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            text = pytesseract.image_to_string(img)
            metadata = {"page": page_num + 1, "source": file_path}
            docs.append(Document(page_content=text, metadata=metadata))
    return docs

def assess_extraction_quality(text: str, page_num: int, total_pages: int) -> float:
    """
    Assess the quality of extracted text from a page.
    Returns a quality score between 0 and 1.
    Low score indicates potential need for OCR fallback.
    """
    if not text.strip():
        return 0.0

    # Basic heuristics
    text_length = len(text.strip())
    avg_words_per_page = 300  # Rough estimate
    expected_length = avg_words_per_page * (text.count(' ') + 1) / total_pages

    # Penalize very short text relative to expected
    length_score = min(1.0, text_length / expected_length) if expected_length > 0 else 0.5

    # Penalize high proportion of non-alphanumeric characters (possible OCR artifacts)
    alpha_num_ratio = sum(c.isalnum() for c in text) / len(text) if text else 0
    alpha_score = min(1.0, alpha_num_ratio * 2)  # Expect at least 50% alphanumeric

    # Combine scores
    quality_score = (length_score + alpha_score) / 2
    return quality_score

def load_pdf_with_unstructured(file_path: str):
    """
    Load PDF using Unstructured.io for semantic parsing into elements.
    Returns docs and per-page quality scores.
    """
    if not UNSTRUCTURED_AVAILABLE:
        return None, {}

    elements = partition_pdf(file_path, strategy="hi_res", extract_images_in_pdf=True)
    docs = []
    page_texts = {}  # page_num -> concatenated text for quality assessment
    current_page = 1
    current_section = ""
    total_pages = 1  # Will update based on elements

    for element in elements:
        # Update total_pages if available
        if hasattr(element, 'metadata') and element.metadata.get('page_number'):
            total_pages = max(total_pages, element.metadata['page_number'])

    for element in elements:
        page_num = current_page
        if hasattr(element, 'metadata') and element.metadata.get('page_number'):
            page_num = element.metadata['page_number']

        if isinstance(element, Title):
            # Use title as section
            current_section = element.text
            metadata = {"type": "header", "section": current_section, "page": page_num, "source": file_path, "extraction_method": "unstructured"}
            docs.append(Document(page_content=element.text, metadata=metadata))
            page_texts.setdefault(page_num, "").append(element.text + " ")
        elif isinstance(element, ListItem):
            # Group list items
            metadata = {"type": "list", "section": current_section, "page": page_num, "source": file_path, "extraction_method": "unstructured"}
            docs.append(Document(page_content=element.text, metadata=metadata))
            page_texts.setdefault(page_num, "").append(element.text + " ")
        elif isinstance(element, Table):
            # Convert table to markdown
            table_md = element.to_dict()['text']
            metadata = {"type": "table", "section": current_section, "page": page_num, "source": file_path, "extraction_method": "unstructured"}
            docs.append(Document(page_content=table_md, metadata=metadata))
            page_texts.setdefault(page_num, "").append(table_md + " ")
        elif isinstance(element, Image):
            # OCR the image
            text = element.to_dict().get('text', '[IMAGE]')
            metadata = {"type": "image", "section": current_section, "page": page_num, "source": file_path, "extraction_method": "unstructured"}
            docs.append(Document(page_content=text, metadata=metadata))
            page_texts.setdefault(page_num, "").append(text + " ")
        elif isinstance(element, Text):
            # Regular text
            metadata = {"type": "text", "section": current_section, "page": page_num, "source": file_path, "extraction_method": "unstructured"}
            docs.append(Document(page_content=element.text, metadata=metadata))
            page_texts.setdefault(page_num, "").append(element.text + " ")
        # Update current_page
        current_page = page_num

    # Assess quality per page
    quality_scores = {}
    for page_num, text in page_texts.items():
        quality_scores[page_num] = assess_extraction_quality(text, page_num, total_pages)

    return docs, quality_scores

def ocr_single_page(file_path: str, page_num: int) -> list[dict[str, Any]]:
    """
    Perform OCR on a single page of the PDF using docTR or pytesseract.
    Returns list of dicts with 'text', 'bbox' (x0,y0,x1,y1), and metadata.
    """
    text_blocks = []
    if DOCTR_AVAILABLE:
        # Use docTR for better OCR with bounding boxes
        model = ocr_predictor(pretrained=True)
        doc = DocumentFile.from_pdf(file_path)
        if page_num <= len(doc):
            page = doc[page_num - 1]  # 0-indexed
            result = model([page])
            page_data = result[0].export()
            for block in page_data['blocks']:
                for line in block['lines']:
                    for word in line['words']:
                        text = word['value']
                        geometry = word['geometry']
                        # geometry is [[x0,y0],[x1,y1]] normalized
                        x0, y0 = geometry[0]
                        x1, y1 = geometry[1]
                        # Convert to absolute if needed, but keep normalized for now
                        bbox = (x0, y0, x1, y1)
                        text_blocks.append({
                            'text': text,
                            'bbox': bbox,
                            'confidence': 0.9  # docTR doesn't provide per-word confidence
                        })
            # Estimate overall confidence
            confidence = min(1.0, len(' '.join([b['text'] for b in text_blocks])) / 500)
            metadata = {"page": page_num, "source": file_path, "extraction_method": "doctr", "ocr_confidence": confidence, "text_blocks": text_blocks}
            return [metadata]  # Return as list of metadata dicts
    else:
        # Fallback to pytesseract with bounding boxes
        import fitz
        doc = fitz.open(file_path)
        if page_num <= len(doc):
            page = doc.load_page(page_num - 1)
            pix = page.get_pixmap()
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
            n_boxes = len(data['text'])
            for i in range(n_boxes):
                if int(data['conf'][i]) > 0:  # Only confident detections
                    text = data['text'][i]
                    x, y, w, h = data['left'][i], data['top'][i], data['width'][i], data['height'][i]
                    bbox = (x, y, x + w, y + h)
                    confidence = int(data['conf'][i]) / 100
                    text_blocks.append({
                        'text': text,
                        'bbox': bbox,
                        'confidence': confidence
                    })
            # Average confidence
            confidences = [b['confidence'] for b in text_blocks]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            metadata = {"page": page_num, "source": file_path, "extraction_method": "tesseract", "ocr_confidence": avg_confidence, "text_blocks": text_blocks}
            return [metadata]
    # If page not found or error
    return [{"page": page_num, "source": file_path, "extraction_method": "failed", "ocr_confidence": 0.0, "text_blocks": []}]

def detect_layout_with_layoutparser(file_path: str, page_num: int, text_blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Use LayoutParser to detect layout elements: tables, text, titles, etc.
    Associate OCR text blocks with layout blocks based on bounding box overlap.
    Return list of blocks with type, content, bbox, text_blocks.
    """
    if not LAYOUTPARSER_AVAILABLE:
        # Fallback: classify all as text
        return [{"type": "text", "content": " ".join([b['text'] for b in text_blocks]), "bbox": None, "page": page_num, "source": file_path, "text_blocks": text_blocks}]

    try:
        # Get the image
        import fitz
        doc = fitz.open(file_path)
        if page_num > len(doc):
            return [{"type": "text", "content": " ".join([b['text'] for b in text_blocks]), "bbox": None, "page": page_num, "source": file_path, "text_blocks": text_blocks}]
        page = doc.load_page(page_num - 1)
        pix = page.get_pixmap()
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        # Load LayoutParser model
        model = lp.Detectron2LayoutModel('lp://PubLayNet/mask_rcnn_X_101_32x8d_FPN_3x')
        layout = model.detect(img)

        blocks = []
        for block in layout:
            # Find OCR text within this block's bbox
            block_bbox = block.block  # Assuming block.block is the bbox
            # Normalize if needed
            if hasattr(block, 'coordinates'):
                x0, y0, x1, y1 = block.coordinates
            else:
                x0, y0, x1, y1 = block_bbox.x_1, block_bbox.y_1, block_bbox.x_2, block_bbox.y_2
            # Collect text blocks that overlap with this layout block
            overlapping_text_blocks = []
            for tb in text_blocks:
                if bbox_overlap(tb['bbox'], (x0, y0, x1, y1)):
                    overlapping_text_blocks.append(tb)
            overlapping_text = [tb['text'] for tb in overlapping_text_blocks]
            content = " ".join(overlapping_text)
            if not content.strip():
                content = "[NO TEXT EXTRACTED]"
            # Classify based on content
            block_type = classify_block_type(block, content)
            blocks.append({
                "type": block_type,
                "content": content,
                "bbox": (x0, y0, x1, y1),
                "page": page_num,
                "source": file_path,
                "text_blocks": overlapping_text_blocks
            })

        # If no blocks detected, fallback to all text
        if not blocks:
            blocks = [{"type": "text", "content": " ".join([b['text'] for b in text_blocks]), "bbox": None, "page": page_num, "source": file_path, "text_blocks": text_blocks}]

        return blocks
    except Exception as e:
        print(f"LayoutParser detection failed: {e}")
        return [{"type": "text", "content": " ".join([b['text'] for b in text_blocks]), "bbox": None, "page": page_num, "source": file_path, "text_blocks": text_blocks}]

def classify_block_type(block, content: str) -> str:
    """
    Classify LayoutParser block into our types: table, header, text, form, list.
    Uses layout type and content heuristics.
    """
    block_type = block.type.lower()
    if 'table' in block_type or ('|' in content and content.count('|') > 2):
        return "table"
    elif 'title' in block_type or 'header' in block_type or (len(content.split()) < 10 and content.isupper()):
        return "header"
    elif 'text' in block_type:
        lines = content.split('\n')
        # Check for form: multiple key-value pairs
        colon_count = content.count(':')
        dash_count = content.count(' - ')
        if colon_count > 1 or dash_count > 1:
            return "form"
        # Check for list: lines starting with bullets or numbers
        list_indicators = ['- ', '* ', '• ']
        numbered = [f"{i}. " for i in range(1, 10)]
        list_indicators.extend(numbered)
        if any(any(line.strip().startswith(ind) for ind in list_indicators) for line in lines if line.strip()):
            return "list"
        else:
            return "text"
    else:
        return "text"

def bbox_overlap(bbox1, bbox2) -> bool:
    """
    Check if two bounding boxes overlap.
    bbox: (x0, y0, x1, y1)
    """
    x0_1, y0_1, x1_1, y1_1 = bbox1
    x0_2, y0_2, x1_2, y1_2 = bbox2
    return not (x1_1 < x0_2 or x1_2 < x0_1 or y1_1 < y0_2 or y1_2 < y0_1)

# Post-processing functions

def convert_table_to_markdown(content: str) -> str:
    """
    Convert detected table content to markdown format.
    Assumes content is space/tab separated rows.
    """
    lines = content.strip().split('\n')
    if not lines:
        return content
    # Simple heuristic: split by multiple spaces or tabs
    import re
    md_lines = []
    for line in lines:
        cols = re.split(r'\s{2,}|\t', line.strip())
        if cols:
            md_lines.append('| ' + ' | '.join(cols) + ' |')
    if md_lines:
        # Add separator
        md_lines.insert(1, '|' + '|'.join([' --- ']*len(re.split(r'\s{2,}|\t', lines[0].strip()))) + '|')
    return '\n'.join(md_lines)

def convert_form_to_json(content: str) -> str:
    """
    Convert detected form content (key-value pairs) to JSON string.
    Assumes lines like "Key: Value" or "Key - Value".
    """
    import json
    form_dict = {}
    lines = content.strip().split('\n')
    for line in lines:
        if ':' in line:
            key, value = line.split(':', 1)
            form_dict[key.strip()] = value.strip()
        elif ' - ' in line:
            key, value = line.split(' - ', 1)
            form_dict[key.strip()] = value.strip()
    return json.dumps(form_dict, indent=2)

def postprocess_forms_in_text(text: str) -> str:
    """
    Detect and convert form-like sections in text to JSON.
    If text has at least 3 key-value pairs, convert them to JSON and append other text.
    """
    lines = text.split('\n')
    form_lines = []
    other_lines = []
    for line in lines:
        stripped = line.strip()
        if ':' in stripped and len(stripped.split(':', 1)) == 2:
            form_lines.append(stripped)
        else:
            other_lines.append(line)
    if len(form_lines) >= 3:  # Threshold for form detection
        form_dict = {}
        for line in form_lines:
            key, value = line.split(':', 1)
            form_dict[key.strip()] = value.strip()
        json_str = json.dumps(form_dict, indent=2)
        return json_str + '\n\n' + '\n'.join(other_lines).strip()
    else:
        return text

def convert_header_to_markdown(content: str) -> str:
    """
    Convert detected header content to markdown header.
    """
    return f"# {content.strip()}"

# Improved table detection with pdfplumber

def extract_tables_with_pdfplumber(file_path: str, page_num: int) -> list[str]:
    """
    Extract tables from a specific page using pdfplumber.
    Returns list of markdown table strings.
    """
    tables_md = []
    try:
        with pdfplumber.open(file_path) as pdf:
            if page_num <= len(pdf.pages):
                page = pdf.pages[page_num - 1]
                tables = page.extract_tables()
                for table in tables:
                    if table:
                        # Convert to markdown
                        md_lines = []
                        for row in table:
                            if row:
                                md_lines.append('| ' + ' | '.join([str(cell) if cell else '' for cell in row]) + ' |')
                        if md_lines:
                            # Add header separator
                            md_lines.insert(1, '|' + '|'.join([' --- ']*len(table[0])) + '|')
                            tables_md.append('\n'.join(md_lines))
    except Exception as e:
        print(f"pdfplumber table extraction failed: {e}")
    return tables_md

# Enhanced form detection using bounding boxes

def detect_key_value_pairs(text_blocks: list[dict[str, Any]]) -> dict[str, str]:
    """
    Detect key-value pairs from OCR text blocks based on alignment.
    Assumes keys are left-aligned, values right-aligned or on same line.
    """
    form_dict = {}
    # Sort by y-coordinate (top to bottom)
    sorted_blocks = sorted(text_blocks, key=lambda b: b['bbox'][1])
    for i, block in enumerate(sorted_blocks):
        text = block['text'].strip()
        if ':' in text:
            key, value = text.split(':', 1)
            form_dict[key.strip()] = value.strip()
        elif ' - ' in text:
            key, value = text.split(' - ', 1)
            form_dict[key.strip()] = value.strip()
        else:
            # Check for alignment: if next block is to the right, assume key-value
            if i + 1 < len(sorted_blocks):
                next_block = sorted_blocks[i + 1]
                if (abs(block['bbox'][1] - next_block['bbox'][1]) < 10 and  # Same row approx
                    next_block['bbox'][0] > block['bbox'][2]):  # Next block to the right
                    form_dict[block['text'].strip()] = next_block['text'].strip()
    return form_dict

def dynamic_extract_pdf(file_path: str) -> list[Document]:
    """
    Dynamic extraction pipeline: OCR with bounding boxes, LayoutParser detection, post-processing.
    Returns list of Documents with structured content.
    """
    docs = []
    import fitz
    pdf_doc = fitz.open(file_path)
    total_pages = len(pdf_doc)

    for page_num in range(1, total_pages + 1):
        # Step 1: OCR with bounding boxes
        ocr_result = ocr_single_page(file_path, page_num)
        if ocr_result and ocr_result[0].get("text_blocks"):
            text_blocks = ocr_result[0]["text_blocks"]
        else:
            # Fallback to simple OCR
            simple_ocr = ocr_pdf(file_path)
            if page_num <= len(simple_ocr):
                doc = simple_ocr[page_num - 1]
                docs.append(Document(page_content=doc.page_content, metadata={"type": "text", "page": page_num, "source": file_path, "extraction_method": "simple_ocr"}))
            continue

        # Step 2: LayoutParser detection
        layout_blocks = detect_layout_with_layoutparser(file_path, page_num, text_blocks)

        # Step 3: Post-process each block
        for block in layout_blocks:
            block_type = block["type"]
            content = block["content"]
            if block_type == "table":
                # Try pdfplumber first
                tables_md = extract_tables_with_pdfplumber(file_path, page_num)
                if tables_md:
                    processed_content = "\n\n".join(tables_md)
                else:
                    processed_content = convert_table_to_markdown(content)
            elif block_type == "form":
                # Use bounding box alignment for key-value pairs
                form_dict = detect_key_value_pairs(block["text_blocks"])
                processed_content = json.dumps(form_dict, indent=2)
            elif block_type == "header":
                processed_content = convert_header_to_markdown(content)
            else:
                processed_content = content  # text as is

            metadata = {
                "type": block_type,
                "page": page_num,
                "source": file_path,
                "extraction_method": "dynamic",
                "bbox": block.get("bbox")
            }
            docs.append(Document(page_content=processed_content, metadata=metadata))

    return docs

def load_pdf(file_path: str):
    """
    Load PDF with hybrid extraction: Unstructured.io first, selective docTR fallback for low-quality pages.
    Returns docs, metadata where metadata includes num_pages.
    """
    # Try Unstructured first
    unstructured_result = load_pdf_with_unstructured(file_path)
    if unstructured_result is None:
        unstructured_docs = None
        quality_scores = {}
    else:
        unstructured_docs, quality_scores = unstructured_result

    if unstructured_docs:
        # Assess quality and selectively fallback
        final_docs = []
        total_pages = max(quality_scores.keys()) if quality_scores else 1
        quality_threshold = 0.3  # Below this, use OCR fallback

        for doc in unstructured_docs:
            page_num = doc.metadata.get("page", 1)
            quality = quality_scores.get(page_num, 1.0)
            if quality >= quality_threshold:
                final_docs.append(doc)
            else:
                # Fallback to OCR for this page
                ocr_docs = ocr_single_page(file_path, page_num)
                # Normalize metadata to match unstructured format
                for ocr_doc in ocr_docs:
                    ocr_doc.metadata.update({
                        "type": "text" if ocr_doc.metadata.get("type") != "table" else "table",  # Keep table type if detected
                        "section": "",  # No section info from OCR
                        "heading": "",
                        "extraction_method": ocr_doc.metadata.get("extraction_method", "ocr")
                    })
                    final_docs.append(ocr_doc)

        # Normalize all docs to have consistent metadata
        for doc in final_docs:
            if "type" not in doc.metadata:
                doc.metadata["type"] = "text"
            if "section" not in doc.metadata:
                doc.metadata["section"] = ""
            if "heading" not in doc.metadata:
                doc.metadata["heading"] = ""

        # Fix multiline URLs
        for doc in final_docs:
            doc.page_content = fix_multiline_urls(doc.page_content)

        metadata = {"num_pages": total_pages}
        return final_docs, metadata

    # Full fallback if Unstructured failed
    import fitz
    pdf_doc = fitz.open(file_path)
    total_pages = len(pdf_doc)
    pdf_doc.close()

    try:
        loader = PyPDFLoader(file_path)
        docs = loader.load()
    except Exception:
        loader = PyMuPDFLoader(file_path)
        docs = loader.load()
    # If no text extracted, full OCR
    if all(not doc.page_content.strip() for doc in docs):
        docs = ocr_pdf(file_path)
        # Add ocr_confidence to metadata
        for doc in docs:
            doc.metadata["ocr_confidence"] = 0.5  # Default for full OCR fallback
            doc.metadata["extraction_method"] = "ocr_fallback"
    # Preprocess and normalize
    for i, doc in enumerate(docs):
        page_num = doc.metadata.get("page", i + 1)
        # Try pdfplumber for tables first
        tables_md = extract_tables_with_pdfplumber(file_path, page_num)
        if tables_md:
            table_content = "\n\n".join(tables_md)
            augmented_content = f"[TABLE START]\n{table_content}\n[TABLE END]\n\n{doc.page_content}"
        else:
            augmented_content = doc.page_content
        preprocessed_text = preprocess_tables_in_text(augmented_content)
        preprocessed_text = preprocess_lists_in_text(preprocessed_text)
        headers = extract_headers(preprocessed_text)
        doc_metadata = doc.metadata.copy() if doc.metadata else {}
        if "page" not in doc_metadata:
            doc_metadata["page"] = page_num
        if "source" not in doc_metadata:
            doc_metadata["source"] = file_path
        if "type" not in doc_metadata:
            doc_metadata["type"] = "text"
        if "section" not in doc_metadata:
            doc_metadata["section"] = ""
        if "heading" not in doc_metadata:
            doc_metadata["heading"] = ""
        doc_metadata["headers"] = headers
        doc_metadata["extraction_method"] = doc_metadata.get("extraction_method", "fallback")
        docs[i] = doc.copy(update={"page_content": preprocessed_text, "metadata": doc_metadata})

    # Fix multiline URLs
    for doc in docs:
        doc.page_content = fix_multiline_urls(doc.page_content)

    metadata = {"num_pages": total_pages}
    return docs, metadata

# Text Chunking

def structured_chunk_documents(docs: list[Document]) -> list[Document]:
    """
    Split documents by sections based on headers, then chunk within sections.
    Keep tables and lists intact as single chunks.
    """
    chunks = []
    for doc in docs:
        text = doc.page_content
        headers = doc.metadata.get("headers", [])
        page = doc.metadata.get("page", 1)
        source = doc.metadata.get("source", "")

        if not headers:
            # No headers, chunk the whole document
            chunks.extend(chunk_text(text, page, source, ""))
        else:
            # Split by sections
            lines = text.splitlines()
            for header in headers:
                start = header['start_line']
                end = header['end_line']
                section_text = "\n".join(lines[start:end+1])
                section_heading = header['header']
                chunks.extend(chunk_text(section_text, page, source, section_heading))
    return chunks

def chunk_text(text: str, page: int, source: str, heading: str) -> list[Document]:
    """
    Chunk text within a section, keeping tables and lists intact.
    """
    import re
    chunks = []
    # Split by [TABLE START], [TABLE END], [LIST START], [LIST END]
    parts = re.split(r'(\[TABLE START\]|\[TABLE END\]|\[LIST START\]|\[LIST END\])', text)
    current_chunk = ""
    in_table = False
    in_list = False

    for part in parts:
        if part == "[TABLE START]":
            in_table = True
            current_chunk += part
        elif part == "[TABLE END]":
            in_table = False
            current_chunk += part
            # Create chunk for table
            if current_chunk.strip():
                metadata = {"type": "table", "heading": heading, "page": page, "source": source}
                chunks.append(Document(page_content=current_chunk.strip(), metadata=metadata))
                current_chunk = ""
        elif part == "[LIST START]":
            in_list = True
            current_chunk += part
        elif part == "[LIST END]":
            in_list = False
            current_chunk += part
            # Create chunk for list
            if current_chunk.strip():
                metadata = {"type": "list", "heading": heading, "page": page, "source": source}
                chunks.append(Document(page_content=current_chunk.strip(), metadata=metadata))
                current_chunk = ""
        else:
            current_chunk += part

    # Handle remaining text
    if current_chunk.strip():
        # Split prose text with recursive splitter
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP
        )
        prose_chunks = splitter.split_text(current_chunk.strip())
        for chunk_text in prose_chunks:
            metadata = {"type": "paragraph", "heading": heading, "page": page, "source": source}
            chunks.append(Document(page_content=chunk_text, metadata=metadata))

    return chunks

def chunk_documents(docs: list[Document]) -> list[Document]:
    """
    Chunk documents. Element-based chunks from Unstructured/OCR, split long text elements.
    """
    if not docs:
        return []

    chunks = []
    for doc in docs:
        content = doc.page_content
        metadata = doc.metadata.copy()

        # If content is short or is a special type (table, list), keep as is
        if len(content) <= CHUNK_SIZE or metadata.get("type") in ["table", "list"]:
            chunks.append(doc)
        else:
            # Split long text elements
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=CHUNK_SIZE,
                chunk_overlap=CHUNK_OVERLAP
            )
            split_texts = splitter.split_text(content)
            for split_text in split_texts:
                chunk_metadata = metadata.copy()
                chunk_metadata["type"] = "paragraph"  # Mark as split paragraph
                chunks.append(Document(page_content=split_text, metadata=chunk_metadata))

    return chunks

# Vector Indexing

FAISS_INDEX_PATH = "server/lib/faiss_index"

async def index_documents(docs):
    embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=os.getenv("OLLAMA_URL"))
    chunks = chunk_documents(docs)
    import pathlib
    index_faiss_path = pathlib.Path(FAISS_INDEX_PATH) / "index.faiss"
    if index_faiss_path.exists():
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

# Hybrid search: FAISS similarity + keyword matching + metadata bias + neighbor retrieval

def apply_metadata_bias(query: str, docs: list[Document]) -> list[Document]:
    """
    Boost chunks based on query keywords and metadata type with semantic mappings.
    E.g., if query contains 'table', prioritize type=table.
    Extended with semantic mappings: breakdown -> table, approval -> form, etc.
    """
    biased_docs = []
    query_lower = query.lower()
    semantic_mappings = {
        "table": ["table", "breakdown", "data", "chart"],
        "form": ["form", "approval", "application", "key-value", "field"],
        "list": ["list", "bullet", "numbered", "items"],
        "header": ["header", "title", "section"],
        "text": ["paragraph", "content", "description"]
    }
    for doc in docs:
        score = 0
        doc_type = doc.metadata.get("type", "text")
        for mapped_type, keywords in semantic_mappings.items():
            if any(kw in query_lower for kw in keywords) and doc_type == mapped_type:
                score += 2
        # Add score to metadata for sorting
        doc.metadata["bias_score"] = score
        biased_docs.append(doc)
    # Sort by bias score descending
    biased_docs.sort(key=lambda d: d.metadata.get("bias_score", 0), reverse=True)
    return biased_docs

def get_neighbors(doc: Document, all_docs: list[Document], n: int = 1) -> list[Document]:
    """
    Get N-1 and N+1 neighbors from the same section/page.
    """
    neighbors = []
    page = doc.metadata.get("page")
    section = doc.metadata.get("section") or doc.metadata.get("heading")
    source = doc.metadata.get("source")
    # Find index of current doc
    try:
        idx = next(i for i, d in enumerate(all_docs) if d.page_content == doc.page_content)
        # Get neighbors
        for offset in range(-n, n+1):
            if offset == 0:
                continue
            neighbor_idx = idx + offset
            if 0 <= neighbor_idx < len(all_docs):
                neighbor = all_docs[neighbor_idx]
                neighbor_section = neighbor.metadata.get("section") or neighbor.metadata.get("heading")
                if (neighbor.metadata.get("page") == page and
                    neighbor_section == section and
                    neighbor.metadata.get("source") == source):
                    neighbors.append(neighbor)
    except StopIteration:
        pass
    return neighbors

def prepend_section_heading(doc: Document) -> Document:
    """
    Prepend section heading to the chunk content.
    """
    section = doc.metadata.get("section") or doc.metadata.get("heading", "")
    if section:
        new_content = f"Section: {section}\n\n{doc.page_content}"
        return doc.copy(update={"page_content": new_content})
    return doc

def hybrid_search(vector_store: FAISS, query: str, metadata_filter: dict[str, Any] = None, k: int = 5):
    # FAISS similarity search with k=5
    faiss_results = vector_store.similarity_search(query, k=5)
    # Keyword matching
    keyword_results = []
    all_docs = vector_store.docstore._dict.values()  # Access all docs
    for doc in all_docs:
        if query.lower() in doc.page_content.lower():
            if metadata_filter:
                if all(doc.metadata.get(key) == val for key, val in metadata_filter.items()):
                    keyword_results.append(doc)
            else:
                keyword_results.append(doc)
    # Combine and deduplicate
    combined = {d.page_content: d for d in faiss_results + keyword_results}
    initial_results = list(combined.values())[:k]

    # Apply metadata bias
    biased_results = apply_metadata_bias(query, initial_results)

    # Neighbor retrieval
    expanded_results = []
    for doc in biased_results:
        expanded_results.append(doc)
        neighbors = get_neighbors(doc, list(all_docs))
        expanded_results.extend(neighbors)

    # Deduplicate again
    expanded_results = list({d.page_content: d for d in expanded_results}.values())

    # Prepend section heading
    final_results = [prepend_section_heading(doc) for doc in expanded_results[:k]]

    return final_results

# Retrieval QA chain

from langchain.schema import BaseRetriever
from langchain.callbacks.manager import CallbackManagerForRetrieverRun
from typing import List as TypingList

class HybridRetriever(BaseRetriever):
    vector_store: FAISS

    def _get_relevant_documents(self, query: str, *, run_manager: CallbackManagerForRetrieverRun) -> TypingList[Document]:
        return hybrid_search(self.vector_store, query, k=5)

def get_qa_chain(vector_store: FAISS, llm):
    retriever = HybridRetriever(vector_store=vector_store)
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        chain_type="stuff"
    )
    return qa_chain

# Metadata filtering for access control

def fix_multiline_urls(text: str) -> str:
    """
    Fix URLs that are split across multiple lines by removing newlines and spaces within URL patterns.
    """
    import re
    # Find all http/https URLs, even if split
    url_pattern = r'https?://[^\s\n]+(?:\n[^\s\n]*)*'
    def fix_url(match):
        url = match.group(0)
        # Remove newlines and extra spaces
        fixed = re.sub(r'\s+', '', url)
        return fixed
    return re.sub(url_pattern, fix_url, text, flags=re.IGNORECASE | re.MULTILINE)

def filter_by_metadata(docs: List[Document], user_permissions: List[str]):
    return [doc for doc in docs if set(doc.metadata.get('permissions', [])) & set(user_permissions)]
