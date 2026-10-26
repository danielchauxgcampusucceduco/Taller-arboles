"""Serve the file system tree through a small standard-library HTTP API."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Tuple
from urllib.parse import parse_qs, urlsplit

from filesystem_tree import (
    FileSystemError,
    FileSystemNode,
    FileSystemTree,
    InvalidPathError,
    build_sample_tree,
)


WEB_DIRECTORY = Path(__file__).resolve().parent / "web"
MAX_REQUEST_BYTES = 16_384


def build_snapshot(tree: FileSystemTree) -> Dict[str, Any]:
    """Return a JSON-ready tree with aggregate size and file statistics."""

    def serialize(
        node: FileSystemNode,
        path: str,
    ) -> Tuple[Dict[str, Any], int, int, int]:
        children = []
        total_size = node.size if not node.is_directory else 0
        file_count = 0 if node.is_directory else 1
        directory_count = 1 if node.is_directory and node is not tree.root else 0

        for child in node.children:
            child_path = f"/{child.name}" if path == "/" else f"{path}/{child.name}"
            child_data, child_size, child_files, child_directories = serialize(
                child,
                child_path,
            )
            children.append(child_data)
            total_size += child_size
            file_count += child_files
            directory_count += child_directories

        data = {
            "name": node.name,
            "path": path,
            "is_directory": node.is_directory,
            "size_bytes": total_size,
            "file_size_bytes": node.size if not node.is_directory else None,
            "children": children,
        }
        return data, total_size, file_count, directory_count

    root, total_size, file_count, directory_count = serialize(tree.root, "/")
    return {
        "tree": root,
        "stats": {
            "total_size_bytes": total_size,
            "file_count": file_count,
            "directory_count": directory_count,
            "entry_count": file_count + directory_count,
        },
    }


class FileSystemRequestHandler(BaseHTTPRequestHandler):
    """Handle static assets and JSON requests for one in-memory tree."""

    tree = build_sample_tree()
    tree_lock = threading.RLock()

    def do_GET(self) -> None:
        """Serve the interface, a tree snapshot, or path search results."""
        request = urlsplit(self.path)
        if request.path == "/api/tree":
            with self.tree_lock:
                self._send_json(200, build_snapshot(self.tree))
            return
        if request.path == "/api/search":
            self._handle_search(parse_qs(request.query))
            return
        self._serve_static(request.path)

    def do_POST(self) -> None:
        """Create a file or directory from a JSON request body."""
        if urlsplit(self.path).path != "/api/nodes":
            self._send_json(404, {"error": "Endpoint not found."})
            return

        try:
            payload = self._read_json_body()
            parent_path = payload.get("parent_path")
            name = payload.get("name")
            kind = payload.get("kind")
            size_bytes = payload.get("size_bytes", 0)
            if not isinstance(parent_path, str) or not isinstance(name, str):
                raise InvalidPathError("Parent path and name are required.")
            if not name or name in {".", ".."} or "/" in name or "\\" in name:
                raise InvalidPathError("Name must be a single path component.")
            if kind not in ("file", "directory"):
                raise InvalidPathError("Kind must be 'file' or 'directory'.")
            if isinstance(size_bytes, bool) or not isinstance(size_bytes, int):
                raise InvalidPathError("File size must be an integer number of bytes.")

            path = f"/{name}" if parent_path == "/" else f"{parent_path.rstrip('/')}/{name}"
            with self.tree_lock:
                parent = self.tree.search(parent_path)
                if not parent.is_directory:
                    raise InvalidPathError("The selected parent is not a directory.")
                node = self.tree.insert(
                    path,
                    is_directory=kind == "directory",
                    size=size_bytes,
                )
                self._send_json(
                    201,
                    {
                        "message": "Elemento creado correctamente.",
                        "path": path,
                        "is_directory": node.is_directory,
                    },
                )
        except (FileSystemError, ValueError, json.JSONDecodeError) as error:
            self._send_json(400, {"error": str(error)})

    def do_DELETE(self) -> None:
        """Delete a node and its descendants from the in-memory tree."""
        request = urlsplit(self.path)
        if request.path != "/api/nodes":
            self._send_json(404, {"error": "Endpoint not found."})
            return

        path = parse_qs(request.query).get("path", [""])[0]
        try:
            with self.tree_lock:
                removed = self.tree.delete(path)
                self._send_json(
                    200,
                    {
                        "message": "Elemento y subárbol eliminados correctamente.",
                        "path": path,
                        "removed_name": removed.name,
                    },
                )
        except FileSystemError as error:
            self._send_json(400, {"error": str(error)})

    def _handle_search(self, query: Dict[str, list[str]]) -> None:
        """Find exact paths and names containing the supplied query."""
        search_text = query.get("q", [""])[0].strip().casefold()
        if not search_text:
            self._send_json(200, {"results": []})
            return

        matches = []
        with self.tree_lock:
            snapshot = build_snapshot(self.tree)
            stack = [snapshot["tree"]]
            while stack:
                entry = stack.pop()
                if search_text in entry["path"].casefold() or search_text in entry["name"].casefold():
                    matches.append(
                        {
                            "name": entry["name"],
                            "path": entry["path"],
                            "is_directory": entry["is_directory"],
                            "size_bytes": entry["size_bytes"],
                        }
                    )
                stack.extend(reversed(entry["children"]))
        self._send_json(200, {"results": matches[:50]})

    def _serve_static(self, request_path: str) -> None:
        """Serve only known interface files to prevent path traversal."""
        assets = {
            "/": (WEB_DIRECTORY / "index.html", "text/html; charset=utf-8"),
            "/assets/styles.css": (WEB_DIRECTORY / "styles.css", "text/css; charset=utf-8"),
            "/assets/app.js": (WEB_DIRECTORY / "app.js", "text/javascript; charset=utf-8"),
        }
        asset = assets.get(request_path)
        if asset is None:
            self._send_json(404, {"error": "Resource not found."})
            return

        file_path, content_type = asset
        try:
            body = file_path.read_bytes()
        except OSError:
            self._send_json(500, {"error": "Interface asset could not be loaded."})
            return
        self._send_bytes(200, body, content_type)

    def _read_json_body(self) -> Dict[str, Any]:
        """Read and decode a bounded JSON request body."""
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
            raise InvalidPathError("Request body is empty or too large.")
        payload = json.loads(self.rfile.read(content_length))
        if not isinstance(payload, dict):
            raise InvalidPathError("Request body must be a JSON object.")
        return payload

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        """Encode a JSON response with safe HTTP headers."""
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send_bytes(status, body, "application/json; charset=utf-8")

    def _send_bytes(self, status: int, body: bytes, content_type: str) -> None:
        """Write a response body and common security headers."""
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format_string: str, *args: Any) -> None:
        """Write compact access logs to the server console."""
        super().log_message(format_string, *args)


def main() -> None:
    """Start the local file system manager web application."""
    server = ThreadingHTTPServer(("127.0.0.1", 8000), FileSystemRequestHandler)
    print("File System Manager is available at http://127.0.0.1:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping File System Manager.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
