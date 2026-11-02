# Contributing to V2E

Thank you for your interest in contributing to V2E! By submitting a pull request or otherwise contributing to this project, you agree to the following terms:

## 1. Contributor License Agreement (CLA)

By submitting a pull request, you agree that:

1. Your contribution is your original work.
2. You grant Nicholas Clifford Maino (the "Project Owner") a perpetual,
   worldwide, non-exclusive, royalty-free, irrevocable license to use,
   modify, distribute, and sublicense your contribution under any license,
   including proprietary licenses.

This CLA is required so the Project Owner can offer commercial licenses
of V2E in addition to the AGPL-3.0 open-source license.

## 2. Developer Certificate of Origin (DCO)

All commits must be signed off with `git commit -s`. This certifies that
you have the right to submit the contribution under the terms above.

## 3. How to Contribute

1. Fork the repository.
2. Create a branch (`git checkout -b feature/your-feature`).
3. Make your changes.
4. Sign your commits (`git commit -s -m "your message"`).
5. Push to your fork and open a pull request.

## 4. Code Standards

- Python: PEP 8, type hints, and `black` formatting.
- JavaScript: 2-space indent, `'use strict'` at top of IIFEs.
- Security: Any change to `app.py`, `module_cache.py`, or the Dockerfile must be reviewed for P0/P1 regressions against the audit matrix in `/docs/AUDIT.md`.