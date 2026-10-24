#!/usr/bin/env Rscript
# PRISMA 2020 Flow Diagram using R grid graphics
# Replicates the official PRISMA 2020 template layout
# Aggregates duplicate exclusion reasons and sums counts
# Usage: Rscript prisma_flow.R <input_json_path>

suppressPackageStartupMessages({
  library(jsonlite)
  library(grid)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: Rscript prisma_flow.R <input_json_path>")

input <- fromJSON(readLines(args[1], warn = FALSE))
output_path <- input$output_path

# Extract data
id <- input$identification
scr <- input$screening
elig <- input$eligibility
incl <- input$included
pending <- if (!is.null(input$pending)) as.numeric(input$pending) else 0

# Helper to safely aggregate reasons across case/whitespace variations and sum counts
aggregate_reasons <- function(raw) {
  if (is.null(raw)) return(list())
  reasons_vec <- c()
  counts_vec <- c()

  if (is.data.frame(raw)) {
    if (nrow(raw) == 0) return(list())
    if ("reason" %in% names(raw)) {
      reasons_vec <- as.character(raw$reason)
      counts_vec <- if ("count" %in% names(raw)) as.numeric(raw$count) else rep(1, nrow(raw))
    }
  } else if (is.list(raw)) {
    if (length(raw) == 0) return(list())
    for (i in seq_along(raw)) {
      item <- raw[[i]]
      if (is.list(item) && !is.null(item$reason)) {
        reasons_vec <- c(reasons_vec, as.character(item$reason))
        cnt <- if (!is.null(item$count)) as.numeric(item$count) else 1
        counts_vec <- c(counts_vec, cnt)
      } else if (is.character(item)) {
        reasons_vec <- c(reasons_vec, item)
        counts_vec <- c(counts_vec, 1)
      }
    }
  }

  if (length(reasons_vec) == 0) return(list())

  # Clean strings & aggregate by normalized key
  cleaned <- gsub("_", " ", trimws(reasons_vec))
  cleaned <- gsub("\\s+", " ", cleaned)
  cleaned <- sub("\\s*[\\[\\(]\\s*([pP](robability)?|conf(idence)?|score)?\\s*[:=><]\\s*[0-9]+(\\.[0-9]+)?%?\\s*[\\]\\)]\\s*$", "", cleaned, perl = TRUE)
  cleaned <- sub("\\s*\\([pP]\\s*=\\s*[0-9\\.]+\\)\\s*$", "", cleaned, perl = TRUE)
  cleaned <- sub("[ :;.-]+$", "", cleaned)
  cleaned <- gsub("\\s+", " ", trimws(cleaned))
  keys <- tolower(cleaned)

  agg <- list()
  for (k in unique(keys)) {
    if (nchar(k) == 0) next
    idx <- which(keys == k)
    total_cnt <- sum(counts_vec[idx], na.rm = TRUE)
    orig <- cleaned[idx[1]]
    disp <- if (orig == tolower(orig)) paste0(toupper(substr(orig, 1, 1)), substr(orig, 2, nchar(orig))) else orig
    agg[[length(agg) + 1]] <- list(reason = disp, count = total_cnt)
  }

  if (length(agg) == 0) return(list())
  counts <- sapply(agg, function(x) x$count)
  agg <- agg[order(counts, decreasing = TRUE)]
  return(agg)
}

ta_reasons <- aggregate_reasons(scr$excluded_with_reasons)
ft_reasons <- aggregate_reasons(elig$excluded_reasons)

# Create output device: PNG when output_path ends in .png, SVG otherwise
if (grepl("\\.png$", output_path, ignore.case = TRUE)) {
  png(output_path, width = 2200, height = 1600, res = 200, bg = "white")
} else {
  svg(output_path, width = 11, height = 8.5, bg = "white")
}

# Set up grid viewport
grid.newpage()
pushViewport(viewport(width = 0.98, height = 0.98))

# Professional styling tokens
box_fill <- "#FFFFFF"
box_border <- "#333333"
phase_bg <- "#F0F4F8"
excl_fill <- "#FFF5F5"
excl_border <- "#E94444"
incl_fill <- "#F0F8E8"
incl_border <- "#75A025"
arrow_col <- "#555555"
text_col <- "#222222"
count_col <- "#0279EE"

# Helper function to draw a main flow box
draw_box <- function(x, y, w, h, title, count, subtitle = "",
                     fill = box_fill, border = box_border, count_color = count_col) {
  grid.rect(x = x, y = y, width = w, height = h,
            gp = gpar(fill = fill, col = border, lwd = 1.2),
            just = c("center", "center"))
  grid.text(title, x = x, y = y + h/2 - 0.015,
            gp = gpar(fontsize = 8.5, fontface = "bold", col = text_col),
            just = c("center", "top"))
  grid.text(sprintf("n = %d", count), x = x, y = y + 0.005,
            gp = gpar(fontsize = 15, fontface = "bold", col = count_color),
            just = c("center", "center"))
  if (subtitle != "") {
    grid.text(subtitle, x = x, y = y - h/2 + 0.012,
              gp = gpar(fontsize = 7.5, col = "#777777"),
              just = c("center", "bottom"))
  }
}

# Helper to draw excluded box with merged reasons
draw_excluded_box <- function(x, y, w, title, total_count, reasons) {
  n_reasons <- min(length(reasons), 5)
  box_h <- 0.065 + max(0, n_reasons * 0.024) + (if (n_reasons > 0) 0.016 else 0)
  box_y <- y - (box_h - 0.07) / 2

  grid.rect(x = x, y = box_y, width = w, height = box_h,
            gp = gpar(fill = excl_fill, col = excl_border, lwd = 1.2),
            just = c("center", "center"))
  grid.text(title, x = x, y = box_y + box_h/2 - 0.012,
            gp = gpar(fontsize = 8.5, fontface = "bold", col = text_col),
            just = c("center", "top"))
  grid.text(sprintf("n = %d", total_count), x = x, y = box_y + box_h/2 - 0.032,
            gp = gpar(fontsize = 13, fontface = "bold", col = "#E94444"),
            just = c("center", "top"))

  if (n_reasons > 0) {
    grid.text("Reasons:", x = x - w/2 + 0.015, y = box_y + box_h/2 - 0.052,
              gp = gpar(fontsize = 7.5, fontface = "italic", col = "#666666"),
              just = c("left", "top"))
    curr_y <- box_y + box_h/2 - 0.070
    for (i in 1:n_reasons) {
      r <- reasons[[i]]
      lbl <- sprintf("%s (n = %d)", r$reason, r$count)
      if (nchar(lbl) > 36) lbl <- paste0(substr(lbl, 1, 33), "...")
      grid.text(lbl, x = x - w/2 + 0.02, y = curr_y,
                gp = gpar(fontsize = 7, col = "#333333"),
                just = c("left", "top"))
      curr_y <- curr_y - 0.022
    }
  }
}

# Helper to draw arrows
draw_arrow <- function(x1, y1, x2, y2, col = arrow_col) {
  grid.segments(x0 = x1, y0 = y1, x1 = x2, y1 = y2,
                gp = gpar(col = col, lwd = 1.2),
                arrow = arrow(length = unit(0.08, "inches"), type = "closed"))
}

# Helper to draw phase label (left column)
draw_phase <- function(y, label) {
  grid.rect(x = 0.06, y = y, width = 0.10, height = 0.06,
            gp = gpar(fill = phase_bg, col = "#0279EE", lwd = 0.8),
            just = c("center", "center"))
  grid.text(label, x = 0.06, y = y,
            gp = gpar(fontsize = 8, fontface = "bold", col = "#0279EE"),
            just = c("center", "center"))
}

# Layout coordinates (normalized 0-1)
main_x <- 0.38
right_x <- 0.74
box_w <- 0.30
excl_w <- 0.28

# Phase labels
draw_phase(0.88, "Identification")
draw_phase(0.65, "Screening")
draw_phase(0.38, "Eligibility")
draw_phase(0.12, "Included")

# ── Identification ──
db_cnt <- if (!is.null(id$database_records)) as.numeric(id$database_records) else 0
reg_cnt <- if (!is.null(id$registers)) as.numeric(id$registers) else 0
oth_cnt <- if (!is.null(id$other_sources)) as.numeric(id$other_sources) else 0
dup_cnt <- if (!is.null(id$duplicates_removed)) as.numeric(id$duplicates_removed) else 0

id_sub <- sprintf("Registers: %d | Other: %d", reg_cnt, oth_cnt)
if (dup_cnt > 0) {
  id_sub <- sprintf("%s | Duplicates removed: %d", id_sub, dup_cnt)
}

draw_box(main_x, 0.88, box_w, 0.08,
         "Records identified from databases",
         db_cnt,
         id_sub)

draw_arrow(main_x, 0.84, main_x, 0.69)

# ── Screening ──
scr_screened <- if (!is.null(scr$records_screened)) as.numeric(scr$records_screened) else 0
scr_excl <- if (!is.null(scr$records_excluded)) as.numeric(scr$records_excluded) else 0

draw_box(main_x, 0.65, box_w, 0.07,
         "Records screened (Title / Abstract)",
         scr_screened)

draw_arrow(main_x + box_w/2, 0.65, right_x - excl_w/2, 0.65)
draw_excluded_box(right_x, 0.65, excl_w, "Records excluded", scr_excl, ta_reasons)

draw_arrow(main_x, 0.61, main_x, 0.42)

# ── Eligibility ──
elig_assessed <- if (!is.null(elig$full_text_assessed)) as.numeric(elig$full_text_assessed) else 0
elig_excl <- if (!is.null(elig$full_text_excluded)) as.numeric(elig$full_text_excluded) else 0

draw_box(main_x, 0.38, box_w, 0.07,
         "Full-text articles assessed for eligibility",
         elig_assessed)

draw_arrow(main_x + box_w/2, 0.38, right_x - excl_w/2, 0.38)
draw_excluded_box(right_x, 0.38, excl_w, "Full-text excluded", elig_excl, ft_reasons)

draw_arrow(main_x, 0.34, main_x, 0.17)

# ── Included ──
incl_rev <- if (!is.null(incl$studies_in_review)) as.numeric(incl$studies_in_review) else 0
incl_meta <- if (!is.null(incl$studies_in_meta_analysis)) as.numeric(incl$studies_in_meta_analysis) else 0

draw_box(main_x, 0.12, box_w, 0.08,
         "Studies included in review",
         incl_rev,
         sprintf("In meta-analysis: %d", incl_meta),
         fill = incl_fill, border = incl_border, count_color = "#75A025")

if (pending > 0) {
  grid.rect(x = main_x, y = 0.03, width = box_w, height = 0.04,
            gp = gpar(fill = "#FFF8E1", col = "#FF9400", lwd = 0.8),
            just = c("center", "center"))
  grid.text(sprintf("%d records pending screening", pending),
            x = main_x, y = 0.03,
            gp = gpar(fontsize = 7.5, fontface = "bold", col = "#FF9400"),
            just = c("center", "center"))
}

# Header Title
grid.text("PRISMA 2020 Flow Diagram for Systematic Reviews",
          x = 0.5, y = 0.97,
          gp = gpar(fontsize = 14, fontface = "bold", col = "#222222"),
          just = c("center", "center"))

popViewport()
dev.off()

cat("PRISMA flow diagram written to", output_path, "\n")
