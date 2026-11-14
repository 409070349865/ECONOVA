import io
import json
import re
import zipfile
from html.parser import HTMLParser
from pathlib import PurePosixPath
from xml.etree import ElementTree

import pandas as pd

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_ROWS = 50_000
MAX_COLUMNS = 80
MAX_ANALYSIS_CHARS = 24_000
SUPPORTED_EXTENSIONS = {
    ".csv", ".tsv", ".xlsx", ".xls", ".json", ".jsonl", ".pdf", ".docx",
    ".pptx", ".txt", ".md", ".markdown", ".html", ".htm", ".xml",
}


class UploadFormatError(ValueError):
    pass


class _HTMLText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        text = data.strip()
        if text:
            self.parts.append(text)


def _safe_text(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            return data.decode("cp1252")
        except UnicodeDecodeError as exc:
            raise UploadFormatError("This text file is not UTF-8 or Windows-1252 encoded.") from exc


def _validate_archive(data: bytes):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            total_size = sum(entry.file_size for entry in entries)
            if len(entries) > 2_000 or total_size > 120 * 1024 * 1024:
                raise UploadFormatError("The Office document expands beyond the safe processing limit.")
    except zipfile.BadZipFile as exc:
        raise UploadFormatError("The uploaded Office document is damaged or is not a valid file.") from exc


def _frame_report(frame: pd.DataFrame, label: str) -> str:
    frame = frame.iloc[:, :MAX_COLUMNS].copy()
    row_count = len(frame)
    columns = list(frame.columns)
    lines = [f"Sheet: {label}", f"Rows analyzed: {row_count}{' (processing limit reached; file may contain more)' if row_count >= MAX_ROWS else ''}", f"Columns analyzed: {len(columns)}"]
    numeric_columns = list(frame.select_dtypes(include="number").columns)[:20]
    for column in columns[:MAX_COLUMNS]:
        series = frame[column]
        missing = int(series.isna().sum())
        try:
            distinct = series.nunique(dropna=True)
        except TypeError:
            distinct = series.dropna().astype(str).nunique(dropna=True)
        lines.append(f"- {str(column)[:100]}: {series.dtype}; {missing} missing; {distinct} distinct")
        if column in numeric_columns and series.notna().any():
            numeric = series.dropna()
            lines.append(
                f"  min={numeric.min():.6g}, median={numeric.median():.6g}, "
                f"mean={numeric.mean():.6g}, max={numeric.max():.6g}, sum={numeric.sum():.6g}"
            )
        elif series.notna().any():
            common = series.dropna().astype(str).value_counts().head(3)
            if not common.empty:
                lines.append("  common values: " + "; ".join(f"{value[:60]} ({count})" for value, count in common.items()))
    sample = frame.iloc[:8, :12]
    if not sample.empty:
        lines.extend(["Sample rows (first 8 rows, up to 12 columns):", sample.to_csv(index=False)])

    group_candidates = []
    for column in columns:
        key = str(column).lower()
        if any(term in key for term in ("year", "period", "date", "country", "region", "sector", "category")):
            try:
                count = frame[column].nunique(dropna=True)
            except TypeError:
                count = frame[column].dropna().astype(str).nunique(dropna=True)
            if 2 <= count <= 30:
                group_candidates.append(column)
        if len(group_candidates) >= 3:
            break
    for group in group_candidates:
        if not numeric_columns:
            break
        try:
            grouped = frame.groupby(group, dropna=True)[numeric_columns[:5]].mean(numeric_only=True).tail(20)
        except (TypeError, ValueError):
            # JSON-derived tables can contain nested values that are not valid
            # pandas group keys; skip that optional summary and keep the upload usable.
            continue
        if not grouped.empty:
            lines.append(f"Average numeric values by {group} (up to 20 groups):")
            lines.append(grouped.to_string())
    return "\n".join(lines)


def _json_frame(data: bytes, lines: bool) -> pd.DataFrame:
    if lines:
        return pd.read_json(io.BytesIO(data), lines=True, nrows=MAX_ROWS)
    try:
        value = json.loads(_safe_text(data))
    except json.JSONDecodeError as exc:
        raise UploadFormatError("The JSON file is not valid JSON.") from exc
    if isinstance(value, dict) and isinstance(value.get("data"), list):
        value = value["data"]
    if isinstance(value, (list, dict)):
        try:
            return pd.json_normalize(value if isinstance(value, list) else [value]).head(MAX_ROWS)
        except (TypeError, ValueError):
            pass
    raise UploadFormatError("This JSON structure could not be converted into a table. Upload a JSON object or array of records.")


def _extract_document(data: bytes, extension: str) -> str:
    if extension in {".txt", ".md", ".markdown"}:
        return _safe_text(data)
    if extension in {".html", ".htm"}:
        parser = _HTMLText()
        parser.feed(_safe_text(data))
        return "\n".join(parser.parts)
    if extension == ".xml":
        try:
            return "\n".join(part.strip() for part in ElementTree.fromstring(data).itertext() if part.strip())
        except ElementTree.ParseError as exc:
            raise UploadFormatError("The XML file is not well formed.") from exc
    if extension == ".pdf":
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(data), strict=False)
            if reader.is_encrypted:
                raise UploadFormatError("Password-protected PDFs are not supported.")
            if len(reader.pages) > 500:
                raise UploadFormatError("PDFs are limited to 500 pages per upload.")
            parts = [f"[Page {number}]\n{page.extract_text() or ''}" for number, page in enumerate(reader.pages, start=1)]
            text = "\n\n".join(parts).strip()
            if not text:
                raise UploadFormatError("No selectable text was found. Scanned PDFs need OCR and are not supported yet.")
            return text
        except UploadFormatError:
            raise
        except Exception as exc:
            raise UploadFormatError("Could not read this PDF. Check that it is valid and not password protected.") from exc
    if extension in {".docx", ".pptx"}:
        _validate_archive(data)
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if extension == ".docx":
                    xml = ElementTree.fromstring(archive.read("word/document.xml"))
                    paragraphs = []
                    for paragraph in xml.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
                        value = "".join(node.text or "" for node in paragraph.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"))
                        if value.strip():
                            paragraphs.append(value)
                    return "\n".join(paragraphs)
                slides = sorted((name for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)), key=lambda name: int(re.search(r"slide(\d+)", name).group(1)))
                if len(slides) > 500:
                    raise UploadFormatError("Presentations are limited to 500 slides per upload.")
                parts = []
                for number, name in enumerate(slides, start=1):
                    xml = ElementTree.fromstring(archive.read(name))
                    text = " ".join(node.text or "" for node in xml.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}t"))
                    if text.strip():
                        parts.append(f"[Slide {number}] {text}")
                return "\n".join(parts)
        except UploadFormatError:
            raise
        except Exception as exc:
            raise UploadFormatError("Could not read this Office document. Check that it is a valid DOCX or PPTX file.") from exc
    raise UploadFormatError("This file type is not supported.")


