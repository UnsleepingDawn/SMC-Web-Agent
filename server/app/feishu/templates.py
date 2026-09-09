"""Load the Feishu post-message templates from JSON.

Both templates are Feishu "post" messages whose text segments are filled in at
render time. The index of each placeholder segment is part of the template
contract, so the files stay byte-for-byte close to the originals.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Dict, List

TEMPLATE_DIR = Path(__file__).parent / "templates"


class PostTemplate:
    """One loaded template; segments are addressed by paragraph and index."""

    def __init__(self, payload: Dict[str, Any]) -> None:
        zh_cn = payload.get("zh_cn") or {}
        self.title: str = str(zh_cn.get("title") or "")
        self.content: List[List[Dict[str, Any]]] = zh_cn.get("content") or []

    def segment(self, paragraph: int, index: int) -> Dict[str, Any]:
        """A deep copy of one segment, safe to mutate before sending."""
        return copy.deepcopy(self.content[paragraph][index])

    def paragraph(self, index: int) -> List[Dict[str, Any]]:
        return copy.deepcopy(self.content[index])

    def to_payload(self, title: str, content: List[List[Dict[str, Any]]]) -> Dict[str, Any]:
        return {"zh_cn": {"title": title, "content": content}}


def load_template(name: str) -> PostTemplate:
    path = TEMPLATE_DIR / f"{name}.json"
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return PostTemplate(payload)
