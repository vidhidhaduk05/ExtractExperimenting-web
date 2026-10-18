#!/usr/bin/env Rscript
# SROC curve using mada package — standard R library themed
# Usage: Rscript sroc_curve.R <input_json_path>
# Input JSON: {sensitivities, specificities, n_pos, n_neg,
#              pooled_sensitivity, pooled_specificity,
#              sroc_a, sroc_b, auc, output_path}

library(mada)
library(jsonlite)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: Rscript sroc_curve.R <input_json_path>")

input <- fromJSON(readLines(args[1], warn = FALSE))
output_path <- input$output_path

sens <- input$sensitivities
spec <- input$specificities
n_pos <- input$n_pos
n_neg <- input$n_neg
pooled_sens <- input$pooled_sensitivity
pooled_spec <- input$pooled_specificity
sroc_a <- input$sroc_a
sroc_b <- input$sroc_b
auc <- input$auc

# FPR = 1 - specificity
fpr <- 1 - spec
tpr <- sens

# Create data frame for mada
dat <- data.frame(
  TP = round(sens * n_pos),
  FN = n_pos - round(sens * n_pos),
  TN = round(spec * n_neg),
  FP = n_neg - round(spec * n_neg)
)

# Fit bivariate model with mada (may fail with few studies — that's OK)
fit <- tryCatch(
  reitsma(dat),
  error = function(e) NULL
)

# Create SVG
svg(output_path, width = 7, height = 7, bg = "white")
op <- par(mar = c(5, 5, 3, 2), las = 1)

# Set up the plot area manually
plot(NULL, xlim = c(0, 1), ylim = c(0, 1),
     xlab = "1 - Specificity (FPR)", ylab = "Sensitivity (TPR)",
     main = "Summary ROC (SROC) Curve",
     cex.main = 1.2, cex.lab = 1.0, cex.axis = 0.9,
     type = "n", asp = 1)

# Add grid
abline(h = seq(0, 1, 0.2), v = seq(0, 1, 0.2), col = "#E0E0E0", lwd = 0.5)

# Diagonal (chance line)
abline(a = 0, b = 1, lty = "dotted", col = "#999999", lwd = 0.8)

# If mada fit succeeded, use its SROC
if (!is.null(fit)) {
  # Get SROC curve from mada
  sroc_x <- seq(0.001, 0.999, length.out = 200)
  sroc_obj <- tryCatch(sroc(fit), error = function(e) NULL)
  if (!is.null(sroc_obj)) {
    # sroc object has x (FPR) and y (TPR) components
    lines(sroc_obj$x, sroc_obj$y, col = "#75A025", lwd = 2)
  } else {
    # Manual SROC from parameters
    sroc_y <- 1 / (1 + exp(-(sroc_a + sroc_b * log(sroc_x / (1 - sroc_x)))))
    lines(sroc_x, sroc_y, col = "#75A025", lwd = 2)
  }
} else {
  # Manual SROC from bivariate parameters
  sroc_x <- seq(0.001, 0.999, length.out = 200)
  sroc_y <- 1 / (1 + exp(-(sroc_a + sroc_b * log(sroc_x / (1 - sroc_x)))))
  lines(sroc_x, sroc_y, col = "#75A025", lwd = 2)
}

# Plot study points
points(fpr, tpr, pch = 16, cex = 1.2, col = "#0279EE", bg = "white")

# Add pooled point
pooled_fpr <- 1 - pooled_spec
points(pooled_fpr, pooled_sens, pch = 17, cex = 2, col = "#FF9400", bg = "white")

# Add AUC annotation
text(0.95, 0.05, sprintf("AUC = %.3f", auc), cex = 0.9, adj = 1, font = 2)

# Add legend
legend("bottomright",
  legend = c("Study estimates", "SROC curve", "Pooled estimate"),
  pch = c(16, NA, 17),
  lty = c(NA, "solid", NA),
  col = c("#0279EE", "#75A025", "#FF9400"),
  lwd = c(NA, 2, NA),
  cex = 0.75,
  bty = "n"
)

par(op)
dev.off()

cat("SROC curve written to", output_path, "\n")
