#!/usr/bin/env Rscript
# PRISMA 2020 Flow Diagram using R grid graphics
# Replicates the official PRISMA 2020 template layout (Haddaway et al. / estech.shinyapps.io/prisma_flowdiagram)
# Usage: Rscript prisma_flow.R <input_json_path>

library(jsonlite)
library(grid)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: Rscript prisma_flow.R <input_json_path>")

input <- fromJSON(readLines(args[1], warn = FALSE))
output_path <- input$output_path

# Extract data with safe defaults
id <- input$identification
scr <- input$screening
elig <- input$eligibility
incl <- input$included
pending <- if (!is.null(input$pending)) input$pending else 0

db_records <- if (!is.null(id$database_records)) id$database_records else (if (!is.null(id$total)) id$total else 0)
reg_records <- if (!is.null(id$registers)) id$registers else 0
dups_rem <- if (!is.null(id$duplicates_removed)) id$duplicates_removed else 0
auto_rem <- if (!is.null(scr$excluded_automatic)) scr$excluded_automatic else 0

screened <- if (!is.null(scr$records_screened)) scr$records_screened else 0
ta_excl <- if (!is.null(scr$records_excluded)) scr$records_excluded else 0

sought <- max(0, screened - ta_excl)
ft_assessed <- if (!is.null(elig$full_text_assessed)) elig$full_text_assessed else sought
not_retrieved <- max(0, sought - ft_assessed)
ft_excl <- if (!is.null(elig$full_text_excluded)) elig$full_text_excluded else 0

studies_incl <- if (!is.null(incl$studies_in_review)) incl$studies_in_review else 0
studies_ma <- if (!is.null(incl$studies_in_meta_analysis)) incl$studies_in_meta_analysis else 0

# Create output device: PNG when output_path ends in .png, SVG otherwise
if (grepl("\\.png$", output_path, ignore.case = TRUE)) {
  png(output_path, width = 2400, height = 1800, res = 200, bg = "white")
} else {
  svg(output_path, width = 12, height = 9, bg = "white")
}

grid.newpage()
pushViewport(viewport(width = 0.98, height = 0.98))

# Color palette (Pure Black & White publication standard)
box_fill <- "#FFFFFF"
line_col <- "#000000"
text_col <- "#000000"

# Helper function to draw rectangular square boxes
draw_rect_box <- function(x, y, w, h) {
  grid.rect(x = x, y = y, width = w, height = h,
            gp = gpar(fill = box_fill, col = line_col, lwd = 1.2),
            just = c("center", "center"))
}

# Helper to draw arrows
draw_arrow <- function(x1, y1, x2, y2) {
  grid.segments(x0 = x1, y0 = y1, x1 = x2, y1 = y2,
                gp = gpar(col = line_col, lwd = 1.2),
                arrow = arrow(length = unit(0.09, "inches"), type = "closed"))
}

# Helper to draw phase label (left column)
draw_phase_banner <- function(y, h, label) {
  grid.rect(x = 0.05, y = y, width = 0.06, height = h,
            gp = gpar(fill = box_fill, col = line_col, lwd = 1.2),
            just = c("center", "center"))
  grid.text(label, x = 0.05, y = y, rot = 90,
            gp = gpar(fontsize = 8, fontface = "bold", col = text_col),
            just = c("center", "center"))
}

# ── Phase labels (left column) ──
draw_phase_banner(0.85, 0.16, "IDENTIFICATION")
draw_phase_banner(0.53, 0.44, "SCREENING")
draw_phase_banner(0.20, 0.16, "INCLUDED")

# ── Top Header Banner ──
grid.rect(x = 0.53, y = 0.96, width = 0.88, height = 0.04,
          gp = gpar(fill = box_fill, col = line_col, lwd = 1.2),
          just = c("center", "center"))
grid.text("Identification of new studies via databases and registers",
          x = 0.53, y = 0.96,
          gp = gpar(fontsize = 9, fontface = "bold", col = text_col),
          just = c("center", "center"))

# Layout x positions
col1_x <- 0.31
col2_x <- 0.75
w_box <- 0.42

