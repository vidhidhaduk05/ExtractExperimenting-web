#!/usr/bin/env Rscript
# PRISMA 2020 Flow Diagram using R grid graphics
# Replicates the official PRISMA 2020 template layout
# Usage: Rscript prisma_flow.R <input_json_path>
# Input JSON: {identification: {database_records, registers, other_sources, total},
#              screening: {records_screened, records_excluded, excluded_with_reasons: [{reason, count}]},
#              eligibility: {full_text_assessed, full_text_excluded, excluded_reasons: [{reason, count}]},
#              included: {studies_in_review, studies_in_meta_analysis},
#              pending, output_path}

library(jsonlite)
library(grid)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: Rscript prisma_flow.R <input_json_path>")

input <- fromJSON(readLines(args[1], warn = FALSE))
output_path <- input$output_path

# Extract data
id <- input$identification
scr <- input$screening
elig <- input$eligibility
incl <- input$included
pending <- input$pending

# Create output device: PNG when output_path ends in .png, SVG otherwise
if (grepl("\\.png$", output_path, ignore.case = TRUE)) {
  png(output_path, width = 2200, height = 1600, res = 200, bg = "white")
} else {
  svg(output_path, width = 11, height = 8, bg = "white")
}

# Set up grid viewport
grid.newpage()
pushViewport(viewport(width = 0.98, height = 0.98))

# Colors (professional PRISMA style)
box_fill <- "#FFFFFF"
box_border <- "#333333"
phase_bg <- "#F0F0F0"
excl_fill <- "#FFF5F5"
excl_border <- "#E94444"
incl_fill <- "#F0F8E8"
incl_border <- "#75A025"
arrow_col <- "#666666"
text_col <- "#333333"
count_col <- "#0279EE"

# Helper function to draw a box with title and count
draw_box <- function(x, y, w, h, title, count, subtitle = "",
                     fill = box_fill, border = box_border, count_color = count_col) {
  # Box
  grid.rect(x = x, y = y, width = w, height = h,
            gp = gpar(fill = fill, col = border, lwd = 1.2),
            just = c("center", "center"))
  # Title
  grid.text(title, x = x, y = y + h/2 - 0.02,
            gp = gpar(fontsize = 8, col = text_col),
            just = c("center", "top"))
  # Count
  grid.text(as.character(count), x = x, y = y + 0.005,
            gp = gpar(fontsize = 16, fontface = "bold", col = count_color),
            just = c("center", "center"))
  # Subtitle
  if (subtitle != "") {
    grid.text(subtitle, x = x, y = y - h/2 + 0.015,
              gp = gpar(fontsize = 7, col = "#999999"),
              just = c("center", "bottom"))
  }
}

# Helper to draw arrow
draw_arrow <- function(x1, y1, x2, y2, col = arrow_col) {
  grid.segments(x0 = x1, y0 = y1, x1 = x2, y1 = y2,
                gp = gpar(col = col, lwd = 1.2),
                arrow = arrow(length = unit(0.08, "inches"), type = "closed"))
}

# Helper to draw phase label (left column)
draw_phase <- function(y, label) {
  grid.rect(x = 0.06, y = y, width = 0.10, height = 0.06,
            gp = gpar(fill = phase_bg, col = "#999999", lwd = 0.8),
            just = c("center", "center"))
  grid.text(label, x = 0.06, y = y,
            gp = gpar(fontsize = 7, fontface = "bold", col = "#0279EE"),
            just = c("center", "center"))
}

# Layout coordinates (normalized 0-1)
# Main column x positions
main_x <- 0.38
right_x <- 0.72
box_w <- 0.28
excl_w <- 0.22

# ── Phase labels (left column) ──
draw_phase(0.88, "Identification")
draw_phase(0.65, "Screening")
draw_phase(0.38, "Eligibility")
draw_phase(0.12, "Included")

# ── Identification ──
# Databases box
draw_box(main_x - 0.08, 0.88, 0.22, 0.08,
         "Records identified from databases",
         id$database_records,
         sprintf("Registers: %d | Other: %d", id$registers, id$other_sources))

# Registers box (below databases)
draw_box(main_x + 0.10, 0.88, 0.18, 0.08,
         "Records identified from registers & other sources",
         id$registers + id$other_sources)

# Arrow down from identification to screening
draw_arrow(main_x, 0.84, main_x, 0.70)

# ── Screening ──
draw_box(main_x, 0.65, box_w, 0.07,
         "Records screened",
         scr$records_screened)

# Arrow right to excluded
draw_arrow(main_x + box_w/2, 0.65, right_x - excl_w/2, 0.65)

# Excluded box
draw_box(right_x, 0.65, excl_w, 0.07,
         "Records excluded",
         scr$records_excluded,
         fill = excl_fill, border = excl_border, count_color = "#E94444")

# Exclusion reasons (TA)
if (length(scr$excluded_with_reasons) > 0) {
  reasons_y <- 0.58
  for (i in 1:min(length(scr$excluded_with_reasons), 5)) {
    r <- scr$excluded_with_reasons[[i]]
    grid.text(sprintf("%s (%d)", substr(r$reason, 1, 28), r$count),
              x = right_x, y = reasons_y - (i-1) * 0.025,
              gp = gpar(fontsize = 6, col = "#888888"),
              just = c("center", "center"))
  }
}

# Arrow down from screening to eligibility
draw_arrow(main_x, 0.61, main_x, 0.43)

# ── Eligibility ──
draw_box(main_x, 0.38, box_w, 0.07,
         "Full-text articles assessed for eligibility",
         elig$full_text_assessed)

# Arrow right to excluded
draw_arrow(main_x + box_w/2, 0.38, right_x - excl_w/2, 0.38)

# Full-text excluded box
draw_box(right_x, 0.38, excl_w, 0.07,
         "Full-text excluded",
         elig$full_text_excluded,
         fill = excl_fill, border = excl_border, count_color = "#E94444")

# Exclusion reasons (FT)
if (length(elig$excluded_reasons) > 0) {
  reasons_y <- 0.31
  for (i in 1:min(length(elig$excluded_reasons), 5)) {
    r <- elig$excluded_reasons[[i]]
    grid.text(sprintf("%s (%d)", substr(r$reason, 1, 28), r$count),
              x = right_x, y = reasons_y - (i-1) * 0.025,
              gp = gpar(fontsize = 6, col = "#888888"),
              just = c("center", "center"))
  }
}

# Arrow down from eligibility to included
draw_arrow(main_x, 0.34, main_x, 0.16)

# ── Included ──
draw_box(main_x, 0.12, box_w, 0.08,
         "Studies included in review",
         incl$studies_in_review,
         sprintf("In meta-analysis: %d", incl$studies_in_meta_analysis),
         fill = incl_fill, border = incl_border, count_color = "#75A025")

# Pending note
if (pending > 0) {
  grid.rect(x = main_x, y = 0.03, width = box_w, height = 0.04,
            gp = gpar(fill = "#FFF8E1", col = "#FF9400", lwd = 0.8),
            just = c("center", "center"))
  grid.text(sprintf("%d records pending screening", pending),
            x = main_x, y = 0.03,
            gp = gpar(fontsize = 7, fontface = "bold", col = "#FF9400"),
            just = c("center", "center"))
}

# Title
grid.text("PRISMA 2020 Flow Diagram",
          x = 0.5, y = 0.97,
          gp = gpar(fontsize = 14, fontface = "bold", col = "#333333"),
          just = c("center", "center"))

popViewport()
dev.off()

cat("PRISMA flow diagram written to", output_path, "\n")
