from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import pyarrow as pa
import pyarrow.fs as pafs
import pyarrow.parquet as pq


class LakeStorage:
    def __init__(self, lake_root: str | Path) -> None:
        self.root_uri = str(lake_root)
        self.is_object_store = _is_object_store_uri(self.root_uri)
        if self.is_object_store:
            self.fs, self.base_path = _object_store_filesystem(self.root_uri)
            self.local_root: Path | None = None
        else:
            parsed = urlparse(self.root_uri)
            root = Path(parsed.path if parsed.scheme == "file" else self.root_uri)
            self.fs = pafs.LocalFileSystem()
            self.base_path = str(root)
            self.local_root = root

    @property
    def backend(self) -> str:
        if self.local_root is not None:
            return "local"
        parsed = urlparse(self.root_uri)
        return parsed.scheme or "object"

    def describe(self) -> dict[str, str | bool]:
        return {
            "backend": self.backend,
            "rootUri": self.root_uri,
            "basePath": self.base_path,
            "isObjectStore": self.is_object_store,
        }

    def parquet_path(self, relative_path: str | Path) -> str:
        return self._join(relative_path)

    def write_parquet_rows(self, rows: list[dict[str, Any]], relative_path: str | Path) -> None:
        table = pa.Table.from_pylist(rows)
        if self.local_root is not None:
            final_path = self.local_root / Path(relative_path)
            _write_local_parquet_atomic(table, final_path)
            return

        final_path = self._join(relative_path)
        parent = final_path.rsplit("/", 1)[0] if "/" in final_path else ""
        if parent:
            self.fs.create_dir(parent, recursive=True)
        with self.fs.open_output_stream(final_path) as sink:
            pq.write_table(table, sink, compression="zstd")

    def write_json_text(self, body: str, relative_path: str | Path) -> None:
        if self.local_root is not None:
            final_path = self.local_root / Path(relative_path)
            final_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = final_path.with_suffix(f".{uuid.uuid4().hex}.tmp")
            tmp_path.write_text(body, encoding="utf-8")
            try:
                os.replace(tmp_path, final_path)
            except OSError:
                shutil.move(str(tmp_path), str(final_path))
            return

        final_path = self._join(relative_path)
        parent = final_path.rsplit("/", 1)[0] if "/" in final_path else ""
        if parent:
            self.fs.create_dir(parent, recursive=True)
        with self.fs.open_output_stream(final_path) as sink:
            sink.write(body.encode("utf-8"))

    def exists(self, relative_path: str | Path) -> bool:
        info = self.fs.get_file_info(self._join(relative_path))
        return info.type != pafs.FileType.NotFound

    def list_files(self, relative_path: str | Path) -> list[str]:
        prefix = self._join(relative_path)
        try:
            infos = self.fs.get_file_info(pafs.FileSelector(prefix, recursive=True))
        except FileNotFoundError:
            return []
        files = []
        for info in infos:
            if info.type == pafs.FileType.File:
                files.append(self._relative_from_key(info.path))
        return sorted(files)

    def read_parquet_table(self, relative_path: str | Path) -> pa.Table:
        with self.fs.open_input_file(self._join(relative_path)) as source:
            return pq.read_table(source)

    def delete_file(self, relative_path: str | Path) -> None:
        self.fs.delete_file(self._join(relative_path))

    def _join(self, relative_path: str | Path) -> str:
        relative = Path(relative_path).as_posix().lstrip("/")
        if not self.base_path:
            return relative
        return f"{self.base_path.rstrip('/')}/{relative}"

    def _relative_from_key(self, key: str) -> str:
        base = self.base_path.rstrip("/")
        if base and key.startswith(base + "/"):
            return key[len(base) + 1 :]
        return key


def _write_local_parquet_atomic(table: pa.Table, final_path: Path) -> None:
    final_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = final_path.with_suffix(f".{uuid.uuid4().hex}.tmp")
    pq.write_table(table, tmp_path, compression="zstd")
    try:
        os.replace(tmp_path, final_path)
    except OSError:
        shutil.move(str(tmp_path), str(final_path))


def _is_object_store_uri(value: str) -> bool:
    parsed = urlparse(value)
    return bool(parsed.scheme and parsed.scheme != "file")


def _object_store_filesystem(root_uri: str) -> tuple[pafs.FileSystem, str]:
    parsed = urlparse(root_uri)
    if parsed.scheme in {"s3", "s3fs"}:
        bucket = parsed.netloc
        base_path = f"{bucket}{parsed.path.rstrip('/')}".rstrip("/")
        return _s3_filesystem(), base_path
    filesystem, base_path = pafs.FileSystem.from_uri(root_uri.rstrip("/") + "/")
    return filesystem, base_path.rstrip("/")


def _s3_filesystem() -> pafs.FileSystem:
    kwargs: dict[str, Any] = {}
    if os.environ.get("AWS_ACCESS_KEY_ID"):
        kwargs["access_key"] = os.environ["AWS_ACCESS_KEY_ID"]
    if os.environ.get("AWS_SECRET_ACCESS_KEY"):
        kwargs["secret_key"] = os.environ["AWS_SECRET_ACCESS_KEY"]
    if os.environ.get("AWS_SESSION_TOKEN"):
        kwargs["session_token"] = os.environ["AWS_SESSION_TOKEN"]
    if os.environ.get("AWS_REGION"):
        kwargs["region"] = os.environ["AWS_REGION"]
    if os.environ.get("AWS_ENDPOINT_URL"):
        kwargs["endpoint_override"] = os.environ["AWS_ENDPOINT_URL"]
    if os.environ.get("TURBALANCE_S3_ENDPOINT"):
        kwargs["endpoint_override"] = os.environ["TURBALANCE_S3_ENDPOINT"]
    if os.environ.get("TURBALANCE_S3_SCHEME"):
        kwargs["scheme"] = os.environ["TURBALANCE_S3_SCHEME"]
    if _env_bool(os.environ.get("TURBALANCE_S3_ANONYMOUS", "false")):
        kwargs["anonymous"] = True
    return pafs.S3FileSystem(**kwargs)


def _env_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}
