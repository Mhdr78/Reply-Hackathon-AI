"""Start the unified local API used by the lecture UI."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / 'src'))
if __name__ == '__main__':
    import uvicorn
    from lecture_rag.unified_api import create_app
    uvicorn.run(create_app(), host='127.0.0.1', port=8787)
