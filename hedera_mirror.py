"""
Hedera Mirror Node client — pulls REAL on-chain data from the public Hedera
Mirror Node REST API (no credentials required).

Network is selected via HEDERA_NETWORK (testnet|mainnet); override the base URL
with HEDERA_MIRROR_URL if needed.
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

_NETWORK = os.getenv("HEDERA_NETWORK", "testnet").lower()
_DEFAULT_BASE = (
    "https://mainnet-public.mirrornode.hedera.com/api/v1"
    if _NETWORK == "mainnet"
    else "https://testnet.mirrornode.hedera.com/api/v1"
)
MIRROR_BASE = os.getenv("HEDERA_MIRROR_URL", _DEFAULT_BASE).rstrip("/")

# Default account to surface in account-centric views (the configured operator).
OPERATOR_ACCOUNT = os.getenv("HEDERA_ACCOUNT_ID", "")

_TIMEOUT = float(os.getenv("HEDERA_MIRROR_TIMEOUT", "8"))

# HashScan explorer — public, lets anyone independently verify on-chain data.
HASHSCAN_BASE = f"https://hashscan.io/{_NETWORK}"


def explorer_url(kind: str, entity_id: Optional[str]) -> Optional[str]:
    """Build a HashScan URL for a transaction/account/token/topic id."""
    if not entity_id:
        return None
    return f"{HASHSCAN_BASE}/{kind}/{entity_id}"


class HederaMirrorError(Exception):
    """Raised when a Mirror Node request fails."""


def _get(path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    try:
        resp = requests.get(f"{MIRROR_BASE}{path}", params=params, timeout=_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        raise HederaMirrorError(f"Mirror Node request failed for {path}: {exc}") from exc


def consensus_to_iso(consensus_timestamp: Optional[str]) -> Optional[str]:
    """Convert a Hedera consensus timestamp ('seconds.nanos') to ISO-8601 UTC."""
    if not consensus_timestamp:
        return None
    try:
        seconds = float(consensus_timestamp)
        return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat()
    except (ValueError, TypeError):
        return None


def network_info() -> Dict[str, Any]:
    """Real network supply (tinybars/HBAR) and active consensus node count."""
    supply = _get("/network/supply")
    nodes = _get("/network/nodes", {"limit": 25})
    node_list = nodes.get("nodes", [])
    released = int(supply.get("released_supply", 0) or 0)
    total = int(supply.get("total_supply", 0) or 0)
    return {
        "network": _NETWORK,
        "released_supply_hbar": released // 100_000_000,
        "total_supply_hbar": total // 100_000_000,
        "released_supply_tinybars": released,
        "total_supply_tinybars": total,
        "consensus_nodes": len(node_list),
        "mirror_node": MIRROR_BASE,
    }


def recent_transactions(limit: int = 10, account_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Real recent transactions (network-wide, or for a specific account)."""
    params: Dict[str, Any] = {"limit": max(1, min(limit, 50)), "order": "desc"}
    if account_id:
        params["account.id"] = account_id
    data = _get("/transactions", params)
    out: List[Dict[str, Any]] = []
    for tx in data.get("transactions", []):
        tx_id = tx.get("transaction_id")
        out.append(
            {
                "transaction_id": tx_id,
                "name": tx.get("name"),
                "result": tx.get("result"),
                "consensus_timestamp": tx.get("consensus_timestamp"),
                "consensus_time": consensus_to_iso(tx.get("consensus_timestamp")),
                "charged_tx_fee": tx.get("charged_tx_fee"),
                "node": tx.get("node"),
                "explorer_url": explorer_url("transaction", tx_id),
            }
        )
    return out


def account_info(account_id: str) -> Dict[str, Any]:
    """Real account balance and metadata."""
    data = _get(f"/accounts/{account_id}")
    balance = data.get("balance", {}) or {}
    tinybars = int(balance.get("balance", 0) or 0)
    return {
        "account": data.get("account"),
        "balance_hbar": tinybars / 100_000_000,
        "balance_tinybars": tinybars,
        "created_timestamp": consensus_to_iso(data.get("created_timestamp")),
        "tokens": balance.get("tokens", []),
        "memo": data.get("memo"),
        "deleted": data.get("deleted"),
        "explorer_url": explorer_url("account", data.get("account")),
    }


def recent_tokens(limit: int = 10) -> List[Dict[str, Any]]:
    """Real recently-created tokens/NFT collections on the network."""
    data = _get("/tokens", {"limit": max(1, min(limit, 50)), "order": "desc"})
    return [
        {
            "token_id": t.get("token_id"),
            "name": t.get("name"),
            "symbol": t.get("symbol"),
            "type": t.get("type"),
            "explorer_url": explorer_url("token", t.get("token_id")),
        }
        for t in data.get("tokens", [])
    ]
