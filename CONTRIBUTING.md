# Contributing to RadExtract

Thank you for contributing to RadExtract! To maintain code quality, reproducibility, and reliable builds, please follow these guidelines.

---

## 🛠️ Development Setup

### Python Backend
1. Python 3.10+ recommended.
2. Install code formatting and linting tools:
   ```bash
   pip install black isort flake8 pre-commit
   pre-commit install
   ```

### Frontend
1. Node.js 18+ / 20+
2. Install packages:
   ```bash
   cd radextract_platform/frontend
   npm install
   ```

---

## 📋 Pull Request Quality Checklist

Before submitting a PR:
- [ ] **Formatting (Python)**: Run `black --line-length 120 .` and `isort --profile black .`
- [ ] **Linting (Python)**: Run `flake8` to verify no critical syntax or undefined variables.
- [ ] **Frontend Build**: Run `npm run build` inside `radextract_platform/frontend` to ensure zero TypeScript errors.
- [ ] **Links**: Ensure external links and DOIs in markdown documentation resolve properly.

---

## 🔬 Scientific Standards
- Risk of Bias assessments must adhere to **Cochrane RoB 2.0 / ROBINS-I** domains.
- Meta-analysis diagrams must follow **PRISMA 2020** guidelines.
- Plots should use accessible palettes (e.g. **Okabe-Ito**) and be exportable at 300+ DPI.
