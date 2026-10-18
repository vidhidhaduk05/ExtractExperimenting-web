#!/usr/bin/env Rscript
# Funnel plot using metafor — standard R library themed
# Usage: Rscript funnel_plot.R <input_json_path>
# Input JSON: {effect_sizes, variances, egger_intercept, egger_p_value,
#              is_log, pooled_effect, output_path}

library(metafor)
library(jsonlite)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: Rscript funnel_plot.R <input_json_path>")

input <- fromJSON(readLines(args[1], warn = FALSE))
output_path <- input$output_path

yi <- input$effect_sizes
vi <- input$variances
sei <- sqrt(vi)
egger_intercept <- input$egger_intercept
egger_p_value <- input$egger_p_value
is_log <- input$is_log
pooled <- input$pooled_effect

# Fit random-effects model
res <- rma(yi = yi, vi = vi, method = "DL")

# Create SVG
svg(output_path, width = 7, height = 5.5, bg = "white")
op <- par(mar = c(5, 5, 3, 2), las = 1)

# Funnel plot with metafor
funnel(res,
  xlab = ifelse(is_log, "Effect Size (log scale)", "Effect Size"),
  ylab = "Standard Error",
  main = "Funnel Plot",
  cex.main = 1.2,
  cex.lab = 1.0,
  cex.axis = 0.9,
  pch = 16,
  col = "#0279EE",
  level = 95,
  digits = 2,
  back = "white",
  shade = "#ECE9E2"
)

# Add Egger's test annotation
if (!is.null(egger_p_value)) {
  sig <- ifelse(egger_p_value < 0.05, "*", "ns")
  text(x = par("usr")[2], y = par("usr")[4],
       labels = sprintf("Egger's test: p = %.4f (%s)", egger_p_value, sig),
       cex = 0.8, adj = c(1.05, 1.2),
       col = ifelse(egger_p_value < 0.05, "#E94444", "#000000"))
}

par(op)
dev.off()

cat("Funnel plot written to", output_path, "\n")
