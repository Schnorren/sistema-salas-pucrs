from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import pdfplumber
import re
import io
import gc
import traceback
import sys

app = FastAPI(title="Extrator PDF PUCRS")

DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
PERIOD_LABEL = {
    'A': 'A (08:00-08:45)', 'B': 'B (08:45-09:30)', 'C': 'C (09:45-10:30)',
    'D': 'D (10:30-11:15)', 'E': 'E (11:30-12:15)', 'E1': 'E1 (12:15-13:00)',
    'F': 'F (14:00-14:45)', 'G': 'G (14:45-15:30)', 'H': 'H (15:45-16:30)',
    'I': 'I (16:30-17:15)', 'J': 'J (17:30-18:15)', 'K': 'K (18:15-19:00)',
    'L': 'L (19:15-20:00)', 'M': 'M (20:00-20:45)', 'N': 'N (21:00-21:45)',
    'P': 'P (21:45-22:30)'
}

PERIOD_RE = re.compile(r'^(\d{2}:\d{2})([A-Z][0-9]?)')
ROOM_RE = re.compile(r'C\.(\d+)\.A\.(\d{2})\.(\d{2,3}(?:\.\d{2})?)')
FOOTER_RE = re.compile(r'^Data:\s*\d{2}/\d{2}/\d{4}')

def parse_room_code(text):
    m = re.search(r'C\.\d+\.A\.\d{2}\.\d{2,3}(?:\.\d{2})?(?:\/[A-Z])?', str(text))
    if m:
        return m.group(0)
    return str(text).strip()

def parse_period(cell_text):
    if not cell_text: return None
    m = PERIOD_RE.match(str(cell_text).strip())
    return m.group(2) if m else None

def clean_class_name(raw):
    if not raw: return ""
    text = str(raw).replace('\n', ' ').strip()
    text = re.sub(r' {2,}', ' ', text)
    if FOOTER_RE.match(text): return ""
    return text

def extract_page(page):
    try:
        table_settings = {
            "vertical_strategy": "lines", 
            "horizontal_strategy": "lines",
            "snap_tolerance": 3,
        }
        
        tables = page.extract_tables(table_settings=table_settings)
        if not tables: return []

        main_table = max(tables, key=lambda t: len(t))
        if not main_table: return []

        all_text = ' '.join(str(cell) for t in tables for row in t for cell in row if cell)
        m = ROOM_RE.search(all_text)
        if not m: return []
        
        room_code = parse_room_code(m.group(0))
        header_row_idx = None
        day_col_map = {}
        
        for row_idx, row in enumerate(main_table):
            day_cols = {}
            for col_idx, cell in enumerate(row):
                if cell:
                    cleaned_cell = str(cell).strip()
                    if cleaned_cell in DAYS:
                        day_cols[cleaned_cell] = col_idx
            if len(day_cols) >= 5:
                header_row_idx = row_idx
                day_col_map = day_cols
                break

        if header_row_idx is None or not day_col_map: return []

        period_col_idx = 0
        if len(main_table) > header_row_idx + 1 and len(main_table[0]) > 0:
            for col_idx in range(len(main_table[0])):
                for row in main_table[header_row_idx + 1: header_row_idx + 10]:
                    if col_idx < len(row) and row[col_idx]:
                        if PERIOD_RE.match(str(row[col_idx]).strip()):
                            period_col_idx = col_idx
                            break
                else: continue
                break

        records = []
        for row in main_table[header_row_idx + 1:]:
            if not row or all(c is None or str(c).strip() == '' for c in row): continue

            period_cell = row[period_col_idx] if period_col_idx < len(row) else None
            period_letter = parse_period(period_cell or "")
            if not period_letter: continue

            period_label = PERIOD_LABEL.get(period_letter, period_letter)

            for day_name, col_idx in day_col_map.items():
                if col_idx >= len(row): continue
                class_name = clean_class_name(row[col_idx] or "")
                if class_name:
                    records.append({
                        'Sala': room_code,
                        'Dia': day_name,
                        'Periodo': period_label,
                        'Nome_da_Aula': class_name,
                    })
        return records
    except Exception as e:
        print(f"⚠️ Erro ao processar página: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return []

@app.get("/")
async def root():
    return {
        "status": "online", 
        "service": "Extrator PDF PUCRS",
        "docs": "/docs" 
    }
    
@app.post("/extract-pdf")
async def extract_pdf_endpoint(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="O arquivo deve ser um PDF")
    
    try:
        file_bytes = await file.read()
        all_records = []
        
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                records = extract_page(page)
                all_records.extend(records)
                
                try:
                    page.flush_cache()
                except AttributeError:
                    pass
                
        gc.collect()
                
        if not all_records:
            raise HTTPException(status_code=422, detail="Nenhum dado encontrado no PDF. Verifique o formato.")
            
        return JSONResponse(content={"records": all_records})
    
    except Exception as e:
        print("🚨 ERRO FATAL NO ENDPOINT /extract-pdf:", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(status_code=500, detail=str(e))