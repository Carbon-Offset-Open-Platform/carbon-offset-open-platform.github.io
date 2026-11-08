"""Snapshot the measured periods for the 3D scatter's offline fallback.

Reads the public, read-only API the site serves, so the snapshot matches what
the live endpoint returns. Run from the repo root:  python3 scripts/export_periods.py
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))
from fastapi.testclient import TestClient  # noqa: E402
from index import app  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "assets" / "data" / "measured-periods.json"

rows = TestClient(app).get("/api/v0/emissions", params={"limit": 500}).json()["emissions"]
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({
    "source": "SCOOP public measurement API, /api/v0/emissions (single lab server)",
    "note": "Measured, not estimated. Snapshot for offline use; the live API is authoritative.",
    "rows": rows,
}, indent=1) + "\n")
print("wrote", len(rows), "periods to", OUT)
