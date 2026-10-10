# Publication risk-of-bias figures via robvis (https://github.com/mcguinlu/robvis).
# Usage: Rscript robvis_plot.R input.json
# JSON: tool, plot ("traffic_light" or "summary"), studies, columns, output_path, colour

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: Rscript robvis_plot.R input.json")

input <- jsonlite::fromJSON(args[1], simplifyDataFrame = TRUE)

if (!requireNamespace("robvis", quietly = TRUE)) {
  stop("robvis is not installed. Run: Rscript r_scripts/install_robvis.R")
}
if (!requireNamespace("ggplot2", quietly = TRUE)) {
  stop("ggplot2 is not installed. Run: Rscript r_scripts/install_robvis.R")
}

df <- as.data.frame(input$studies, stringsAsFactors = FALSE)
columns <- input$columns
if (!is.null(columns) && length(columns) > 0) {
  missing <- setdiff(columns, names(df))
  if (length(missing) > 0) {
    stop(paste("Missing robvis columns:", paste(missing, collapse = ", ")))
  }
  df <- df[, columns, drop = FALSE]
}

tool <- input$tool
plot_kind <- if (is.null(input$plot) || input$plot == "") "traffic_light" else input$plot
colour <- if (is.null(input$colour) || input$colour == "") "cochrane" else input$colour

if (plot_kind == "summary") {
  figure <- robvis::rob_summary(data = df, tool = tool, colour = colour)
} else {
  figure <- robvis::rob_traffic_light(data = df, tool = tool, colour = colour, psize = 10)
}

n <- nrow(df)
height <- if (plot_kind == "summary") 6 else max(4, 0.35 * n + 2)
width <- if (plot_kind == "summary") 8 else 11

if (grepl("\\.png$", input$output_path, ignore.case = TRUE)) {
  grDevices::png(filename = input$output_path, width = width, height = height,
                 units = "in", res = 220)
} else {
  grDevices::svg(filename = input$output_path, width = width, height = height)
}
print(figure)
grDevices::dev.off()
