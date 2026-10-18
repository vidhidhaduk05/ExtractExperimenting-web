#!/usr/bin/env Rscript
# Forest plot using metafor — standard R library themed
# Usage: Rscript forest_plot.R <input_json_path>
# Input JSON: {labels, effect_sizes, variances, pooled_effect, pooled_ci_lower,
#              pooled_ci_upper, weights, effect_measure, is_log, i_squared}
# Output: SVG file written to stdout path specified in input as "output_path"

library(metafor)
library(jsonlite)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: Rscript forest_plot.R <input_json_path>")

input <- fromJSON(readLines(args[1], warn = FALSE))
output_path <- input$output_path

labels <- input$labels
yi <- input$effect_sizes
vi <- input$variances
sei <- sqrt(vi)
pooled <- input$pooled_effect
pooled_lower <- input$pooled_ci_lower
pooled_upper <- input$pooled_ci_upper
weights <- input$weights
effect_measure <- input$effect_measure
is_log <- input$is_log
i_squared <- input$i_squared

n_studies <- length(labels)

# For log-scale measures, exponentiate for display
if (is_log) {
  display_yi <- exp(yi)
  display_pooled <- exp(pooled)
  display_lower <- exp(yi - 1.96 * sei)
  display_upper <- exp(yi + 1.96 * sei)
  display_pooled_lower <- exp(pooled_lower)
  display_pooled_upper <- exp(pooled_upper)
  xlab <- switch(effect_measure,
    "rr" = "Risk Ratio", "or" = "Odds Ratio", "hr" = "Hazard Ratio",
    "log_rr" = "Risk Ratio", "log_or" = "Odds Ratio", "log_hr" = "Hazard Ratio",
    "Effect Size (exp)")
} else {
  display_yi <- yi
  display_pooled <- pooled
  display_lower <- yi - 1.96 * sei
  display_upper <- yi + 1.96 * sei
  display_pooled_lower <- pooled_lower
  display_pooled_upper <- pooled_upper
  xlab <- switch(effect_measure,
    "md" = "Mean Difference", "smd" = "Std. Mean Difference",
    "logit_sens" = "Logit(Sensitivity)",
    "Effect Size")
}

# Build data frame for metafor
dat <- data.frame(
  study = labels,
  yi = yi,
  vi = vi,
  sei = sei,
  w = weights / sum(weights) * 100
)

# Fit random-effects model for forest plot
res <- rma(yi = yi, vi = vi, data = dat, method = "DL", slab = labels)

# Create SVG
svg(output_path, width = 10, height = max(4, 0.8 * n_studies + 3), bg = "white")

# Set up forest plot layout with metafor
# Columns: study name | effect size + CI | weight
op <- par(mar = c(4, 1, 2, 1))

# Calculate dynamic axis limits ensuring alim is strictly inside xlim
alim_min <- max(0.01, floor(min(c(display_lower, display_pooled_lower)) * 10) / 10)
alim_max <- ceiling(max(c(display_upper, display_pooled_upper)) * 10) / 10
span <- max(1.0, alim_max - alim_min)
xlim_min <- alim_min - span * 1.5
xlim_max <- alim_max + span * 1.4

col_effect_x <- alim_max + span * 0.15
col_weight_x <- alim_max + span * 0.8

# Forest plot using metafor
forest(res,
  xlim = c(xlim_min, xlim_max),
  alim = c(alim_min, alim_max),
  ylim = c(-1.8, n_studies + 2),
  at = seq(alim_min, alim_max, length.out = 5),
  psize = 1,
  header = TRUE,
  xlab = xlab,
  slab = labels,
  order = rev(order(dat$w)),
  rows = n_studies:1,
)

# Add text annotations for effect sizes and weights
for (i in 1:n_studies) {
  row_pos <- n_studies - i + 1
  text(x = col_effect_x, y = row_pos,
       labels = sprintf("%.2f [%.2f, %.2f]", display_yi[i], display_lower[i], display_upper[i]),
       cex = 0.75, adj = 0)
  text(x = col_weight_x, y = row_pos,
       labels = sprintf("%.1f%%", dat$w[i]),
       cex = 0.75, adj = 0)
}

# Add column headers
text(x = col_effect_x, y = n_studies + 1.2, labels = "Effect [95% CI]", cex = 0.75, font = 2, adj = 0)
text(x = col_weight_x, y = n_studies + 1.2, labels = "Weight", cex = 0.75, font = 2, adj = 0)

# Add pooled estimate annotation
text(x = col_effect_x, y = -0.6,
     labels = sprintf("%.2f [%.2f, %.2f]", display_pooled, display_pooled_lower, display_pooled_upper),
     cex = 0.8, font = 2, adj = 0, col = "#75A025")
text(x = col_weight_x, y = -0.6,
     labels = "100.0%",
     cex = 0.8, font = 2, adj = 0, col = "#75A025")

# Add I-squared annotation
text(x = xlim_min, y = -1.4,
     labels = sprintf("Heterogeneity: I² = %.1f%% | Random-Effects (DerSimonian-Laird)", i_squared),
     cex = 0.75, adj = 0)

par(op)
dev.off()

cat("Forest plot written to", output_path, "\n")
