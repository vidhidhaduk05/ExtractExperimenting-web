---
name: publication-charts
description: Generates publication-ready figures (Forest, Funnel, SROC, PRISMA, RoB 2.0).
---

# Skill: Publication Charts

## Description
Generates high-DPI (300 DPI) figures with editable SVG text and Okabe-Ito colorblind-safe palettes matching ICMJE, Cochrane, and Nature journal standards.

## Endpoints
- `POST /api/charts/forest` — Forest plot with weighted squares and summary diamond
- `POST /api/charts/funnel` — Funnel plot with 95% & 99% pseudo-confidence regions
- `POST /api/charts/sroc` — Summary ROC curve with 95% confidence ellipse and AUC
- `POST /api/charts/rob-traffic-light` — Cochrane RoB 2.0 traffic light summary matrix
- `POST /api/charts/prisma` — PRISMA 2020 4-stage flow diagram

## Module
- `services/chart_engine.py`
- `services/plot_config.py`
