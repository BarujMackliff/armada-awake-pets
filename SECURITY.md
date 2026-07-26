# Security policy

This public repository is exclusively for the Awake Pet application, its original
art, tests, and public documentation. Organizational records, personal records,
credentials, operational databases, internal reports, and unrelated files do not
belong here.

## Publication controls

- Only an explicit allowlist of project paths and file types can pass publication.
- The working tree, staged snapshot, and complete Git history are scanned.
- Images are checked by file signature, not filename alone.
- Credential patterns, protected-record indicators, pointer-warping code, symbolic
  links, nested repositories, oversized files, and remote workflow files are blocked.
- Local commit and push hooks call a checksum-sealed scanner stored outside the
  repository.
- The publisher verifies the exact repository, exact remote, `main` branch,
  checksums, tests, fast-forward history, and a second post-commit scan.
- Force-push is never used.

Install or refresh the outside seal after a trusted code review:

```powershell
.\INSTALL_SECURITY_GATES.ps1
```

Then publish only through:

```powershell
.\SYNC_TO_GITHUB.ps1
```

## Reporting a vulnerability

Use GitHub's private vulnerability reporting option on the repository Security
page. Do not place sensitive reproduction details in a public issue.