# ── Row 1: Identification ──
# Left Box: Records identified
draw_rect_box(col1_x, 0.85, w_box, 0.14)
grid.text("Records identified from*:", x = col1_x - w_box/2 + 0.02, y = 0.90,
          gp = gpar(fontsize = 8, fontface = "bold", col = text_col), just = c("left", "center"))
grid.text(sprintf("Databases (n = %d)", db_records), x = col1_x - w_box/2 + 0.03, y = 0.86,
          gp = gpar(fontsize = 7.5, col = text_col), just = c("left", "center"))
grid.text(sprintf("Registers (n = %d)", reg_records), x = col1_x - w_box/2 + 0.03, y = 0.82,
          gp = gpar(fontsize = 7.5, col = text_col), just = c("left", "center"))

# Arrow right
draw_arrow(col1_x + w_box/2, 0.85, col2_x - w_box/2, 0.85)

# Right Box: Records removed before screening
draw_rect_box(col2_x, 0.85, w_box, 0.14)
grid.text("Records removed before screening:", x = col2_x - w_box/2 + 0.02, y = 0.90,
          gp = gpar(fontsize = 8, fontface = "bold", col = text_col), just = c("left", "center"))
grid.text(sprintf("Duplicate records removed (n = %d)", dups_rem), x = col2_x - w_box/2 + 0.03, y = 0.865,
          gp = gpar(fontsize = 7, col = text_col), just = c("left", "center"))
grid.text(sprintf("Records marked ineligible by automation (n = %d)", auto_rem), x = col2_x - w_box/2 + 0.03, y = 0.835,
          gp = gpar(fontsize = 7, col = text_col), just = c("left", "center"))
grid.text("Records removed for other reasons (n = 0)", x = col2_x - w_box/2 + 0.03, y = 0.805,
          gp = gpar(fontsize = 7, col = text_col), just = c("left", "center"))

# Arrow down to Records screened
draw_arrow(col1_x, 0.78, col1_x, 0.72)

# ── Row 2: Records screened ──
draw_rect_box(col1_x, 0.68, w_box, 0.07)
grid.text("Records screened", x = col1_x, y = 0.695,
          gp = gpar(fontsize = 8, fontface = "bold", col = text_col), just = c("center", "center"))
grid.text(sprintf("(n = %d)", screened), x = col1_x, y = 0.665,
          gp = gpar(fontsize = 8.5, fontface = "bold", col = text_col), just = c("center", "center"))

# Arrow right to Records excluded
draw_arrow(col1_x + w_box/2, 0.68, col2_x - w_box/2, 0.68)

draw_rect_box(col2_x, 0.68, w_box, 0.07)
grid.text("Records excluded**", x = col2_x, y = 0.695,
          gp = gpar(fontsize = 8, fontface = "bold", col = text_col), just = c("center", "center"))
grid.text(sprintf("(n = %d)", ta_excl), x = col2_x, y = 0.665,
          gp = gpar(fontsize = 8.5, fontface = "bold", col = text_col), just = c("center", "center"))

# Arrow down to Reports sought
draw_arrow(col1_x, 0.645, col1_x, 0.585)

# ── Row 3: Reports sought for retrieval ──
draw_rect_box(col1_x, 0.55, w_box, 0.07)
grid.text("Reports sought for retrieval", x = col1_x, y = 0.565,
          gp = gpar(fontsize = 8, fontface = "bold", col = text_col), just = c("center", "center"))
grid.text(sprintf("(n = %d)", sought), x = col1_x, y = 0.535,
          gp = gpar(fontsize = 8.5, fontface = "bold", col = text_col), just = c("center", "center"))

# Arrow right to Reports not retrieved
draw_arrow(col1_x + w_box/2, 0.55, col2_x - w_box/2, 0.55)

draw_rect_box(col2_x, 0.55, w_box, 0.07)
grid.text("Reports not retrieved", x = col2_x, y = 0.565,
          gp = gpar(fontsize = 8, fontface = "bold", col = text_col), just = c("center", "center"))
grid.text(sprintf("(n = %d)", not_retrieved), x = col2_x, y = 0.535,
          gp = gpar(fontsize = 8.5, fontface = "bold", col = text_col), just = c("center", "center"))

# Arrow down to Reports assessed
draw_arrow(col1_x, 0.515, col1_x, 0.455)