def analyze_upload(filename: str, data: bytes) -> tuple[str, str, str]:
    if not data:
        raise UploadFormatError("The selected file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadFormatError("Files must be 15 MB or smaller.")
    normalized_name = filename.replace("\\", "/")
    safe_name = PurePosixPath(normalized_name).name[:255] or "upload"
    extension = PurePosixPath(safe_name).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        accepted = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise UploadFormatError(f"Unsupported file type. Supported types: {accepted}.")

    try:
        if extension in {".csv", ".tsv"}:
            try:
                frame = pd.read_csv(io.BytesIO(data), sep="\t" if extension == ".tsv" else None, engine="python", nrows=MAX_ROWS, encoding="utf-8-sig")
            except UnicodeDecodeError:
                frame = pd.read_csv(io.BytesIO(data), sep="\t" if extension == ".tsv" else None, engine="python", nrows=MAX_ROWS, encoding="cp1252")
            analysis = _frame_report(frame, safe_name)
            file_type = "table"
        elif extension in {".xlsx", ".xls"}:
            if extension == ".xlsx":
                _validate_archive(data)
            sheets = pd.read_excel(io.BytesIO(data), sheet_name=None, nrows=MAX_ROWS, engine="openpyxl" if extension == ".xlsx" else "xlrd")
            if not sheets:
                raise UploadFormatError("No worksheet data was found in this workbook.")
            analysis = "\n\n".join(_frame_report(frame, str(name)) for name, frame in list(sheets.items())[:5])
            if len(sheets) > 5:
                analysis += f"\nOnly the first 5 of {len(sheets)} worksheets were analyzed."
            file_type = "spreadsheet"
        elif extension in {".json", ".jsonl"}:
            try:
                frame = _json_frame(data, lines=extension == ".jsonl")
                analysis = _frame_report(frame, safe_name)
                file_type = "table"
            except UploadFormatError:
                if extension == ".jsonl":
                    raise
                analysis = _safe_text(data)
                file_type = "document"
        else:
            analysis = _extract_document(data, extension)
            if not analysis.strip():
                raise UploadFormatError("No readable text was found in this file.")
            analysis = f"File: {safe_name}\nType: {extension[1:].upper()} text document\nExtracted characters: {len(analysis)}\n\n{analysis}"
            file_type = "document"
    except UploadFormatError:
        raise
    except Exception as exc:
        raise UploadFormatError(f"Could not analyze this file: {type(exc).__name__}.") from exc

    if len(analysis) > MAX_ANALYSIS_CHARS:
        analysis = analysis[:MAX_ANALYSIS_CHARS] + "\n\n[The extracted analysis context was shortened to fit the safe chat limit.]"
    return safe_name, file_type, analysis
