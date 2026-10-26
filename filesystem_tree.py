"""A hierarchical file system model backed by a general n-ary tree."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


class FileSystemError(Exception):
    """Base exception for file system tree errors."""


class DuplicatePathError(FileSystemError):
    """Raised when an insertion targets a path that already exists."""


class PathNotFoundError(FileSystemError):
    """Raised when an operation references a path that does not exist."""


class NotDirectoryError(FileSystemError):
    """Raised when a path component is a file instead of a directory."""


class InvalidPathError(FileSystemError):
    """Raised when a path or node size violates the model's constraints."""


@dataclass(eq=False)
class FileSystemNode:
    """Represent a file or directory in the hierarchical file system."""

    name: str
    is_directory: bool
    size: int = 0
    parent: Optional[FileSystemNode] = None
    children: List[FileSystemNode] = field(default_factory=list)

    def __post_init__(self) -> None:
        """Validate node invariants after initialization."""
        if not self.name:
            raise InvalidPathError("A node name cannot be empty.")
        if isinstance(self.size, bool) or not isinstance(self.size, int):
            raise InvalidPathError("Node size must be an integer number of bytes.")
        if self.size < 0:
            raise InvalidPathError("Node size cannot be negative.")
        if self.is_directory and self.size != 0:
            raise InvalidPathError("Directory nodes must have a base size of zero.")
        if not self.is_directory and self.children:
            raise InvalidPathError("File nodes cannot have children.")


class FileSystemTree:
    """Encapsulate a root directory and operations over its n-ary tree."""

    def __init__(self) -> None:
        """Initialize an empty tree with the POSIX root directory."""
        self.root = FileSystemNode(name="/", is_directory=True)

    @staticmethod
    def _split_path(path: str) -> List[str]:
        """Validate an absolute POSIX path and return its components."""
        if not isinstance(path, str) or not path.startswith("/"):
            raise InvalidPathError("Paths must be absolute POSIX paths.")
        if "\\" in path or "\x00" in path:
            raise InvalidPathError("Paths cannot contain backslashes or null bytes.")

        components = [component for component in path.split("/") if component]
        if any(component in {".", ".."} for component in components):
            raise InvalidPathError("Relative path components are not allowed.")
        return components

    def search(self, path: str) -> FileSystemNode:
        """Return the node at an exact absolute path."""
        components = self._split_path(path)
        current = self.root

        for component in components:
            if not current.is_directory:
                raise NotDirectoryError(
                    f"'{current.name}' is a file and cannot contain children."
                )
            match = next(
                (child for child in current.children if child.name == component),
                None,
            )
            if match is None:
                raise PathNotFoundError(f"Path not found: {path}")
            current = match

        return current

    def insert(self, path: str, is_directory: bool, size: int = 0) -> FileSystemNode:
        """Create a node, adding missing intermediate directories as needed.

        File sizes are measured in bytes. Directories always have a base size
        of zero; their aggregate size is computed from their descendants.
        """
        components = self._split_path(path)
        if not components:
            raise DuplicatePathError("The root directory already exists.")
        if not isinstance(is_directory, bool):
            raise InvalidPathError("is_directory must be a boolean value.")
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            raise InvalidPathError("Size must be a non-negative integer in bytes.")
        if is_directory and size != 0:
            raise InvalidPathError("Directory nodes must have a base size of zero.")

        current = self.root
        for index, component in enumerate(components):
            is_final = index == len(components) - 1
            if not current.is_directory:
                raise NotDirectoryError(
                    f"Cannot add a child to file '{current.name}'."
                )

            existing = next(
                (child for child in current.children if child.name == component),
                None,
            )
            if existing is not None:
                if is_final:
                    raise DuplicatePathError(f"Path already exists: {path}")
                if not existing.is_directory:
                    raise NotDirectoryError(
                        f"Cannot traverse through file '{existing.name}'."
                    )
                current = existing
                continue

            node_is_directory = is_directory if is_final else True
            node_size = size if is_final and not is_directory else 0
            node = FileSystemNode(
                name=component,
                is_directory=node_is_directory,
                size=node_size,
                parent=current,
            )
            current.children.append(node)
            current = node

        return current

    def calculate_total_size(self, node: FileSystemNode) -> int:
        """Return the total file bytes under a node using post-order DFS."""
        if not node.is_directory:
            return node.size
        return sum(self.calculate_total_size(child) for child in node.children)

    def display_tree(
        self,
        node: Optional[FileSystemNode] = None,
        level: int = 0,
    ) -> None:
        """Print a pre-order, indented view of a subtree."""
        if level < 0:
            raise ValueError("level cannot be negative.")
        current = self.root if node is None else node
        label = current.name
        suffix = "/" if current.is_directory and current is not self.root else ""
        size_text = (
            f" ({self.calculate_total_size(current)} bytes)"
            if current.is_directory
            else f" ({current.size} bytes)"
        )
        print(f"{'  ' * level}{label}{suffix}{size_text}")
        for child in current.children:
            self.display_tree(child, level + 1)

    def delete(self, path: str) -> FileSystemNode:
        """Remove a node and detach its complete subtree from the tree."""
        node = self.search(path)
        if node is self.root:
            raise InvalidPathError("The root directory cannot be deleted.")
        if node.parent is None:
            raise InvalidPathError("The target node is detached from the tree.")

        parent = node.parent
        parent.children.remove(node)
        node.parent = None
        return node


def build_sample_tree() -> FileSystemTree:
    """Build and return a sample hierarchy for the interactive demonstration."""
    tree = FileSystemTree()
    entries = [
        ("/home/alex", True, 0),
        ("/home/alex/documents", True, 0),
        ("/home/alex/documents/report.pdf", False, 2 * 1024 * 1024),
        ("/home/alex/documents/notes.txt", False, 12 * 1024),
        ("/home/alex/projects", True, 0),
        ("/home/alex/projects/tree_lab", True, 0),
        ("/home/alex/projects/tree_lab/main.py", False, 8 * 1024),
        ("/home/alex/projects/tree_lab/data", True, 0),
        ("/home/alex/projects/tree_lab/data/sample.csv", False, 256 * 1024),
        ("/home/alex/downloads", True, 0),
        ("/home/alex/downloads/archive.zip", False, 5 * 1024 * 1024),
        ("/var/log", True, 0),
        ("/var/log/system.log", False, 640 * 1024),
    ]
    for path, is_directory, size in entries:
        tree.insert(path, is_directory, size)
    return tree


def main() -> None:
    """Run an interactive demonstration of the file system tree."""
    tree = build_sample_tree()

    print("Initial file system tree:")
    tree.display_tree()

    print("\nAggregate directory sizes:")
    for path in ("/", "/home", "/home/alex", "/home/alex/projects"):
        node = tree.search(path)
        total_size = tree.calculate_total_size(node)
        size_mib = total_size / (1024 * 1024)
        print(f"{path}: {total_size:,} bytes ({size_mib:.2f} MiB)")

    search_path = input("\nEnter an absolute path to search: ").strip()
    try:
        found = tree.search(search_path)
        node_type = "directory" if found.is_directory else "file"
        print(f"Found {node_type}: {search_path}")
    except FileSystemError as error:
        print(f"Search failed: {error}")

    delete_prompt = "Enter an absolute path to delete (or press Enter to skip): "
    delete_path = input(delete_prompt).strip()
    if delete_path:
        try:
            removed = tree.delete(delete_path)
            print(f"Removed '{removed.name}' and its subtree.")
            print("Updated file system tree:")
            tree.display_tree()
        except FileSystemError as error:
            print(f"Deletion failed: {error}")


if __name__ == "__main__":
    main()