# ── Row 4: Reports assessed for eligibility ──
draw_rect_box(col1_x, 0.40, w_box, 0.09)
grid.text("Reports assessed for eligibility", x = col1_x, y = 0.425,
          gp = gpar(fontsize = 8, fontface = "bold", col = text_col), just = c("center", "center"))
grid.text(sprintf("(n = %d)", ft_assessed), x = col1_x, y = 0.385,
          gp = gpar(fontsize = 9, fontface = "bold", col = text_col), just = c("center", "center"))

# Arrow right to Reports excluded
draw_arrow(col1_x + w_box/2, 0.40, col2_x - w_box/2, 0.40)

draw_rect_box(col2_x, 0.38, w_box, 0.15)
grid.text(sprintf("Reports excluded (n = %d):", ft_excl), x = col2_x - w_box/2 + 0.02, y = 0.435,
          gp = gpar(fontsize = 7.5, fontface = "bold", col = text_col), just = c("left", "center"))

# Exclusion reasons
reasons <- elig$excluded_reasons
if (length(reasons) > 0) {
  start_y <- 0.405
  for (i in 1:min(length(reasons), 4)) {
    r <- reasons[[i]]
    grid.text(sprintf("• %s (n = %d)", substr(r$reason, 1, 36), r$count),
              x = col2_x - w_box/2 + 0.03, y = start_y - (i-1) * 0.025,
              gp = gpar(fontsize = 6.5, col = text_col), just = c("left", "center"))
  }
} else {
  grid.text("• Criteria not met (n = 0)",
            x = col2_x - w_box/2 + 0.03, y = 0.405,
            gp = gpar(fontsize = 6.5, col = text_col), just = c("left", "center"))
}

# Arrow down to Included
draw_arrow(col1_x, 0.355, col1_x, 0.27)

# ── Row 5: Included ──
draw_rect_box(col1_x, 0.20, w_box, 0.12)
grid.text("New studies included in review", x = col1_x, y = 0.235,
          gp = gpar(fontsize = 8, fontface = "bold", col = text_col), just = c("center", "center"))
grid.text(sprintf("(n = %d)", studies_incl), x = col1_x, y = 0.205,
          gp = gpar(fontsize = 9, fontface = "bold", col = text_col), just = c("center", "center"))
grid.text(sprintf("Reports of new included studies (n = %d)", studies_incl), x = col1_x, y = 0.175,
          gp = gpar(fontsize = 7, col = "#333333"), just = c("center", "center"))

# Arrow right to Total studies included
draw_arrow(col1_x + w_box/2, 0.20, col2_x - w_box/2, 0.20)

draw_rect_box(col2_x, 0.20, w_box, 0.12)
grid.text("Total studies included in review", x = col2_x, y = 0.235,
          gp = gpar(fontsize = 8, fontface = "bold", col = text_col), just = c("center", "center"))
grid.text(sprintf("(n = %d)", studies_incl), x = col2_x, y = 0.205,
          gp = gpar(fontsize = 9, fontface = "bold", col = text_col), just = c("center", "center"))
grid.text(sprintf("Reports in meta-analysis (n = %d)", studies_ma), x = col2_x, y = 0.175,
          gp = gpar(fontsize = 7, col = "#333333"), just = c("center", "center"))

# ── Footnotes at Bottom ──
grid.text("*Consider, if feasible to do so, reporting the number of records identified from each database or register searched rather than the total number.",
          x = 0.09, y = 0.09,
          gp = gpar(fontsize = 6, col = "#444444"), just = c("left", "center"))
grid.text("**If automation tools were used, indicate how many records were excluded by a human and how many were excluded by automation tools.",
          x = 0.09, y = 0.065,
          gp = gpar(fontsize = 6, col = "#444444"), just = c("left", "center"))
grid.text("From: Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ 2021;372:n71.",
          x = 0.09, y = 0.04,
          gp = gpar(fontsize = 6, col = "#666666"), just = c("left", "center"))
grid.text("For more information, visit: http://www.prisma-statement.org/",
          x = 0.09, y = 0.02,
          gp = gpar(fontsize = 6, col = "#666666"), just = c("left", "center"))

popViewport()
dev.off()

cat("PRISMA flow diagram written to", output_path, "\n")
