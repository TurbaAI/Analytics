from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


HOSTS_TABLE_SQL = """
create table if not exists hosts(
  host_id text primary key,
  hostname text not null,
  agent_id text not null,
  capabilities_json text not null,
  labels_json text not null,
  last_seen_at text not null
)
"""

SERVICES_TABLE_SQL = """
create table if not exists services(
  service_id text primary key,
  service_type text not null,
  base_url text not null,
  health_url text not null,
  labels_json text not null,
  last_seen_at text not null
)
"""

AGENTS_TABLE_SQL = """
create table if not exists agents(
  agent_id text primary key,
  host_id text not null,
  hostname text not null,
  public_key_pem text not null,
  certificate_signing_request_pem text not null,
  spiffe_id text not null,
  client_cert_secret_name text not null,
  capabilities_json text not null,
  labels_json text not null,
  status text not null,
  enrolled_at text not null,
  last_seen_at text not null,
  certificate_pem text not null default '',
  ca_certificate_pem text not null default '',
  generated_private_key_pem text not null default '',
  certificate_serial text not null default '',
  certificate_not_before text not null default '',
  certificate_not_after text not null default '',
  certificate_fingerprint_sha256 text not null default '',
  certificate_status text not null default 'pending'
)
"""

CERTIFICATE_COLUMNS = {
    "certificate_pem": "text not null default ''",
    "ca_certificate_pem": "text not null default ''",
    "generated_private_key_pem": "text not null default ''",
    "certificate_serial": "text not null default ''",
    "certificate_not_before": "text not null default ''",
    "certificate_not_after": "text not null default ''",
    "certificate_fingerprint_sha256": "text not null default ''",
    "certificate_status": "text not null default 'pending'",
}


class MetadataConnection(Protocol):
    def execute(self, sql: str, parameters: tuple[Any, ...] = ()) -> Any:
        ...

    def __enter__(self) -> "MetadataConnection":
        ...

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        ...


class MetadataStore(Protocol):
    backend: str

    def connect(self) -> MetadataConnection:
        ...

    def init_schema(self) -> None:
        ...


def create_metadata_store(database_url: str, db_path: Path) -> MetadataStore:
    if database_url:
        return PostgresMetadataStore(database_url)
    return SqliteMetadataStore(db_path)


@dataclass(frozen=True)
class SqliteMetadataStore:
    path: Path
    backend: str = "sqlite"

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def init_schema(self) -> None:
        with self.connect() as db:
            db.execute(HOSTS_TABLE_SQL)
            db.execute(SERVICES_TABLE_SQL)
            db.execute(AGENTS_TABLE_SQL)
            _ensure_columns(db, "agents", CERTIFICATE_COLUMNS, backend=self.backend)


@dataclass(frozen=True)
class PostgresMetadataStore:
    database_url: str
    backend: str = "postgres"

    def connect(self) -> "PostgresConnection":
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:  # pragma: no cover - only reached when Postgres is configured without dependency.
            raise RuntimeError("psycopg is required when TURBALANCE_DISCOVERY_DATABASE_URL is set") from exc
        return PostgresConnection(psycopg.connect(self.database_url, row_factory=dict_row))

    def init_schema(self) -> None:
        with self.connect() as db:
            db.execute(HOSTS_TABLE_SQL)
            db.execute(SERVICES_TABLE_SQL)
            db.execute(AGENTS_TABLE_SQL)
            _ensure_columns(db, "agents", CERTIFICATE_COLUMNS, backend=self.backend)


class PostgresConnection:
    def __init__(self, connection: Any) -> None:
        self.connection = connection

    def execute(self, sql: str, parameters: tuple[Any, ...] = ()) -> Any:
        cursor = self.connection.cursor()
        cursor.execute(_postgres_placeholders(sql), parameters)
        return cursor

    def __enter__(self) -> "PostgresConnection":
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        if exc_type is None:
            self.connection.commit()
        else:
            self.connection.rollback()
        self.connection.close()


def _ensure_columns(db: MetadataConnection, table_name: str, columns: dict[str, str], *, backend: str) -> None:
    existing = _column_names(db, table_name, backend=backend)
    for column_name, declaration in columns.items():
        if column_name not in existing:
            db.execute(f"alter table {table_name} add column {column_name} {declaration}")


def _column_names(db: MetadataConnection, table_name: str, *, backend: str) -> set[str]:
    if backend == "postgres":
        rows = db.execute(
            """
            select column_name
            from information_schema.columns
            where table_schema = current_schema()
              and table_name = ?
            """,
            (table_name,),
        ).fetchall()
        return {row["column_name"] for row in rows}
    return {row["name"] for row in db.execute(f"pragma table_info({table_name})").fetchall()}


def _postgres_placeholders(sql: str) -> str:
    return sql.replace("?", "%s")
