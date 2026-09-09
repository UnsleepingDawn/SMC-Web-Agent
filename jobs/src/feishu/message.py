"""Send Feishu messages (post, text and images)."""

from __future__ import annotations

import json
import logging
from io import BytesIO
from typing import Any, Dict, List

import requests

from src.feishu.client import BASE_URL, FeishuClient

logger = logging.getLogger(__name__)

# Feishu's receive_id_type values we use: "open_id" for a person, "chat_id" for
# a group.
RECEIVE_ID_TYPE_OPEN_ID = "open_id"
RECEIVE_ID_TYPE_CHAT_ID = "chat_id"


def _send(
    client: FeishuClient,
    *,
    receive_id: str,
    receive_id_type: str,
    msg_type: str,
    content: str,
) -> Dict[str, Any]:
    return client.request(
        "POST",
        "im/v1/messages",
        params={"receive_id_type": receive_id_type},
        json_body={
            "receive_id": receive_id,
            "msg_type": msg_type,
            "content": content,
        },
    )


def send_text(
    client: FeishuClient,
    *,
    receive_id: str,
    text: str,
    receive_id_type: str = RECEIVE_ID_TYPE_OPEN_ID,
) -> Dict[str, Any]:
    return _send(
        client,
        receive_id=receive_id,
        receive_id_type=receive_id_type,
        msg_type="text",
        content=json.dumps({"text": text}, ensure_ascii=False),
    )


def send_post(
    client: FeishuClient,
    *,
    receive_id: str,
    title: str,
    content: List[List[Dict[str, Any]]],
    receive_id_type: str = RECEIVE_ID_TYPE_OPEN_ID,
) -> Dict[str, Any]:
    """Send a rich-text post message.

    ``content`` is Feishu's nested paragraph structure, the same shape the
    original ``configs/post_template/*.json`` files stored.
    """
    return _send(
        client,
        receive_id=receive_id,
        receive_id_type=receive_id_type,
        msg_type="post",
        content=json.dumps(
            {"zh_cn": {"title": title, "content": content}}, ensure_ascii=False
        ),
    )


def upload_image(client: FeishuClient, image: BytesIO, filename: str) -> str:
    """Upload an image and return its ``image_key`` for use in post messages."""
    response = requests.post(
        f"{BASE_URL}/im/v1/images",
        headers={"Authorization": f"Bearer {client.tenant_access_token}"},
        data={"image_type": "message"},
        files={"image": (filename, image, "image/png")},
        timeout=60,
    )
    payload = response.json()
    if payload.get("code") != 0:
        raise RuntimeError(
            f"Failed to upload image to Feishu (code={payload.get('code')}): "
            f"{payload.get('msg')}"
        )
    return str((payload.get("data") or {}).get("image_key") or "")


def send_image(
    client: FeishuClient,
    *,
    receive_id: str,
    image_key: str,
    receive_id_type: str = RECEIVE_ID_TYPE_OPEN_ID,
) -> Dict[str, Any]:
    return _send(
        client,
        receive_id=receive_id,
        receive_id_type=receive_id_type,
        msg_type="image",
        content=json.dumps({"image_key": image_key}),
    )
